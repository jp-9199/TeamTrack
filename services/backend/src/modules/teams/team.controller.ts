import type { Response } from 'express';
import type { AuthorizedRequest } from '../authorization/authorization.middleware.js';
import {
  validateUUID,
  validateCreateTeamRequest,
  validateUpdateTeamRequest,
  validateAddTeamMemberRequest,
} from '@teamtrack/validation';
import { teamService } from './team.service.js';
import { ServiceError } from '../organizations/organization.service.js';

export class TeamController {
  async createTeam(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const orgIdRes = validateUUID(req.params.organizationId, 'organizationId');
      if (!orgIdRes.isValid) {
        res.status(400).json({ success: false, error: orgIdRes.errors[0] });
        return;
      }

      const validation = validateCreateTeamRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const team = await teamService.createTeam(userId, orgIdRes.data!, validation.data);
      res.status(201).json({ success: true, data: { team } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listTeams(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const orgIdRes = validateUUID(req.params.organizationId, 'organizationId');
      if (!orgIdRes.isValid) {
        res.status(400).json({ success: false, error: orgIdRes.errors[0] });
        return;
      }

      const teams = await teamService.listTeams(userId, orgIdRes.data!);
      res.status(200).json({ success: true, data: { teams } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getTeam(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const result = await teamService.getTeam(userId, teamIdRes.data!);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async joinPublicTeam(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const member = await teamService.joinPublicTeam(userId, teamIdRes.data!);
      res.status(201).json({ success: true, data: { member } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateTeam(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const validation = validateUpdateTeamRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const team = await teamService.updateTeam(userId, teamIdRes.data!, validation.data);
      res.status(200).json({ success: true, data: { team } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async archiveTeam(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const team = await teamService.archiveTeam(userId, teamIdRes.data!);
      res.status(200).json({ success: true, data: { team } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listTeamMembers(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const members = await teamService.listTeamMembers(userId, teamIdRes.data!);
      res.status(200).json({ success: true, data: { members } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async addTeamMember(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const validation = validateAddTeamMemberRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const member = await teamService.addTeamMember(userId, teamIdRes.data!, validation.data);
      res.status(201).json({ success: true, data: { member } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async removeTeamMember(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const memberIdRes = validateUUID(req.params.userId, 'userId');
      if (!memberIdRes.isValid) {
        res.status(400).json({ success: false, error: memberIdRes.errors[0] });
        return;
      }

      const result = await teamService.removeTeamMember(userId, teamIdRes.data!, memberIdRes.data!);
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

    console.error('[TeamController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export const teamController = new TeamController();
