import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';

export type Queryable = Pool | PoolClient;

export interface DbUser {
  id: string;
  email: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
  job_title: string | null;
  status: 'active' | 'suspended' | 'deactivated';
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  fullName?: string;
  avatarUrl?: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  locale?: string | null;
  jobTitle?: string | null;
}

export interface DbUserSecuritySummary {
  created_at: Date;
  last_login_at: Date | null;
  active_session_count: number;
  active_device_count: number;
  status: 'active' | 'suspended' | 'deactivated';
}

export class UserRepository {
  async findByEmail(email: string, db: Queryable = pool): Promise<DbUser | null> {
    const res = await db.query<DbUser>(
      `SELECT id, email, display_name, full_name, avatar_url,
              COALESCE(timezone, NULL) as timezone,
              COALESCE(locale, NULL) as locale,
              COALESCE(job_title, NULL) as job_title,
              status, created_at, updated_at, deleted_at
       FROM users
       WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    return res.rows[0] || null;
  }

  async findById(id: string, db: Queryable = pool): Promise<DbUser | null> {
    const res = await db.query<DbUser>(
      `SELECT id, email, display_name, full_name, avatar_url,
              COALESCE(timezone, NULL) as timezone,
              COALESCE(locale, NULL) as locale,
              COALESCE(job_title, NULL) as job_title,
              status, created_at, updated_at, deleted_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createUser(input: CreateUserInput, db: Queryable = pool): Promise<DbUser> {
    const res = await db.query<DbUser>(
      `INSERT INTO users (email, display_name, full_name, avatar_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, email, display_name, full_name, avatar_url,
                 timezone, locale, job_title,
                 status, created_at, updated_at, deleted_at`,
      [input.email, input.displayName, input.fullName || null, input.avatarUrl || null]
    );
    return res.rows[0];
  }

  async updateProfile(
    userId: string,
    updates: UpdateProfileInput,
    db: Queryable = pool
  ): Promise<DbUser | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex++}`);
      values.push(updates.displayName);
    }
    if (updates.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      values.push(updates.fullName);
    }
    if (updates.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.timezone !== undefined) {
      setClauses.push(`timezone = $${paramIndex++}`);
      values.push(updates.timezone);
    }
    if (updates.locale !== undefined) {
      setClauses.push(`locale = $${paramIndex++}`);
      values.push(updates.locale);
    }
    if (updates.jobTitle !== undefined) {
      setClauses.push(`job_title = $${paramIndex++}`);
      values.push(updates.jobTitle);
    }

    const queryText = `
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, email, display_name, full_name, avatar_url,
                timezone, locale, job_title,
                status, created_at, updated_at, deleted_at
    `;

    const res = await db.query<DbUser>(queryText, values);
    return res.rows[0] || null;
  }

  async getUserSecuritySummary(
    userId: string,
    db: Queryable = pool
  ): Promise<DbUserSecuritySummary | null> {
    const user = await this.findById(userId, db);
    if (!user) return null;

    const sessionRes = await db.query<{ count: string; last_login: Date | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > NOW()) as count,
         MAX(COALESCE(rotated_at, created_at)) as last_login
       FROM user_sessions
       WHERE user_id = $1`,
      [userId]
    );

    const deviceRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM user_devices
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    const sessionRow = sessionRes.rows[0];
    const deviceRow = deviceRes.rows[0];

    return {
      created_at: user.created_at,
      last_login_at: sessionRow?.last_login || null,
      active_session_count: parseInt(sessionRow?.count || '0', 10),
      active_device_count: parseInt(deviceRow?.count || '0', 10),
      status: user.status,
    };
  }
}

export const userRepository = new UserRepository();

