import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { ChannelReadState } from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbChannelReadState {
  id: string;
  channel_id: string;
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: Date;
}

export class ChannelReadStateRepository {
  mapReadState(row: DbChannelReadState): ChannelReadState {
    return {
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      lastReadMessageId: row.last_read_message_id,
      lastReadAt: row.last_read_at.toISOString(),
    };
  }

  async getReadState(
    channelId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<ChannelReadState | null> {
    const res = await db.query<DbChannelReadState>(
      `SELECT id, channel_id, user_id, last_read_message_id, last_read_at
       FROM channel_read_states
       WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );

    return res.rows.length > 0 ? this.mapReadState(res.rows[0]) : null;
  }

  async upsertReadState(
    channelId: string,
    userId: string,
    lastReadMessageId: string | null,
    lastReadAt: Date = new Date(),
    db: Queryable = pool
  ): Promise<ChannelReadState> {
    const res = await db.query<DbChannelReadState>(
      `INSERT INTO channel_read_states (channel_id, user_id, last_read_message_id, last_read_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (channel_id, user_id)
       DO UPDATE SET
         last_read_message_id = EXCLUDED.last_read_message_id,
         last_read_at = EXCLUDED.last_read_at
       RETURNING id, channel_id, user_id, last_read_message_id, last_read_at`,
      [channelId, userId, lastReadMessageId, lastReadAt]
    );

    return this.mapReadState(res.rows[0]);
  }

  async countUnreadMessages(
    channelId: string,
    userId: string,
    lastReadAt: Date,
    db: Queryable = pool
  ): Promise<number> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM messages
       WHERE channel_id = $1
         AND created_at > $2
         AND is_deleted = false
         AND sender_id != $3`,
      [channelId, lastReadAt, userId]
    );

    return parseInt(res.rows[0]?.count || '0', 10);
  }
}

export const channelReadStateRepository = new ChannelReadStateRepository();
