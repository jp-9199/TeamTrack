import type { Request, Response } from 'express';
import { fileService } from './file.service.js';
import { FileServiceError } from './file.errors.js';

export class FileController {
  /**
   * POST /api/v1/organizations/:organizationId/files/upload-intent
   */
  async createUploadIntent(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_ORGANIZATION_ID', message: 'organizationId path parameter is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const intent = await fileService.createUploadIntent(userId, organizationId, req.body);
      res.status(201).json({
        success: true,
        data: intent,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /api/v1/files/:fileId/finalize
   */
  async finalizeUpload(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { fileId } = req.params;

      const file = await fileService.finalizeUpload(fileId, userId);
      res.status(200).json({
        success: true,
        data: { file },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/files/:fileId
   */
  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { fileId } = req.params;

      const file = await fileService.getFile(fileId, userId);
      res.status(200).json({
        success: true,
        data: { file },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/files/:fileId/download-url
   */
  async getDownloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { fileId } = req.params;

      const result = await fileService.getSignedDownloadUrl(fileId, userId);
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
   * DELETE /api/v1/files/:fileId
   */
  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { fileId } = req.params;

      const result = await fileService.deleteFile(fileId, userId);
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
   * GET /api/v1/organizations/:organizationId/files
   */
  async listOrganizationFiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { organizationId } = req.params;
      const { cursor, limit } = req.query;

      const result = await fileService.listOrganizationFiles(
        organizationId,
        userId,
        {
          cursor: typeof cursor === 'string' ? cursor : undefined,
          limit: limit ? Number(limit) : undefined,
        }
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

  private handleError(err: any, res: Response): void {
    if (err instanceof FileServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[FileController Unhandled Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected internal error occurred' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const fileController = new FileController();
