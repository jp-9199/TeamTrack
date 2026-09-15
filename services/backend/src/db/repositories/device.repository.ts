import type { Queryable } from './user.repository.js';
import { pool } from '../pool.js';

export interface DbUserDevice {
  id: string;
  user_id: string;
  device_token: string;
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web';
  device_model: string | null;
  app_version: string | null;
  is_active: boolean;
  last_seen_at: Date;
  created_at: Date;
}

export interface RegisterDeviceInput {
  userId: string;
  deviceToken: string;
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web';
  deviceModel?: string;
  appVersion?: string;
}

export class DeviceRepository {
  async registerOrUpdateDevice(
    input: RegisterDeviceInput,
    db: Queryable = pool
  ): Promise<DbUserDevice> {
    const res = await db.query<DbUserDevice>(
      `INSERT INTO user_devices (
         user_id,
         device_token,
         platform,
         device_model,
         app_version,
         is_active,
         last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       ON CONFLICT (device_token)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         device_model = COALESCE(EXCLUDED.device_model, user_devices.device_model),
         app_version = COALESCE(EXCLUDED.app_version, user_devices.app_version),
         is_active = true,
         last_seen_at = NOW()
       RETURNING *`,
      [
        input.userId,
        input.deviceToken,
        input.platform,
        input.deviceModel || null,
        input.appVersion || null,
      ]
    );
    return res.rows[0];
  }

  async deactivateDevice(deviceToken: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE user_devices
       SET is_active = false, last_seen_at = NOW()
       WHERE device_token = $1`,
      [deviceToken]
    );
  }
}

export const deviceRepository = new DeviceRepository();
