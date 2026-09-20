import type { Request, Response } from 'express';
import { userService, UserServiceError } from './user.service.js';
import {
  validateUpdateUserProfile,
  validateChangePassword,
} from '@teamtrack/validation';

export class UserController {
  async getProfile(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    try {
      const profile = await userService.getProfile(userId);
      res.status(200).json({
        success: true,
        data: { profile },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async searchUsers(req: Request, res: Response): Promise<void> {
    const currentUserId = (req as any).user.id;
    const q = (req.query.q as string) || '';
    try {
      const users = await userService.searchUsers(q, currentUserId);
      res.status(200).json({
        success: true,
        data: { users },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const validation = validateUpdateUserProfile(req.body);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: validation.errors[0]?.message || 'Validation failed',
          details: validation.errors,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const profile = await userService.updateProfile(userId, validation.data);
      res.status(200).json({
        success: true,
        data: { profile },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getSecurityInfo(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    try {
      const security = await userService.getSecurityInfo(userId);
      res.status(200).json({
        success: true,
        data: { security },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const sessionId = (req as any).user.sessionId;

    const validation = validateChangePassword(req.body);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: {
          code: validation.errors[0]?.code || 'VALIDATION_FAILED',
          message: validation.errors[0]?.message || 'Validation failed',
          details: validation.errors,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const result = await userService.changePassword(userId, sessionId, validation.data);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listSessions(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const sessionId = (req as any).user.sessionId;

    try {
      const sessions = await userService.listSessions(userId, sessionId);
      res.status(200).json({
        success: true,
        data: { sessions },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async revokeSession(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const result = await userService.revokeSession(userId, sessionId);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async revokeAllSessions(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const sessionId = (req as any).user.sessionId;
    const preserveCurrent = req.body?.preserveCurrent !== false && req.query.preserveCurrent !== 'false';

    try {
      const result = await userService.revokeAllSessions(
        userId,
        preserveCurrent ? sessionId : undefined
      );
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof UserServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[UserController Error]:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const userController = new UserController();
