import type { Request, Response } from 'express';
import { conversationService, ConversationServiceError } from './conversation.service.js';
import {
  validateCreateConversationRequest,
  validateSendMessageRequest,
  validateUUID,
} from '@teamtrack/validation';

export class ConversationController {
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const bodyRes = validateCreateConversationRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const conversation = await conversationService.createConversation(userId, bodyRes.data!);

      res.status(201).json({
        success: true,
        data: { conversation },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const conversations = await conversationService.listConversations(userId);

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
      const convIdRes = validateUUID(req.params.conversationId, 'conversationId');
      if (!convIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: convIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const conversation = await conversationService.getConversation(convIdRes.data!, userId);

      res.status(200).json({
        success: true,
        data: { conversation },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const convIdRes = validateUUID(req.params.conversationId, 'conversationId');
      if (!convIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: convIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const bodyRes = validateSendMessageRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const { message, isIdempotentRetry } = await conversationService.sendConversationMessage(
        convIdRes.data!,
        userId,
        bodyRes.data!
      );

      res.status(isIdempotentRetry ? 200 : 201).json({
        success: true,
        data: { message },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listMessages(req: Request, res: Response): Promise<void> {
    try {
      const convIdRes = validateUUID(req.params.conversationId, 'conversationId');
      if (!convIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: convIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await conversationService.listConversationMessages(convIdRes.data!, userId, {
        cursor,
        limit,
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

  async syncConversation(req: Request, res: Response): Promise<void> {
    try {
      const convIdRes = validateUUID(req.params.conversationId, 'conversationId');
      if (!convIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: convIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const since = typeof req.query.since === 'string' ? req.query.since : '';
      if (!since) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_FAILED', message: 'Query parameter "since" is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const result = await conversationService.syncConversation(convIdRes.data!, userId, since);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async markRead(req: Request, res: Response): Promise<void> {
    try {
      const convIdRes = validateUUID(req.params.conversationId, 'conversationId');
      if (!convIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: convIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const readState = await conversationService.markConversationRead(convIdRes.data!, userId);

      res.status(200).json({
        success: true,
        data: { readState },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof ConversationServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[ConversationController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const conversationController = new ConversationController();
