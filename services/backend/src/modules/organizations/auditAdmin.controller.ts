import type { Request, Response } from 'express';
import { auditAdminService } from './auditAdmin.service.js';
import { validateAuditLogQuery } from '@teamtrack/validation';
import { ServiceError } from './organization.service.js';

export class AuditAdminController {
  async getOrganizationAuditLogs(req: Request, res: Response): Promise<void> {
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

    const validation = validateAuditLogQuery(req.query);
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
      const logs = await auditAdminService.getOrganizationAuditLogs(userId, orgId, validation.data);
      res.status(200).json({
        success: true,
        data: logs,
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

    console.error('[AuditAdminController Error]:', err);
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

export const auditAdminController = new AuditAdminController();
