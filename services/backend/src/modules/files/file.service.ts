import crypto from 'crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { fileRepository, type DbFile } from '../../db/repositories/file.repository.js';
import { fileAuthorizationService } from './file.auth.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { getStorageProvider } from '../../storage/index.js';
import { FileServiceError } from './file.errors.js';
import {
  validateFileUploadIntent,
  decodeCursor,
  encodeCursor,
} from '@teamtrack/validation';
import {
  UPLOAD_INTENT_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  type FileMetadata,
  type FileUploadIntentRequest,
  type FileUploadIntentResponse,
  type CursorPaginatedResponse,
} from '@teamtrack/shared-types';

/**
 * Generates a cryptographically secure, canonical storage key:
 * tenants/{organizationId}/files/{fileId}/{nonce}_{sanitizedBasename}
 */
export function generateStorageKey(organizationId: string, fileId: string, originalName: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  // Strip directory paths and extract base filename
  const baseName = originalName.replace(/\\/g, '/').split('/').pop() || 'file';
  // Strip traversal dots '..' and non-alphanumeric characters except safe symbols
  const sanitized = baseName
    .replace(/\.{2,}/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'file';
  return `tenants/${organizationId}/files/${fileId}/${nonce}_${sanitized}`;
}


export class FileService {
  /**
   * Creates an upload intent for direct client-to-storage PUT upload.
   * Derives tenant context strictly from the authorized route organizationId.
   */
  async createUploadIntent(
    userId: string,
    organizationId: string,
    body: unknown
  ): Promise<FileUploadIntentResponse> {
    // 1. Validate request body (Phase 8A validation rules)
    const validation = validateFileUploadIntent(body);
    if (!validation.isValid) {
      throw new FileServiceError(
        'VALIDATION_FAILED',
        validation.errors[0]?.message || 'Invalid upload intent payload',
        400
      );
    }

    const { fileName, fileSizeBytes, mimeType, checksumSha256 } = validation.data;

    // 2. Authorize organization membership
    const canCreate = await fileAuthorizationService.canCreateFileInOrg(userId, organizationId);
    if (!canCreate) {
      throw new FileServiceError('NOT_FOUND', 'Organization not found or inactive', 404);
    }

    // 3. Generate file UUID and secure canonical storage key
    const fileId = crypto.randomUUID();
    const storageKey = generateStorageKey(organizationId, fileId, fileName);
    const uploadExpiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1000);

    // 4. Request presigned PUT URL from configured StorageProvider
    const storageProvider = getStorageProvider();
    const signResult = await storageProvider.getSignedUploadUrl(
      storageKey,
      mimeType,
      UPLOAD_INTENT_TTL_SECONDS,
      fileSizeBytes
    );

    // 5. Short DB transaction to insert the file record
    // If DB insert fails, presigned URL will be orphaned and expire safely in 15m.
    try {
      await withTransaction(async (client) => {
        await fileRepository.create(
          {
            id: fileId,
            organizationId,
            uploaderId: userId,
            fileName,
            fileSizeBytes,
            mimeType,
            storageDriver: storageProvider.driver,
            storageKey,
            checksumSha256: checksumSha256 || null,
            uploadExpiresAt,
            status: 'uploading',
          },
          client
        );
      });
    } catch (err: any) {
      throw new FileServiceError('STORAGE_UNAVAILABLE', `Failed to initialize file record: ${err.message}`, 500);
    }

    return {
      fileId,
      uploadUrl: signResult.uploadUrl,
      expiresAt: signResult.expiresAt,
    };
  }

  /**
   * Finalizes an upload by verifying remote object existence and size in object storage.
   *
   * CRITICAL PERMISSION: ONLY the original uploader may finalize the file.
   */
  async finalizeUpload(fileId: string, userId: string): Promise<FileMetadata> {
    // 1. Load file
    const file = await fileRepository.findById(fileId);
    if (!file || file.is_deleted) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    // 2. Anti-IDOR: verify organization membership
    const orgAuth = await authorizationService.getOrganizationAuth(userId, file.organization_id);
    if (!orgAuth.isMember) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    // 3. CRITICAL PERMISSION: Only the original uploader may finalize
    if (!fileAuthorizationService.canFinalizeFile(file, userId)) {
      throw new FileServiceError(
        'FORBIDDEN',
        'Only the uploader who originally created the upload intent may finalize it',
        403
      );
    }

    // 4. Verify status
    if (file.status === 'ready') {
      throw new FileServiceError('FILE_ALREADY_READY', 'File is already in ready status', 400);
    }
    if (file.status === 'failed') {
      throw new FileServiceError('FILE_UPLOAD_FAILED', 'File upload has failed', 400);
    }

    // 5. Verify upload has not expired
    if (file.upload_expires_at && new Date() > file.upload_expires_at) {
      await fileRepository.updateStatus(fileId, 'failed');
      throw new FileServiceError('UPLOAD_EXPIRED', 'Upload intent has expired', 400);
    }

    // 6. Verify actual object in storage
    const storageProvider = getStorageProvider();
    const head = await storageProvider.headObject(file.storage_key);
    if (!head) {
      throw new FileServiceError('FILE_UPLOAD_FAILED', 'Uploaded object not found in storage', 400);
    }

    // 7. Verify size
    if (head.contentLength !== Number(file.file_size_bytes)) {
      throw new FileServiceError(
        'FILE_UPLOAD_FAILED',
        `Object size mismatch (expected ${file.file_size_bytes} bytes, received ${head.contentLength} bytes)`,
        400
      );
    }

    // 7.5 Verify MIME type metadata when provided by storage provider
    // NOTE: This verifies metadata consistency with presigned PUT parameters,
    // but is NOT proof of content safety or an antivirus scan.
    if (head.contentType) {
      const providerMime = head.contentType.split(';')[0].trim().toLowerCase();
      const declaredMime = file.mime_type.split(';')[0].trim().toLowerCase();
      if (
        providerMime &&
        providerMime !== 'application/octet-stream' &&
        declaredMime !== 'application/octet-stream' &&
        providerMime !== declaredMime
      ) {
        throw new FileServiceError(
          'FILE_UPLOAD_FAILED',
          `Content type mismatch (expected ${declaredMime}, received ${providerMime})`,
          400
        );
      }
    }

    // 8. Row-locked transaction to prevent concurrent finalize race conditions

    const finalized = await withTransaction(async (client) => {
      const locked = await fileRepository.findByIdForUpdate(fileId, client);
      if (!locked || locked.is_deleted) {
        throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
      }
      if (locked.status === 'ready') {
        throw new FileServiceError('FILE_ALREADY_READY', 'File is already in ready status', 400);
      }
      if (locked.upload_expires_at && new Date() > locked.upload_expires_at) {
        await fileRepository.updateStatus(fileId, 'failed', client);
        throw new FileServiceError('UPLOAD_EXPIRED', 'Upload intent has expired', 400);
      }

      return await fileRepository.finalizeFile(fileId, client);
    });

    return fileRepository.mapFile(finalized!);
  }

  /**
   * Retrieves file metadata if the caller is authorized.
   */
  async getFile(fileId: string, userId: string): Promise<FileMetadata> {
    const file = await fileRepository.findById(fileId);
    if (!file || file.is_deleted) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    const canRead = await fileAuthorizationService.canReadFile(file, userId);
    if (!canRead) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    return fileRepository.mapFile(file);
  }

  /**
   * Generates a short-lived presigned GET download URL (600s TTL).
   * Forces Content-Disposition: attachment to protect against active browser content.
   */
  async getSignedDownloadUrl(fileId: string, userId: string): Promise<{ downloadUrl: string }> {
    const file = await fileRepository.findById(fileId);
    if (!file || file.is_deleted) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    const canRead = await fileAuthorizationService.canReadFile(file, userId);
    if (!canRead) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    if (file.status !== 'ready') {
      throw new FileServiceError('FILE_NOT_READY', 'File is not in ready status', 400);
    }

    const storageProvider = getStorageProvider();
    const downloadUrl = await storageProvider.getSignedDownloadUrl(
      file.storage_key,
      DOWNLOAD_URL_TTL_SECONDS,
      file.file_name
    );

    return { downloadUrl };
  }

  /**
   * Performs soft deletion in PostgreSQL and triggers decoupled remote storage deletion.
   * Database soft deletion is authoritative; storage failures do not resurrect the file.
   */
  async deleteFile(fileId: string, userId: string): Promise<{ message: string }> {
    const file = await fileRepository.findById(fileId);
    if (!file || file.is_deleted) {
      throw new FileServiceError('FILE_NOT_FOUND', 'File not found', 404);
    }

    const canDelete = await fileAuthorizationService.canDeleteFile(file, userId);
    if (!canDelete) {
      throw new FileServiceError('CANNOT_DELETE_FILE', 'User is not authorized to delete this file', 403);
    }

    // 1. Authoritative DB soft delete
    await fileRepository.softDeleteFile(fileId);

    // 2. Decoupled remote storage cleanup
    try {
      const storageProvider = getStorageProvider();
      await storageProvider.deleteObject(file.storage_key);
    } catch (err: any) {
      console.error(
        '[Storage Deletion Warning] Failed to delete physical object; soft delete remains authoritative:',
        err?.message || err
      );
    }

    return { message: 'File deleted successfully' };
  }

  /**
   * Lists non-deleted, ready files in an organization using keyset cursor pagination.
   */
  async listOrganizationFiles(
    organizationId: string,
    userId: string,
    options: { cursor?: string; limit?: number }
  ): Promise<CursorPaginatedResponse<FileMetadata>> {
    const orgAuth = await authorizationService.getOrganizationAuth(userId, organizationId);
    if (!orgAuth.isMember) {
      throw new FileServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

    let decodedCursor: { createdAt: string; id: string } | undefined = undefined;
    if (options.cursor) {
      const cursorRes = decodeCursor(options.cursor);
      if (!cursorRes.isValid) {
        throw new FileServiceError('VALIDATION_FAILED', 'Invalid cursor parameter', 400);
      }
      decodedCursor = cursorRes.data;
    }

    // Query limit + 1 to detect hasMore
    const rows = await fileRepository.listOrganizationFiles(
      organizationId,
      { cursor: decodedCursor, limit: limit + 1 }
    );

    // If caller is a guest, filter to only files they are authorized to see
    let filteredRows = rows;
    if (orgAuth.isGuest) {
      const accessibleRows: DbFile[] = [];
      for (const row of rows) {
        if (await fileAuthorizationService.canReadFile(row, userId)) {
          accessibleRows.push(row);
        }
      }
      filteredRows = accessibleRows;
    }

    const hasMore = filteredRows.length > limit;
    const items = filteredRows.slice(0, limit).map((r) => fileRepository.mapFile(r));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Validates attachments for message sending integration.
   */
  async validateMessageAttachments(
    attachmentFileIds: string[],
    targetOrgId: string,
    userId: string
  ): Promise<DbFile[]> {
    return fileAuthorizationService.validateAttachmentsForContext(attachmentFileIds, targetOrgId, userId);
  }
}

export const fileService = new FileService();
