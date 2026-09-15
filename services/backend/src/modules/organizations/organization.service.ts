import { withTransaction } from '../../db/pool.js';
import {
  organizationRepository,
  type DbOrganization,
} from '../../db/repositories/organization.repository.js';
import { teamRepository } from '../../db/repositories/team.repository.js';
import { channelRepository } from '../../db/repositories/channel.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { auditLogRepository } from '../../db/repositories/auditLog.repository.js';
import { governanceRepository } from '../../db/repositories/governance.repository.js';
import { subscriptionManager } from '../../realtime/subscription.manager.js';
import { authorizationService } from '../authorization/authorization.service.js';
import type {
  Organization,
  OrganizationMemberWithUser,
  OrganizationRole,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  AddOrganizationMemberRequest,
  UpdateOrganizationMemberRequest,
  OrganizationMemberStatus,
} from '@teamtrack/shared-types';
import { PHASE13_ERROR_CODES } from '@teamtrack/shared-types';

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class OrganizationService {
  async createOrganization(
    userId: string,
    input: CreateOrganizationRequest
  ): Promise<Organization> {
    const slug = (
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ).slice(0, 80);

    const existing = await organizationRepository.findBySlug(slug);
    if (existing) {
      throw new ServiceError('SLUG_ALREADY_EXISTS', 'Organization slug is already in use', 409);
    }

    return withTransaction(async (client) => {
      // 1. Create Organization
      const org = await organizationRepository.createOrganization(
        {
          name: input.name.trim(),
          slug,
          ownerId: userId,
        },
        client
      );

      // 2. Add creator as owner in organization_members
      await organizationRepository.addMember(org.id, userId, 'owner', client);

      // 3. Create default "General" team
      const generalTeam = await teamRepository.createTeam(
        {
          organizationId: org.id,
          name: 'General',
          slug: 'general',
          description: 'Default organization-wide team',
          isPrivate: false,
        },
        client
      );

      // 4. Add creator as team lead
      await teamRepository.addTeamMember(generalTeam.id, userId, 'lead', client);

      // 5. Create default "general" channel in the General team
      await channelRepository.createChannel(
        {
          teamId: generalTeam.id,
          name: 'general',
          description: 'General discussion for the General team',
          isPrivate: false,
        },
        client
      );

      return organizationRepository.mapOrg(org);
    });
  }

  async getOrganization(
    userId: string,
    orgId: string
  ): Promise<{ organization: Organization; memberRole: OrganizationRole }> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember || !auth.organization) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    return {
      organization: auth.organization,
      memberRole: auth.role || 'member',
    };
  }

  async listUserOrganizations(userId: string): Promise<Organization[]> {
    const rows = await organizationRepository.findForUser(userId);
    return rows.map((r) => organizationRepository.mapOrg(r));
  }

  async updateOrganization(
    userId: string,
    orgId: string,
    input: UpdateOrganizationRequest
  ): Promise<Organization> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only organization owner or admin can update details', 403);
    }

    const updated = await organizationRepository.updateOrganization(orgId, {
      name: input.name?.trim(),
    });
    if (!updated) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    await auditLogRepository.logAudit({
      organizationId: orgId,
      actorId: userId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'organization',
      entityId: orgId,
      metadata: { name: input.name },
    });

    return organizationRepository.mapOrg(updated);
  }

  async archiveOrganization(userId: string, orgId: string): Promise<Organization> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (!auth.isOwner) {
      throw new ServiceError('FORBIDDEN', 'Only the organization owner can archive an organization', 403);
    }

    const archived = await organizationRepository.archiveOrganization(orgId);
    if (!archived) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    await auditLogRepository.logAudit({
      organizationId: orgId,
      actorId: userId,
      action: 'ORGANIZATION_ARCHIVED',
      entityType: 'organization',
      entityId: orgId,
    });

    return organizationRepository.mapOrg(archived);
  }

  async transferOwnership(
    userId: string,
    orgId: string,
    newOwnerUserId: string
  ): Promise<Organization> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (!auth.isOwner) {
      throw new ServiceError('FORBIDDEN', 'Only the organization owner can transfer ownership', 403);
    }
    if (userId === newOwnerUserId) {
      throw new ServiceError('INVALID_REQUEST', 'You are already the owner of this organization', 400);
    }

    return withTransaction(async (client) => {
      try {
        const updatedOrg = await organizationRepository.transferOwnershipLocked(
          client,
          orgId,
          userId,
          newOwnerUserId
        );

        await auditLogRepository.logAudit({
          organizationId: orgId,
          actorId: userId,
          action: 'OWNERSHIP_TRANSFERRED',
          entityType: 'organization',
          entityId: orgId,
          metadata: { oldOwnerId: userId, newOwnerId: newOwnerUserId },
        }, client);

        return organizationRepository.mapOrg(updatedOrg);
      } catch (err: any) {
        if (err.message === 'ORGANIZATION_NOT_FOUND') {
          throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
        }
        if (err.message === 'CALLER_NOT_OWNER') {
          throw new ServiceError('FORBIDDEN', 'Caller is not the organization owner', 403);
        }
        if (err.message === 'TARGET_NOT_ACTIVE_MEMBER') {
          throw new ServiceError('USER_NOT_IN_ORG', 'Target user is not an active member of this organization', 400);
        }
        throw err;
      }
    });
  }

  async listMembers(
    userId: string,
    orgId: string,
    options: { includeSuspended?: boolean } = {}
  ): Promise<OrganizationMemberWithUser[]> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (auth.isGuest) {
      throw new ServiceError('FORBIDDEN', 'Guest members cannot view the organization directory', 403);
    }

    const rows = await organizationRepository.listMembers(orgId, {
      includeSuspended: auth.isAdmin && options.includeSuspended,
    });
    return rows.map((r) => organizationRepository.mapMemberWithUser(r));
  }

  async addMember(
    userId: string,
    orgId: string,
    input: AddOrganizationMemberRequest
  ): Promise<OrganizationMemberWithUser> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only organization owner or admin can add members', 403);
    }

    const targetRole = input.role || 'member';
    if ((targetRole as string) === 'owner') {
      throw new ServiceError('FORBIDDEN', 'Cannot assign owner role via member addition; use ownership transfer', 403);
    }

    // Admins cannot create other admins; only owners can appoint admins
    if (targetRole === 'admin' && !auth.isOwner) {
      throw new ServiceError('FORBIDDEN', 'Only the organization owner can add or promote admins', 403);
    }

    // Enforce guest invite governance policy
    if (targetRole === 'guest') {
      const gov = await governanceRepository.getSettings(orgId);
      if (!gov.allow_guest_invites) {
        throw new ServiceError(
          PHASE13_ERROR_CODES.GUEST_INVITES_DISABLED,
          'Guest invitations are disabled for this organization',
          403
        );
      }
    }

    // Verify target user exists in users table
    const targetUser = await userRepository.findById(input.userId);
    if (!targetUser) {
      throw new ServiceError('USER_NOT_FOUND', 'User does not exist', 404);
    }

    // Check if already a member
    const existing = await organizationRepository.getMember(orgId, input.userId);
    if (existing) {
      throw new ServiceError('MEMBER_ALREADY_EXISTS', 'User is already a member of this organization', 409);
    }

    const member = await organizationRepository.addMember(orgId, input.userId, targetRole);

    await auditLogRepository.logAudit({
      organizationId: orgId,
      actorId: userId,
      action: 'MEMBER_ADDED',
      entityType: 'organization_member',
      entityId: member.id,
      metadata: { targetUserId: input.userId, role: targetRole },
    });

    return {
      ...organizationRepository.mapMember(member),
      user: {
        id: targetUser.id,
        email: targetUser.email,
        displayName: targetUser.display_name,
        avatarUrl: targetUser.avatar_url,
      },
    };
  }

  async updateMember(
    userId: string,
    orgId: string,
    targetUserId: string,
    updates: UpdateOrganizationMemberRequest
  ): Promise<OrganizationMemberWithUser> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only organization owner or admin can update members', 403);
    }

    if (updates.role === 'owner') {
      throw new ServiceError(
        PHASE13_ERROR_CODES.CANNOT_PROMOTE_TO_OWNER,
        'Cannot set owner role via role update; use ownership transfer',
        403
      );
    }

    const targetMember = await organizationRepository.getMember(orgId, targetUserId);
    if (!targetMember) {
      throw new ServiceError('MEMBER_NOT_FOUND', 'Member not found in organization', 404);
    }

    // Protection of Organization Owner
    if (targetMember.role === 'owner') {
      throw new ServiceError(
        PHASE13_ERROR_CODES.CANNOT_MODIFY_OWNER,
        'Cannot modify the role or status of the organization owner',
        400
      );
    }

    // Admins cannot modify, demote, or suspend other admins, nor promote anyone to admin
    if (!auth.isOwner) {
      if (targetMember.role === 'admin') {
        throw new ServiceError(
          PHASE13_ERROR_CODES.CANNOT_MODIFY_ADMIN,
          'Only the organization owner can manage or suspend admin members',
          403
        );
      }
      if (updates.role === 'admin') {
        throw new ServiceError(
          PHASE13_ERROR_CODES.CANNOT_PROMOTE_TO_ADMIN,
          'Only the organization owner can promote members to admin',
          403
        );
      }
    }

    const updated = await organizationRepository.updateMemberRoleAndStatus(orgId, targetUserId, updates);
    if (!updated) {
      throw new ServiceError('NOT_FOUND', 'Member not found', 404);
    }

    // Realtime invalidation & audit logging when suspended
    if (updates.status === 'suspended') {
      await subscriptionManager.invalidateUserOrganizationSubscriptions(targetUserId, orgId);

      await auditLogRepository.logAudit({
        organizationId: orgId,
        actorId: userId,
        action: 'MEMBER_SUSPENDED',
        entityType: 'organization_member',
        entityId: updated.id,
        metadata: { targetUserId },
      });
    } else if (updates.status === 'active' && targetMember.status === 'suspended') {
      await auditLogRepository.logAudit({
        organizationId: orgId,
        actorId: userId,
        action: 'MEMBER_RESTORED',
        entityType: 'organization_member',
        entityId: updated.id,
        metadata: { targetUserId },
      });
    }

    if (updates.role && updates.role !== targetMember.role) {
      await auditLogRepository.logAudit({
        organizationId: orgId,
        actorId: userId,
        action: 'MEMBER_ROLE_CHANGED',
        entityType: 'organization_member',
        entityId: updated.id,
        metadata: { targetUserId, oldRole: targetMember.role, newRole: updates.role },
      });
    }

    const user = await userRepository.findById(targetUserId);
    return {
      ...organizationRepository.mapMember(updated),
      user: {
        id: targetUserId,
        email: user?.email || '',
        displayName: user?.display_name || '',
        avatarUrl: user?.avatar_url || null,
      },
    };
  }

  async updateMemberRole(
    userId: string,
    orgId: string,
    targetUserId: string,
    newRole: OrganizationRole
  ): Promise<OrganizationMemberWithUser> {
    return this.updateMember(userId, orgId, targetUserId, { role: newRole });
  }

  async removeMember(
    userId: string,
    orgId: string,
    targetUserId: string
  ): Promise<{ message: string }> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    const org = await organizationRepository.findById(orgId);
    if (!org) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    // Sole owner invariant protection
    if (targetUserId === org.owner_id) {
      throw new ServiceError(
        PHASE13_ERROR_CODES.OWNER_CANNOT_LEAVE,
        'The organization owner cannot leave or be removed without transferring ownership',
        400
      );
    }

    const targetMember = await organizationRepository.getMember(orgId, targetUserId);
    if (!targetMember) {
      throw new ServiceError('MEMBER_NOT_FOUND', 'Member not found in organization', 404);
    }

    const isSelf = userId === targetUserId;
    if (!isSelf) {
      // Must be owner or admin to remove others
      if (!auth.isAdmin) {
        throw new ServiceError('FORBIDDEN', 'Insufficient permissions to remove members', 403);
      }
      // Admins cannot remove other admins; only owners can remove admins
      if (targetMember.role === 'admin' && !auth.isOwner) {
        throw new ServiceError(
          PHASE13_ERROR_CODES.CANNOT_MODIFY_ADMIN,
          'Only the organization owner can remove admin members',
          403
        );
      }
    }

    // Explicit transactional cascade deprovisioning
    await withTransaction(async (client) => {
      await organizationRepository.deprovisionMemberCascade(client, orgId, targetUserId);

      await auditLogRepository.logAudit({
        organizationId: orgId,
        actorId: userId,
        action: isSelf ? 'MEMBER_LEFT' : 'MEMBER_REMOVED',
        entityType: 'organization_member',
        entityId: targetMember.id,
        metadata: { targetUserId, isSelf },
      }, client);
    });

    // Invalidate realtime subscriptions immediately
    await subscriptionManager.invalidateUserOrganizationSubscriptions(targetUserId, orgId);

    return { message: isSelf ? 'Successfully left organization' : 'Member removed successfully' };
  }
}

export const organizationService = new OrganizationService();
