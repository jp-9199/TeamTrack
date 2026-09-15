import type { Request, Response } from 'express';
import { notificationPreferencesService } from './notification-preferences.service.js';
import { NotificationServiceError } from './notification.errors.js';
import {
  validateUpdateNotificationPreferencesRequest,
  validateUpdateNotificationTypePreferenceRequest,
  validateNotificationTypeParam,
  validateMuteChannelRequest,
  validateUUID,
} from '@teamtrack/validation';

export class NotificationPreferencesController {
  /**
   * GET /api/v1/notifications/preferences
   * Retrieves global notification preferences for the authenticated user.
   */
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const result = await notificationPreferencesService.getPreferences(userId);

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
   * PATCH /api/v1/notifications/preferences
   * Updates global notification preferences for the authenticated user.
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const valRes = validateUpdateNotificationPreferencesRequest(req.body);
      if (!valRes.isValid) {
        res.status(400).json({
          success: false,
          error: valRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationPreferencesService.updatePreferences(userId, valRes.data);

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
   * GET /api/v1/notifications/preferences/types
   * Retrieves all per-notification-type preference overrides for the authenticated user.
   */
  async getTypePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const result = await notificationPreferencesService.getTypePreferences(userId);

      res.status(200).json({
        success: true,
        data: { preferences: result },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * PATCH /api/v1/notifications/preferences/types/:notificationType
   * Updates or resets a per-notification-type preference override for the authenticated user.
   */
  async updateTypePreference(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { notificationType } = req.params;

      const typeRes = validateNotificationTypeParam(notificationType);
      if (!typeRes.isValid) {
        res.status(400).json({
          success: false,
          error: typeRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const valRes = validateUpdateNotificationTypePreferenceRequest(req.body);
      if (!valRes.isValid) {
        res.status(400).json({
          success: false,
          error: valRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationPreferencesService.updateTypePreference(
        userId,
        typeRes.data,
        valRes.data
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
   * GET /api/v1/channels/:channelId/notification-mute
   * Retrieves channel mute status for the authenticated user.
   */
  async getChannelMute(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { channelId } = req.params;

      const uuidRes = validateUUID(channelId, 'channelId');
      if (!uuidRes.isValid) {
        res.status(400).json({
          success: false,
          error: uuidRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationPreferencesService.getChannelMute(userId, uuidRes.data);

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
   * PUT /api/v1/channels/:channelId/notification-mute
   * Mutes a channel for the authenticated user (permanent or temporary).
   */
  async muteChannel(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { channelId } = req.params;

      const uuidRes = validateUUID(channelId, 'channelId');
      if (!uuidRes.isValid) {
        res.status(400).json({
          success: false,
          error: uuidRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const muteRes = validateMuteChannelRequest(req.body);
      if (!muteRes.isValid) {
        res.status(400).json({
          success: false,
          error: muteRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const mutedUntil = muteRes.data.mutedUntil ? new Date(muteRes.data.mutedUntil) : null;
      const result = await notificationPreferencesService.muteChannel(
        userId,
        uuidRes.data,
        mutedUntil
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
   * DELETE /api/v1/channels/:channelId/notification-mute
   * Unmutes a channel for the authenticated user.
   */
  async unmuteChannel(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { channelId } = req.params;

      const uuidRes = validateUUID(channelId, 'channelId');
      if (!uuidRes.isValid) {
        res.status(400).json({
          success: false,
          error: uuidRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await notificationPreferencesService.unmuteChannel(userId, uuidRes.data);

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

    console.error('[NotificationPreferencesController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const notificationPreferencesController = new NotificationPreferencesController();
