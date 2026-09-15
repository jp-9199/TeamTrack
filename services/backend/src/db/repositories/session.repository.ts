import type { PoolClient } from 'pg';
import type { Queryable } from './user.repository.js';
import { pool } from '../pool.js';

export interface DbUserSession {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  rotated_at: Date | null;
  rotation_counter: number;
}

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export type SessionRotationMatch =
  | { type: 'not_found' }
  | { type: 'revoked'; session: DbUserSession }
  | { type: 'expired'; session: DbUserSession }
  | { type: 'reuse_detected'; session: DbUserSession }
  | { type: 'current_valid'; session: DbUserSession };

export class SessionRepository {
  async createSession(
    input: CreateSessionInput,
    db: Queryable = pool
  ): Promise<DbUserSession> {
    const res = await db.query<DbUserSession>(
      `INSERT INTO user_sessions (
         user_id,
         refresh_token_hash,
         expires_at,
         user_agent,
         ip_address
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.userId,
        input.refreshTokenHash,
        input.expiresAt,
        input.userAgent || null,
        input.ipAddress || null,
      ]
    );
    return res.rows[0];
  }

  /**
   * Locks the session row with SELECT ... FOR UPDATE to guarantee atomic token rotation
   * and detect reuse across concurrent requests.
   */
  async lockAndEvaluateSession(
    client: PoolClient,
    tokenHash: string
  ): Promise<SessionRotationMatch> {
    const res = await client.query<DbUserSession>(
      `SELECT id, user_id, refresh_token_hash, previous_refresh_token_hash,
              user_agent, ip_address, expires_at, created_at, revoked_at,
              rotated_at, rotation_counter
       FROM user_sessions
       WHERE refresh_token_hash = $1 OR previous_refresh_token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const session = res.rows[0];
    if (!session) {
      return { type: 'not_found' };
    }

    if (session.revoked_at !== null) {
      return { type: 'revoked', session };
    }

    if (session.expires_at.getTime() <= Date.now()) {
      return { type: 'expired', session };
    }

    // CASE B: Presented hash == previous_refresh_token_hash (Reuse detected)
    if (session.previous_refresh_token_hash === tokenHash) {
      await client.query(
        `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE id = $1`,
        [session.id]
      );
      return { type: 'reuse_detected', session };
    }

    // CASE A: Presented hash == current refresh_token_hash
    if (session.refresh_token_hash === tokenHash) {
      return { type: 'current_valid', session };
    }

    return { type: 'not_found' };
  }

  async rotateSession(
    client: PoolClient,
    sessionId: string,
    currentHash: string,
    newHash: string
  ): Promise<DbUserSession> {
    const res = await client.query<DbUserSession>(
      `UPDATE user_sessions
       SET previous_refresh_token_hash = $2,
           refresh_token_hash = $3,
           rotated_at = NOW(),
           rotation_counter = rotation_counter + 1
       WHERE id = $1
       RETURNING *`,
      [sessionId, currentHash, newHash]
    );
    return res.rows[0];
  }

  async revokeSession(sessionId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId]
    );
  }

  async revokeByTokenHash(tokenHash: string, db: Queryable = pool): Promise<DbUserSession | null> {
    const res = await db.query<DbUserSession>(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE (refresh_token_hash = $1 OR previous_refresh_token_hash = $1)
         AND revoked_at IS NULL
       RETURNING *`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async findById(sessionId: string, db: Queryable = pool): Promise<DbUserSession | null> {
    const res = await db.query<DbUserSession>(
      `SELECT * FROM user_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );
    return res.rows[0] || null;
  }

  async findActiveSessionsByUserId(
    userId: string,
    db: Queryable = pool
  ): Promise<DbUserSession[]> {
    const res = await db.query<DbUserSession>(
      `SELECT id, user_id, refresh_token_hash, previous_refresh_token_hash,
              user_agent, ip_address, expires_at, created_at, revoked_at,
              rotated_at, rotation_counter
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY COALESCE(rotated_at, created_at) DESC`,
      [userId]
    );
    return res.rows;
  }

  async revokeSessionForUser(
    userId: string,
    sessionId: string,
    db: Queryable = pool
  ): Promise<DbUserSession | null> {
    const res = await db.query<DbUserSession>(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING *`,
      [sessionId, userId]
    );
    return res.rows[0] || null;
  }

  async revokeAllSessionsForUser(
    userId: string,
    exceptSessionId?: string,
    db: Queryable = pool
  ): Promise<number> {
    const queryText = exceptSessionId
      ? `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`
      : `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`;

    const params = exceptSessionId ? [userId, exceptSessionId] : [userId];
    const res = await db.query(queryText, params);
    return res.rowCount || 0;
  }

  async countActiveSessionsByUserId(
    userId: string,
    db: Queryable = pool
  ): Promise<number> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [userId]
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  }
}

export const sessionRepository = new SessionRepository();
