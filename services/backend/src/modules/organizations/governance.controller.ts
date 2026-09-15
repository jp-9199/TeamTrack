import type { Request, Response } from 'express';
import { governanceService } from './governance.service.js';
import { validateUpdateGovernanceSettings } from '@teamtrack/validation';
import { ServiceError } from './organization.service.js';

export class GovernanceController {
  async getGovernanceSettings(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const orgId = req.params.organizationId;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'organizationId is required' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const governance = await governanceService.getGovernanceSettings(userId, orgId);
      res.status(200).json({
        success: true,
        data: { governance },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateGovernanceSettings(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user.id;
    const orgId = req.params.organizationId;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'organizationId is required' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const validation = validateUpdateGovernanceSettings(req.body);
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
      const governance = await governanceService.updateGovernanceSettings(userId, orgId, validation.data);
      res.status(200).json({
        success: true,
        data: { governance },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof ServiceError) {
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

    console.error('[GovernanceController Error]:', err);
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

export const governanceController = new GovernanceController();
