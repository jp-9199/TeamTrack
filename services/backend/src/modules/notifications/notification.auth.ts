import type { DbNotification } from '../../db/repositories/notification.repository.js';

export class NotificationAuthService {
  /**
   * Evaluates if a user can access a notification.
   * STRICT SECURITY RULE: Only the recipient can access an active notification.
   * Notifications belonging to another user must be treated as 404 (NOT_FOUND)
   * to eliminate any IDOR or resource existence enumeration.
   */
  canAccessNotification(notification: DbNotification, userId: string): boolean {
    if (!notification || notification.deleted_at !== null) {
      return false;
    }
    return notification.recipient_id === userId;
  }

  /**
   * Evaluates if a user can mutate (mark read/unread, delete) a notification.
   * STRICT SECURITY RULE: Only the recipient can mutate their own notification.
   */
  canModifyNotification(notification: DbNotification, userId: string): boolean {
    if (!notification || notification.deleted_at !== null) {
      return false;
    }
    return notification.recipient_id === userId;
  }
}

export const notificationAuthService = new NotificationAuthService();
export const notificationAuth = notificationAuthService;
