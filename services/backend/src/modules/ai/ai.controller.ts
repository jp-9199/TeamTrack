import type { Request, Response } from 'express';
import { aiService, AIServiceError } from './ai.service.js';

export class AIController {
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { message, conversationId, organizationId, context, responseMode } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'AI_INVALID_REQUEST',
            message: 'message is required and must be a string',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await aiService.handleUserMessage(userId, {
        message,
        conversationId,
        organizationId,
        context,
        responseMode,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const orgId = req.query.organizationId as string | undefined;
      const conversations = await aiService.listConversations(userId, orgId);

      res.status(200).json({
        success: true,
        data: { conversations },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const conversationId = req.params.conversationId;

      const result = await aiService.getConversation(userId, conversationId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const conversationId = req.params.conversationId;

      await aiService.deleteConversation(userId, conversationId);

      res.status(200).json({
        success: true,
        data: { message: 'Conversation deleted successfully' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async confirmAction(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const actionId = req.params.actionId;
      const { confirmationToken } = req.body;

      if (!confirmationToken || typeof confirmationToken !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'AI_INVALID_REQUEST',
            message: 'confirmationToken is required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await aiService.confirmAction(userId, actionId, confirmationToken);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async cancelAction(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const actionId = req.params.actionId;

      const action = await aiService.cancelAction(userId, actionId);

      res.status(200).json({
        success: true,
        data: { action },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof AIServiceError) {
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

    console.error('[AIController Error]:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during AI processing',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const aiController = new AIController();
