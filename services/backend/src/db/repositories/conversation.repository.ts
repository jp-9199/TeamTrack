import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import crypto from 'crypto';
import type {
  Conversation,
  ConversationMember,
  ConversationMemberWithUser,
  ConversationWithMembers,
  ConversationType,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbConversation {
  id: string;
  organization_id: string;
  type: ConversationType;
  direct_hash: string | null;
  title: string | null;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DbConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: Date;
  last_read_at: Date;
}

export interface DbConversationMemberWithUser extends DbConversationMember {
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export class ConversationRepository {
  mapConversation(row: DbConversation): Conversation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      type: row.type,
      directHash: row.direct_hash,
      title: row.title,
      isArchived: row.is_archived,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapMember(row: DbConversationMember): ConversationMember {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      joinedAt: row.joined_at.toISOString(),
      lastReadAt: row.last_read_at.toISOString(),
    };
  }

  mapMemberWithUser(row: DbConversationMemberWithUser): ConversationMemberWithUser {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      joinedAt: row.joined_at.toISOString(),
      lastReadAt: row.last_read_at.toISOString(),
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
    };
  }

  computeDirectHash(userA: string, userB: string): string {
    const sorted = [userA, userB].sort();
    return crypto
      .createHash('sha256')
      .update(`direct:${sorted[0]}:${sorted[1]}`)
      .digest('hex');
  }

  async findDirectByHash(
    organizationId: string,
    directHash: string,
    db: Queryable = pool
  ): Promise<DbConversation | null> {
    const res = await db.query<DbConversation>(
      `SELECT id, organization_id, type, direct_hash, title, is_archived, created_at, updated_at
       FROM conversations
       WHERE organization_id = $1 AND direct_hash = $2`,
      [organizationId, directHash]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async findById(id: string, db: Queryable = pool): Promise<DbConversation | null> {
    const res = await db.query<DbConversation>(
      `SELECT id, organization_id, type, direct_hash, title, is_archived, created_at, updated_at
       FROM conversations
       WHERE id = $1`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async createConversation(
    organizationId: string,
    type: ConversationType,
    directHash: string | null,
    title: string | null,
    participantIds: string[],
    db: Queryable = pool
  ): Promise<DbConversation> {
    const res = await db.query<DbConversation>(
      `INSERT INTO conversations (organization_id, type, direct_hash, title)
       VALUES ($1, $2, $3, $4)
       RETURNING id, organization_id, type, direct_hash, title, is_archived, created_at, updated_at`,
      [organizationId, type, directHash, title]
    );

    const conv = res.rows[0];

    // Add members in batch
    for (const userId of participantIds) {
      await db.query(
        `INSERT INTO conversation_members (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conv.id, userId]
      );
    }

    return conv;
  }

  async getMember(
    conversationId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<ConversationMember | null> {
    const res = await db.query<DbConversationMember>(
      `SELECT id, conversation_id, user_id, joined_at, last_read_at
       FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    return res.rows.length > 0 ? this.mapMember(res.rows[0]) : null;
  }

  async listMembers(
    conversationId: string,
    db: Queryable = pool
  ): Promise<ConversationMemberWithUser[]> {
    const res = await db.query<DbConversationMemberWithUser>(
      `SELECT cm.id, cm.conversation_id, cm.user_id, cm.joined_at, cm.last_read_at,
              u.email, u.display_name, u.avatar_url
       FROM conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = $1
       ORDER BY cm.joined_at ASC`,
      [conversationId]
    );

    return res.rows.map((r) => this.mapMemberWithUser(r));
  }

  async findByIdWithMembers(
    id: string,
    currentUserId?: string,
    db: Queryable = pool
  ): Promise<ConversationWithMembers | null> {
    const conv = await this.findById(id, db);
    if (!conv) return null;

    const members = await this.listMembers(id, db);
    let unreadCount = 0;

    if (currentUserId) {
      const currentMember = members.find((m) => m.userId === currentUserId);
      if (currentMember) {
        unreadCount = await this.countUnreadMessages(id, currentUserId, new Date(currentMember.lastReadAt), db);
      }
    }

    return {
      ...this.mapConversation(conv),
      members,
      unreadCount,
    };
  }

  async listUserConversations(
    userId: string,
    organizationId?: string,
    db: Queryable = pool
  ): Promise<ConversationWithMembers[]> {
    let queryText = `
      SELECT c.id, c.organization_id, c.type, c.direct_hash, c.title, c.is_archived, c.created_at, c.updated_at
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      WHERE cm.user_id = $1
    `;
    const params: any[] = [userId];

    if (organizationId) {
      queryText += ` AND c.organization_id = $2`;
      params.push(organizationId);
    }

    queryText += ` ORDER BY c.updated_at DESC`;

    const res = await db.query<DbConversation>(queryText, params);
    if (res.rows.length === 0) return [];

    const convIds = res.rows.map((r) => r.id);
    const allMembersRes = await db.query<DbConversationMemberWithUser>(
      `SELECT cm.id, cm.conversation_id, cm.user_id, cm.joined_at, cm.last_read_at,
              u.email, u.display_name, u.avatar_url
       FROM conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = ANY($1::uuid[])
       ORDER BY cm.joined_at ASC`,
      [convIds]
    );

    // Group members by conversation_id
    const memberMap = new Map<string, ConversationMemberWithUser[]>();
    for (const r of allMembersRes.rows) {
      if (!memberMap.has(r.conversation_id)) {
        memberMap.set(r.conversation_id, []);
      }
      memberMap.get(r.conversation_id)!.push(this.mapMemberWithUser(r));
    }

    const conversations: ConversationWithMembers[] = [];
    for (const row of res.rows) {
      const members = memberMap.get(row.id) || [];
      const currentMember = members.find((m) => m.userId === userId);
      const unreadCount = currentMember
        ? await this.countUnreadMessages(row.id, userId, new Date(currentMember.lastReadAt), db)
        : 0;

      conversations.push({
        ...this.mapConversation(row),
        members,
        unreadCount,
      });
    }

    return conversations;
  }

  async updateLastRead(
    conversationId: string,
    userId: string,
    lastReadAt: Date = new Date(),
    db: Queryable = pool
  ): Promise<ConversationMember | null> {
    const res = await db.query<DbConversationMember>(
      `UPDATE conversation_members
       SET last_read_at = $1
       WHERE conversation_id = $2 AND user_id = $3
       RETURNING id, conversation_id, user_id, joined_at, last_read_at`,
      [lastReadAt, conversationId, userId]
    );

    return res.rows.length > 0 ? this.mapMember(res.rows[0]) : null;
  }

  async countUnreadMessages(
    conversationId: string,
    userId: string,
    lastReadAt: Date,
    db: Queryable = pool
  ): Promise<number> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM messages
       WHERE conversation_id = $1
         AND created_at > $2
         AND is_deleted = false
         AND sender_id != $3`,
      [conversationId, lastReadAt, userId]
    );

    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async touchUpdatedAt(
    conversationId: string,
    db: Queryable = pool
  ): Promise<void> {
    await db.query(
      `UPDATE conversations
       SET updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );
  }
}

export const conversationRepository = new ConversationRepository();
