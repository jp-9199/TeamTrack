export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string;
  etag: string;
  lastModified?: Date;
}

export interface SignedUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string; // ISO-8601 UTC
}

export interface StorageProvider {
  readonly driver: 's3' | 'mock';

  /**
   * Generates a short-lived presigned URL for direct client PUT upload.
   */
  getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds?: number,
    contentLength?: number
  ): Promise<SignedUploadUrlResult>;

  /**
   * Generates a short-lived presigned URL for direct client GET download.
   */
  getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds?: number,
    downloadFilename?: string
  ): Promise<string>;

  /**
   * Verifies object existence and retrieves byte size and ETag from storage.
   * Returns null if the object does not exist.
   */
  headObject(storageKey: string): Promise<StorageObjectMetadata | null>;

  /**
   * Deletes an object from storage. Idempotent on missing objects.
   */
  deleteObject(storageKey: string): Promise<void>;

  /**
   * Batch deletes objects from storage. Empty list is a safe no-op.
   */
  deleteObjects(storageKeys: string[]): Promise<void>;
}
