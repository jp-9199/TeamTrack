import {
  UPLOAD_INTENT_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
} from '@teamtrack/shared-types';
import type {
  StorageProvider,
  StorageObjectMetadata,
  SignedUploadUrlResult,
} from './storage.types.js';
import { validateStorageKey } from './storageKey.validator.js';
import { StorageSigningError } from './storage.errors.js';

export interface MockStoredObject {
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  buffer?: Buffer;
}

export class MockStorageProvider implements StorageProvider {
  public readonly driver = 'mock' as const;
  private readonly objects = new Map<string, MockStoredObject>();

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = UPLOAD_INTENT_TTL_SECONDS,
    contentLength?: number
  ): Promise<SignedUploadUrlResult> {
    const validKey = validateStorageKey(storageKey);

    if (!contentType || contentType.trim().length === 0) {
      throw new StorageSigningError('ContentType is required to sign upload URL');
    }

    const expiresIn = expiresInSeconds > 0 ? expiresInSeconds : UPLOAD_INTENT_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const uploadUrl = `mock-s3://teamtrack-mock-bucket/${validKey}?action=upload&expires=${encodeURIComponent(expiresAt)}&type=${encodeURIComponent(contentType)}${contentLength !== undefined ? `&size=${contentLength}` : ''}`;

    return {
      uploadUrl,
      storageKey: validKey,
      expiresAt,
    };
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
    downloadFilename?: string
  ): Promise<string> {
    const validKey = validateStorageKey(storageKey);

    const expiresIn = expiresInSeconds > 0 ? expiresInSeconds : DOWNLOAD_URL_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    let downloadUrl = `mock-s3://teamtrack-mock-bucket/${validKey}?action=download&expires=${encodeURIComponent(expiresAt)}`;
    if (downloadFilename && downloadFilename.trim().length > 0) {
      downloadUrl += `&filename=${encodeURIComponent(downloadFilename.trim())}`;
    }

    return downloadUrl;
  }

  async headObject(storageKey: string): Promise<StorageObjectMetadata | null> {
    const validKey = validateStorageKey(storageKey);
    const obj = this.objects.get(validKey);

    if (!obj) {
      return null;
    }

    return {
      contentLength: obj.size,
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: obj.lastModified,
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    const validKey = validateStorageKey(storageKey);
    this.objects.delete(validKey);
  }

  async deleteObjects(storageKeys: string[]): Promise<void> {
    if (!storageKeys || storageKeys.length === 0) {
      return;
    }

    for (const key of storageKeys) {
      const validKey = validateStorageKey(key);
      this.objects.delete(validKey);
    }
  }

  // ==========================================================================
  // Test Helpers
  // ==========================================================================

  putMockObject(
    storageKey: string,
    options: {
      size?: number;
      contentType?: string;
      etag?: string;
      buffer?: Buffer;
    } = {}
  ): void {
    const validKey = validateStorageKey(storageKey);
    this.objects.set(validKey, {
      size: options.size !== undefined ? options.size : (options.buffer ? options.buffer.length : 1024),
      contentType: options.contentType || 'application/octet-stream',
      etag: options.etag || 'mock-etag-12345',
      lastModified: new Date(),
      buffer: options.buffer,
    });
  }

  hasMockObject(storageKey: string): boolean {
    return this.objects.has(validateStorageKey(storageKey));
  }

  clear(): void {
    this.objects.clear();
  }
}
