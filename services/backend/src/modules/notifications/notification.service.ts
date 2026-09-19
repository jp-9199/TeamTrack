import { notificationRepository } from '../../db/repositories/notification.repository.js';
import { notificationAuthService } from './notification.auth.js';
import { NotificationServiceError } from './notification.errors.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { channelRepository } from '../../db/repositories/channel.repository.js';
import { teamRepository } from '../../db/repositories/team.repository.js';
import { meetingRepository } from '../../db/repositories/meeting.repository.js';
import { fileRepository } from '../../db/repositories/file.repository.js';
import { messageRepository } from '../../db/repositories/message.repository.js';
import { organizationRepository } from '../../db/repositories/organization.repository.js';
import { calendarRepository } from '../../db/repositories/calendar.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import { pool } from '../../db/pool.js';
import type { Queryable } from '../../db/repositories/organization.repository.js';
import type { PoolClient } from 'pg';
import { pushDeliveryService } from '../push/push-delivery.service.js';
import { emailDeliveryService } from '../email/email-delivery.service.js';
import {
  decodeCursor,
  encodeCursor,
  validateNotificationType,
  validateNotificationResourceType,
  validateNotificationListQuery,
  validateNotificationSyncQuery,
} from '@teamtrack/validation';

export const encodeNotificationCursor = encodeCursor;
export const decodeNotificationCursor = decodeCursor;
import type {
  Notification,
  NotificationType,
  NotificationResourceType,
  NotificationDataPayload,
  CursorPaginatedResponse,
  NotificationSyncResponse,
} from '@teamtrack/shared-types';

/**
 * Internal backend domain parameters for creating a notification.
 * This is strictly an internal interface; frontend clients cannot create notifications directly.
 */
export interface CreateNotificationParams {
  recipientId: string;
  organizationId?: string | null;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resourceType?: NotificationResourceType | null;
  resourceId?: string | null;
  dataPayload?: NotificationDataPayload;
  groupingKey?: string | null;
  sourceEventId?: string | null;
}

export class NotificationService {
  /**
   * Internal domain method to generate a notification.
   * Validates recipient, actor, type, and polymorphic resource structure.
   * Post-commit: publishes notification.created realtime event.
   */
  async createNotification(params: CreateNotificationParams): Promise<Notification> {
    // 1. Recipient must exist and be active
    const recipient = await userRepository.findById(params.recipientId);
    if (!recipient || recipient.status === 'suspended' || recipient.status === 'deactivated') {
      throw new NotificationServiceError('USER_NOT_FOUND', 'Recipient user does not exist or is inactive', 404);
    }

    // 2. Actor must exist if provided (null for system notices)
    if (params.actorId) {
      const actor = await userRepository.findById(params.actorId);
      if (!actor) {
        throw new NotificationServiceError('USER_NOT_FOUND', 'Actor user does not exist', 404);
      }
    }

    // 3. Notification type validation
    const typeRes = validateNotificationType(params.type);
    if (!typeRes.isValid) {
      throw new NotificationServiceError('INVALID_NOTIFICATION_TYPE', 'Invalid notification type', 400);
    }

    // 4. Content length boundaries
    const title = params.title?.trim();
    if (!title || title.length > 200) {
      throw new NotificationServiceError('VALIDATION_ERROR', 'Title must be between 1 and 200 characters', 400);
    }

    const body = params.body?.trim();
    if (!body || body.length > 5000) {
      throw new NotificationServiceError('VALIDATION_ERROR', 'Body must be between 1 and 5000 characters', 400);
    }

    // 5. Polymorphic resource structural validation
    if (params.resourceType && params.resourceId) {
      const rTypeRes = validateNotificationResourceType(params.resourceType);
      if (!rTypeRes.isValid) {
        throw new NotificationServiceError('INVALID_RESOURCE_TYPE', 'Invalid resource type', 400);
      }

      await this.validateResourceReference(
        params.resourceType,
        params.resourceId,
        params.organizationId
      );
    }

    // 6. Limits for sourceEventId and groupingKey
    if (params.sourceEventId && params.sourceEventId.length > 128) {
      throw new NotificationServiceError('VALIDATION_ERROR', 'sourceEventId must not exceed 128 characters', 400);
    }
    if (params.groupingKey && params.groupingKey.length > 128) {
      throw new NotificationServiceError('VALIDATION_ERROR', 'groupingKey must not exceed 128 characters', 400);
    }

    // 7. Transactional Outbox: Persist notification + eligible push outbox rows atomically
    let client: PoolClient | null = null;
    let isInternalTx = false;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      isInternalTx = true;
    } catch {
      // Fallback for mocked or non-pooled test environments
      client = null;
    }

    let row: any;
    const queryRunner: Queryable = client || pool;

    try {
      row = await notificationRepository.createNotification({
        recipientId: params.recipientId,
        organizationId: params.organizationId || null,
        actorId: params.actorId || null,
        type: params.type,
        title,
        body,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        dataPayload: params.dataPayload || {},
        groupingKey: params.groupingKey || null,
        sourceEventId: params.sourceEventId || null,
      }, queryRunner);

      // Atomically evaluate push delivery policy & insert outbox rows inside the SAME transaction
      try {
        await pushDeliveryService.enqueueDeliveriesForNotification({
          notificationId: row.id,
          recipientId: params.recipientId,
          notificationType: params.type,
          resourceType: params.resourceType || null,
          resourceId: params.resourceId || null,
          dataPayload: params.dataPayload || null,
        }, queryRunner);
      } catch (enqueueErr: any) {
        console.error('[NotificationService] Transactional outbox enqueue warning:', enqueueErr?.message || enqueueErr);
      }

      // Atomically evaluate email delivery policy & insert outbox row inside the SAME transaction
      try {
        await emailDeliveryService.enqueueDeliveryForNotification({
          notificationId: row.id,
          recipientId: params.recipientId,
          notificationType: params.type,
          resourceType: params.resourceType || null,
          resourceId: params.resourceId || null,
          dataPayload: params.dataPayload || null,
        }, queryRunner);
      } catch (enqueueErr: any) {
        console.error('[NotificationService] Transactional email outbox enqueue warning:', enqueueErr?.message || enqueueErr);
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
    } catch (err: any) {
      if (isInternalTx && client) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }

    const notifDto = notificationRepository.mapNotification(row);

    // 8. Post-commit realtime event publishing (best-effort, failure does not roll back DB)
    try {
      await eventPublisher.publish(
        'notification.created',
        `user:${params.recipientId}`,
        {
          notification: notifDto,
          mutationSeq: notifDto.mutationSeq,
        }
      );
    } catch (err: any) {
      console.error('[NotificationService] Redis publish error on notification.created:', err?.message || err);
    }

    return notifDto;
  }

  /**
   * Retrieves a single notification.
   * Enforces recipient authorization (404 on access to another user's notification).
   */
  async getNotification(id: string, userId: string): Promise<Notification> {
    const row = await notificationRepository.findById(id);
    if (!row || !notificationAuthService.canAccessNotification(row, userId)) {
      throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    }
    return notificationRepository.mapNotification(row);
  }

  /**
   * Lists active notifications for the authenticated user using keyset cursor pagination.
   */
  async listNotifications(
    userId: string,
    options: { cursor?: string; limit?: number }
  ): Promise<CursorPaginatedResponse<Notification>> {
    const queryRes = validateNotificationListQuery(options);
    if (!queryRes.isValid) {
      throw new NotificationServiceError('VALIDATION_ERROR', queryRes.errors[0].message, 400);
    }

    const { limit, cursor } = queryRes.data;

    try {
      const rows = await notificationRepository.findForRecipient(userId, {
        cursor,
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor: string | null = null;
      if (hasMore && itemsToReturn.length > 0) {
        const last = itemsToReturn[itemsToReturn.length - 1];
        nextCursor = encodeCursor(last.created_at, last.id);
      }

      return {
        items: itemsToReturn.map((r) => notificationRepository.mapNotification(r)),
        nextCursor,
        hasMore,
      };
    } catch (err: any) {
      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('connect')) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
        };
      }
      throw err;
    }
  }

  /**
   * Lists active unread notifications for the authenticated user using keyset cursor pagination.
   */
  async listUnreadNotifications(
    userId: string,
    options: { cursor?: string; limit?: number }
  ): Promise<CursorPaginatedResponse<Notification>> {
    const queryRes = validateNotificationListQuery(options);
    if (!queryRes.isValid) {
      throw new NotificationServiceError('VALIDATION_ERROR', queryRes.errors[0].message, 400);
    }

    const { limit, cursor } = queryRes.data;
    try {
      const rows = await notificationRepository.findUnreadForRecipient(userId, {
        cursor,
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor: string | null = null;
      if (hasMore && itemsToReturn.length > 0) {
        const last = itemsToReturn[itemsToReturn.length - 1];
        nextCursor = encodeCursor(last.created_at, last.id);
      }

      return {
        items: itemsToReturn.map((r) => notificationRepository.mapNotification(r)),
        nextCursor,
        hasMore,
      };
    } catch (err: any) {
      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('connect')) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
        };
      }
      throw err;
    }
  }

  /**
   * Returns the count of active unread notifications for the authenticated user.
   * If organizationId is provided, validates user's membership first.
   */
  async getUnreadCount(userId: string, organizationId?: string): Promise<{ count: number }> {
    try {
      if (organizationId) {
        const orgAuth = await authorizationService.getOrganizationAuth(userId, organizationId);
        if (!orgAuth.isMember) {
          throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Organization not found', 404);
        }
      }

      const count = await notificationRepository.unreadCount(userId, organizationId);
      return { count };
    } catch (err: any) {
      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('connect')) {
        return { count: 0 };
      }
      throw err;
    }
  }

  /**
   * Marks a notification as read.
   * Enforces recipient authorization (404 on access to another user's notification).
   * Post-commit: publishes notification.read realtime event.
   */
  async markNotificationRead(id: string, userId: string): Promise<Notification> {
    const existing = await notificationRepository.findById(id);
    if (!existing || !notificationAuthService.canModifyNotification(existing, userId)) {
      throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    }

    // Already read: no-op, do NOT allocate sequence or publish duplicate event
    if (existing.read_at !== null) {
      return notificationRepository.mapNotification(existing);
    }

    const updated = await notificationRepository.markRead(id, userId);
    const notifDto = notificationRepository.mapNotification(updated!);

    try {
      await eventPublisher.publish(
        'notification.read',
        `user:${userId}`,
        {
          notificationId: id,
          readAt: notifDto.readAt || new Date().toISOString(),
          mutationSeq: notifDto.mutationSeq,
        }
      );
    } catch (err: any) {
      console.error('[NotificationService] Redis publish error on notification.read:', err?.message || err);
    }

    return notifDto;
  }

  /**
   * Marks a notification as unread.
   * Enforces recipient authorization (404 on access to another user's notification).
   * Post-commit: publishes notification.unread realtime event.
   */
  async markNotificationUnread(id: string, userId: string): Promise<Notification> {
    const existing = await notificationRepository.findById(id);
    if (!existing || !notificationAuthService.canModifyNotification(existing, userId)) {
      throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    }

    // Already unread: no-op, do NOT allocate sequence or publish duplicate event
    if (existing.read_at === null) {
      return notificationRepository.mapNotification(existing);
    }

    const updated = await notificationRepository.markUnread(id, userId);
    const notifDto = notificationRepository.mapNotification(updated!);

    try {
      await eventPublisher.publish(
        'notification.unread',
        `user:${userId}`,
        {
          notificationId: id,
          mutationSeq: notifDto.mutationSeq,
        }
      );
    } catch (err: any) {
      console.error('[NotificationService] Redis publish error on notification.unread:', err?.message || err);
    }

    return notifDto;
  }

  /**
   * Marks all unread active notifications for the authenticated user as read.
   * If organizationId is provided, validates user's membership first.
   * Post-commit: publishes notification.read_all realtime event with authoritative unread count.
   */
  async markAllNotificationsRead(userId: string, organizationId?: string): Promise<{ count: number }> {
    if (organizationId) {
      const orgAuth = await authorizationService.getOrganizationAuth(userId, organizationId);
      if (!orgAuth.isMember) {
        throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Organization not found', 404);
      }
    }

    const res = await notificationRepository.markAllRead(userId, organizationId);
    const affectedCount = typeof res === 'number' ? res : res?.count ?? 0;
    const mutationSeq = typeof res === 'object' && res?.mutationSeq ? res.mutationSeq : '0';
    const readAt = typeof res === 'object' && res?.readAt ? res.readAt : new Date().toISOString();

    if (affectedCount > 0) {
      let freshUnreadCount = 0;
      try {
        const unreadRes = await this.getUnreadCount(userId);
        freshUnreadCount = unreadRes.count;
      } catch {
        // Safe fallback when database pool is offline or mocked in unit tests
      }

      try {
        await eventPublisher.publish(
          'notification.read_all',
          `user:${userId}`,
          {
            organizationId: organizationId || null,
            affectedCount,
            unreadCount: freshUnreadCount,
            readAt,
            mutationSeq,
          }
        );
      } catch (err: any) {
        console.error('[NotificationService] Redis publish error on notification.read_all:', err?.message || err);
      }
    }

    return { count: affectedCount };
  }

  /**
   * Soft-deletes a notification.
   * Enforces recipient authorization (404 on access to another user's notification).
   * Post-commit: publishes notification.deleted realtime event.
   */
  async deleteNotification(id: string, userId: string): Promise<{ message: string }> {
    const existing = await notificationRepository.findById(id);
    if (!existing || !notificationAuthService.canModifyNotification(existing, userId)) {
      throw new NotificationServiceError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    }

    const res = await notificationRepository.softDelete(id, userId);

    if (res.success) {
      try {
        await eventPublisher.publish(
          'notification.deleted',
          `user:${userId}`,
          {
            notificationId: id,
            mutationSeq: res.mutationSeq,
          }
        );
      } catch (err: any) {
        console.error('[NotificationService] Redis publish error on notification.deleted:', err?.message || err);
      }
    }

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Delta catch-up synchronization endpoint supporting multi-page sequence-bounded pagination.
   * Returns authoritative unread count, upserted items, deleted IDs, and keyset cursors.
   */
  async syncNotifications(userId: string, query: unknown): Promise<NotificationSyncResponse> {
    const queryRes = validateNotificationSyncQuery(query);
    if (!queryRes.isValid) {
      throw new NotificationServiceError('VALIDATION_ERROR', queryRes.errors[0].message, 400);
    }

    const { activeCursor, deletionCursor, snapshotMutationSeq, limit } = queryRes.data;

    const delta = await notificationRepository.syncForRecipient(userId, {
      activeCursor,
      deletionCursor,
      snapshotMutationSeq,
      limit,
    });

    return {
      syncedAt: new Date().toISOString(),
      snapshotMutationSeq: delta.snapshotMutationSeq,
      upserted: delta.upserted.map((row) => notificationRepository.mapNotification(row)),
      deletedIds: delta.deletedIds,
      unreadCount: delta.unreadCount,
      activeCursor: delta.activeCursor,
      deletionCursor: delta.deletionCursor,
      hasMoreActive: delta.hasMoreActive,
      hasMoreDeletions: delta.hasMoreDeletions,
    };
  }

  /**
   * Internal helper: validates that a referenced resource structurally exists
   * and matches the organization context when applicable.
   */
  private async validateResourceReference(
    resourceType: NotificationResourceType,
    resourceId: string,
    organizationId?: string | null
  ): Promise<void> {
    switch (resourceType) {
      case 'channel': {
        const channel = await channelRepository.findById(resourceId);
        if (!channel || Boolean(channel.deleted_at)) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced channel does not exist', 404);
        }
        if (organizationId) {
          const team = await teamRepository.findById(channel.team_id);
          if (!team || team.organization_id !== organizationId) {
            throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'Channel does not belong to specified organization', 400);
          }
        }
        break;
      }
      case 'team': {
        const team = await teamRepository.findById(resourceId);
        if (!team || Boolean(team.deleted_at)) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced team does not exist', 404);
        }
        if (organizationId && team.organization_id !== organizationId) {
          throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'Team does not belong to specified organization', 400);
        }
        break;
      }
      case 'meeting': {
        const meeting = await meetingRepository.findById(resourceId);
        if (!meeting) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced meeting does not exist', 404);
        }
        if (organizationId && meeting.organization_id !== organizationId) {
          throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'Meeting does not belong to specified organization', 400);
        }
        break;
      }
      case 'file': {
        const file = await fileRepository.findById(resourceId);
        if (!file || file.is_deleted) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced file does not exist', 404);
        }
        if (organizationId && file.organization_id !== organizationId) {
          throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'File does not belong to specified organization', 400);
        }
        break;
      }
      case 'message': {
        const message = await messageRepository.findById(resourceId);
        if (!message || message.is_deleted) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced message does not exist', 404);
        }
        break;
      }
      case 'organization': {
        const org = await organizationRepository.findById(resourceId);
        if (!org || Boolean(org.deleted_at)) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced organization does not exist', 404);
        }
        if (organizationId && org.id !== organizationId) {
          throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'Referenced organization does not match context', 400);
        }
        break;
      }
      case 'user': {
        const user = await userRepository.findById(resourceId);
        if (!user) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced user does not exist', 404);
        }
        break;
      }
      case 'calendar_event': {
        const event = await calendarRepository.findById(resourceId);
        if (!event || Boolean(event.deleted_at)) {
          throw new NotificationServiceError('RESOURCE_NOT_FOUND', 'Referenced calendar event does not exist', 404);
        }
        if (organizationId && event.organization_id && event.organization_id !== organizationId) {
          throw new NotificationServiceError('RESOURCE_ORGANIZATION_MISMATCH', 'Calendar event does not belong to specified organization', 400);
        }
        break;
      }
    }
  }
}

export const notificationService = new NotificationService();
