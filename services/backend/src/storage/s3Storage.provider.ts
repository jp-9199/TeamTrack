import {
  S3Client,
  type S3ClientConfig,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
import {
  StorageError,
  StorageUnavailableError,
  StorageSigningError,
  InvalidStorageConfigError,
} from './storage.errors.js';

export interface S3ProviderOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  forcePathStyle?: boolean;
  s3Client?: S3Client;
}

export class S3StorageProvider implements StorageProvider {
  public readonly driver = 's3' as const;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: S3ProviderOptions) {
    if (!options || !options.bucket || options.bucket.trim().length === 0) {
      throw new InvalidStorageConfigError('S3 bucket name is required');
    }
    this.bucket = options.bucket.trim();

    if (options.s3Client) {
      this.client = options.s3Client;
    } else {
      const clientConfig: S3ClientConfig = {
        region: options.region || 'us-east-1',
        forcePathStyle: Boolean(options.forcePathStyle),
      };

      if (options.endpoint && options.endpoint.trim().length > 0) {
        clientConfig.endpoint = options.endpoint.trim();
      }

      if (options.credentials?.accessKeyId && options.credentials?.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: options.credentials.accessKeyId.trim(),
          secretAccessKey: options.credentials.secretAccessKey.trim(),
        };
      }

      this.client = new S3Client(clientConfig);
    }
  }

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

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: validKey,
        ContentType: contentType.trim().toLowerCase(),
        ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
      });

      const expiresIn = expiresInSeconds > 0 ? expiresInSeconds : UPLOAD_INTENT_TTL_SECONDS;
      const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      return {
        uploadUrl,
        storageKey: validKey,
        expiresAt,
      };
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      throw new StorageSigningError(`Failed to generate signed upload URL: ${err.message || 'Signing failed'}`);
    }
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
    downloadFilename?: string
  ): Promise<string> {
    const validKey = validateStorageKey(storageKey);

    try {
      const commandInput: GetObjectCommandInput = {
        Bucket: this.bucket,
        Key: validKey,
      };

      if (downloadFilename && downloadFilename.trim().length > 0) {
        const sanitized = downloadFilename.trim().replace(/["\r\n]/g, '_');
        commandInput.ResponseContentDisposition = `attachment; filename="${sanitized}"`;
      }

      const expiresIn = expiresInSeconds > 0 ? expiresInSeconds : DOWNLOAD_URL_TTL_SECONDS;
      return await getSignedUrl(this.client, new GetObjectCommand(commandInput), { expiresIn });
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      throw new StorageSigningError(`Failed to generate signed download URL: ${err.message || 'Signing failed'}`);
    }
  }

  async headObject(storageKey: string): Promise<StorageObjectMetadata | null> {
    const validKey = validateStorageKey(storageKey);

    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: validKey,
        })
      );

      return {
        contentLength: Number(res.ContentLength) || 0,
        contentType: res.ContentType || 'application/octet-stream',
        etag: res.ETag ? res.ETag.replace(/"/g, '') : '',
        lastModified: res.LastModified,
      };
    } catch (err: any) {
      // S3 404 can present as NotFound, NoSuchKey, or httpStatusCode 404
      if (
        err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.statusCode === 404
      ) {
        return null;
      }

      throw new StorageUnavailableError(
        `Failed to retrieve object metadata from storage: ${err.message || 'Storage error'}`
      );
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    const validKey = validateStorageKey(storageKey);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: validKey,
        })
      );
    } catch (err: any) {
      // Idempotent: deleting a non-existent object in S3 is safe
      if (
        err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return;
      }

      throw new StorageUnavailableError(
        `Failed to delete object from storage: ${err.message || 'Storage error'}`
      );
    }
  }

  async deleteObjects(storageKeys: string[]): Promise<void> {
    if (!storageKeys || storageKeys.length === 0) {
      return;
    }

    const validKeys = storageKeys.map((k) => validateStorageKey(k));

    try {
      const res = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: validKeys.map((k) => ({ Key: k })),
            Quiet: true,
          },
        })
      );

      if (res.Errors && res.Errors.length > 0) {
        const failedKeys = res.Errors.map((e) => e.Key).filter(Boolean).join(', ');
        throw new StorageError(
          'BATCH_DELETE_PARTIAL_FAILURE',
          `Failed to delete one or more objects from storage: ${failedKeys}`,
          500
        );
      }
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      throw new StorageUnavailableError(
        `Failed to batch delete objects from storage: ${err.message || 'Storage error'}`
      );
    }
  }
}
