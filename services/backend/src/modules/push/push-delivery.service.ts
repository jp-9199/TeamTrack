import { pool } from '../../db/pool.js';
import { notificationDeliveryPolicy } from '../notifications/notification-delivery-policy.js';
import { pushDeviceRepository } from '../../db/repositories/push-device.repository.js';
import { pushDeliveryRepository } from '../../db/repositories/push-delivery.repository.js';
import type { NotificationType } from '@teamtrack/shared-types';
import type { Queryable } from '../../db/repositories/organization.repository.js';

export interface EnqueuePushDeliveryParams {
  notificationId: string;
  recipientId: string;
  notificationType: NotificationType;
  resourceType?: string | null;
  resourceId?: string | null;
  dataPayload?: Record<string, unknown> | null;
}

export class PushDeliveryService {
  /**
   * Evaluates Phase 9D-A delivery policy for push medium,
   * retrieves active push devices for recipient, and inserts
   * outbox records into push_notification_deliveries.
   */
  async enqueueDeliveriesForNotification(
    params: EnqueuePushDeliveryParams,
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

    if (!policy.pushAllowed) {
      return 0;
    }

    // 3. Find active enabled devices for recipient
    const devices = await pushDeviceRepository.findActiveDevicesByUserId(params.recipientId, client);
    if (devices.length === 0) {
      return 0;
    }

    // 4. Create delivery jobs for each device
    const jobs = devices.map((d) => ({
      notificationId: params.notificationId,
      deviceId: d.id,
    }));

    return pushDeliveryRepository.createDeliveries(jobs, client);
  }

  /**
   * Deterministic recovery mechanism: Discovers any eligible notifications
   * created within the lookback window that lack push delivery records
   * (e.g., historical notifications or process crashes) and enqueues their outbox rows.
   */
  async reconcileMissingOutboxDeliveries(
    lookbackHours: number = 24,
    client?: Queryable
  ): Promise<number> {
    const q = client || pool;
    const query = `
      SELECT n.id, n.recipient_id, n.type, n.resource_type, n.resource_id, n.data_payload
      FROM notifications n
      LEFT JOIN push_notification_deliveries d ON d.notification_id = n.id
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
      const count = await this.enqueueDeliveriesForNotification(
        {
          notificationId: row.id,
          recipientId: row.recipient_id,
          notificationType: row.type,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          dataPayload: row.data_payload,
        },
        q
      );
      totalEnqueued += count;
    }

    return totalEnqueued;
  }
}

export const pushDeliveryService = new PushDeliveryService();

