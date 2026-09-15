import type { PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';
import type {
  PushPlatform,
  PushProvider,
  PushDeliveryStatus,
  NotificationType,
} from '@teamtrack/shared-types';

export interface DbPushDelivery {
  id: string;
  notification_id: string;
  device_id: string;
  status: PushDeliveryStatus;
  attempt_count: number;
  next_attempt_at: Date | string | null;
  lease_expires_at: Date | string | null;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  sent_at: Date | string | null;
}

export interface ClaimedPushDeliveryJob {
  deliveryId: string;
  notificationId: string;
  deviceId: string;
  attemptCount: number;
  platform: PushPlatform;
  provider: PushProvider;
  pushToken: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  dataPayload: Record<string, unknown> | null;
}

export class PushDeliveryRepository {
  /**
   * Bulk inserts delivery jobs for eligible devices.
   * Uses ON CONFLICT (notification_id, device_id) DO NOTHING to prevent duplicate jobs.
   */
  async createDeliveries(
    deliveries: Array<{ notificationId: string; deviceId: string }>,
    client?: Queryable
  ): Promise<number> {
    if (deliveries.length === 0) return 0;

    const q = client || pool;
    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < deliveries.length; i++) {
      const offset = i * 2;
      values.push(deliveries[i].notificationId, deliveries[i].deviceId);
      rows.push(`($${offset + 1}, $${offset + 2}, 'PENDING', 0, NOW())`);
    }

    const query = `
      INSERT INTO push_notification_deliveries (
        notification_id,
        device_id,
        status,
        attempt_count,
        next_attempt_at
      )
      VALUES ${rows.join(', ')}
      ON CONFLICT (notification_id, device_id) DO NOTHING
      RETURNING id;
    `;

    const res = await q.query(query, values);
    return res.rowCount ?? 0;
  }

  /**
   * Concurrency-safe job claiming with SKIP LOCKED and lease expiration recovery.
   * Claims PENDING jobs (where next_attempt_at <= NOW()) or stale PROCESSING jobs
   * (where lease_expires_at <= NOW()).
   * Increments attempt_count and sets lease_expires_at atomically.
   */
  async claimPendingDeliveries(
    batchSize: number = 10,
    leaseDurationMs: number = 300000, // 5 minutes
    client?: Queryable
  ): Promise<ClaimedPushDeliveryJob[]> {
    const q = client || pool;

    const query = `
      WITH claimable AS (
        SELECT d.id
        FROM push_notification_deliveries d
        JOIN push_devices dev ON dev.id = d.device_id
        WHERE (
          (d.status = 'PENDING' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW()))
          OR
          (d.status = 'PROCESSING' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at <= NOW())
        )
        AND dev.enabled = true
        ORDER BY COALESCE(d.next_attempt_at, d.created_at) ASC
        LIMIT $1
        FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE push_notification_deliveries upd
      SET
        status = 'PROCESSING',
        attempt_count = upd.attempt_count + 1,
        lease_expires_at = NOW() + ($2 || ' milliseconds')::interval,
        updated_at = NOW()
      FROM claimable c
      JOIN push_notification_deliveries d2 ON d2.id = c.id
      JOIN push_devices dev ON dev.id = d2.device_id
      JOIN notifications n ON n.id = d2.notification_id
      WHERE upd.id = c.id
      RETURNING
        upd.id AS delivery_id,
        upd.notification_id,
        upd.device_id,
        upd.attempt_count,
        dev.platform,
        dev.provider,
        dev.push_token,
        n.type AS notification_type,
        n.title,
        n.body,
        n.resource_type,
        n.resource_id,
        n.data_payload;
    `;

    const res = await q.query<{
      delivery_id: string;
      notification_id: string;
      device_id: string;
      attempt_count: number;
      platform: PushPlatform;
      provider: PushProvider;
      push_token: string;
      notification_type: NotificationType;
      title: string;
      body: string;
      resource_type: string | null;
      resource_id: string | null;
      data_payload: Record<string, unknown> | null;
    }>(query, [batchSize, leaseDurationMs]);

    return res.rows.map((row) => ({
      deliveryId: row.delivery_id,
      notificationId: row.notification_id,
      deviceId: row.device_id,
      attemptCount: row.attempt_count,
      platform: row.platform,
      provider: row.provider,
      pushToken: row.push_token,
      notificationType: row.notification_type,
      title: row.title,
      body: row.body,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      dataPayload: row.data_payload,
    }));
  }

  async markSent(
    deliveryId: string,
    providerMessageId: string | null,
    client?: Queryable
  ): Promise<void> {
    const q = client || pool;
    await q.query(
      `
      UPDATE push_notification_deliveries
      SET
        status = 'SENT',
        provider_message_id = $2,
        last_error_code = NULL,
        last_error_message = NULL,
        lease_expires_at = NULL,
        sent_at = NOW(),
        updated_at = NOW()
      WHERE id = $1;
      `,
      [deliveryId, providerMessageId]
    );
  }

  async scheduleRetry(
    deliveryId: string,
    nextAttemptAt: Date,
    errorCode: string,
    errorMessage: string,
    client?: Queryable
  ): Promise<void> {
    const q = client || pool;
    const sanitizedMsg = errorMessage.slice(0, 500);
    await q.query(
      `
      UPDATE push_notification_deliveries
      SET
        status = 'PENDING',
        next_attempt_at = $2,
        lease_expires_at = NULL,
        last_error_code = $3,
        last_error_message = $4,
        updated_at = NOW()
      WHERE id = $1;
      `,
      [deliveryId, nextAttemptAt, errorCode, sanitizedMsg]
    );
  }

  async markFailed(
    deliveryId: string,
    errorCode: string,
    errorMessage: string,
    client?: Queryable
  ): Promise<void> {
    const q = client || pool;
    const sanitizedMsg = errorMessage.slice(0, 500);
    await q.query(
      `
      UPDATE push_notification_deliveries
      SET
        status = 'FAILED',
        lease_expires_at = NULL,
        last_error_code = $2,
        last_error_message = $3,
        updated_at = NOW()
      WHERE id = $1;
      `,
      [deliveryId, errorCode, sanitizedMsg]
    );
  }

  async markDisabled(
    deliveryId: string,
    errorCode: string,
    errorMessage: string,
    client?: Queryable
  ): Promise<void> {
    const q = client || pool;
    const sanitizedMsg = errorMessage.slice(0, 500);
    await q.query(
      `
      UPDATE push_notification_deliveries
      SET
        status = 'DISABLED',
        lease_expires_at = NULL,
        last_error_code = $2,
        last_error_message = $3,
        updated_at = NOW()
      WHERE id = $1;
      `,
      [deliveryId, errorCode, sanitizedMsg]
    );
  }

  async findById(id: string, client?: Queryable): Promise<DbPushDelivery | null> {
    const q = client || pool;
    const res = await q.query<DbPushDelivery>(
      'SELECT * FROM push_notification_deliveries WHERE id = $1;',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByNotificationId(notificationId: string, client?: Queryable): Promise<DbPushDelivery[]> {
    const q = client || pool;
    const res = await q.query<DbPushDelivery>(
      'SELECT * FROM push_notification_deliveries WHERE notification_id = $1 ORDER BY created_at ASC;',
      [notificationId]
    );
    return res.rows;
  }
}

export const pushDeliveryRepository = new PushDeliveryRepository();
