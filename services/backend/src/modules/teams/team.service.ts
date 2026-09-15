import { withTransaction } from '../../db/pool.js';
import { teamRepository, type DbTeam } from '../../db/repositories/team.repository.js';
import { channelRepository } from '../../db/repositories/channel.repository.js';
import { organizationRepository } from '../../db/repositories/organization.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { ServiceError } from '../organizations/organization.service.js';
import type {
  Team,
  TeamMember,
  TeamMemberWithUser,
  TeamWithMembership,
  CreateTeamRequest,
  UpdateTeamRequest,
  AddTeamMemberRequest,
} from '@teamtrack/shared-types';

export class TeamService {
  async createTeam(
    userId: string,
    orgId: string,
    input: CreateTeamRequest
  ): Promise<Team> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }
    if (auth.isGuest) {
      throw new ServiceError('FORBIDDEN', 'Guest members cannot create teams', 403);
    }

    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'team';

    const existing = await teamRepository.findBySlug(orgId, slug);
    if (existing) {
      throw new ServiceError('SLUG_ALREADY_EXISTS', 'A team with this name or slug already exists in this organization', 409);
    }

    return withTransaction(async (client) => {
      // 1. Create team
      const team = await teamRepository.createTeam(
        {
          organizationId: orgId,
          name: input.name.trim(),
          slug,
          description: input.description,
          isPrivate: input.isPrivate ?? false,
        },
        client
      );

      // 2. Add creator as team lead
      await teamRepository.addTeamMember(team.id, userId, 'lead', client);

      // 3. Create default "general" channel
      await channelRepository.createChannel(
        {
          teamId: team.id,
          name: 'general',
          description: `General discussion for ${team.name}`,
          isPrivate: false,
        },
        client
      );

      return teamRepository.mapTeam(team);
    });
  }

  async listTeams(userId: string, orgId: string): Promise<TeamWithMembership[]> {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Organization not found', 404);
    }

    const rows = await teamRepository.listTeamsForUserInOrg(
      orgId,
      userId,
      auth.isAdmin,
      auth.isGuest
    );
    return rows.map((r) => teamRepository.mapTeamWithMembership(r));
  }

  async getTeam(
    userId: string,
    teamId: string
  ): Promise<{ team: Team; memberRole?: string }> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    return {
      team: auth.team,
      memberRole: auth.role,
    };
  }

  async joinPublicTeam(userId: string, teamId: string): Promise<TeamMember> {
    const team = await teamRepository.findById(teamId);
    if (!team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const orgAuth = await authorizationService.getOrganizationAuth(userId, team.organization_id);
    if (!orgAuth.isMember) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }
    if (orgAuth.isGuest) {
      throw new ServiceError('FORBIDDEN', 'Guest members cannot self-join teams', 403);
    }

    if (team.is_private) {
      throw new ServiceError('TEAM_IS_PRIVATE', 'Cannot self-join private teams; invitation required', 403);
    }
    if (team.is_archived) {
      throw new ServiceError('TEAM_IS_ARCHIVED', 'Cannot join an archived team', 400);
    }

    const existing = await teamRepository.getTeamMember(teamId, userId);
    if (existing) {
      throw new ServiceError('MEMBER_ALREADY_EXISTS', 'You are already a member of this team', 409);
    }

    const member = await teamRepository.addTeamMember(teamId, userId, 'member');
    return teamRepository.mapMember(member);
  }

  async updateTeam(
    userId: string,
    teamId: string,
    input: UpdateTeamRequest
  ): Promise<Team> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canManage = auth.isLead || auth.isOrgOwnerOrAdmin;
    if (!canManage) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can update team details', 403);
    }

    if (auth.team.isArchived) {
      throw new ServiceError('TEAM_IS_ARCHIVED', 'Cannot update an archived team', 400);
    }

    const updated = await teamRepository.updateTeam(teamId, {
      name: input.name?.trim(),
      description: input.description,
    });
    if (!updated) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    return teamRepository.mapTeam(updated);
  }

  async archiveTeam(userId: string, teamId: string): Promise<Team> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canManage = auth.isLead || auth.isOrgOwnerOrAdmin;
    if (!canManage) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can archive a team', 403);
    }

    const archived = await teamRepository.archiveTeam(teamId);
    if (!archived) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    return teamRepository.mapTeam(archived);
  }

  async listTeamMembers(userId: string, teamId: string): Promise<TeamMemberWithUser[]> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canView = auth.isMember || auth.isOrgOwnerOrAdmin;
    if (!canView) {
      throw new ServiceError('FORBIDDEN', 'You must be a team member to view the member directory', 403);
    }

    const rows = await teamRepository.listTeamMembers(teamId);
    return rows.map((r) => teamRepository.mapMemberWithUser(r));
  }

  async addTeamMember(
    userId: string,
    teamId: string,
    input: AddTeamMemberRequest
  ): Promise<TeamMemberWithUser> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canManage = auth.isLead || auth.isOrgOwnerOrAdmin;
    if (!canManage) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can add team members', 403);
    }

    if (auth.team.isArchived) {
      throw new ServiceError('TEAM_IS_ARCHIVED', 'Cannot add members to an archived team', 400);
    }

    // Verify target user exists
    const targetUser = await userRepository.findById(input.userId);
    if (!targetUser) {
      throw new ServiceError('USER_NOT_FOUND', 'User does not exist', 404);
    }

    // Anti-Phantom Invariant: target user MUST be an active organization member
    const orgMember = await organizationRepository.getMember(auth.organizationId!, input.userId);
    if (!orgMember || orgMember.status !== 'active') {
      throw new ServiceError('USER_NOT_IN_ORG', 'Target user is not an active member of this organization', 400);
    }

    // Check if already in team
    const existing = await teamRepository.getTeamMember(teamId, input.userId);
    if (existing) {
      throw new ServiceError('MEMBER_ALREADY_EXISTS', 'User is already a member of this team', 409);
    }

    const member = await teamRepository.addTeamMember(teamId, input.userId, input.role || 'member');
    return {
      ...teamRepository.mapMember(member),
      user: {
        id: targetUser.id,
        email: targetUser.email,
        displayName: targetUser.display_name,
        avatarUrl: targetUser.avatar_url,
      },
    };
  }

  async removeTeamMember(
    userId: string,
    teamId: string,
    targetUserId: string
  ): Promise<{ message: string }> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const targetMember = await teamRepository.getTeamMember(teamId, targetUserId);
    if (!targetMember) {
      throw new ServiceError('MEMBER_NOT_FOUND', 'User is not a member of this team', 404);
    }

    const isSelf = userId === targetUserId;
    if (!isSelf) {
      const canManage = auth.isLead || auth.isOrgOwnerOrAdmin;
      if (!canManage) {
        throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can remove team members', 403);
      }
    }

    // Explicit transactional cascade: remove from all private channels in team + remove from team
    await withTransaction(async (client) => {
      await teamRepository.deprovisionTeamMemberCascade(client, teamId, targetUserId);
    });

    return { message: isSelf ? 'Successfully left team' : 'Team member removed successfully' };
  }
}

export const teamService = new TeamService();
