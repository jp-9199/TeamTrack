import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  Organization,
  OrganizationMember,
  OrganizationMemberWithUser,
  OrganizationRole,
  OrganizationStatus,
  OrganizationMemberStatus,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbOrganization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  status: OrganizationStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbOrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'suspended';
  joined_at: Date;
  updated_at: Date;
}

export interface DbOrganizationMemberWithUser extends DbOrganizationMember {
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  ownerId: string;
}

export class OrganizationRepository {
  mapOrg(row: DbOrganization): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.owner_id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  mapMember(row: DbOrganizationMember): OrganizationMember {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at.toISOString(),
    };
  }

  mapMemberWithUser(row: DbOrganizationMemberWithUser): OrganizationMemberWithUser {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at.toISOString(),
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
    };
  }

  async createOrganization(
    input: CreateOrganizationInput,
    db: Queryable = pool
  ): Promise<DbOrganization> {
    const res = await db.query<DbOrganization>(
      `INSERT INTO organizations (name, slug, owner_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, name, slug, owner_id, status, created_at, updated_at, deleted_at`,
      [input.name, input.slug, input.ownerId]
    );
    return res.rows[0];
  }

  async findById(id: string, db: Queryable = pool): Promise<DbOrganization | null> {
    const res = await db.query<DbOrganization>(
      `SELECT id, name, slug, owner_id, status, created_at, updated_at, deleted_at
       FROM organizations
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findBySlug(slug: string, db: Queryable = pool): Promise<DbOrganization | null> {
    const res = await db.query<DbOrganization>(
      `SELECT id, name, slug, owner_id, status, created_at, updated_at, deleted_at
       FROM organizations
       WHERE slug = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [slug]
    );
    return res.rows[0] || null;
  }

  async findForUser(userId: string, db: Queryable = pool): Promise<DbOrganization[]> {
    const res = await db.query<DbOrganization>(
      `SELECT o.id, o.name, o.slug, o.owner_id, o.status, o.created_at, o.updated_at, o.deleted_at
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1
         AND om.status = 'active'
         AND o.deleted_at IS NULL
       ORDER BY o.name ASC`,
      [userId]
    );
    return res.rows;
  }

  async updateOrganization(
    id: string,
    updates: { name?: string },
    db: Queryable = pool
  ): Promise<DbOrganization | null> {
    const res = await db.query<DbOrganization>(
      `UPDATE organizations
       SET name = COALESCE($2, name), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, slug, owner_id, status, created_at, updated_at, deleted_at`,
      [id, updates.name || null]
    );
    return res.rows[0] || null;
  }

  async archiveOrganization(id: string, db: Queryable = pool): Promise<DbOrganization | null> {
    const res = await db.query<DbOrganization>(
      `UPDATE organizations
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, slug, owner_id, status, created_at, updated_at, deleted_at`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Row-locked ownership transfer within an active transaction.
   */
  async transferOwnershipLocked(
    client: PoolClient,
    orgId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<DbOrganization> {
    // 1. Lock the organization row for update
    const lockRes = await client.query<DbOrganization>(
      `SELECT id, name, slug, owner_id, status, created_at, updated_at, deleted_at
       FROM organizations
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [orgId]
    );
    const org = lockRes.rows[0];
    if (!org) {
      throw new Error('ORGANIZATION_NOT_FOUND');
    }
    if (org.owner_id !== currentOwnerId) {
      throw new Error('CALLER_NOT_OWNER');
    }

    // 2. Verify target user is an active member
    const targetMember = await this.getMember(orgId, newOwnerId, client);
    if (!targetMember || targetMember.status !== 'active') {
      throw new Error('TARGET_NOT_ACTIVE_MEMBER');
    }

    // 3. Update organization owner_id
    const updatedOrgRes = await client.query<DbOrganization>(
      `UPDATE organizations
       SET owner_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, owner_id, status, created_at, updated_at, deleted_at`,
      [orgId, newOwnerId]
    );

    // 4. Update old owner role to admin
    await client.query(
      `UPDATE organization_members
       SET role = 'admin', updated_at = NOW()
       WHERE organization_id = $1 AND user_id = $2`,
      [orgId, currentOwnerId]
    );

    // 5. Update new owner role to owner
    await client.query(
      `UPDATE organization_members
       SET role = 'owner', updated_at = NOW()
       WHERE organization_id = $1 AND user_id = $2`,
      [orgId, newOwnerId]
    );

    return updatedOrgRes.rows[0];
  }

  async getMember(
    orgId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<DbOrganizationMember | null> {
    const res = await db.query<DbOrganizationMember>(
      `SELECT id, organization_id, user_id, role, status, joined_at, updated_at
       FROM organization_members
       WHERE organization_id = $1 AND user_id = $2
       LIMIT 1`,
      [orgId, userId]
    );
    return res.rows[0] || null;
  }

  async listMembers(
    orgId: string,
    options: { includeSuspended?: boolean } = {},
    db: Queryable = pool
  ): Promise<DbOrganizationMemberWithUser[]> {
    const statusClause = options.includeSuspended
      ? `om.status IN ('active', 'suspended')`
      : `om.status = 'active'`;

    const res = await db.query<DbOrganizationMemberWithUser>(
      `SELECT om.id, om.organization_id, om.user_id, om.role, om.status, om.joined_at, om.updated_at,
              u.email, u.display_name, u.avatar_url
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND ${statusClause}
       ORDER BY om.role = 'owner' DESC, om.role = 'admin' DESC, om.joined_at ASC`,
      [orgId]
    );
    return res.rows;
  }

  async addMember(
    orgId: string,
    userId: string,
    role: OrganizationRole = 'member',
    db: Queryable = pool
  ): Promise<DbOrganizationMember> {
    const res = await db.query<DbOrganizationMember>(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, organization_id, user_id, role, status, joined_at, updated_at`,
      [orgId, userId, role]
    );
    return res.rows[0];
  }

  async updateMemberRole(
    orgId: string,
    userId: string,
    role: OrganizationRole,
    db: Queryable = pool
  ): Promise<DbOrganizationMember | null> {
    const res = await db.query<DbOrganizationMember>(
      `UPDATE organization_members
       SET role = $3, updated_at = NOW()
       WHERE organization_id = $1 AND user_id = $2
       RETURNING id, organization_id, user_id, role, status, joined_at, updated_at`,
      [orgId, userId, role]
    );
    return res.rows[0] || null;
  }

  async updateMemberStatus(
    orgId: string,
    userId: string,
    status: 'active' | 'suspended',
    db: Queryable = pool
  ): Promise<DbOrganizationMember | null> {
    const res = await db.query<DbOrganizationMember>(
      `UPDATE organization_members
       SET status = $3, updated_at = NOW()
       WHERE organization_id = $1 AND user_id = $2
       RETURNING id, organization_id, user_id, role, status, joined_at, updated_at`,
      [orgId, userId, status]
    );
    return res.rows[0] || null;
  }

  async updateMemberRoleAndStatus(
    orgId: string,
    userId: string,
    updates: { role?: OrganizationRole; status?: OrganizationMemberStatus },
    db: Queryable = pool
  ): Promise<DbOrganizationMember | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [orgId, userId];
    let paramIdx = 3;

    if (updates.role !== undefined) {
      setClauses.push(`role = $${paramIdx++}`);
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(updates.status);
    }

    const res = await db.query<DbOrganizationMember>(
      `UPDATE organization_members
       SET ${setClauses.join(', ')}
       WHERE organization_id = $1 AND user_id = $2
       RETURNING id, organization_id, user_id, role, status, joined_at, updated_at`,
      values
    );
    return res.rows[0] || null;
  }

  /**
   * Explicit transactional deprovisioning cascade:
   * 1. Remove from all private channel memberships in the organization
   * 2. Remove from all team memberships in the organization
   * 3. Remove from organization_members
   */
  async deprovisionMemberCascade(
    client: PoolClient,
    orgId: string,
    userId: string
  ): Promise<void> {
    // 1. Remove channel memberships in this org
    await client.query(
      `DELETE FROM channel_members
       WHERE user_id = $1
         AND channel_id IN (
           SELECT c.id FROM channels c
           JOIN teams t ON t.id = c.team_id
           WHERE t.organization_id = $2
         )`,
      [userId, orgId]
    );

    // 2. Remove team memberships in this org
    await client.query(
      `DELETE FROM team_members
       WHERE user_id = $1
         AND team_id IN (
           SELECT t.id FROM teams t
           WHERE t.organization_id = $2
         )`,
      [userId, orgId]
    );

    // 3. Remove organization membership
    await client.query(
      `DELETE FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userId]
    );
  }
}

export const organizationRepository = new OrganizationRepository();
