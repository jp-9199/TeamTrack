import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  Message,
  MessageWithSender,
  MessageAttachment,
} from '@teamtrack/shared-types';
import { reactionRepository } from './reaction.repository.js';

export type Queryable = Pool | PoolClient;

export interface DbMessage {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  sender_id: string;
  parent_message_id: string | null;
  content: string;
  content_type: string;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  idempotency_key: string | null;
}

export interface DbMessageWithUser extends DbMessage {
  sender_display_name: string;
  sender_avatar_url: string | null;
  sender_email: string;
}

export interface DbAttachment {
  id: string;
  message_id: string;
  file_id: string;
  created_at: Date;
}

export interface InsertMessageParams {
  channelId?: string | null;
  conversationId?: string | null;
  senderId: string;
  parentMessageId?: string | null;
  content: string;
  contentType?: string;
  idempotencyKey?: string | null;
  attachmentFileIds?: string[];
}

export class MessageRepository {
  mapMessage(row: DbMessage): Message {
    return {
      id: row.id,
      channelId: row.channel_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      parentMessageId: row.parent_message_id,
      content: row.content,
      contentType: row.content_type,
      isEdited: row.is_edited,
      isDeleted: row.is_deleted,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
      idempotencyKey: row.idempotency_key,
    };
  }

  mapMessageWithSender(
    row: DbMessageWithUser,
    attachments?: MessageAttachment[]
  ): MessageWithSender {
    return {
      id: row.id,
      channelId: row.channel_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      parentMessageId: row.parent_message_id,
      content: row.content,
      contentType: row.content_type,
      isEdited: row.is_edited,
      isDeleted: row.is_deleted,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
      idempotencyKey: row.idempotency_key,
      sender: {
        id: row.sender_id,
        displayName: row.sender_display_name,
        avatarUrl: row.sender_avatar_url,
        email: row.sender_email,
      },
      attachments: attachments || [],
    };
  }

  async findById(id: string, db: Queryable = pool): Promise<DbMessage | null> {
    const res = await db.query<DbMessage>(
      `SELECT id, channel_id, conversation_id, sender_id, parent_message_id,
              content, content_type, is_edited, is_deleted, created_at,
              updated_at, deleted_at, idempotency_key
       FROM messages
       WHERE id = $1`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async findWithSenderById(
    id: string,
    currentUserId?: string,
    db: Queryable = pool
  ): Promise<MessageWithSender | null> {
    const res = await db.query<DbMessageWithUser>(
      `SELECT m.id, m.channel_id, m.conversation_id, m.sender_id, m.parent_message_id,
              m.content, m.content_type, m.is_edited, m.is_deleted, m.created_at,
              m.updated_at, m.deleted_at, m.idempotency_key,
              u.display_name AS sender_display_name,
              u.avatar_url AS sender_avatar_url,
              u.email AS sender_email
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = $1`,
      [id]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const attachments = await this.getAttachmentsForMessages([row.id], db);
    const reactionsMap = await reactionRepository.getReactionsForMessages([row.id], currentUserId, db);

    const msg = this.mapMessageWithSender(row, attachments.get(row.id));
    msg.reactions = reactionsMap.get(row.id) || [];
    return msg;
  }

  async findByIdempotencyKey(
    scope: { channelId?: string; conversationId?: string; senderId: string; idempotencyKey: string },
    db: Queryable = pool
  ): Promise<DbMessage | null> {
    if (scope.channelId) {
      const res = await db.query<DbMessage>(
        `SELECT id, channel_id, conversation_id, sender_id, parent_message_id,
                content, content_type, is_edited, is_deleted, created_at,
                updated_at, deleted_at, idempotency_key
         FROM messages
         WHERE channel_id = $1 AND sender_id = $2 AND idempotency_key = $3`,
        [scope.channelId, scope.senderId, scope.idempotencyKey]
      );
      return res.rows.length > 0 ? res.rows[0] : null;
    }

    if (scope.conversationId) {
      const res = await db.query<DbMessage>(
        `SELECT id, channel_id, conversation_id, sender_id, parent_message_id,
                content, content_type, is_edited, is_deleted, created_at,
                updated_at, deleted_at, idempotency_key
         FROM messages
         WHERE conversation_id = $1 AND sender_id = $2 AND idempotency_key = $3`,
        [scope.conversationId, scope.senderId, scope.idempotencyKey]
      );
      return res.rows.length > 0 ? res.rows[0] : null;
    }

    return null;
  }

  async insert(
    params: InsertMessageParams,
    db: Queryable = pool
  ): Promise<DbMessage> {
    const res = await db.query<DbMessage>(
      `INSERT INTO messages (
         channel_id, conversation_id, sender_id, parent_message_id,
         content, content_type, idempotency_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, channel_id, conversation_id, sender_id, parent_message_id,
                 content, content_type, is_edited, is_deleted, created_at,
                 updated_at, deleted_at, idempotency_key`,
      [
        params.channelId || null,
        params.conversationId || null,
        params.senderId,
        params.parentMessageId || null,
        params.content,
        params.contentType || 'text/plain',
        params.idempotencyKey || null,
      ]
    );

    const message = res.rows[0];

    // Add attachments if provided
    if (params.attachmentFileIds && params.attachmentFileIds.length > 0) {
      for (const fileId of params.attachmentFileIds) {
        await db.query(
          `INSERT INTO message_attachments (message_id, file_id)
           VALUES ($1, $2)
           ON CONFLICT (message_id, file_id) DO NOTHING`,
          [message.id, fileId]
        );
      }
    }

    return message;
  }

  async edit(
    id: string,
    content: string,
    db: Queryable = pool
  ): Promise<DbMessage | null> {
    const res = await db.query<DbMessage>(
      `UPDATE messages
       SET content = $1, is_edited = true, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, channel_id, conversation_id, sender_id, parent_message_id,
                 content, content_type, is_edited, is_deleted, created_at,
                 updated_at, deleted_at, idempotency_key`,
      [content, id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async softDelete(
    id: string,
    db: Queryable = pool
  ): Promise<DbMessage | null> {
    const res = await db.query<DbMessage>(
      `UPDATE messages
       SET is_deleted = true, content = '', deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = false
       RETURNING id, channel_id, conversation_id, sender_id, parent_message_id,
                 content, content_type, is_edited, is_deleted, created_at,
                 updated_at, deleted_at, idempotency_key`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async listChannelMessages(
    channelId: string,
    options: {
      cursor?: { createdAt: string; id: string };
      limit: number;
      currentUserId?: string;
    },
    db: Queryable = pool
  ): Promise<MessageWithSender[]> {
    let sql = `
      SELECT m.id, m.channel_id, m.conversation_id, m.sender_id, m.parent_message_id,
             m.content, m.content_type, m.is_edited, m.is_deleted, m.created_at,
             m.updated_at, m.deleted_at, m.idempotency_key,
             u.display_name AS sender_display_name,
             u.avatar_url AS sender_avatar_url,
             u.email AS sender_email
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = $1 AND m.is_deleted = false
    `;
    const params: any[] = [channelId];

    if (options.cursor) {
      params.push(new Date(options.cursor.createdAt), options.cursor.id);
      sql += ` AND (m.created_at < $2 OR (m.created_at = $2 AND m.id < $3))`;
    }

    params.push(options.limit);
    sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`;

    const res = await db.query<DbMessageWithUser>(sql, params);
    if (res.rows.length === 0) return [];

    const msgIds = res.rows.map((r) => r.id);
    const attachmentsMap = await this.getAttachmentsForMessages(msgIds, db);
    const reactionsMap = await reactionRepository.getReactionsForMessages(msgIds, options.currentUserId, db);

    return res.rows.map((row) => {
      const msg = this.mapMessageWithSender(row, attachmentsMap.get(row.id));
      msg.reactions = reactionsMap.get(row.id) || [];
      return msg;
    });
  }

  async listConversationMessages(
    conversationId: string,
    options: {
      cursor?: { createdAt: string; id: string };
      limit: number;
      currentUserId?: string;
    },
    db: Queryable = pool
  ): Promise<MessageWithSender[]> {
    let sql = `
      SELECT m.id, m.channel_id, m.conversation_id, m.sender_id, m.parent_message_id,
             m.content, m.content_type, m.is_edited, m.is_deleted, m.created_at,
             m.updated_at, m.deleted_at, m.idempotency_key,
             u.display_name AS sender_display_name,
             u.avatar_url AS sender_avatar_url,
             u.email AS sender_email
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1 AND m.is_deleted = false
    `;
    const params: any[] = [conversationId];

    if (options.cursor) {
      params.push(new Date(options.cursor.createdAt), options.cursor.id);
      sql += ` AND (m.created_at < $2 OR (m.created_at = $2 AND m.id < $3))`;
    }

    params.push(options.limit);
    sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`;

    const res = await db.query<DbMessageWithUser>(sql, params);
    if (res.rows.length === 0) return [];

    const msgIds = res.rows.map((r) => r.id);
    const attachmentsMap = await this.getAttachmentsForMessages(msgIds, db);
    const reactionsMap = await reactionRepository.getReactionsForMessages(msgIds, options.currentUserId, db);

    return res.rows.map((row) => {
      const msg = this.mapMessageWithSender(row, attachmentsMap.get(row.id));
      msg.reactions = reactionsMap.get(row.id) || [];
      return msg;
    });
  }

  async syncChannelMessages(
    channelId: string,
    since: Date,
    currentUserId?: string,
    db: Queryable = pool
  ): Promise<{ upserted: MessageWithSender[]; deletedIds: string[] }> {
    // 1. Fetch upserted messages (is_deleted = false AND updated_at > since)
    const upsertedRes = await db.query<DbMessageWithUser>(
      `SELECT m.id, m.channel_id, m.conversation_id, m.sender_id, m.parent_message_id,
              m.content, m.content_type, m.is_edited, m.is_deleted, m.created_at,
              m.updated_at, m.deleted_at, m.idempotency_key,
              u.display_name AS sender_display_name,
              u.avatar_url AS sender_avatar_url,
              u.email AS sender_email
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.channel_id = $1 AND m.updated_at > $2 AND m.is_deleted = false
       ORDER BY m.created_at ASC, m.id ASC`,
      [channelId, since]
    );

    // 2. Fetch deleted message IDs (is_deleted = true AND updated_at > since)
    const deletedRes = await db.query<{ id: string }>(
      `SELECT id
       FROM messages
       WHERE channel_id = $1 AND updated_at > $2 AND is_deleted = true`,
      [channelId, since]
    );

    const msgIds = upsertedRes.rows.map((r) => r.id);
    const attachmentsMap = await this.getAttachmentsForMessages(msgIds, db);
    const reactionsMap = await reactionRepository.getReactionsForMessages(msgIds, currentUserId, db);

    const upserted = upsertedRes.rows.map((row) => {
      const msg = this.mapMessageWithSender(row, attachmentsMap.get(row.id));
      msg.reactions = reactionsMap.get(row.id) || [];
      return msg;
    });

    return {
      upserted,
      deletedIds: deletedRes.rows.map((r) => r.id),
    };
  }

  async syncConversationMessages(
    conversationId: string,
    since: Date,
    currentUserId?: string,
    db: Queryable = pool
  ): Promise<{ upserted: MessageWithSender[]; deletedIds: string[] }> {
    const upsertedRes = await db.query<DbMessageWithUser>(
      `SELECT m.id, m.channel_id, m.conversation_id, m.sender_id, m.parent_message_id,
              m.content, m.content_type, m.is_edited, m.is_deleted, m.created_at,
              m.updated_at, m.deleted_at, m.idempotency_key,
              u.display_name AS sender_display_name,
              u.avatar_url AS sender_avatar_url,
              u.email AS sender_email
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1 AND m.updated_at > $2 AND m.is_deleted = false
       ORDER BY m.created_at ASC, m.id ASC`,
      [conversationId, since]
    );

    const deletedRes = await db.query<{ id: string }>(
      `SELECT id
       FROM messages
       WHERE conversation_id = $1 AND updated_at > $2 AND is_deleted = true`,
      [conversationId, since]
    );

    const msgIds = upsertedRes.rows.map((r) => r.id);
    const attachmentsMap = await this.getAttachmentsForMessages(msgIds, db);
    const reactionsMap = await reactionRepository.getReactionsForMessages(msgIds, currentUserId, db);

    const upserted = upsertedRes.rows.map((row) => {
      const msg = this.mapMessageWithSender(row, attachmentsMap.get(row.id));
      msg.reactions = reactionsMap.get(row.id) || [];
      return msg;
    });

    return {
      upserted,
      deletedIds: deletedRes.rows.map((r) => r.id),
    };
  }

  async getAttachmentsForMessages(
    messageIds: string[],
    db: Queryable = pool
  ): Promise<Map<string, MessageAttachment[]>> {
    const map = new Map<string, MessageAttachment[]>();
    if (messageIds.length === 0) return map;

    const res = await db.query<DbAttachment & { file_name?: string; file_size_bytes?: string | number; mime_type?: string }>(
      `SELECT ma.id, ma.message_id, ma.file_id, ma.created_at,
              f.file_name, f.file_size_bytes, f.mime_type
       FROM message_attachments ma
       LEFT JOIN files f ON ma.file_id = f.id
       WHERE ma.message_id = ANY($1::uuid[])
       ORDER BY ma.created_at ASC`,
      [messageIds]
    );

    for (const r of res.rows) {
      if (!map.has(r.message_id)) {
        map.set(r.message_id, []);
      }
      map.get(r.message_id)!.push({
        id: r.id,
        messageId: r.message_id,
        fileId: r.file_id,
        createdAt: r.created_at.toISOString(),
        fileName: r.file_name || undefined,
        fileSizeBytes: r.file_size_bytes !== undefined && r.file_size_bytes !== null ? Number(r.file_size_bytes) : undefined,
        mimeType: r.mime_type || undefined,
      });
    }

    return map;
  }
}

export const messageRepository = new MessageRepository();

