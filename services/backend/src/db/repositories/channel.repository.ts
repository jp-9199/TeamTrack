import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  Channel,
  ChannelMember,
  ChannelMemberWithUser,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbChannel {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'member';
  joined_at: Date;
}

export interface DbChannelMemberWithUser extends DbChannelMember {
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CreateChannelInput {
  teamId: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export class ChannelRepository {
  mapChannel(row: DbChannel): Channel {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      description: row.description,
      isPrivate: row.is_private,
      isArchived: row.is_archived,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapMember(row: DbChannelMember): ChannelMember {
    return {
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at.toISOString(),
    };
  }

  mapMemberWithUser(row: DbChannelMemberWithUser): ChannelMemberWithUser {
    return {
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at.toISOString(),
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
    };
  }

  async createChannel(input: CreateChannelInput, db: Queryable = pool): Promise<DbChannel> {
    const res = await db.query<DbChannel>(
      `INSERT INTO channels (team_id, name, description, is_private)
       VALUES ($1, $2, $3, $4)
       RETURNING id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [input.teamId, input.name, input.description || null, input.isPrivate ?? false]
    );
    return res.rows[0];
  }

  async findById(id: string, db: Queryable = pool): Promise<DbChannel | null> {
    const res = await db.query<DbChannel>(
      `SELECT id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at
       FROM channels
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findByName(teamId: string, name: string, db: Queryable = pool): Promise<DbChannel | null> {
    const res = await db.query<DbChannel>(
      `SELECT id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at
       FROM channels
       WHERE team_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL
       LIMIT 1`,
      [teamId, name]
    );
    return res.rows[0] || null;
  }

  async listChannelsForUserInTeam(
    teamId: string,
    userId: string,
    canAccessAllPrivate: boolean,
    db: Queryable = pool
  ): Promise<DbChannel[]> {
    if (canAccessAllPrivate) {
      const res = await db.query<DbChannel>(
        `SELECT id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at
         FROM channels
         WHERE team_id = $1 AND deleted_at IS NULL
         ORDER BY name ASC`,
        [teamId]
      );
      return res.rows;
    }

    const res = await db.query<DbChannel>(
      `SELECT c.id, c.team_id, c.name, c.description, c.is_private, c.is_archived, c.created_at, c.updated_at, c.deleted_at
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
       WHERE c.team_id = $1
         AND c.deleted_at IS NULL
         AND (c.is_private = false OR cm.id IS NOT NULL)
       ORDER BY c.name ASC`,
      [teamId, userId]
    );
    return res.rows;
  }

  async updateChannel(
    id: string,
    updates: { name?: string; description?: string | null },
    db: Queryable = pool
  ): Promise<DbChannel | null> {
    const res = await db.query<DbChannel>(
      `UPDATE channels
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [id, updates.name || null, updates.description !== undefined, updates.description || null]
    );
    return res.rows[0] || null;
  }

  async archiveChannel(id: string, db: Queryable = pool): Promise<DbChannel | null> {
    const res = await db.query<DbChannel>(
      `UPDATE channels
       SET is_archived = true, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, team_id, name, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getChannelMember(
    channelId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<DbChannelMember | null> {
    const res = await db.query<DbChannelMember>(
      `SELECT id, channel_id, user_id, role, joined_at
       FROM channel_members
       WHERE channel_id = $1 AND user_id = $2
       LIMIT 1`,
      [channelId, userId]
    );
    return res.rows[0] || null;
  }

  async listChannelMembers(
    channelId: string,
    db: Queryable = pool
  ): Promise<DbChannelMemberWithUser[]> {
    const res = await db.query<DbChannelMemberWithUser>(
      `SELECT cm.id, cm.channel_id, cm.user_id, cm.role, cm.joined_at,
              u.email, u.display_name, u.avatar_url
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = $1
       ORDER BY cm.joined_at ASC`,
      [channelId]
    );
    return res.rows;
  }

  async addChannelMember(
    channelId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<DbChannelMember> {
    const res = await db.query<DbChannelMember>(
      `INSERT INTO channel_members (channel_id, user_id, role)
       VALUES ($1, $2, 'member')
       RETURNING id, channel_id, user_id, role, joined_at`,
      [channelId, userId]
    );
    return res.rows[0];
  }

  async removeChannelMember(
    channelId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<boolean> {
    const res = await db.query(
      `DELETE FROM channel_members
       WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const channelRepository = new ChannelRepository();
