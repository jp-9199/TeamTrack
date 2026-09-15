import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  FileMetadata,
  FileStatus,
  MessageAttachment,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbFile {
  id: string;
  organization_id: string;
  uploader_id: string;
  file_name: string;
  file_size_bytes: string | number; // pg returns bigint as string
  mime_type: string;
  storage_driver: string;
  storage_key: string;
  checksum_sha256: string | null;
  status: FileStatus;
  upload_expires_at: Date | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateFileParams {
  id?: string;
  organizationId: string;
  uploaderId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageDriver: string;
  storageKey: string;
  checksumSha256?: string | null;
  uploadExpiresAt?: Date | null;
  status?: FileStatus;
}

export interface AttachmentContext {
  messageId: string;
  channelId: string | null;
  conversationId: string | null;
}

export class FileRepository {
  /**
   * Maps a database row into a safe, client-facing FileMetadata DTO.
   * NOTE: storage_key is explicitly excluded to avoid leaking internal storage paths.
   */
  mapFile(row: DbFile): FileMetadata {
    return {
      id: row.id,
      organizationId: row.organization_id,
      uploaderId: row.uploader_id,
      fileName: row.file_name,
      fileSizeBytes: Number(row.file_size_bytes),
      mimeType: row.mime_type,
      storageDriver: row.storage_driver,
      status: row.status,
      checksumSha256: row.checksum_sha256,
      isDeleted: row.is_deleted,
      uploadExpiresAt: row.upload_expires_at ? row.upload_expires_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    };
  }

  /**
   * Alias for createFile.
   */
  async create(params: CreateFileParams, db: Queryable = pool): Promise<DbFile> {
    return this.createFile(params, db);
  }

  /**
   * Inserts a new file record with 'uploading' status and explicit expiry boundary.
   */
  async createFile(params: CreateFileParams, db: Queryable = pool): Promise<DbFile> {

    const res = await db.query<DbFile>(
      `INSERT INTO files (
         id, organization_id, uploader_id, file_name, file_size_bytes,
         mime_type, storage_driver, storage_key, checksum_sha256,
         status, upload_expires_at
       )
       VALUES (
         COALESCE($1, gen_random_uuid()), $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11
       )
       RETURNING id, organization_id, uploader_id, file_name, file_size_bytes,
                 mime_type, storage_driver, storage_key, checksum_sha256,
                 status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at`,
      [
        params.id || null,
        params.organizationId,
        params.uploaderId,
        params.fileName,
        params.fileSizeBytes,
        params.mimeType,
        params.storageDriver,
        params.storageKey,
        params.checksumSha256 || null,
        params.status || 'uploading',
        params.uploadExpiresAt || null,
      ]
    );

    return res.rows[0];
  }

  /**
   * Retrieves a file record by primary key ID.
   */
  async findById(id: string, db: Queryable = pool): Promise<DbFile | null> {
    const res = await db.query<DbFile>(
      `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
              mime_type, storage_driver, storage_key, checksum_sha256,
              status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
       FROM files
       WHERE id = $1`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Loads a file record inside a transaction with an exclusive row lock (SELECT ... FOR UPDATE)
   * to eliminate race conditions during state transitions.
   */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<DbFile | null> {
    const res = await client.query<DbFile>(
      `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
              mime_type, storage_driver, storage_key, checksum_sha256,
              status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
       FROM files
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Updates file status and refreshed updated_at timestamp.
   */
  async updateStatus(id: string, status: FileStatus, db: Queryable = pool): Promise<DbFile | null> {
    const res = await db.query<DbFile>(
      `UPDATE files
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, organization_id, uploader_id, file_name, file_size_bytes,
                 mime_type, storage_driver, storage_key, checksum_sha256,
                 status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at`,
      [status, id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Transitions a file record from 'uploading' to 'ready' upon successful storage verification.
   */
  async finalizeFile(id: string, db: Queryable = pool): Promise<DbFile | null> {
    const res = await db.query<DbFile>(
      `UPDATE files
       SET status = 'ready', updated_at = NOW()
       WHERE id = $1
       RETURNING id, organization_id, uploader_id, file_name, file_size_bytes,
                 mime_type, storage_driver, storage_key, checksum_sha256,
                 status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Marks a file record as soft-deleted.
   */
  async softDeleteFile(id: string, db: Queryable = pool): Promise<DbFile | null> {
    const res = await db.query<DbFile>(
      `UPDATE files
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = false
       RETURNING id, organization_id, uploader_id, file_name, file_size_bytes,
                 mime_type, storage_driver, storage_key, checksum_sha256,
                 status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Keyset cursor-paginated list of non-deleted, ready files in an organization.
   * Utilizes idx_files_org: (organization_id, created_at DESC) WHERE is_deleted = false.
   */
  async listOrganizationFiles(
    organizationId: string,
    options: {
      cursor?: { createdAt: string; id: string };
      limit: number;
    },
    db: Queryable = pool
  ): Promise<DbFile[]> {
    if (options.cursor) {
      const res = await db.query<DbFile>(
        `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
                mime_type, storage_driver, storage_key, checksum_sha256,
                status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
         FROM files
         WHERE organization_id = $1
           AND is_deleted = false
           AND status = 'ready'
           AND (created_at, id) < ($2, $3)
         ORDER BY created_at DESC, id DESC
         LIMIT $4`,
        [organizationId, options.cursor.createdAt, options.cursor.id, options.limit]
      );
      return res.rows;
    }

    const res = await db.query<DbFile>(
      `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
              mime_type, storage_driver, storage_key, checksum_sha256,
              status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
       FROM files
       WHERE organization_id = $1
         AND is_deleted = false
         AND status = 'ready'
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [organizationId, options.limit]
    );

    return res.rows;
  }

  /**
   * Finds expired uploading intents for cleanup/reconciliation routines.
   * Utilizes idx_files_upload_expiry: (status, upload_expires_at) WHERE status = 'uploading'.
   */
  async findExpiredUploadingFiles(limit: number = 100, db: Queryable = pool): Promise<DbFile[]> {
    const res = await db.query<DbFile>(
      `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
              mime_type, storage_driver, storage_key, checksum_sha256,
              status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
       FROM files
       WHERE status = 'uploading'
         AND upload_expires_at < NOW()
         AND is_deleted = false
       ORDER BY upload_expires_at ASC
       LIMIT $1`,
      [limit]
    );

    return res.rows;
  }

  /**
   * Returns all active message attachment contexts (channelId or conversationId) for a file.
   */
  async findAttachmentContext(fileId: string, db: Queryable = pool): Promise<AttachmentContext[]> {
    const res = await db.query<AttachmentContext>(
      `SELECT m.id AS "messageId", m.channel_id AS "channelId", m.conversation_id AS "conversationId"
       FROM message_attachments ma
       JOIN messages m ON ma.message_id = m.id
       WHERE ma.file_id = $1
         AND m.is_deleted = false`,
      [fileId]
    );

    return res.rows;
  }

  /**
   * Links a file to a message as an attachment.
   */
  async createMessageAttachment(messageId: string, fileId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO message_attachments (message_id, file_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id, file_id) DO NOTHING`,
      [messageId, fileId]
    );
  }

  /**
   * Batch fetches files for attachment validation.
   */
  async findFilesByIds(ids: string[], db: Queryable = pool): Promise<DbFile[]> {
    if (ids.length === 0) return [];
    const res = await db.query<DbFile>(
      `SELECT id, organization_id, uploader_id, file_name, file_size_bytes,
              mime_type, storage_driver, storage_key, checksum_sha256,
              status, upload_expires_at, is_deleted, created_at, updated_at, deleted_at
       FROM files
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return res.rows;
  }
}

export const fileRepository = new FileRepository();
