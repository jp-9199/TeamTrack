import type { Response } from 'express';
import type { AuthorizedRequest } from '../authorization/authorization.middleware.js';
import {
  validateUUID,
  validateCreateChannelRequest,
  validateUpdateChannelRequest,
  validateAddChannelMemberRequest,
} from '@teamtrack/validation';
import { channelService } from './channel.service.js';
import { ServiceError } from '../organizations/organization.service.js';

export class ChannelController {
  async createChannel(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const teamIdRes = validateUUID(req.params.teamId, 'teamId');
      if (!teamIdRes.isValid) {
        res.status(400).json({ success: false, error: teamIdRes.errors[0] });
        return;
      }

      const validation = validateCreateChannelRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const channel = await channelService.createChannel(userId, teamIdRes.data!, validation.data);
      res.status(201).json({ success: true, data: { channel } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listChannels(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const teamIdRes = validateUUID(req.params.teamId, 'teamId');
      if (!teamIdRes.isValid) {
        res.status(400).json({ success: false, error: teamIdRes.errors[0] });
        return;
      }

      const channels = await channelService.listChannels(userId, teamIdRes.data!);
      res.status(200).json({ success: true, data: { channels } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getChannel(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const channel = await channelService.getChannel(userId, channelIdRes.data!);
      res.status(200).json({ success: true, data: { channel } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateChannel(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const validation = validateUpdateChannelRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const channel = await channelService.updateChannel(userId, channelIdRes.data!, validation.data);
      res.status(200).json({ success: true, data: { channel } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async archiveChannel(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const channel = await channelService.archiveChannel(userId, channelIdRes.data!);
      res.status(200).json({ success: true, data: { channel } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listChannelMembers(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const members = await channelService.listChannelMembers(userId, channelIdRes.data!);
      res.status(200).json({ success: true, data: { members } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async addChannelMember(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const validation = validateAddChannelMemberRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const member = await channelService.addChannelMember(userId, channelIdRes.data!, validation.data);
      res.status(201).json({ success: true, data: { member } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async removeChannelMember(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const channelIdRes = validateUUID(req.params.channelId, 'channelId');
      if (!channelIdRes.isValid) {
        res.status(400).json({ success: false, error: channelIdRes.errors[0] });
        return;
      }

      const memberIdRes = validateUUID(req.params.userId, 'userId');
      if (!memberIdRes.isValid) {
        res.status(400).json({ success: false, error: memberIdRes.errors[0] });
        return;
      }

      const result = await channelService.removeChannelMember(userId, channelIdRes.data!, memberIdRes.data!);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    console.error('[ChannelController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export const channelController = new ChannelController();
