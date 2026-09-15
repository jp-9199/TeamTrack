import type { Queryable } from './user.repository.js';
import { pool } from '../pool.js';

export interface DbUserCredential {
  user_id: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export class CredentialRepository {
  async createCredentials(
    userId: string,
    passwordHash: string,
    db: Queryable = pool
  ): Promise<void> {
    await db.query(
      `INSERT INTO user_credentials (user_id, password_hash)
       VALUES ($1, $2)`,
      [userId, passwordHash]
    );
  }

  async findByUserId(
    userId: string,
    db: Queryable = pool
  ): Promise<DbUserCredential | null> {
    const res = await db.query<DbUserCredential>(
      `SELECT user_id, password_hash, created_at, updated_at
       FROM user_credentials
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    db: Queryable = pool
  ): Promise<void> {
    await db.query(
      `UPDATE user_credentials
       SET password_hash = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, passwordHash]
    );
  }
}

export const credentialRepository = new CredentialRepository();
