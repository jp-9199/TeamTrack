import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { MessageReaction, MessageReactionAggregate } from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_code: string;
  created_at: Date;
}

export class ReactionRepository {
  mapReaction(row: DbMessageReaction): MessageReaction {
    return {
      id: row.id,
      messageId: row.message_id,
      userId: row.user_id,
      reactionCode: row.reaction_code,
      createdAt: row.created_at.toISOString(),
    };
  }

  async addReaction(
    messageId: string,
    userId: string,
    reactionCode: string,
    db: Queryable = pool
  ): Promise<{ reaction: MessageReaction; created: boolean }> {
    // Attempt insert with conflict avoidance
    const insertRes = await db.query<DbMessageReaction>(
      `INSERT INTO message_reactions (message_id, user_id, reaction_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, reaction_code) DO NOTHING
       RETURNING id, message_id, user_id, reaction_code, created_at`,
      [messageId, userId, reactionCode]
    );

    if (insertRes.rows.length > 0) {
      return { reaction: this.mapReaction(insertRes.rows[0]), created: true };
    }

    // Already existed, fetch it
    const existing = await db.query<DbMessageReaction>(
      `SELECT id, message_id, user_id, reaction_code, created_at
       FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND reaction_code = $3`,
      [messageId, userId, reactionCode]
    );

    return { reaction: this.mapReaction(existing.rows[0]), created: false };
  }

  async removeReaction(
    messageId: string,
    userId: string,
    reactionCode: string,
    db: Queryable = pool
  ): Promise<boolean> {
    const res = await db.query(
      `DELETE FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND reaction_code = $3`,
      [messageId, userId, reactionCode]
    );

    return (res.rowCount ?? 0) > 0;
  }

  async getReactionsForMessages(
    messageIds: string[],
    currentUserId?: string,
    db: Queryable = pool
  ): Promise<Map<string, MessageReactionAggregate[]>> {
    const map = new Map<string, MessageReactionAggregate[]>();
    if (messageIds.length === 0) return map;

    const res = await db.query<DbMessageReaction>(
      `SELECT id, message_id, user_id, reaction_code, created_at
       FROM message_reactions
       WHERE message_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [messageIds]
    );

    // Group by message_id -> reaction_code -> users
    const msgMap = new Map<string, Map<string, string[]>>();
    for (const r of res.rows) {
      if (!msgMap.has(r.message_id)) {
        msgMap.set(r.message_id, new Map());
      }
      const codeMap = msgMap.get(r.message_id)!;
      if (!codeMap.has(r.reaction_code)) {
        codeMap.set(r.reaction_code, []);
      }
      codeMap.get(r.reaction_code)!.push(r.user_id);
    }

    for (const [msgId, codeMap] of msgMap.entries()) {
      const aggregates: MessageReactionAggregate[] = [];
      for (const [code, users] of codeMap.entries()) {
        aggregates.push({
          reactionCode: code,
          count: users.length,
          users,
          hasReacted: currentUserId ? users.includes(currentUserId) : false,
        });
      }
      map.set(msgId, aggregates);
    }

    return map;
  }

  async listReactionsSince(
    messageIds: string[],
    since: Date,
    db: Queryable = pool
  ): Promise<MessageReaction[]> {
    if (messageIds.length === 0) return [];

    const res = await db.query<DbMessageReaction>(
      `SELECT id, message_id, user_id, reaction_code, created_at
       FROM message_reactions
       WHERE message_id = ANY($1::uuid[]) AND created_at > $2
       ORDER BY created_at ASC`,
      [messageIds, since]
    );

    return res.rows.map((r) => this.mapReaction(r));
  }
}

export const reactionRepository = new ReactionRepository();
