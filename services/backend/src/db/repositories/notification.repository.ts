import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  Notification,
  NotificationType,
  NotificationResourceType,
  NotificationDataPayload,
} from '@teamtrack/shared-types';
import { encodeNotificationSyncCursor } from '@teamtrack/validation';

export type Queryable = Pool | PoolClient;

export interface DbNotification {
  id: string;
  recipient_id: string;
  organization_id: string | null;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resource_type: NotificationResourceType | null;
  resource_id: string | null;
  data_payload: NotificationDataPayload;
  is_read: boolean;
  read_at: Date | null;
  grouping_key: string | null;
  source_event_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  mutation_seq: string | number | bigint;
}

export interface CreateNotificationDbParams {
  id?: string;
  recipientId: string;
  organizationId?: string | null;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resourceType?: NotificationResourceType | null;
  resourceId?: string | null;
  dataPayload?: NotificationDataPayload;
  groupingKey?: string | null;
  sourceEventId?: string | null;
  mutationSeq?: string;
}

export class NotificationRepository {
  /**
   * Maps a raw database notification row to a safe client-facing DTO.
   * NOTE: Internal persistence details (is_read, deleted_at, source_event_id, grouping_key)
   * are strictly omitted to prevent internal metadata leaks.
   * mutationSeq is converted to string for safe 64-bit integer handling.
   */
  mapNotification(row: DbNotification): Notification {
    return {
      id: row.id,
      recipientId: row.recipient_id,
      organizationId: row.organization_id,
      actorId: row.actor_id,
      type: row.type,
      title: row.title,
      body: row.body,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      dataPayload: row.data_payload || {},
      readAt: row.read_at ? (row.read_at instanceof Date ? row.read_at.toISOString() : String(row.read_at)) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      mutationSeq: String(row.mutation_seq || '0'),
    };
  }

  /**
   * Allocates the next monotonic mutation sequence for a recipient under an atomic row lock.
   */
  async nextMutationSeq(recipientId: string, db: Queryable = pool): Promise<string> {
    const query = `
      INSERT INTO user_notification_state (user_id, last_mutation_seq, updated_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET last_mutation_seq = user_notification_state.last_mutation_seq + 1,
          updated_at = NOW()
      RETURNING last_mutation_seq::text AS last_mutation_seq;
    `;
    const res = await db.query<{ last_mutation_seq: string }>(query, [recipientId]);
    return res.rows[0]?.last_mutation_seq || '1';
  }

  /**
   * Retrieves the current highest mutation sequence for a recipient.
   */
  async getLatestMutationSeq(recipientId: string, db: Queryable = pool): Promise<string> {
    const query = `
      SELECT COALESCE(last_mutation_seq, 0)::text AS last_mutation_seq
      FROM user_notification_state
      WHERE user_id = $1;
    `;
    const res = await db.query<{ last_mutation_seq: string }>(query, [recipientId]);
    return res.rows[0]?.last_mutation_seq || '0';
  }

  /**
   * Creates a notification using trusted server-side parameters.
   * Atomically acquires recipient sequence row lock and assigns mutation_seq.
   * Enforces idempotent duplicate prevention using the Phase 9A unique partial index:
   * (recipient_id, type, source_event_id) WHERE source_event_id IS NOT NULL AND deleted_at IS NULL
   */
  async createNotification(
    params: CreateNotificationDbParams,
    db: Queryable = pool
  ): Promise<DbNotification> {
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      const hasExplicitSeq = Boolean(params.mutationSeq);
      const query = hasExplicitSeq
        ? `
          INSERT INTO notifications (
            id,
            recipient_id,
            organization_id,
            actor_id,
            type,
            title,
            body,
            resource_type,
            resource_id,
            data_payload,
            grouping_key,
            source_event_id,
            mutation_seq
          ) VALUES (
            COALESCE($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
          )
          ON CONFLICT (recipient_id, type, source_event_id)
          WHERE source_event_id IS NOT NULL AND deleted_at IS NULL
          DO NOTHING
          RETURNING *;
        `
        : `
          WITH seq AS (
            INSERT INTO user_notification_state (user_id, last_mutation_seq, updated_at)
            VALUES ($2, 1, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET last_mutation_seq = user_notification_state.last_mutation_seq + 1,
                updated_at = NOW()
            RETURNING last_mutation_seq
          )
          INSERT INTO notifications (
            id,
            recipient_id,
            organization_id,
            actor_id,
            type,
            title,
            body,
            resource_type,
            resource_id,
            data_payload,
            grouping_key,
            source_event_id,
            mutation_seq
          ) VALUES (
            COALESCE($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT last_mutation_seq FROM seq)
          )
          ON CONFLICT (recipient_id, type, source_event_id)
          WHERE source_event_id IS NOT NULL AND deleted_at IS NULL
          DO NOTHING
          RETURNING *;
        `;

      const values: any[] = [
        params.id || null,
        params.recipientId,
        params.organizationId || null,
        params.actorId || null,
        params.type,
        params.title,
        params.body,
        params.resourceType || null,
        params.resourceId || null,
        JSON.stringify(params.dataPayload || {}),
        params.groupingKey || null,
        params.sourceEventId || null,
      ];
      if (hasExplicitSeq) {
        values.push(params.mutationSeq);
      }

      const res = await queryRunner.query<DbNotification>(query, values);

      if (res.rows.length > 0) {
        if (isInternalTx && client) {
          await client.query('COMMIT');
        }
        return res.rows[0];
      }

      // Conflict occurred on insert (e.g. duplicate active notification)
      // We MUST rollback the transaction so the sequence increment is not committed!
      if (isInternalTx && client) {
        await client.query('ROLLBACK');
      }

      // Fallback query for concurrent or duplicate event insertion
      if (params.sourceEventId) {
        const fallbackQuery = `
          SELECT * FROM notifications
          WHERE recipient_id = $1
            AND type = $2
            AND source_event_id = $3
            AND deleted_at IS NULL
          LIMIT 1;
        `;
        const fallbackRunner = isInternalTx ? pool : queryRunner;
        const fallbackRes = await fallbackRunner.query<DbNotification>(fallbackQuery, [
          params.recipientId,
          params.type,
          params.sourceEventId,
        ]);
        if (fallbackRes.rows.length > 0) {
          return fallbackRes.rows[0];
        }
      }

      throw new Error('Failed to create or retrieve active notification');
    } catch (err) {
      if (isInternalTx && client) {
        try {
          await client.query('ROLLBACK');
        } catch {}
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }

  /**
   * Finds an active notification by ID.
   */
  async findById(id: string, db: Queryable = pool): Promise<DbNotification | null> {
    const query = `
      SELECT * FROM notifications
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const res = await db.query<DbNotification>(query, [id]);
    return res.rows[0] || null;
  }

  /**
   * Lists active notifications for an authenticated recipient using keyset cursor pagination.
   * Orders strictly by (created_at DESC, id DESC).
   */
  async findForRecipient(
    recipientId: string,
    options: { cursor?: { createdAt: string; id: string }; limit?: number },
    db: Queryable = pool
  ): Promise<DbNotification[]> {
    const limit = options.limit ?? 25;

    if (options.cursor) {
      const query = `
        SELECT * FROM notifications
        WHERE recipient_id = $1
          AND (created_at, id) < ($2, $3)
          AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT $4;
      `;
      const res = await db.query<DbNotification>(query, [
        recipientId,
        options.cursor.createdAt,
        options.cursor.id,
        limit,
      ]);
      return res.rows;
    }

    const query = `
      SELECT * FROM notifications
      WHERE recipient_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $2;
    `;
    const res = await db.query<DbNotification>(query, [recipientId, limit]);
    return res.rows;
  }

  /**
   * Lists active unread notifications for an authenticated recipient using keyset cursor pagination.
   * Orders strictly by (created_at DESC, id DESC).
   */
  async findUnreadForRecipient(
    recipientId: string,
    options: { cursor?: { createdAt: string; id: string }; limit?: number },
    db: Queryable = pool
  ): Promise<DbNotification[]> {
    const limit = options.limit ?? 25;

    if (options.cursor) {
      const query = `
        SELECT * FROM notifications
        WHERE recipient_id = $1
          AND read_at IS NULL
          AND (created_at, id) < ($2, $3)
          AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT $4;
      `;
      const res = await db.query<DbNotification>(query, [
        recipientId,
        options.cursor.createdAt,
        options.cursor.id,
        limit,
      ]);
      return res.rows;
    }

    const query = `
      SELECT * FROM notifications
      WHERE recipient_id = $1
        AND read_at IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $2;
    `;
    const res = await db.query<DbNotification>(query, [recipientId, limit]);
    return res.rows;
  }

  /**
   * Marks a single active notification as read.
   * Atomically increments recipient mutation sequence and updates mutation_seq.
   */
  async markRead(id: string, recipientId: string, db: Queryable = pool): Promise<DbNotification | null> {
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      const seq = await this.nextMutationSeq(recipientId, queryRunner);
      const query = `
        UPDATE notifications
        SET read_at = NOW(),
            mutation_seq = $3
        WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL AND deleted_at IS NULL
        RETURNING *;
      `;
      const res = await queryRunner.query<DbNotification>(query, [id, recipientId, seq]);
      if (res.rows.length === 0) {
        if (isInternalTx && client) {
          await client.query('ROLLBACK');
        }
        const checkQuery = `
          SELECT * FROM notifications
          WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
          LIMIT 1;
        `;
        const checkRunner = isInternalTx ? pool : queryRunner;
        const checkRes = await checkRunner.query<DbNotification>(checkQuery, [id, recipientId]);
        return checkRes.rows[0] || null;
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
      return res.rows[0] || null;
    } catch (err) {
      if (isInternalTx && client) {
        try {
          await client.query('ROLLBACK');
        } catch {}
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }

  /**
   * Marks a single active notification as unread.
   * Atomically increments recipient mutation sequence and updates mutation_seq.
   */
  async markUnread(id: string, recipientId: string, db: Queryable = pool): Promise<DbNotification | null> {
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      const seq = await this.nextMutationSeq(recipientId, queryRunner);
      const query = `
        UPDATE notifications
        SET read_at = NULL,
            mutation_seq = $3
        WHERE id = $1 AND recipient_id = $2 AND read_at IS NOT NULL AND deleted_at IS NULL
        RETURNING *;
      `;
      const res = await queryRunner.query<DbNotification>(query, [id, recipientId, seq]);
      if (res.rows.length === 0) {
        if (isInternalTx && client) {
          await client.query('ROLLBACK');
        }
        const checkQuery = `
          SELECT * FROM notifications
          WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
          LIMIT 1;
        `;
        const checkRunner = isInternalTx ? pool : queryRunner;
        const checkRes = await checkRunner.query<DbNotification>(checkQuery, [id, recipientId]);
        return checkRes.rows[0] || null;
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
      return res.rows[0] || null;
    } catch (err) {
      if (isInternalTx && client) {
        try {
          await client.query('ROLLBACK');
        } catch {}
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }

  /**
   * Marks all unread active notifications for a recipient as read.
   * Assigns the exact same batch mutation_seq to all affected rows.
   */
  async markAllRead(
    recipientId: string,
    organizationId?: string,
    db: Queryable = pool
  ): Promise<{ count: number; mutationSeq: string; readAt: string }> {
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      const seq = await this.nextMutationSeq(recipientId, queryRunner);
      let count = 0;
      let readAt = new Date().toISOString();

      if (organizationId) {
        const query = `
          UPDATE notifications
          SET read_at = NOW(),
              mutation_seq = $3
          WHERE recipient_id = $1
            AND organization_id = $2
            AND read_at IS NULL
            AND deleted_at IS NULL
          RETURNING id, read_at;
        `;
        const res = await queryRunner.query<{ id: string; read_at: Date }>(query, [recipientId, organizationId, seq]);
        count = res.rows.length;
        if (count > 0 && res.rows[0]?.read_at) {
          readAt = new Date(res.rows[0].read_at).toISOString();
        }
      } else {
        const query = `
          UPDATE notifications
          SET read_at = NOW(),
              mutation_seq = $2
          WHERE recipient_id = $1
            AND read_at IS NULL
            AND deleted_at IS NULL
          RETURNING id, read_at;
        `;
        const res = await queryRunner.query<{ id: string; read_at: Date }>(query, [recipientId, seq]);
        count = res.rows.length;
        if (count > 0 && res.rows[0]?.read_at) {
          readAt = new Date(res.rows[0].read_at).toISOString();
        }
      }

      if (count === 0) {
        if (isInternalTx && client) {
          await client.query('ROLLBACK');
        }
        return { count: 0, mutationSeq: '0', readAt };
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
      return { count, mutationSeq: seq, readAt };
    } catch (err) {
      if (isInternalTx && client) {
        try {
          await client.query('ROLLBACK');
        } catch {}
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }

  /**
   * Soft-deletes a notification for a recipient.
   * Atomically increments recipient mutation sequence and updates mutation_seq.
   */
  async softDelete(
    id: string,
    recipientId: string,
    db: Queryable = pool
  ): Promise<{ success: boolean; mutationSeq: string }> {
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      const seq = await this.nextMutationSeq(recipientId, queryRunner);
      const query = `
        UPDATE notifications
        SET deleted_at = NOW(),
            mutation_seq = $3
        WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
        RETURNING id;
      `;
      const res = await queryRunner.query(query, [id, recipientId, seq]);
      if (res.rows.length === 0) {
        if (isInternalTx && client) {
          await client.query('ROLLBACK');
        }
        return { success: false, mutationSeq: '0' };
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
      return { success: true, mutationSeq: seq };
    } catch (err) {
      if (isInternalTx && client) {
        try {
          await client.query('ROLLBACK');
        } catch {}
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }

  /**
   * Counts active unread notifications for a recipient, optionally filtered by organizationId.
   */
  async unreadCount(
    recipientId: string,
    organizationId?: string,
    db: Queryable = pool
  ): Promise<number> {
    if (organizationId) {
      const query = `
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE recipient_id = $1
          AND organization_id = $2
          AND read_at IS NULL
          AND deleted_at IS NULL;
      `;
      const res = await db.query<{ count: number }>(query, [recipientId, organizationId]);
      return res.rows[0]?.count ?? 0;
    }

    const query = `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE recipient_id = $1
        AND read_at IS NULL
        AND deleted_at IS NULL;
    `;
    const res = await db.query<{ count: number }>(query, [recipientId]);
    return res.rows[0]?.count ?? 0;
  }

  /**
   * Delta catch-up synchronization query supporting multi-page sequence-bounded pagination.
   * Executes inside a single REPEATABLE READ READ ONLY transaction.
   */
  async syncForRecipient(
    recipientId: string,
    options: {
      activeCursor?: { mutationSeq: string; id: string };
      deletionCursor?: { mutationSeq: string; id: string };
      snapshotMutationSeq?: string;
      limit?: number;
    },
    db: Queryable = pool
  ): Promise<{
    upserted: DbNotification[];
    deletedIds: string[];
    unreadCount: number;
    activeCursor: string | null;
    deletionCursor: string | null;
    hasMoreActive: boolean;
    hasMoreDeletions: boolean;
    snapshotMutationSeq: string;
  }> {
    const limit = options.limit ?? 50;
    let client: PoolClient | null = null;
    let queryRunner: Queryable = db;
    let isInternalTx = false;

    if (db === pool) {
      client = await pool.connect();
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      queryRunner = client;
      isInternalTx = true;
    }

    try {
      // 1. Establish or reuse the fixed logical snapshot boundary
      let snapshotMutationSeq = options.snapshotMutationSeq;
      if (!snapshotMutationSeq) {
        const seqRes = await queryRunner.query<{ last_mutation_seq: string }>(
          `SELECT COALESCE(last_mutation_seq, 0)::text AS last_mutation_seq
           FROM user_notification_state
           WHERE user_id = $1;`,
          [recipientId]
        );
        snapshotMutationSeq = seqRes.rows[0]?.last_mutation_seq || '0';
      }

      // 2. Query Active Notifications Delta bounded by snapshotMutationSeq
      let activeRows: DbNotification[];
      if (options.activeCursor) {
        const activeQuery = `
          SELECT * FROM notifications
          WHERE recipient_id = $1
            AND (mutation_seq, id) > ($2::bigint, $3)
            AND mutation_seq <= $4::bigint
            AND deleted_at IS NULL
          ORDER BY mutation_seq ASC, id ASC
          LIMIT $5;
        `;
        const res = await queryRunner.query<DbNotification>(activeQuery, [
          recipientId,
          options.activeCursor.mutationSeq,
          options.activeCursor.id,
          snapshotMutationSeq,
          limit + 1,
        ]);
        activeRows = res.rows;
      } else {
        const activeQuery = `
          SELECT * FROM notifications
          WHERE recipient_id = $1
            AND mutation_seq <= $2::bigint
            AND deleted_at IS NULL
          ORDER BY mutation_seq ASC, id ASC
          LIMIT $3;
        `;
        const res = await queryRunner.query<DbNotification>(activeQuery, [
          recipientId,
          snapshotMutationSeq,
          limit + 1,
        ]);
        activeRows = res.rows;
      }

      const hasMoreActive = activeRows.length > limit;
      const upserted = hasMoreActive ? activeRows.slice(0, limit) : activeRows;
      let nextActiveCursor: string | null = null;
      if (hasMoreActive && upserted.length > 0) {
        const last = upserted[upserted.length - 1];
        nextActiveCursor = encodeNotificationSyncCursor(last.mutation_seq, last.id);
      }

      // 3. Query Soft-Deleted Notifications Delta bounded by snapshotMutationSeq
      let deletionRows: { id: string; mutation_seq: string }[];
      if (options.deletionCursor) {
        const delQuery = `
          SELECT id, mutation_seq::text AS mutation_seq FROM notifications
          WHERE recipient_id = $1
            AND (mutation_seq, id) > ($2::bigint, $3)
            AND mutation_seq <= $4::bigint
            AND deleted_at IS NOT NULL
          ORDER BY mutation_seq ASC, id ASC
          LIMIT $5;
        `;
        const res = await queryRunner.query<{ id: string; mutation_seq: string }>(delQuery, [
          recipientId,
          options.deletionCursor.mutationSeq,
          options.deletionCursor.id,
          snapshotMutationSeq,
          limit + 1,
        ]);
        deletionRows = res.rows;
      } else {
        const delQuery = `
          SELECT id, mutation_seq::text AS mutation_seq FROM notifications
          WHERE recipient_id = $1
            AND mutation_seq <= $2::bigint
            AND deleted_at IS NOT NULL
          ORDER BY mutation_seq ASC, id ASC
          LIMIT $3;
        `;
        const res = await queryRunner.query<{ id: string; mutation_seq: string }>(delQuery, [
          recipientId,
          snapshotMutationSeq,
          limit + 1,
        ]);
        deletionRows = res.rows;
      }

      const hasMoreDeletions = deletionRows.length > limit;
      const deletedItems = hasMoreDeletions ? deletionRows.slice(0, limit) : deletionRows;
      const deletedIds = deletedItems.map((r) => r.id);
      let nextDeletionCursor: string | null = null;
      if (hasMoreDeletions && deletedItems.length > 0) {
        const last = deletedItems[deletedItems.length - 1];
        nextDeletionCursor = encodeNotificationSyncCursor(last.mutation_seq, last.id);
      }

      // 4. Query Total Unread Count at snapshot
      const unreadCountRes = await queryRunner.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE recipient_id = $1
           AND read_at IS NULL
           AND deleted_at IS NULL;`,
        [recipientId]
      );
      const unreadCount = unreadCountRes.rows[0]?.count ?? 0;

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }

      return {
        upserted,
        deletedIds,
        unreadCount,
        activeCursor: nextActiveCursor,
        deletionCursor: nextDeletionCursor,
        hasMoreActive,
        hasMoreDeletions,
        snapshotMutationSeq,
      };
    } catch (err) {
      if (isInternalTx && client) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }
  }
}

export const notificationRepository = new NotificationRepository();
