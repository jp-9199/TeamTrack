import type { Request, Response } from 'express';
import { messagingService, MessagingServiceError } from './messaging.service.js';
import {
  validateSendMessageRequest,
  validateEditMessageRequest,
  validateAddReactionRequest,
  validateMarkReadRequest,
  validateUUID,
} from '@teamtrack/validation';

export class MessagingController {
  async sendChannelMessage(req: Request, res: Response): Promise<void> {
    try {
      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: channelIdRes.errors[0],
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
      const { message, isIdempotentRetry } = await messagingService.sendChannelMessage(
        channelIdRes.data!,
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

  async listChannelMessages(req: Request, res: Response): Promise<void> {
    try {
      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: channelIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await messagingService.listChannelMessages(channelIdRes.data!, userId, {
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

  async syncChannel(req: Request, res: Response): Promise<void> {
    try {
      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: channelIdRes.errors[0],
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
      const result = await messagingService.syncChannel(channelIdRes.data!, userId, since);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async markChannelRead(req: Request, res: Response): Promise<void> {
    try {
      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: channelIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const bodyRes = validateMarkReadRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const readState = await messagingService.markChannelRead(
        channelIdRes.data!,
        userId,
        bodyRes.data?.messageId
      );

      res.status(200).json({
        success: true,
        data: { readState },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const messageIdRes = validateUUID(req.params.messageId, 'messageId');
      if (!messageIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: messageIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const message = await messagingService.getMessage(messageIdRes.data!, userId);

      res.status(200).json({
        success: true,
        data: { message },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async editMessage(req: Request, res: Response): Promise<void> {
    try {
      const messageIdRes = validateUUID(req.params.messageId, 'messageId');
      if (!messageIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: messageIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const bodyRes = validateEditMessageRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const message = await messagingService.editMessage(
        messageIdRes.data!,
        userId,
        bodyRes.data!
      );

      res.status(200).json({
        success: true,
        data: { message },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const messageIdRes = validateUUID(req.params.messageId, 'messageId');
      if (!messageIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: messageIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const message = await messagingService.deleteMessage(messageIdRes.data!, userId);

      res.status(200).json({
        success: true,
        data: { message },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async addReaction(req: Request, res: Response): Promise<void> {
    try {
      const messageIdRes = validateUUID(req.params.messageId, 'messageId');
      if (!messageIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: messageIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const bodyRes = validateAddReactionRequest(req.body);
      if (!bodyRes.isValid) {
        res.status(400).json({
          success: false,
          error: bodyRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      const reaction = await messagingService.addReaction(
        messageIdRes.data!,
        userId,
        bodyRes.data!
      );

      res.status(201).json({
        success: true,
        data: { reaction },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async removeReaction(req: Request, res: Response): Promise<void> {
    try {
      const messageIdRes = validateUUID(req.params.messageId, 'messageId');
      if (!messageIdRes.isValid) {
        res.status(400).json({
          success: false,
          error: messageIdRes.errors[0],
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const reactionCode = req.params.reactionCode;
      if (!reactionCode) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_FAILED', message: 'Reaction code is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userId = (req as any).user.id;
      await messagingService.removeReaction(messageIdRes.data!, userId, reactionCode);

      res.status(200).json({
        success: true,
        data: { message: 'Reaction removed successfully' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof MessagingServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[MessagingController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const messagingController = new MessagingController();
