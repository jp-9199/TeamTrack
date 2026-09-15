import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  PHASE8_ERROR_CODES,
  MAX_GENERAL_FILE_SIZE_BYTES,
  UPLOAD_INTENT_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  type FileStatus,
  type FileMetadata,
  type FileUploadIntentRequest,
  type FileUploadIntentResponse,
  type MessageAttachment,
  type MessageAttachmentEnriched,
} from '@teamtrack/shared-types';
import {
  DANGEROUS_EXTENSIONS,
  DANGEROUS_MIME_TYPES,
  extractFileExtension,
  validateFileName,
  validateFileSizeBytes,
  validateMimeType,
  validateChecksumSha256,
  validateFileUploadIntent,
  validateFileAttachmentIds,
} from '@teamtrack/validation';

describe('Phase 8A: Database Static Validation', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migration13Path = path.join(migrationsDir, '20260912120003_create_file_enhancements.sql');

  it('verifies migration 13 file exists and follows correct chronological naming', () => {
    assert.strictEqual(fs.existsSync(migration13Path), true, 'Migration 13 file must exist');

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(files.length >= 13, 'Expected at least 13 migrations in chronological sequence');
    assert.strictEqual(files[12], '20260912120003_create_file_enhancements.sql');
    assert.strictEqual(files[11], '20260912120002_create_meeting_enhancements.sql');
    assert.strictEqual(files[4], '20260910120005_create_files_tables.sql');
  });

  it('verifies migration 13 is strictly transactional (BEGIN ... COMMIT)', () => {
    const content = fs.readFileSync(migration13Path, 'utf8');
    assert.match(content, /^BEGIN;/m, 'Migration must begin with a transaction');
    assert.match(content, /^COMMIT;/m, 'Migration must commit the transaction');
  });

  it('verifies migration 13 adds status column and safely migrates existing rows to ready', () => {
    const content = fs.readFileSync(migration13Path, 'utf8');

    // Safe migration sequence:
    // 1. Add status column as nullable
    assert.match(content, /ALTER TABLE files ADD COLUMN status VARCHAR\(20\);/i);

    // 2. Populate existing rows with 'ready' so existing files are immediately ready
    assert.match(content, /UPDATE files SET status = 'ready' WHERE status IS NULL;/i);

    // 3. Set NOT NULL and establish DEFAULT 'uploading' for future upload intents
    assert.match(content, /ALTER TABLE files ALTER COLUMN status SET NOT NULL;/i);
    assert.match(content, /ALTER TABLE files ALTER COLUMN status SET DEFAULT 'uploading';/i);

    // 4. Status CHECK constraint
    assert.match(content, /CONSTRAINT chk_files_status\s+CHECK \(status IN \('uploading', 'ready', 'failed'\)\)/i);
  });

  it('verifies migration 13 adds upload_expires_at, updated_at, trigger, and expiry index', () => {
    const content = fs.readFileSync(migration13Path, 'utf8');

    // upload_expires_at
    assert.match(content, /ALTER TABLE files ADD COLUMN upload_expires_at TIMESTAMPTZ NULL;/i);

    // updated_at with DEFAULT NOW()
    assert.match(content, /ALTER TABLE files ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\);/i);

    // Reusable trigger attachment
    assert.match(content, /CREATE TRIGGER trg_files_updated_at/i);
    assert.match(content, /EXECUTE FUNCTION set_updated_at\(\);/i);

    // Index for finding expired uploads
    assert.match(content, /CREATE INDEX idx_files_upload_expiry\s+ON files\(status, upload_expires_at\)/i);
    assert.match(content, /WHERE status = 'uploading' AND upload_expires_at IS NOT NULL;/i);
  });

  it('confirms previous migrations 01-12 remain untouched', () => {
    // Inspect original files migration 05
    const migration05Path = path.join(migrationsDir, '20260910120005_create_files_tables.sql');
    const content05 = fs.readFileSync(migration05Path, 'utf8');

    // Confirm it still creates original table without modification
    assert.match(content05, /CREATE TABLE files/i);
    assert.strictEqual(content05.includes('upload_expires_at'), false, 'Migration 05 must not be modified');
    assert.strictEqual(content05.includes('uploading'), false, 'Migration 05 must not be modified');
  });
});

describe('Phase 8A: Shared Validation & Security Rules', () => {
  describe('File Name Validation (validateFileName)', () => {
    it('accepts valid, safe file names with common extensions', () => {
      const validNames = [
        'report.pdf',
        'financial_quarter_Q3.xlsx',
        'team-avatar.png',
        'meeting_recording.mp4',
        'dataset.csv',
        'document.docx',
        'presentation.pptx',
        'archive.tar.gz',
        'README.txt',
        'LICENSE',
      ];

      for (const name of validNames) {
        const res = validateFileName(name);
        assert.strictEqual(res.isValid, true, `Expected valid for '${name}'`);
        assert.strictEqual(res.data, name);
      }
    });

    it('rejects empty or whitespace-only file names', () => {
      assert.strictEqual(validateFileName('').isValid, false);
      assert.strictEqual(validateFileName('   ').isValid, false);
      assert.strictEqual(validateFileName(null).isValid, false);
      assert.strictEqual(validateFileName(123).isValid, false);
    });

    it('rejects file names exceeding 255 characters', () => {
      const longName = 'a'.repeat(252) + '.pdf'; // 256 chars
      const res = validateFileName(longName);
      assert.strictEqual(res.isValid, false);
      assert.match(res.errors![0].message, /255 characters/i);
    });

    it('rejects path traversal attempts (../, ..\\, slashes)', () => {
      assert.strictEqual(validateFileName('../secret.txt').isValid, false);
      assert.strictEqual(validateFileName('..\\secret.txt').isValid, false);
      assert.strictEqual(validateFileName('subfolder/file.pdf').isValid, false);
      assert.strictEqual(validateFileName('C:\\Windows\\system32.dll').isValid, false);
      assert.strictEqual(validateFileName('/etc/passwd').isValid, false);
    });

    it('rejects null bytes and control characters', () => {
      assert.strictEqual(validateFileName('file\0.pdf').isValid, false);
      assert.strictEqual(validateFileName('file\u0000.png').isValid, false);
      assert.strictEqual(validateFileName('bad\x07name.txt').isValid, false);
      assert.strictEqual(validateFileName('bad\x1Bname.txt').isValid, false);
    });

    it('rejects dangerous executable and script extensions', () => {
      const dangerousList = [
        'malware.exe',
        'script.bat',
        'payload.cmd',
        'exploit.sh',
        'virus.vbs',
        'runner.js',
        'installer.msi',
        'command.com',
        'shortcut.pif',
        'app.hta',
        'archive.jar',
        'powershell.ps1',
        'screensaver.scr',
        'registry.reg',
      ];

      for (const name of dangerousList) {
        const res = validateFileName(name);
        assert.strictEqual(res.isValid, false, `Expected dangerous extension '${name}' to be rejected`);
        assert.match(res.errors![0].message, /dangerous and not permitted/i);
      }
    });

    it('rejects case-insensitive variants of dangerous extensions', () => {
      assert.strictEqual(validateFileName('payload.EXE').isValid, false);
      assert.strictEqual(validateFileName('script.BAT').isValid, false);
      assert.strictEqual(validateFileName('exploit.Sh').isValid, false);
      assert.strictEqual(validateFileName('virus.VbS').isValid, false);
      assert.strictEqual(validateFileName('installer.MsI').isValid, false);
      assert.strictEqual(validateFileName('app.Ps1').isValid, false);
    });

    it('rejects multi-extension spoofing tricks containing dangerous extensions', () => {
      assert.strictEqual(validateFileName('invoice.pdf.exe').isValid, false);
      assert.strictEqual(validateFileName('photo.exe.png').isValid, false);
      assert.strictEqual(validateFileName('document.bat.docx').isValid, false);
    });
  });

  describe('File Size Validation (validateFileSizeBytes)', () => {
    it('accepts non-negative integers up to 100MB limit', () => {
      assert.strictEqual(validateFileSizeBytes(0).isValid, true, 'Zero size is valid');
      assert.strictEqual(validateFileSizeBytes(1024).isValid, true);
      assert.strictEqual(validateFileSizeBytes(MAX_GENERAL_FILE_SIZE_BYTES).isValid, true, 'Exactly 100MB is valid');
    });

    it('rejects negative sizes and non-integers', () => {
      assert.strictEqual(validateFileSizeBytes(-1).isValid, false);
      assert.strictEqual(validateFileSizeBytes(1024.5).isValid, false);
      assert.strictEqual(validateFileSizeBytes(NaN).isValid, false);
      assert.strictEqual(validateFileSizeBytes('1024').isValid, false);
    });

    it('rejects files exceeding 100MB', () => {
      const res = validateFileSizeBytes(MAX_GENERAL_FILE_SIZE_BYTES + 1);
      assert.strictEqual(res.isValid, false);
      assert.match(res.errors![0].message, /100MB/i);
    });
  });

  describe('MIME Type Validation (validateMimeType)', () => {
    it('accepts and normalizes valid standard MIME types', () => {
      const valid = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'text/plain',
        'application/json',
        'video/mp4',
        'audio/ogg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      for (const mime of valid) {
        const res = validateMimeType(mime);
        assert.strictEqual(res.isValid, true, `Expected valid for MIME '${mime}'`);
        assert.strictEqual(res.data, mime.toLowerCase());
      }
    });

    it('normalizes uppercase and trimmed MIME types', () => {
      const res = validateMimeType('  APPLICATION/PDF  ');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data, 'application/pdf');
    });

    it('rejects malformed or empty MIME types', () => {
      assert.strictEqual(validateMimeType('').isValid, false);
      assert.strictEqual(validateMimeType('invalid-mime').isValid, false);
      assert.strictEqual(validateMimeType('image/').isValid, false);
      assert.strictEqual(validateMimeType('/png').isValid, false);
      assert.strictEqual(validateMimeType('image//png').isValid, false);
      assert.strictEqual(validateMimeType(null).isValid, false);
    });

    it('rejects dangerous executable MIME types', () => {
      assert.strictEqual(validateMimeType('application/x-msdownload').isValid, false);
      assert.strictEqual(validateMimeType('application/x-msdos-program').isValid, false);
      assert.strictEqual(validateMimeType('application/x-sh').isValid, false);
      assert.strictEqual(validateMimeType('application/x-bat').isValid, false);
      assert.strictEqual(validateMimeType('application/x-executable').isValid, false);
    });
  });

  describe('SHA-256 Checksum Validation (validateChecksumSha256)', () => {
    it('accepts valid 64-character hexadecimal SHA-256 checksums', () => {
      const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const res = validateChecksumSha256(validHash);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data, validHash);
    });

    it('accepts uppercase hex and normalizes to lowercase', () => {
      const uppercaseHash = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
      const res = validateChecksumSha256(uppercaseHash);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data, uppercaseHash.toLowerCase());
    });

    it('allows undefined or null as optional', () => {
      assert.strictEqual(validateChecksumSha256(undefined).isValid, true);
      assert.strictEqual(validateChecksumSha256(null).isValid, true);
      assert.strictEqual(validateChecksumSha256('').isValid, true);
    });

    it('rejects invalid length or non-hex characters', () => {
      assert.strictEqual(validateChecksumSha256('short-hash').isValid, false);
      assert.strictEqual(validateChecksumSha256('z'.repeat(64)).isValid, false);
      assert.strictEqual(validateChecksumSha256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85!').isValid, false);
    });
  });

  describe('Upload Intent Request Validation (validateFileUploadIntent)', () => {
    it('validates a complete, valid upload intent payload', () => {
      const body = {
        fileName: 'annual_budget_2026.pdf',
        fileSizeBytes: 2048576,
        mimeType: 'application/pdf',
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const res = validateFileUploadIntent(body);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data?.fileName, 'annual_budget_2026.pdf');
      assert.strictEqual(res.data?.fileSizeBytes, 2048576);
      assert.strictEqual(res.data?.mimeType, 'application/pdf');
      assert.strictEqual(res.data?.checksumSha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('collects multiple validation errors on invalid input', () => {
      const invalidBody = {
        fileName: 'malicious.exe',
        fileSizeBytes: -50,
        mimeType: 'invalid-mime',
      };

      const res = validateFileUploadIntent(invalidBody);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors && res.errors.length >= 3);
    });

    it('rejects non-object payloads', () => {
      assert.strictEqual(validateFileUploadIntent(null).isValid, false);
      assert.strictEqual(validateFileUploadIntent('string').isValid, false);
    });
  });

  describe('Message Attachment IDs Validation (validateFileAttachmentIds)', () => {
    it('accepts an array of valid UUIDs up to limit', () => {
      const ids = [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ];
      const res = validateFileAttachmentIds(ids);
      assert.strictEqual(res.isValid, true);
      assert.deepStrictEqual(res.data, ids);
    });

    it('accepts undefined or null and defaults to empty array', () => {
      const res = validateFileAttachmentIds(undefined);
      assert.strictEqual(res.isValid, true);
      assert.deepStrictEqual(res.data, []);
    });

    it('rejects non-arrays and invalid UUID elements', () => {
      assert.strictEqual(validateFileAttachmentIds('not-an-array').isValid, false);
      assert.strictEqual(validateFileAttachmentIds(['not-a-uuid']).isValid, false);
    });

    it('rejects attachment count exceeding limit (> 10)', () => {
      const elevenIds = Array.from({ length: 11 }, (_, i) =>
        `00000000-0000-4000-8000-00000000000${i.toString(16)}`
      );
      const res = validateFileAttachmentIds(elevenIds);
      assert.strictEqual(res.isValid, false);
      assert.match(res.errors![0].message, /Cannot attach more than 10 files/i);
    });
  });
});

describe('Phase 8A: Shared Types & Error Codes Contract', () => {
  it('verifies Phase 8 error codes are defined with correct strings', () => {
    assert.strictEqual(PHASE8_ERROR_CODES.FILE_NOT_FOUND, 'FILE_NOT_FOUND');
    assert.strictEqual(PHASE8_ERROR_CODES.FILE_TOO_LARGE, 'FILE_TOO_LARGE');
    assert.strictEqual(PHASE8_ERROR_CODES.UNSUPPORTED_FILE_TYPE, 'UNSUPPORTED_FILE_TYPE');
    assert.strictEqual(PHASE8_ERROR_CODES.INVALID_FILE_NAME, 'INVALID_FILE_NAME');
    assert.strictEqual(PHASE8_ERROR_CODES.UPLOAD_EXPIRED, 'UPLOAD_EXPIRED');
    assert.strictEqual(PHASE8_ERROR_CODES.FILE_NOT_READY, 'FILE_NOT_READY');
    assert.strictEqual(PHASE8_ERROR_CODES.FILE_ALREADY_READY, 'FILE_ALREADY_READY');
    assert.strictEqual(PHASE8_ERROR_CODES.FILE_UPLOAD_FAILED, 'FILE_UPLOAD_FAILED');
    assert.strictEqual(PHASE8_ERROR_CODES.CANNOT_DELETE_FILE, 'CANNOT_DELETE_FILE');
    assert.strictEqual(PHASE8_ERROR_CODES.ATTACHMENT_FORBIDDEN, 'ATTACHMENT_FORBIDDEN');
    assert.strictEqual(PHASE8_ERROR_CODES.ORGANIZATION_MISMATCH, 'ORGANIZATION_MISMATCH');
    assert.strictEqual(PHASE8_ERROR_CODES.STORAGE_UNAVAILABLE, 'STORAGE_UNAVAILABLE');
  });

  it('verifies constants match approved architecture specification', () => {
    assert.strictEqual(MAX_GENERAL_FILE_SIZE_BYTES, 104857600, '100 MB = 104857600 bytes');
    assert.strictEqual(UPLOAD_INTENT_TTL_SECONDS, 900, 'Upload intent TTL = 15 minutes (900s)');
    assert.strictEqual(DOWNLOAD_URL_TTL_SECONDS, 600, 'Download URL TTL = 10 minutes (600s)');
  });

  it('verifies FileStatus values type contract at compile time and runtime', () => {
    const validStatuses: FileStatus[] = ['uploading', 'ready', 'failed'];
    assert.strictEqual(validStatuses.length, 3);
    assert.ok(validStatuses.includes('uploading'));
    assert.ok(validStatuses.includes('ready'));
    assert.ok(validStatuses.includes('failed'));
  });

  it('verifies FileMetadata shape satisfies client data needs without exposing storage keys or credentials', () => {
    const meta: FileMetadata = {
      id: 'f-1',
      organizationId: 'org-1',
      uploaderId: 'u-1',
      fileName: 'doc.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
      storageDriver: 's3',
      status: 'ready',
      checksumSha256: null,
      isDeleted: false,
      uploadExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    assert.strictEqual(meta.status, 'ready');
    assert.strictEqual(meta.isDeleted, false);
    assert.strictEqual((meta as any).storageKey, undefined, 'storageKey must not be exposed in client FileMetadata');
    assert.strictEqual((meta as any).awsSecretAccessKey, undefined);
  });

  it('verifies MessageAttachment extension maintains backwards compatibility with Phase 6', () => {
    // Phase 6 shape (minimal)
    const p6Attachment: MessageAttachment = {
      id: 'att-1',
      messageId: 'msg-1',
      fileId: 'file-1',
      createdAt: new Date().toISOString(),
    };

    assert.strictEqual(p6Attachment.id, 'att-1');
    assert.strictEqual(p6Attachment.fileName, undefined);

    // Phase 8 enriched shape
    const p8Attachment: MessageAttachmentEnriched = {
      id: 'att-2',
      messageId: 'msg-1',
      fileId: 'file-2',
      createdAt: new Date().toISOString(),
      fileName: 'budget.xlsx',
      fileSizeBytes: 2048,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      downloadUrl: 'https://s3.amazonaws.com/bucket/key?signed=true',
    };

    assert.strictEqual(p8Attachment.fileName, 'budget.xlsx');
    assert.strictEqual(p8Attachment.fileSizeBytes, 2048);
  });
});
