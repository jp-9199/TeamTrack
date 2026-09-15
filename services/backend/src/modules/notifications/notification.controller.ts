import type { Request, Response } from 'express';
import { notificationService } from './notification.service.js';
import { NotificationServiceError } from './notification.errors.js';
import {
  validateNotificationId,
  validateMarkAllReadRequest,
} from '@teamtrack/validation';

export class NotificationController {
  /**
   * GET /api/v1/notifications
   * Keyset paginated active notifications for the authenticated user.
   */
  async listNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { cursor, limit } = req.query;

      const result = await notificationService.listNotifications(userId, {
        cursor: typeof cursor === 'string' ? cursor : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/notifications/unread
   * Keyset paginated active unread notifications for the authenticated user.
   */
  async listUnreadNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { cursor, limit } = req.query;

      const result = await notificationService.listUnreadNotifications(userId, {
        cursor: typeof cursor === 'string' ? cursor : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/notifications/unread-count
   * Active unread badge count for the authenticated user, optionally filtered by verified organization.
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { organizationId } = req.query;

      const result = await notificationService.getUnreadCount(
        userId,
        typeof organizationId === 'string' ? organizationId : undefined
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/notifications/:notificationId
   * Retrieves a single active notification for the authenticated user.
   */
  async getNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { notificationId } = req.params;

      const idRes = validateNotificationId(notificationId);
      if (!idRes.isValid) {
        res.status(400).json({
          success: false,
          error: idRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const notification = await notificationService.getNotification(idRes.data, userId);

      res.status(200).json({
        success: true,
        data: { notification },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /api/v1/notifications/:notificationId/read
   * Marks an active notification as read.
   */
  async markRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { notificationId } = req.params;

      const idRes = validateNotificationId(notificationId);
      if (!idRes.isValid) {
        res.status(400).json({
          success: false,
          error: idRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const notification = await notificationService.markNotificationRead(idRes.data, userId);

      res.status(200).json({
        success: true,
        data: { notification },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /api/v1/notifications/:notificationId/unread
   * Marks an active notification as unread.
   */
  async markUnread(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { notificationId } = req.params;

      const idRes = validateNotificationId(notificationId);
      if (!idRes.isValid) {
        res.status(400).json({
          success: false,
          error: idRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const notification = await notificationService.markNotificationUnread(idRes.data, userId);

      res.status(200).json({
        success: true,
        data: { notification },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /api/v1/notifications/read-all
   * Marks all unread active notifications as read for the authenticated user.
   */
  async markAllRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;

      const bodyRes = validateMarkAllReadRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationService.markAllNotificationsRead(
        userId,
        bodyRes.data.organizationId
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * DELETE /api/v1/notifications/:notificationId
   * Soft-deletes a notification for the authenticated user.
   */
  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { notificationId } = req.params;

      const idRes = validateNotificationId(notificationId);
      if (!idRes.isValid) {
        res.status(400).json({
          success: false,
          error: idRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationService.deleteNotification(idRes.data, userId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/notifications/sync
   * Sequence-bounded delta catch-up synchronization for the authenticated user.
   */
  async syncNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const result = await notificationService.syncNotifications(userId, req.query);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  private handleError(err: any, res: Response): void {
    if (err instanceof NotificationServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[NotificationController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const notificationController = new NotificationController();
