import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { fileRepository, type DbFile } from '../src/db/repositories/file.repository.js';
import { fileAuthorizationService } from '../src/modules/files/file.auth.js';
import { fileService, generateStorageKey } from '../src/modules/files/file.service.js';
import { FileServiceError } from '../src/modules/files/file.errors.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { conversationRepository } from '../src/db/repositories/conversation.repository.js';
import { MockStorageProvider, setStorageProviderForTest } from '../src/storage/index.js';
import { messagingService } from '../src/modules/messaging/messaging.service.js';
import { conversationService } from '../src/modules/conversations/conversation.service.js';
import { messageRepository } from '../src/db/repositories/message.repository.js';

describe('Phase 8C: File Repository, Service, Authorization & Messaging Integration', () => {
  let mockStorage: MockStorageProvider;
  let origPoolConnect: any;

  beforeEach(() => {
    mockStorage = new MockStorageProvider('test-bucket');
    setStorageProviderForTest(mockStorage);

    origPoolConnect = pool.connect;
    pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    } as any);
  });

  afterEach(() => {
    pool.connect = origPoolConnect;
  });

  function createMockDbFile(overrides?: Partial<DbFile>): DbFile {
    return {
      id: 'file-123',
      organization_id: 'org-abc',
      uploader_id: 'user-uploader',
      file_name: 'report.pdf',
      file_size_bytes: 1024,
      mime_type: 'application/pdf',
      storage_driver: 'mock',
      storage_key: 'tenants/org-abc/files/file-123/nonce_report.pdf',
      checksum_sha256: null,
      status: 'ready',
      upload_expires_at: new Date(Date.now() + 900000),
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      ...overrides,
    };
  }

  // ==========================================================================
  // 1. CANONICAL STORAGE KEY GENERATION
  // ==========================================================================
  describe('Canonical Storage Key Generation', () => {
    it('generates secure canonical key with tenant isolation and random nonce', () => {
      const key1 = generateStorageKey('org-1', 'file-1', 'invoice.pdf');
      const key2 = generateStorageKey('org-1', 'file-1', 'invoice.pdf');

      assert.ok(key1.startsWith('tenants/org-1/files/file-1/'));
      assert.ok(key1.endsWith('_invoice.pdf'));
      // Nonces must be unique (cryptographically random)
      assert.notStrictEqual(key1, key2);
    });

    it('sanitizes traversal characters, slashes, and control characters in filename', () => {
      const dangerous = '../../etc/passwd\0bad.exe';
      const key = generateStorageKey('org-1', 'file-2', dangerous);

      assert.ok(!key.includes('..'));
      assert.ok(!key.includes('\0'));
      assert.ok(!key.includes('etc'));
      assert.ok(key.startsWith('tenants/org-1/files/file-2/'));
    });
  });

  // ==========================================================================
  // 2. FILE AUTHORIZATION
  // ==========================================================================
  describe('File Authorization Logic', () => {
    it('allows upload intent creation only for active organization members', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async (_userId, orgId) => {
          if (orgId === 'org-active') {
            return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
          }
          return { isMember: false, isOwner: false, isAdmin: false, isGuest: false };
        };

        const allowed = await fileAuthorizationService.canCreateFileInOrg('user-1', 'org-active');
        const denied = await fileAuthorizationService.canCreateFileInOrg('user-1', 'org-other');

        assert.strictEqual(allowed, true);
        assert.strictEqual(denied, false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('authorizes unattached file reads for uploader and org admins/owners, denying other members and cross-tenant', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      const origFindAttachmentContext = fileRepository.findAttachmentContext;

      try {
        fileRepository.findAttachmentContext = async () => []; // Unattached
        authorizationService.getOrganizationAuth = async (userId, orgId) => {
          if (orgId !== 'org-abc') return { isMember: false, isOwner: false, isAdmin: false, isGuest: false };
          if (userId === 'user-admin') return { isMember: true, isOwner: false, isAdmin: true, isGuest: false };
          if (userId === 'user-uploader') return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
          if (userId === 'user-guest') return { isMember: true, isOwner: false, isAdmin: false, isGuest: true };
          return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
        };

        const file = createMockDbFile();

        // Uploader can read
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-uploader'), true);
        // Admin can read
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-admin'), true);
        // Random org member cannot read unattached file of another user
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-random'), false);
        // Guest cannot read unattached file of another user
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-guest'), false);
        // Cross-org user denied
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-cross-org'), false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
        fileRepository.findAttachmentContext = origFindAttachmentContext;
      }
    });

    it('enforces attached resource authorization (channel message): uploader has NO permanent bypass to private channels', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      const origFindAttachmentContext = fileRepository.findAttachmentContext;
      const origGetChannelAuth = authorizationService.getChannelAuth;

      try {
        fileRepository.findAttachmentContext = async () => [
          { messageId: 'msg-1', channelId: 'chan-secret', conversationId: null },
        ];
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        // User A is the original uploader, but has been REMOVED from the private channel
        authorizationService.getChannelAuth = async (userId, channelId) => {
          if (userId === 'user-member') return { canAccess: true } as any;
          return { canAccess: false } as any; // user-uploader cannot access chan-secret
        };

        const file = createMockDbFile({ uploader_id: 'user-uploader' });

        // User who is currently in private channel can access
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-member'), true);
        // Original uploader CANNOT access once attached to a channel they cannot access!
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-uploader'), false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
        fileRepository.findAttachmentContext = origFindAttachmentContext;
        authorizationService.getChannelAuth = origGetChannelAuth;
      }
    });

    it('enforces attached conversation authorization', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      const origFindAttachmentContext = fileRepository.findAttachmentContext;
      const origGetMember = conversationRepository.getMember;

      try {
        fileRepository.findAttachmentContext = async () => [
          { messageId: 'msg-1', channelId: null, conversationId: 'conv-private' },
        ];
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        conversationRepository.getMember = async (_convId, userId) => {
          if (userId === 'user-conv-member') return { id: 'm1' } as any;
          return null;
        };

        const file = createMockDbFile({ uploader_id: 'user-uploader' });

        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-conv-member'), true);
        assert.strictEqual(await fileAuthorizationService.canReadFile(file, 'user-stranger'), false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
        fileRepository.findAttachmentContext = origFindAttachmentContext;
        conversationRepository.getMember = origGetMember;
      }
    });

    it('strictly restricts finalization to the original uploader ONLY', () => {
      const file = createMockDbFile({ uploader_id: 'user-uploader' });

      // Uploader can finalize
      assert.strictEqual(fileAuthorizationService.canFinalizeFile(file, 'user-uploader'), true);
      // Admin / Owner CANNOT finalize another user's upload intent
      assert.strictEqual(fileAuthorizationService.canFinalizeFile(file, 'user-admin'), false);
      assert.strictEqual(fileAuthorizationService.canFinalizeFile(file, 'user-owner'), false);
    });

    it('authorizes file deletion for uploader or org admin/owner', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async (userId) => {
          if (userId === 'user-admin') return { isMember: true, isOwner: false, isAdmin: true, isGuest: false };
          if (userId === 'user-owner') return { isMember: true, isOwner: true, isAdmin: false, isGuest: false };
          return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
        };

        const file = createMockDbFile({ uploader_id: 'user-uploader' });

        assert.strictEqual(await fileAuthorizationService.canDeleteFile(file, 'user-uploader'), true);
        assert.strictEqual(await fileAuthorizationService.canDeleteFile(file, 'user-admin'), true);
        assert.strictEqual(await fileAuthorizationService.canDeleteFile(file, 'user-owner'), true);
        assert.strictEqual(await fileAuthorizationService.canDeleteFile(file, 'user-other'), false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });
  });

  // ==========================================================================
  // 3. UPLOAD INTENT
  // ==========================================================================
  describe('FileService: createUploadIntent', () => {
    it('creates upload intent and returns presigned PUT URL with 900s TTL', async () => {
      const origCanCreate = fileAuthorizationService.canCreateFileInOrg;
      const origCreate = fileRepository.create;

      let createdRow: any = null;
      try {
        fileAuthorizationService.canCreateFileInOrg = async () => true;
        fileRepository.create = async (params) => {
          createdRow = params;
          return {
            id: params.id!,
            organization_id: params.organizationId,
            uploader_id: params.uploaderId,
            file_name: params.fileName,
            file_size_bytes: params.fileSizeBytes,
            mime_type: params.mimeType,
            storage_driver: params.storageDriver,
            storage_key: params.storageKey,
            checksum_sha256: null,
            status: 'uploading',
            upload_expires_at: params.uploadExpiresAt!,
            is_deleted: false,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          };
        };

        const res = await fileService.createUploadIntent('user-uploader', 'org-abc', {
          fileName: 'presentation.pdf',
          fileSizeBytes: 2048,
          mimeType: 'application/pdf',
        });

        assert.ok(res.fileId);
        assert.ok(res.uploadUrl.startsWith('mock-s3://'));
        assert.ok(res.expiresAt);
        assert.strictEqual(createdRow.status, 'uploading');
        assert.strictEqual(createdRow.organizationId, 'org-abc');
        assert.strictEqual(createdRow.fileSizeBytes, 2048);
      } finally {
        fileAuthorizationService.canCreateFileInOrg = origCanCreate;
        fileRepository.create = origCreate;
      }
    });

    it('rejects cross-organization upload intent with 404 NOT_FOUND', async () => {
      const origCanCreate = fileAuthorizationService.canCreateFileInOrg;
      try {
        fileAuthorizationService.canCreateFileInOrg = async () => false;

        await assert.rejects(
          async () => {
            await fileService.createUploadIntent('user-1', 'org-forbidden', {
              fileName: 'doc.pdf',
              fileSizeBytes: 1000,
              mimeType: 'application/pdf',
            });
          },
          (err: any) => err instanceof FileServiceError && err.code === 'NOT_FOUND' && err.statusCode === 404
        );
      } finally {
        fileAuthorizationService.canCreateFileInOrg = origCanCreate;
      }
    });

    it('rejects invalid upload intent payloads (file > 100MB, dangerous extension)', async () => {
      const origCanCreate = fileAuthorizationService.canCreateFileInOrg;
      try {
        fileAuthorizationService.canCreateFileInOrg = async () => true;

        // Size > 100MB
        await assert.rejects(
          async () => {
            await fileService.createUploadIntent('user-1', 'org-abc', {
              fileName: 'huge.zip',
              fileSizeBytes: 104857601, // 100MB + 1 byte
              mimeType: 'application/zip',
            });
          },
          (err: any) => err instanceof FileServiceError && err.code === 'VALIDATION_FAILED'
        );

        // Dangerous extension
        await assert.rejects(
          async () => {
            await fileService.createUploadIntent('user-1', 'org-abc', {
              fileName: 'virus.exe',
              fileSizeBytes: 1024,
              mimeType: 'application/octet-stream',
            });
          },
          (err: any) => err instanceof FileServiceError && err.code === 'VALIDATION_FAILED'
        );
      } finally {
        fileAuthorizationService.canCreateFileInOrg = origCanCreate;
      }
    });
  });

  // ==========================================================================
  // 4. FINALIZE UPLOAD
  // ==========================================================================
  describe('FileService: finalizeUpload', () => {
    it('successfully finalizes upload when remote object exists and size matches declared bytes', async () => {
      const origFindById = fileRepository.findById;
      const origFindByIdForUpdate = fileRepository.findByIdForUpdate;
      const origFinalize = fileRepository.finalizeFile;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({
          id: 'file-to-finalize',
          status: 'uploading',
          file_size_bytes: 1024,
          storage_key: 'tenants/org-abc/files/file-to-finalize/nonce_file.pdf',
        });

        // Store mock object in storage with exact declared size
        mockStorage.putMockObject(file.storage_key, { size: 1024, contentType: 'application/pdf' });


        fileRepository.findById = async () => file;
        fileRepository.findByIdForUpdate = async () => file;
        fileRepository.finalizeFile = async () => ({ ...file, status: 'ready' });
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        const finalized = await fileService.finalizeUpload('file-to-finalize', 'user-uploader');
        assert.strictEqual(finalized.status, 'ready');
        assert.strictEqual(finalized.fileSizeBytes, 1024);
      } finally {
        fileRepository.findById = origFindById;
        fileRepository.findByIdForUpdate = origFindByIdForUpdate;
        fileRepository.finalizeFile = origFinalize;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if remote object does not exist in storage', async () => {
      const origFindById = fileRepository.findById;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({
          status: 'uploading',
          storage_key: 'tenants/org-abc/files/missing/nonce_file.pdf',
        });

        fileRepository.findById = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        await assert.rejects(
          async () => {
            await fileService.finalizeUpload('file-missing', 'user-uploader');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_UPLOAD_FAILED' && err.statusCode === 400
        );
      } finally {
        fileRepository.findById = origFindById;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if object size in storage does not match declared size', async () => {
      const origFindById = fileRepository.findById;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({
          status: 'uploading',
          file_size_bytes: 1024,
          storage_key: 'tenants/org-abc/files/size-mismatch/nonce_file.pdf',
        });

        // Store 500 bytes instead of declared 1024 bytes
        mockStorage.putMockObject(file.storage_key, { size: 500, contentType: 'application/pdf' });


        fileRepository.findById = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        await assert.rejects(
          async () => {
            await fileService.finalizeUpload('file-size-mismatch', 'user-uploader');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_UPLOAD_FAILED'
        );
      } finally {
        fileRepository.findById = origFindById;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if object content type in storage does not match declared MIME type', async () => {
      const origFindById = fileRepository.findById;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({
          status: 'uploading',
          file_size_bytes: 1024,
          mime_type: 'application/pdf',
          storage_key: 'tenants/org-abc/files/mime-mismatch/nonce_file.pdf',
        });

        // Store with mismatched MIME type image/png
        mockStorage.putMockObject(file.storage_key, { size: 1024, contentType: 'image/png' });

        fileRepository.findById = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        await assert.rejects(
          async () => {
            await fileService.finalizeUpload('file-mime-mismatch', 'user-uploader');
          },
          (err: any) =>
            err instanceof FileServiceError &&
            err.code === 'FILE_UPLOAD_FAILED' &&
            err.message.includes('Content type mismatch')
        );
      } finally {
        fileRepository.findById = origFindById;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if user is not the original uploader (even if org admin)', async () => {

      const origFindById = fileRepository.findById;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({ status: 'uploading', uploader_id: 'user-uploader' });

        fileRepository.findById = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: true, isAdmin: true, isGuest: false,
        });

        await assert.rejects(
          async () => {
            // Admin attempts to finalize uploader's file
            await fileService.finalizeUpload('file-123', 'user-admin');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FORBIDDEN' && err.statusCode === 403
        );
      } finally {
        fileRepository.findById = origFindById;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if upload intent has expired', async () => {
      const origFindById = fileRepository.findById;
      const origUpdateStatus = fileRepository.updateStatus;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({
          status: 'uploading',
          upload_expires_at: new Date(Date.now() - 10000), // Expired 10s ago
        });

        fileRepository.findById = async () => file;
        fileRepository.updateStatus = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        await assert.rejects(
          async () => {
            await fileService.finalizeUpload('file-expired', 'user-uploader');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'UPLOAD_EXPIRED' && err.statusCode === 400
        );
      } finally {
        fileRepository.findById = origFindById;
        fileRepository.updateStatus = origUpdateStatus;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('rejects finalize if file is already ready (cannot finalize twice)', async () => {
      const origFindById = fileRepository.findById;
      const origGetOrgAuth = authorizationService.getOrganizationAuth;

      try {
        const file = createMockDbFile({ status: 'ready' });

        fileRepository.findById = async () => file;
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        await assert.rejects(
          async () => {
            await fileService.finalizeUpload('file-already-ready', 'user-uploader');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_ALREADY_READY' && err.statusCode === 400
        );
      } finally {
        fileRepository.findById = origFindById;
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });
  });

  // ==========================================================================
  // 5. DOWNLOAD URL & ACTIVE CONTENT DISPOSITION
  // ==========================================================================
  describe('FileService: getSignedDownloadUrl', () => {
    it('generates short-lived presigned GET URL for authorized ready file', async () => {
      const origFindById = fileRepository.findById;
      const origCanRead = fileAuthorizationService.canReadFile;

      try {
        const file = createMockDbFile({ status: 'ready', file_name: 'notes.txt' });
        fileRepository.findById = async () => file;
        fileAuthorizationService.canReadFile = async () => true;

        const res = await fileService.getSignedDownloadUrl('file-ready', 'user-1');
        assert.ok(res.downloadUrl.startsWith('mock-s3://'));
      } finally {
        fileRepository.findById = origFindById;
        fileAuthorizationService.canReadFile = origCanRead;
      }
    });

    it('rejects download URL for non-ready (uploading) files', async () => {
      const origFindById = fileRepository.findById;
      const origCanRead = fileAuthorizationService.canReadFile;

      try {
        const file = createMockDbFile({ status: 'uploading' });
        fileRepository.findById = async () => file;
        fileAuthorizationService.canReadFile = async () => true;

        await assert.rejects(
          async () => {
            await fileService.getSignedDownloadUrl('file-uploading', 'user-1');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_NOT_READY' && err.statusCode === 400
        );
      } finally {
        fileRepository.findById = origFindById;
        fileAuthorizationService.canReadFile = origCanRead;
      }
    });

    it('rejects download URL for soft-deleted files with 404', async () => {
      const origFindById = fileRepository.findById;

      try {
        const file = createMockDbFile({ is_deleted: true });
        fileRepository.findById = async () => file;

        await assert.rejects(
          async () => {
            await fileService.getSignedDownloadUrl('file-deleted', 'user-1');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_NOT_FOUND' && err.statusCode === 404
        );
      } finally {
        fileRepository.findById = origFindById;
      }
    });
  });

  // ==========================================================================
  // 6. SOFT DELETE & REMOTE STORAGE DELETION
  // ==========================================================================
  describe('FileService: deleteFile', () => {
    it('marks database record soft-deleted and triggers remote object delete', async () => {
      const origFindById = fileRepository.findById;
      const origCanDelete = fileAuthorizationService.canDeleteFile;
      const origSoftDelete = fileRepository.softDeleteFile;

      let deletedInDb = false;
      try {
        const file = createMockDbFile({ storage_key: 'tenants/org-abc/files/f1/key.pdf' });
        mockStorage.putMockObject(file.storage_key, { size: 100, contentType: 'application/pdf' });


        fileRepository.findById = async () => file;
        fileAuthorizationService.canDeleteFile = async () => true;
        fileRepository.softDeleteFile = async () => {
          deletedInDb = true;
          return { ...file, is_deleted: true };
        };

        const res = await fileService.deleteFile('f1', 'user-uploader');
        assert.strictEqual(res.message, 'File deleted successfully');
        assert.strictEqual(deletedInDb, true);
        assert.strictEqual(mockStorage.hasMockObject(file.storage_key), false);
      } finally {
        fileRepository.findById = origFindById;
        fileAuthorizationService.canDeleteFile = origCanDelete;
        fileRepository.softDeleteFile = origSoftDelete;
      }
    });

    it('remote storage deletion failure does NOT resurrect or fail the authoritative DB soft delete', async () => {
      const origFindById = fileRepository.findById;
      const origCanDelete = fileAuthorizationService.canDeleteFile;
      const origSoftDelete = fileRepository.softDeleteFile;
      const origDeleteObject = mockStorage.deleteObject.bind(mockStorage);

      let deletedInDb = false;
      try {
        const file = createMockDbFile();

        fileRepository.findById = async () => file;
        fileAuthorizationService.canDeleteFile = async () => true;
        fileRepository.softDeleteFile = async () => {
          deletedInDb = true;
          return { ...file, is_deleted: true };
        };

        // Mock remote storage outage
        mockStorage.deleteObject = async () => {
          throw new Error('S3 503 Service Unavailable');
        };

        const res = await fileService.deleteFile('f1', 'user-uploader');
        // Success must still be returned because DB soft delete is authoritative!
        assert.strictEqual(res.message, 'File deleted successfully');
        assert.strictEqual(deletedInDb, true);
      } finally {
        fileRepository.findById = origFindById;
        fileAuthorizationService.canDeleteFile = origCanDelete;
        fileRepository.softDeleteFile = origSoftDelete;
        mockStorage.deleteObject = origDeleteObject;
      }
    });
  });

  // ==========================================================================
  // 7. MESSAGING INTEGRATION & ATTACHMENT VALIDATION
  // ==========================================================================
  describe('Messaging Attachment Validation Integration', () => {
    it('accepts ready attachments belonging to the same organization', async () => {
      const origFindFilesByIds = fileRepository.findFilesByIds;
      const origCanRead = fileAuthorizationService.canReadFile;

      try {
        const file1 = createMockDbFile({ id: 'att-1', organization_id: 'org-abc', status: 'ready' });
        const file2 = createMockDbFile({ id: 'att-2', organization_id: 'org-abc', status: 'ready' });

        fileRepository.findFilesByIds = async () => [file1, file2];
        fileAuthorizationService.canReadFile = async () => true;

        const validated = await fileService.validateMessageAttachments(
          ['att-1', 'att-2'],
          'org-abc',
          'user-1'
        );

        assert.strictEqual(validated.length, 2);
      } finally {
        fileRepository.findFilesByIds = origFindFilesByIds;
        fileAuthorizationService.canReadFile = origCanRead;
      }
    });

    it('rejects attachments not in ready status (e.g. uploading or failed)', async () => {
      const origFindFilesByIds = fileRepository.findFilesByIds;
      const origCanRead = fileAuthorizationService.canReadFile;

      try {
        const fileUploading = createMockDbFile({ id: 'att-uploading', organization_id: 'org-abc', status: 'uploading' });

        fileRepository.findFilesByIds = async () => [fileUploading];
        fileAuthorizationService.canReadFile = async () => true;

        await assert.rejects(
          async () => {
            await fileService.validateMessageAttachments(['att-uploading'], 'org-abc', 'user-1');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_NOT_READY'
        );
      } finally {
        fileRepository.findFilesByIds = origFindFilesByIds;
        fileAuthorizationService.canReadFile = origCanRead;
      }
    });

    it('rejects cross-tenant attachments without leaking existence (404 ORGANIZATION_MISMATCH)', async () => {
      const origFindFilesByIds = fileRepository.findFilesByIds;

      try {
        const crossOrgFile = createMockDbFile({ id: 'att-cross', organization_id: 'org-OTHER', status: 'ready' });

        fileRepository.findFilesByIds = async () => [crossOrgFile];

        await assert.rejects(
          async () => {
            await fileService.validateMessageAttachments(['att-cross'], 'org-abc', 'user-1');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'ORGANIZATION_MISMATCH' && err.statusCode === 404
        );
      } finally {
        fileRepository.findFilesByIds = origFindFilesByIds;
      }
    });

    it('rejects deleted file attachments with 404 FILE_NOT_FOUND', async () => {
      const origFindFilesByIds = fileRepository.findFilesByIds;

      try {
        const deletedFile = createMockDbFile({ id: 'att-del', is_deleted: true, status: 'ready' });
        fileRepository.findFilesByIds = async () => [deletedFile];

        await assert.rejects(
          async () => {
            await fileService.validateMessageAttachments(['att-del'], 'org-abc', 'user-1');
          },
          (err: any) => err instanceof FileServiceError && err.code === 'FILE_NOT_FOUND' && err.statusCode === 404
        );
      } finally {
        fileRepository.findFilesByIds = origFindFilesByIds;
      }
    });

    it('rejects message if attachment count exceeds maximum limit (10)', async () => {
      const tooMany = Array.from({ length: 11 }, (_, i) => `att-${i}`);

      await assert.rejects(
        async () => {
          await fileService.validateMessageAttachments(tooMany, 'org-abc', 'user-1');
        },
        (err: any) => err instanceof FileServiceError && err.code === 'ATTACHMENT_FORBIDDEN' && err.statusCode === 400
      );
    });

    it('rejects sendChannelMessage if any attachment validation fails', async () => {
      const origGetChannelAuth = authorizationService.getChannelAuth;
      const origValidateAttachments = fileService.validateMessageAttachments;

      try {
        authorizationService.getChannelAuth = async () => ({
          canAccess: true,
          organizationId: 'org-abc',
        } as any);

        fileService.validateMessageAttachments = async () => {
          throw new FileServiceError('FILE_NOT_READY', 'Attachment file is not ready', 400);
        };

        await assert.rejects(
          async () => {
            await messagingService.sendChannelMessage('chan-1', 'user-1', {
              content: 'Hello with invalid attachment',
              attachmentFileIds: ['file-not-ready'],
            });
          },
          (err: any) => err.code === 'FILE_NOT_READY'
        );
      } finally {
        authorizationService.getChannelAuth = origGetChannelAuth;
        fileService.validateMessageAttachments = origValidateAttachments;
      }
    });
  });

  // ==========================================================================
  // 8. ORGANIZATION FILE LISTING WITH CURSOR PAGINATION
  // ==========================================================================
  describe('FileService: listOrganizationFiles', () => {
    it('returns cursor-paginated list of non-deleted ready files', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      const origListFiles = fileRepository.listOrganizationFiles;

      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true, isOwner: false, isAdmin: false, isGuest: false,
        });

        const f1 = createMockDbFile({ id: 'f-1', created_at: new Date('2026-09-12T10:00:00Z') });
        const f2 = createMockDbFile({ id: 'f-2', created_at: new Date('2026-09-12T09:00:00Z') });

        fileRepository.listOrganizationFiles = async () => [f1, f2];

        const res = await fileService.listOrganizationFiles('org-abc', 'user-1', { limit: 10 });
        assert.strictEqual(res.items.length, 2);
        assert.strictEqual(res.hasMore, false);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
        fileRepository.listOrganizationFiles = origListFiles;
      }
    });
  });
});
