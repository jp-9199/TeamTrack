import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  Team,
  TeamMember,
  TeamMemberWithUser,
  TeamWithMembership,
  TeamRole,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbTeam {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_private: boolean;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: Date;
}

export interface DbTeamMemberWithUser extends DbTeamMember {
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface DbTeamWithMembership extends DbTeam {
  is_member: boolean;
  member_role: TeamRole | null;
}

export interface CreateTeamInput {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  isPrivate?: boolean;
}

export class TeamRepository {
  mapTeam(row: DbTeam): Team {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isPrivate: row.is_private,
      isArchived: row.is_archived,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapMember(row: DbTeamMember): TeamMember {
    return {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at.toISOString(),
    };
  }

  mapMemberWithUser(row: DbTeamMemberWithUser): TeamMemberWithUser {
    return {
      id: row.id,
      teamId: row.team_id,
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

  mapTeamWithMembership(row: DbTeamWithMembership): TeamWithMembership {
    return {
      ...this.mapTeam(row),
      isMember: Boolean(row.is_member),
      memberRole: row.member_role || undefined,
    };
  }

  async createTeam(input: CreateTeamInput, db: Queryable = pool): Promise<DbTeam> {
    const res = await db.query<DbTeam>(
      `INSERT INTO teams (organization_id, name, slug, description, is_private)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, name, slug, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [input.organizationId, input.name, input.slug, input.description || null, input.isPrivate ?? false]
    );
    return res.rows[0];
  }

  async findById(id: string, db: Queryable = pool): Promise<DbTeam | null> {
    const res = await db.query<DbTeam>(
      `SELECT id, organization_id, name, slug, description, is_private, is_archived, created_at, updated_at, deleted_at
       FROM teams
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findBySlug(orgId: string, slug: string, db: Queryable = pool): Promise<DbTeam | null> {
    const res = await db.query<DbTeam>(
      `SELECT id, organization_id, name, slug, description, is_private, is_archived, created_at, updated_at, deleted_at
       FROM teams
       WHERE organization_id = $1 AND slug = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [orgId, slug]
    );
    return res.rows[0] || null;
  }

  async listTeamsForUserInOrg(
    orgId: string,
    userId: string,
    canAccessAllPrivate: boolean,
    isGuest: boolean,
    db: Queryable = pool
  ): Promise<DbTeamWithMembership[]> {
    if (isGuest) {
      // Guests ONLY see teams where they are explicitly members
      const res = await db.query<DbTeamWithMembership>(
        `SELECT t.id, t.organization_id, t.name, t.slug, t.description, t.is_private, t.is_archived,
                t.created_at, t.updated_at, t.deleted_at,
                true AS is_member, tm.role AS member_role
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
         WHERE t.organization_id = $1 AND t.deleted_at IS NULL
         ORDER BY t.name ASC`,
        [orgId, userId]
      );
      return res.rows;
    }

    if (canAccessAllPrivate) {
      // Org Owner / Admin sees all non-deleted teams in the org
      const res = await db.query<DbTeamWithMembership>(
        `SELECT t.id, t.organization_id, t.name, t.slug, t.description, t.is_private, t.is_archived,
                t.created_at, t.updated_at, t.deleted_at,
                (tm.id IS NOT NULL) AS is_member, tm.role AS member_role
         FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
         WHERE t.organization_id = $1 AND t.deleted_at IS NULL
         ORDER BY t.name ASC`,
        [orgId, userId]
      );
      return res.rows;
    }

    // Standard Org Member: sees all public teams + private teams they are member of
    const res = await db.query<DbTeamWithMembership>(
      `SELECT t.id, t.organization_id, t.name, t.slug, t.description, t.is_private, t.is_archived,
              t.created_at, t.updated_at, t.deleted_at,
              (tm.id IS NOT NULL) AS is_member, tm.role AS member_role
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
       WHERE t.organization_id = $1
         AND t.deleted_at IS NULL
         AND (t.is_private = false OR tm.id IS NOT NULL)
       ORDER BY t.name ASC`,
      [orgId, userId]
    );
    return res.rows;
  }

  async updateTeam(
    id: string,
    updates: { name?: string; description?: string | null },
    db: Queryable = pool
  ): Promise<DbTeam | null> {
    const res = await db.query<DbTeam>(
      `UPDATE teams
       SET name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, organization_id, name, slug, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [id, updates.name || null, updates.description !== undefined, updates.description || null]
    );
    return res.rows[0] || null;
  }

  async archiveTeam(id: string, db: Queryable = pool): Promise<DbTeam | null> {
    const res = await db.query<DbTeam>(
      `UPDATE teams
       SET is_archived = true, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, organization_id, name, slug, description, is_private, is_archived, created_at, updated_at, deleted_at`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getTeamMember(
    teamId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<DbTeamMember | null> {
    const res = await db.query<DbTeamMember>(
      `SELECT id, team_id, user_id, role, joined_at
       FROM team_members
       WHERE team_id = $1 AND user_id = $2
       LIMIT 1`,
      [teamId, userId]
    );
    return res.rows[0] || null;
  }

  async listTeamMembers(teamId: string, db: Queryable = pool): Promise<DbTeamMemberWithUser[]> {
    const res = await db.query<DbTeamMemberWithUser>(
      `SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.joined_at,
              u.email, u.display_name, u.avatar_url
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.role = 'lead' DESC, tm.joined_at ASC`,
      [teamId]
    );
    return res.rows;
  }

  async addTeamMember(
    teamId: string,
    userId: string,
    role: TeamRole = 'member',
    db: Queryable = pool
  ): Promise<DbTeamMember> {
    const res = await db.query<DbTeamMember>(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, team_id, user_id, role, joined_at`,
      [teamId, userId, role]
    );
    return res.rows[0];
  }

  /**
   * Explicit transactional deprovisioning cascade:
   * 1. Remove from all private channel memberships in this team
   * 2. Remove from team_members
   */
  async deprovisionTeamMemberCascade(
    client: PoolClient,
    teamId: string,
    userId: string
  ): Promise<void> {
    // 1. Remove channel memberships in this team
    await client.query(
      `DELETE FROM channel_members
       WHERE user_id = $1
         AND channel_id IN (
           SELECT id FROM channels WHERE team_id = $2
         )`,
      [userId, teamId]
    );

    // 2. Remove team membership
    await client.query(
      `DELETE FROM team_members
       WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId]
    );
  }
}

export const teamRepository = new TeamRepository();
