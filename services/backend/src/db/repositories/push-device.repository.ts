import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';
import type {
  PushPlatform,
  PushProvider,
  PushDevice,
} from '@teamtrack/shared-types';

export interface DbPushDevice {
  id: string;
  user_id: string;
  platform: PushPlatform;
  provider: PushProvider;
  push_token: string;
  token_hash: string;
  app_version: string | null;
  device_name: string | null;
  enabled: boolean;
  last_seen_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export function hashPushToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function mapPushDevice(row: DbPushDevice): PushDevice {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    provider: row.provider,
    tokenHash: row.token_hash,
    appVersion: row.app_version,
    deviceName: row.device_name,
    enabled: row.enabled,
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export class PushDeviceRepository {
  /**
   * Registers or updates a device push token for the user.
   * If token is already registered to the same user, idempotently updates metadata and enables device.
   * If token was registered to a different user (e.g. account switch on mobile hardware),
   * deletes the previous device record (cascading delete to un-sent deliveries to prevent leakage)
   * and registers a fresh record for the new user.
   */
  async registerOrUpdateDevice(
    params: {
      userId: string;
      platform: PushPlatform;
      provider: PushProvider;
      pushToken: string;
      appVersion?: string;
      deviceName?: string;
    },
    client?: Queryable
  ): Promise<DbPushDevice> {
    const q = client || pool;
    const tokenHash = hashPushToken(params.pushToken);

    // 1. Check if token_hash is already registered
    const existingRes = await q.query<DbPushDevice>(
      'SELECT * FROM push_devices WHERE token_hash = $1;',
      [tokenHash]
    );
    const existing = existingRes.rows[0];

    if (existing) {
      if (existing.user_id === params.userId) {
        // Same user: idempotent update, re-enable device, refresh last_seen_at
        const updateRes = await q.query<DbPushDevice>(
          `UPDATE push_devices
           SET platform = $2,
               provider = $3,
               push_token = $4,
               app_version = COALESCE($5, app_version),
               device_name = COALESCE($6, device_name),
               enabled = true,
               last_seen_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *;`,
          [
            existing.id,
            params.platform,
            params.provider,
            params.pushToken.trim(),
            params.appVersion || null,
            params.deviceName || null,
          ]
        );
        return updateRes.rows[0];
      }

      // Different user: previous owner reassignment (e.g. account switch on mobile)
      // Delete old device row to cascade-delete/purge old user's pending deliveries and prevent leakage
      await q.query('DELETE FROM push_devices WHERE id = $1;', [existing.id]);
    }

    // 2. Insert new device row for params.userId
    const insertRes = await q.query<DbPushDevice>(
      `INSERT INTO push_devices (
        user_id,
        platform,
        provider,
        push_token,
        token_hash,
        app_version,
        device_name,
        enabled,
        last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      RETURNING *;`,
      [
        params.userId,
        params.platform,
        params.provider,
        params.pushToken.trim(),
        tokenHash,
        params.appVersion || null,
        params.deviceName || null,
      ]
    );

    return insertRes.rows[0];
  }

  async findById(deviceId: string, client?: Queryable): Promise<DbPushDevice | null> {
    const q = client || pool;
    const res = await q.query<DbPushDevice>(
      'SELECT * FROM push_devices WHERE id = $1;',
      [deviceId]
    );
    return res.rows[0] || null;
  }

  async findUserDevice(userId: string, deviceId: string, client?: Queryable): Promise<DbPushDevice | null> {
    const q = client || pool;
    const res = await q.query<DbPushDevice>(
      'SELECT * FROM push_devices WHERE id = $1 AND user_id = $2;',
      [deviceId, userId]
    );
    return res.rows[0] || null;
  }

  async findActiveDevicesByUserId(userId: string, client?: Queryable): Promise<DbPushDevice[]> {
    const q = client || pool;
    const res = await q.query<DbPushDevice>(
      'SELECT * FROM push_devices WHERE user_id = $1 AND enabled = true ORDER BY last_seen_at DESC;',
      [userId]
    );
    return res.rows;
  }

  async listDevicesByUserId(userId: string, client?: Queryable): Promise<DbPushDevice[]> {
    const q = client || pool;
    const res = await q.query<DbPushDevice>(
      'SELECT * FROM push_devices WHERE user_id = $1 ORDER BY created_at DESC;',
      [userId]
    );
    return res.rows;
  }

  async deleteDevice(userId: string, deviceId: string, client?: Queryable): Promise<boolean> {
    const q = client || pool;
    const res = await q.query(
      'DELETE FROM push_devices WHERE id = $1 AND user_id = $2 RETURNING id;',
      [deviceId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async disableDevice(deviceId: string, client?: Queryable): Promise<boolean> {
    const q = client || pool;
    const res = await q.query(
      'UPDATE push_devices SET enabled = false, updated_at = NOW() WHERE id = $1 RETURNING id;',
      [deviceId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async disableDeviceByTokenHash(tokenHash: string, client?: Queryable): Promise<boolean> {
    const q = client || pool;
    const res = await q.query(
      'UPDATE push_devices SET enabled = false, updated_at = NOW() WHERE token_hash = $1 RETURNING id;',
      [tokenHash]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const pushDeviceRepository = new PushDeviceRepository();
