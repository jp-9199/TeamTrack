import type { Response } from 'express';
import type { AuthorizedRequest } from '../authorization/authorization.middleware.js';
import {
  validateUUID,
  validateCreateOrganizationRequest,
  validateUpdateOrganizationRequest,
  validateAddOrganizationMemberRequest,
  validateUpdateOrganizationMemberRoleRequest,
  validateUpdateMemberRoleAndStatus,
} from '@teamtrack/validation';
import { organizationService, ServiceError } from './organization.service.js';

export class OrganizationController {
  async createOrganization(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const validation = validateCreateOrganizationRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const organization = await organizationService.createOrganization(userId, validation.data);
      res.status(201).json({ success: true, data: { organization } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listUserOrganizations(req: AuthorizedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const organizations = await organizationService.listUserOrganizations(userId);
      res.status(200).json({ success: true, data: { organizations } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getOrganization(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const result = await organizationService.getOrganization(userId, orgIdRes.data!);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateOrganization(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const validation = validateUpdateOrganizationRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const organization = await organizationService.updateOrganization(userId, orgIdRes.data!, validation.data);
      res.status(200).json({ success: true, data: { organization } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async archiveOrganization(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const organization = await organizationService.archiveOrganization(userId, orgIdRes.data!);
      res.status(200).json({ success: true, data: { organization } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async transferOwnership(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const targetRes = validateUUID(req.body?.newOwnerUserId, 'newOwnerUserId');
      if (!targetRes.isValid) {
        res.status(400).json({ success: false, error: targetRes.errors[0] });
        return;
      }

      const organization = await organizationService.transferOwnership(userId, orgIdRes.data!, targetRes.data!);
      res.status(200).json({ success: true, data: { organization } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listMembers(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const includeSuspended = req.query.includeSuspended === 'true';
      const members = await organizationService.listMembers(userId, orgIdRes.data!, { includeSuspended });
      res.status(200).json({ success: true, data: { members } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async addMember(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const validation = validateAddOrganizationMemberRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const member = await organizationService.addMember(userId, orgIdRes.data!, validation.data);
      res.status(201).json({ success: true, data: { member } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateMemberRole(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const memberIdRes = validateUUID(req.params.userId, 'userId');
      if (!memberIdRes.isValid) {
        res.status(400).json({ success: false, error: memberIdRes.errors[0] });
        return;
      }

      const validation = validateUpdateMemberRoleAndStatus(req.body);
      if (!validation.isValid) {
        res.status(400).json({ success: false, error: validation.errors[0] });
        return;
      }

      const member = await organizationService.updateMember(
        userId,
        orgIdRes.data!,
        memberIdRes.data!,
        validation.data
      );
      res.status(200).json({ success: true, data: { member } });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async removeMember(req: AuthorizedRequest, res: Response): Promise<void> {
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

      const memberIdRes = validateUUID(req.params.userId, 'userId');
      if (!memberIdRes.isValid) {
        res.status(400).json({ success: false, error: memberIdRes.errors[0] });
        return;
      }

      const result = await organizationService.removeMember(userId, orgIdRes.data!, memberIdRes.data!);
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

    console.error('[OrganizationController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export const organizationController = new OrganizationController();
