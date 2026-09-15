import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  S3StorageProvider,
  MockStorageProvider,
  resolveStorageProvider,
  setStorageProviderForTest,
  validateStorageKey,
  InvalidStorageKeyError,
  InvalidStorageConfigError,
  StorageUnavailableError,
  StorageSigningError,
  type StorageProvider,
} from '../src/storage/index.js';
import { config } from '../src/config/index.js';
import {
  UPLOAD_INTENT_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
} from '@teamtrack/shared-types';

describe('Phase 8B: Storage Key Security Validation', () => {
  it('accepts valid, safe storage keys', () => {
    const validKeys = [
      'tenants/org-123/files/file-456/document.pdf',
      'avatars/user-789.png',
      'exports/2026/09/data.csv',
      'a/b/c/d/e.txt',
      'simple-key-123',
    ];

    for (const key of validKeys) {
      assert.strictEqual(validateStorageKey(key), key);
    }
  });

  it('rejects empty or whitespace-only keys', () => {
    assert.throws(() => validateStorageKey(''), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('   '), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey(null as any), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey(undefined as any), InvalidStorageKeyError);
  });

  it('rejects keys exceeding 1024 characters', () => {
    const longKey = 'a/'.repeat(513); // 1026 chars
    assert.throws(() => validateStorageKey(longKey), InvalidStorageKeyError);
  });

  it('rejects path traversal attempts (../, ..\\, embedded dots)', () => {
    assert.throws(() => validateStorageKey('../secret.txt'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('..\\secret.txt'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('tenants/org-1/../../../etc/passwd'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('tenants/../other-org/file.pdf'), InvalidStorageKeyError);
  });

  it('rejects absolute paths and drive letters', () => {
    assert.throws(() => validateStorageKey('/root/file.pdf'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('\\Windows\\system32'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('C:\\uploads\\file.pdf'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('D:/uploads/file.pdf'), InvalidStorageKeyError);
  });

  it('rejects null bytes and control characters', () => {
    assert.throws(() => validateStorageKey('tenants/file\0.pdf'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('tenants/file\u0000.pdf'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('bad\x07key.txt'), InvalidStorageKeyError);
    assert.throws(() => validateStorageKey('bad\x1Bkey.txt'), InvalidStorageKeyError);
  });
});

describe('Phase 8B: MockStorageProvider Implementation', () => {
  let mock: MockStorageProvider;

  beforeEach(() => {
    mock = new MockStorageProvider();
  });

  it('generates presigned upload URL with expiration and content type', async () => {
    const result = await mock.getSignedUploadUrl(
      'tenants/org-1/files/f-1/doc.pdf',
      'application/pdf',
      UPLOAD_INTENT_TTL_SECONDS
    );

    assert.strictEqual(mock.driver, 'mock');
    assert.strictEqual(result.storageKey, 'tenants/org-1/files/f-1/doc.pdf');
    assert.ok(result.uploadUrl.startsWith('mock-s3://teamtrack-mock-bucket/'));
    assert.ok(result.uploadUrl.includes('action=upload'));
    assert.ok(result.uploadUrl.includes('application%2Fpdf'));
    assert.ok(new Date(result.expiresAt).getTime() > Date.now());
  });

  it('generates presigned download URL with optional attachment filename', async () => {
    const downloadUrl = await mock.getSignedDownloadUrl(
      'tenants/org-1/files/f-1/doc.pdf',
      DOWNLOAD_URL_TTL_SECONDS,
      'Quarterly Report.pdf'
    );

    assert.ok(downloadUrl.startsWith('mock-s3://teamtrack-mock-bucket/'));
    assert.ok(downloadUrl.includes('action=download'));
    assert.ok(downloadUrl.includes('Quarterly%20Report.pdf'));
  });

  it('returns null for headObject when object does not exist', async () => {
    const meta = await mock.headObject('tenants/org-1/files/f-1/nonexistent.pdf');
    assert.strictEqual(meta, null);
  });

  it('returns object metadata when mock object was stored', async () => {
    mock.putMockObject('tenants/org-1/files/f-1/stored.pdf', {
      size: 4096,
      contentType: 'application/pdf',
      etag: 'mock-etag-abc',
    });

    const meta = await mock.headObject('tenants/org-1/files/f-1/stored.pdf');
    assert.notStrictEqual(meta, null);
    assert.strictEqual(meta?.contentLength, 4096);
    assert.strictEqual(meta?.contentType, 'application/pdf');
    assert.strictEqual(meta?.etag, 'mock-etag-abc');
  });

  it('deletes object idempotently', async () => {
    mock.putMockObject('tenants/org-1/files/f-1/to-delete.pdf');
    assert.strictEqual(mock.hasMockObject('tenants/org-1/files/f-1/to-delete.pdf'), true);

    await mock.deleteObject('tenants/org-1/files/f-1/to-delete.pdf');
    assert.strictEqual(mock.hasMockObject('tenants/org-1/files/f-1/to-delete.pdf'), false);

    // Second delete on non-existent object is a safe no-op
    await mock.deleteObject('tenants/org-1/files/f-1/to-delete.pdf');
  });

  it('batch deletes objects and handles empty input safely', async () => {
    // Empty list is a safe no-op
    await mock.deleteObjects([]);

    mock.putMockObject('key1.pdf');
    mock.putMockObject('key2.pdf');
    mock.putMockObject('key3.pdf');

    await mock.deleteObjects(['key1.pdf', 'key3.pdf']);
    assert.strictEqual(mock.hasMockObject('key1.pdf'), false);
    assert.strictEqual(mock.hasMockObject('key2.pdf'), true);
    assert.strictEqual(mock.hasMockObject('key3.pdf'), false);
  });
});

describe('Phase 8B: S3StorageProvider Implementation (Mocked SDK Client)', () => {
  it('throws InvalidStorageConfigError if bucket name is missing', () => {
    assert.throws(
      () => new S3StorageProvider({ bucket: '' }),
      InvalidStorageConfigError
    );
  });

  it('presigns PUT upload URL without leaking credentials', async () => {
    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      region: 'us-west-2',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    const result = await provider.getSignedUploadUrl(
      'tenants/org-1/files/f-1/data.csv',
      'text/csv',
      900
    );

    assert.strictEqual(provider.driver, 's3');
    assert.strictEqual(result.storageKey, 'tenants/org-1/files/f-1/data.csv');
    assert.ok(typeof result.uploadUrl === 'string');
    assert.ok(result.uploadUrl.includes('test-bucket'));
    assert.ok(result.uploadUrl.includes('X-Amz-Signature') || result.uploadUrl.includes('data.csv'));

    // Security check: secretAccessKey must NEVER appear in the upload URL or result object
    assert.strictEqual(result.uploadUrl.includes('test-secret'), false);
    assert.strictEqual((result as any).secretAccessKey, undefined);
  });

  it('presigns GET download URL with optional sanitized filename', async () => {
    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      region: 'us-west-2',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    const downloadUrl = await provider.getSignedDownloadUrl(
      'tenants/org-1/files/f-1/data.csv',
      600,
      'Annual "Report"\r\n.csv'
    );

    assert.ok(typeof downloadUrl === 'string');
    assert.ok(downloadUrl.includes('test-bucket'));
    // Quotes and newlines must be sanitized out
    assert.strictEqual(downloadUrl.includes('\r'), false);
    assert.strictEqual(downloadUrl.includes('\n'), false);
  });

  it('maps HeadObject result and strips surrounding quotes from ETag', async () => {
    const mockDate = new Date();
    const mockS3Client = {
      send: async (cmd: any) => {
        if (cmd.constructor.name === 'HeadObjectCommand') {
          return {
            ContentLength: 8192,
            ContentType: 'application/pdf',
            ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
            LastModified: mockDate,
          };
        }
        return {};
      },
    } as any;

    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      s3Client: mockS3Client,
    });

    const meta = await provider.headObject('tenants/org-1/files/f-1/doc.pdf');
    assert.notStrictEqual(meta, null);
    assert.strictEqual(meta?.contentLength, 8192);
    assert.strictEqual(meta?.contentType, 'application/pdf');
    assert.strictEqual(meta?.etag, 'd41d8cd98f00b204e9800998ecf8427e');
    assert.strictEqual(meta?.lastModified, mockDate);
  });

  it('returns null when HeadObject throws NotFound or 404', async () => {
    const notFoundError = new Error('Not Found');
    notFoundError.name = 'NotFound';
    (notFoundError as any).$metadata = { httpStatusCode: 404 };

    const mockS3Client = {
      send: async () => {
        throw notFoundError;
      },
    } as any;

    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      s3Client: mockS3Client,
    });

    const meta = await provider.headObject('missing-key.pdf');
    assert.strictEqual(meta, null);
  });

  it('throws StorageUnavailableError when HeadObject encounters a storage failure', async () => {
    const networkError = new Error('Connection refused by endpoint');
    networkError.name = 'TimeoutError';

    const mockS3Client = {
      send: async () => {
        throw networkError;
      },
    } as any;

    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      s3Client: mockS3Client,
    });

    await assert.rejects(
      async () => provider.headObject('some-key.pdf'),
      StorageUnavailableError
    );
  });

  it('deletes object and treats 404 as safe idempotent success', async () => {
    let deletedKey = '';
    const notFoundError = new Error('NoSuchKey');
    notFoundError.name = 'NoSuchKey';
    (notFoundError as any).$metadata = { httpStatusCode: 404 };

    const mockS3Client = {
      send: async (cmd: any) => {
        deletedKey = cmd.input.Key;
        throw notFoundError;
      },
    } as any;

    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      s3Client: mockS3Client,
    });

    // Should not throw on 404
    await provider.deleteObject('already-deleted.pdf');
    assert.strictEqual(deletedKey, 'already-deleted.pdf');
  });

  it('batch deletes objects and avoids network call on empty list', async () => {
    let callCount = 0;
    const mockS3Client = {
      send: async () => {
        callCount++;
        return { Deleted: [{ Key: 'k1' }] };
      },
    } as any;

    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      s3Client: mockS3Client,
    });

    await provider.deleteObjects([]);
    assert.strictEqual(callCount, 0, 'Must not send network request on empty list');

    await provider.deleteObjects(['k1', 'k2']);
    assert.strictEqual(callCount, 1);
  });
});

describe('Phase 8B: Storage Factory & Fail-Closed Production Invariants', () => {
  it('resolves MockStorageProvider in development/test environment', () => {
    const originalDriver = config.storage.driver;
    try {
      (config.storage as any).driver = 'mock';
      const provider = resolveStorageProvider();
      assert.strictEqual(provider.driver, 'mock');
      assert.ok(provider instanceof MockStorageProvider);
    } finally {
      (config.storage as any).driver = originalDriver;
    }
  });

  it('strictly rejects MockStorageProvider in production (fail-closed rule)', () => {
    const origIsProd = config.isProduction;
    const origDriver = config.storage.driver;

    try {
      (config as any).isProduction = true;
      (config.storage as any).driver = 'mock';

      assert.throws(
        () => resolveStorageProvider(),
        /MockStorageProvider is strictly disallowed in production/
      );
    } finally {
      (config as any).isProduction = origIsProd;
      (config.storage as any).driver = origDriver;
    }
  });

  it('rejects unsupported storage drivers', () => {
    const origDriver = config.storage.driver;

    try {
      (config.storage as any).driver = 'ftp';
      assert.throws(
        () => resolveStorageProvider(),
        /Unsupported storage driver: 'ftp'/
      );
    } finally {
      (config.storage as any).driver = origDriver;
    }
  });

  it('allows polymorphic usage of StorageProvider interface', async () => {
    const mockProvider: StorageProvider = new MockStorageProvider();
    setStorageProviderForTest(mockProvider);

    // Application caller does not know whether it is S3 or Mock
    const upload = await mockProvider.getSignedUploadUrl('tenants/org-1/f-1.pdf', 'application/pdf');
    assert.strictEqual(upload.storageKey, 'tenants/org-1/f-1.pdf');

    setStorageProviderForTest(null);
  });
});
