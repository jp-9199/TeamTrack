import { pool } from '../../db/pool.js';
import { notificationDeliveryPolicy } from '../notifications/notification-delivery-policy.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { emailDeliveryRepository } from '../../db/repositories/email-delivery.repository.js';
import type { NotificationType } from '@teamtrack/shared-types';
import type { Queryable } from '../../db/repositories/organization.repository.js';

export interface EnqueueEmailDeliveryParams {
  notificationId: string;
  recipientId: string;
  notificationType: NotificationType;
  resourceType?: string | null;
  resourceId?: string | null;
  dataPayload?: Record<string, unknown> | null;
}

export class EmailDeliveryService {
  /**
   * Evaluates Phase 9D-A delivery policy for email medium,
   * authoritatively verifies recipient user email and active status,
   * and inserts an outbox record into email_notification_deliveries.
   */
  async enqueueDeliveryForNotification(
    params: EnqueueEmailDeliveryParams,
    client?: Queryable
  ): Promise<number> {
    // 1. Resolve channelId if associated with a channel
    let channelId: string | null = null;
    if (params.resourceType === 'channel' && params.resourceId) {
      channelId = params.resourceId;
    } else if (params.dataPayload && typeof params.dataPayload.channelId === 'string') {
      channelId = params.dataPayload.channelId;
    }

    // 2. Evaluate delivery policy via Phase 9D-A centralized policy service
    const policy = await notificationDeliveryPolicy.resolvePolicy(
      {
        recipientId: params.recipientId,
        type: params.notificationType,
        channelId,
      },
      client
    );

    if (!policy.emailAllowed) {
      return 0;
    }

    // 3. Authoritatively fetch recipient user from database
    const recipient = await userRepository.findById(params.recipientId, client);
    if (!recipient) {
      return 0;
    }

    // 4. Verify recipient status and usable email
    if (recipient.status !== 'active' || recipient.deleted_at !== null) {
      return 0;
    }

    const email = recipient.email?.trim();
    if (!email || !email.includes('@') || email.includes(' ')) {
      return 0;
    }

    // 5. Insert durable outbox record with snapshotted authoritative email address
    return emailDeliveryRepository.createDelivery(
      {
        notificationId: params.notificationId,
        recipientUserId: recipient.id,
        emailAddressSnapshot: email,
      },
      client
    );
  }

  /**
   * Deterministic recovery mechanism: Discovers any eligible notifications
   * created within the lookback window that lack email delivery records
   * and enqueues their outbox rows.
   */
  async reconcileMissingOutboxDeliveries(
    lookbackHours: number = 24,
    client?: Queryable
  ): Promise<number> {
    const q = client || pool;
    const query = `
      SELECT n.id, n.recipient_id, n.type, n.resource_type, n.resource_id, n.data_payload
      FROM notifications n
      LEFT JOIN email_notification_deliveries d ON d.notification_id = n.id
      WHERE d.id IS NULL
        AND n.deleted_at IS NULL
        AND n.created_at >= NOW() - ($1 || ' hours')::interval
      ORDER BY n.created_at ASC
      LIMIT 100;
    `;

    const res = await q.query<{
      id: string;
      recipient_id: string;
      type: NotificationType;
      resource_type: string | null;
      resource_id: string | null;
      data_payload: Record<string, unknown> | null;
    }>(query, [lookbackHours]);

    let totalEnqueued = 0;
    for (const row of res.rows) {
      const count = await this.enqueueDeliveryForNotification(
        {
          notificationId: row.id,
          recipientId: row.recipient_id,
          notificationType: row.type,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          dataPayload: row.data_payload,
        },
        client
      );
      totalEnqueued += count;
    }

    return totalEnqueued;
  }
}

export const emailDeliveryService = new EmailDeliveryService();
