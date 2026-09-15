import type { Request, Response } from 'express';
import { pushDeviceService } from './push-device.service.js';
import {
  validateRegisterPushDeviceRequest,
  validatePushDeviceIdParam,
} from '@teamtrack/validation';

export class PushDeviceController {
  /**
   * POST /api/v1/devices/push
   * Registers or updates a push device for the authenticated user.
   */
  async registerPushDevice(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Explicit check: reject any client attempt to supply or spoof a different userId
      if ((req.body as any)?.userId && (req.body as any).userId !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot register push device for another user' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const valRes = validateRegisterPushDeviceRequest(req.body);
      if (!valRes.isValid) {
        res.status(400).json({
          success: false,
          error: valRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const device = await pushDeviceService.registerDevice(userId, valRes.data);

      res.status(201).json({
        success: true,
        data: device,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PushDeviceController] register error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/v1/devices/push
   * Lists push devices registered for the authenticated user.
   * Returns sanitized DTOs without tokens.
   */
  async listPushDevices(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const devices = await pushDeviceService.listDevices(userId);

      res.status(200).json({
        success: true,
        data: devices,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PushDeviceController] list error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * DELETE /api/v1/devices/push/:deviceId
   * Deletes a registered push device belonging to the authenticated user.
   */
  async deletePushDevice(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const valRes = validatePushDeviceIdParam(req.params.deviceId);
      if (!valRes.isValid) {
        res.status(400).json({
          success: false,
          error: valRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check device existence and user ownership (404 for cross-user or nonexistent)
      const existing = await pushDeviceService.getDevice(userId, valRes.data);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 'DEVICE_NOT_FOUND', message: 'Push device not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await pushDeviceService.deleteDevice(userId, valRes.data);

      res.status(204).send();
    } catch (err: any) {
      console.error('[PushDeviceController] delete error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const pushDeviceController = new PushDeviceController();
