import type { PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';
import type {
  EmailDeliveryStatus,
  NotificationType,
} from '@teamtrack/shared-types';

export interface DbEmailDelivery {
  id: string;
  notification_id: string;
  recipient_user_id: string;
  email_address_snapshot: string;
  status: EmailDeliveryStatus;
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

export interface ClaimedEmailDeliveryJob {
  deliveryId: string;
  notificationId: string;
  recipientUserId: string;
  emailAddress: string;
  attemptCount: number;
  notificationType: NotificationType;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  dataPayload: Record<string, unknown> | null;
}

export class EmailDeliveryRepository {
  /**
   * Inserts an email delivery outbox job for an eligible notification and recipient.
   * Enforces UNIQUE (notification_id, recipient_user_id) with ON CONFLICT DO NOTHING.
   */
  async createDelivery(
    params: {
      notificationId: string;
      recipientUserId: string;
      emailAddressSnapshot: string;
    },
    client?: Queryable
  ): Promise<number> {
    const q = client || pool;
    const query = `
      INSERT INTO email_notification_deliveries (
        notification_id,
        recipient_user_id,
        email_address_snapshot,
        status,
        attempt_count,
        next_attempt_at
      )
      VALUES ($1, $2, $3, 'PENDING', 0, NOW())
      ON CONFLICT (notification_id, recipient_user_id) DO NOTHING
      RETURNING id;
    `;

    const res = await q.query(query, [
      params.notificationId,
      params.recipientUserId,
      params.emailAddressSnapshot.trim().toLowerCase(),
    ]);

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
  ): Promise<ClaimedEmailDeliveryJob[]> {
    const q = client || pool;

    const query = `
      WITH claimable AS (
        SELECT d.id
        FROM email_notification_deliveries d
        JOIN users u ON u.id = d.recipient_user_id
        WHERE (
          (d.status = 'PENDING' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW()))
          OR
          (d.status = 'PROCESSING' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at <= NOW())
        )
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        ORDER BY COALESCE(d.next_attempt_at, d.created_at) ASC
        LIMIT $1
        FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE email_notification_deliveries upd
      SET
        status = 'PROCESSING',
        attempt_count = upd.attempt_count + 1,
        lease_expires_at = NOW() + ($2 || ' milliseconds')::interval,
        updated_at = NOW()
      FROM claimable c
      JOIN email_notification_deliveries d2 ON d2.id = c.id
      JOIN notifications n ON n.id = d2.notification_id
      WHERE upd.id = c.id
      RETURNING
        upd.id AS delivery_id,
        upd.notification_id,
        upd.recipient_user_id,
        upd.email_address_snapshot,
        upd.attempt_count,
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
      recipient_user_id: string;
      email_address_snapshot: string;
      attempt_count: number;
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
      recipientUserId: row.recipient_user_id,
      emailAddress: row.email_address_snapshot,
      attemptCount: row.attempt_count,
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
      UPDATE email_notification_deliveries
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
      UPDATE email_notification_deliveries
      SET
        status = 'PENDING',
        next_attempt_at = $2,
        last_error_code = $3,
        last_error_message = $4,
        lease_expires_at = NULL,
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
      UPDATE email_notification_deliveries
      SET
        status = 'FAILED',
        last_error_code = $2,
        last_error_message = $3,
        lease_expires_at = NULL,
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
      UPDATE email_notification_deliveries
      SET
        status = 'DISABLED',
        last_error_code = $2,
        last_error_message = $3,
        lease_expires_at = NULL,
        updated_at = NOW()
      WHERE id = $1;
      `,
      [deliveryId, errorCode, sanitizedMsg]
    );
  }

  async findById(id: string, client?: Queryable): Promise<DbEmailDelivery | null> {
    const q = client || pool;
    const res = await q.query<DbEmailDelivery>(
      `SELECT * FROM email_notification_deliveries WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findByNotificationAndRecipient(
    notificationId: string,
    recipientUserId: string,
    client?: Queryable
  ): Promise<DbEmailDelivery | null> {
    const q = client || pool;
    const res = await q.query<DbEmailDelivery>(
      `SELECT * FROM email_notification_deliveries WHERE notification_id = $1 AND recipient_user_id = $2 LIMIT 1`,
      [notificationId, recipientUserId]
    );
    return res.rows[0] || null;
  }
}

export const emailDeliveryRepository = new EmailDeliveryRepository();
