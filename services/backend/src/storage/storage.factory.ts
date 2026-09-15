import { config } from '../config/index.js';
import type { StorageProvider } from './storage.types.js';
import { S3StorageProvider } from './s3Storage.provider.js';
import { MockStorageProvider } from './mockStorage.provider.js';
import { InvalidStorageConfigError } from './storage.errors.js';

let activeProvider: StorageProvider | null = null;

export function resolveStorageProvider(): StorageProvider {
  const driver = config.storage.driver;

  if (driver === 'mock') {
    if (config.isProduction) {
      throw new InvalidStorageConfigError('FATAL: MockStorageProvider is strictly disallowed in production');
    }
    return new MockStorageProvider();
  }

  if (driver === 's3') {
    const s3Config = config.storage.s3;

    if (!s3Config.bucket || s3Config.bucket.trim().length === 0) {
      throw new InvalidStorageConfigError('S3_BUCKET must be configured when storage driver is s3');
    }

    if (config.isProduction && (!s3Config.accessKeyId || !s3Config.secretAccessKey)) {
      throw new InvalidStorageConfigError(
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured in production'
      );
    }

    return new S3StorageProvider({
      bucket: s3Config.bucket,
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      credentials:
        s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined,
      forcePathStyle: s3Config.forcePathStyle,
    });
  }

  throw new InvalidStorageConfigError(`Unsupported storage driver: '${driver}'`);
}

export function getStorageProvider(): StorageProvider {
  if (!activeProvider) {
    activeProvider = resolveStorageProvider();
  }
  return activeProvider;
}

export function setStorageProviderForTest(provider: StorageProvider | null): void {
  activeProvider = provider;
}
