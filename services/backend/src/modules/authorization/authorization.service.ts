import type { OrganizationRole, TeamRole, Organization, Team, Channel } from '@teamtrack/shared-types';
import { organizationRepository, type DbOrganization } from '../../db/repositories/organization.repository.js';
import { teamRepository, type DbTeam } from '../../db/repositories/team.repository.js';
import { channelRepository, type DbChannel } from '../../db/repositories/channel.repository.js';
import type { Queryable } from '../../db/repositories/organization.repository.js';
import { pool } from '../../db/pool.js';

export interface OrgAuthResult {
  isMember: boolean;
  role?: OrganizationRole;
  isOwner: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  organization?: Organization;
}

export interface TeamAuthResult {
  teamExists: boolean;
  isMember: boolean;
  role?: TeamRole;
  isLead: boolean;
  orgRole?: OrganizationRole;
  isOrgOwnerOrAdmin: boolean;
  organizationId?: string;
  team?: Team;
}

export interface ChannelAuthResult {
  channelExists: boolean;
  canAccess: boolean;
  isPrivate: boolean;
  isChannelMember: boolean;
  teamRole?: TeamRole;
  orgRole?: OrganizationRole;
  isLeadOrOrgAdmin: boolean;
  channel?: Channel;
  teamId?: string;
  organizationId?: string;
}

export class AuthorizationService {
  /**
   * Resolves caller authorization for an organization.
   * Checks organization existence, non-deletion, and active membership.
   */
  async getOrganizationAuth(
    userId: string,
    organizationId: string,
    db: Queryable = pool
  ): Promise<OrgAuthResult> {
    const org = await organizationRepository.findById(organizationId, db);
    if (!org || org.deleted_at !== null) {
      return {
        isMember: false,
        isOwner: false,
        isAdmin: false,
        isGuest: false,
      };
    }

    const member = await organizationRepository.getMember(organizationId, userId, db);
    if (!member || member.status !== 'active') {
      return {
        isMember: false,
        isOwner: false,
        isAdmin: false,
        isGuest: false,
        organization: organizationRepository.mapOrg(org),
      };
    }

    const isOwner = member.role === 'owner' || org.owner_id === userId;
    const isAdmin = isOwner || member.role === 'admin';
    const isGuest = member.role === 'guest';

    return {
      isMember: true,
      role: member.role,
      isOwner,
      isAdmin,
      isGuest,
      organization: organizationRepository.mapOrg(org),
    };
  }

  /**
   * Resolves caller authorization for a team.
   * Resolves hierarchy: Team -> Organization -> Organization Membership -> Team Membership.
   * If organization membership is missing or inactive, team is treated as not found (anti-IDOR 404).
   */
  async getTeamAuth(
    userId: string,
    teamId: string,
    db: Queryable = pool
  ): Promise<TeamAuthResult> {
    const team = await teamRepository.findById(teamId, db);
    if (!team || team.deleted_at !== null) {
      return {
        teamExists: false,
        isMember: false,
        isLead: false,
        isOrgOwnerOrAdmin: false,
      };
    }

    // Verify parent organization and caller's active org membership
    const orgAuth = await this.getOrganizationAuth(userId, team.organization_id, db);
    if (!orgAuth.isMember) {
      // Cross-tenant barrier: caller is NOT in the team's organization
      return {
        teamExists: false, // Hidden for anti-enumeration
        isMember: false,
        isLead: false,
        isOrgOwnerOrAdmin: false,
      };
    }

    const teamMember = await teamRepository.getTeamMember(teamId, userId, db);
    const isTeamMember = teamMember !== null;
    const teamRole = teamMember?.role;
    const isLead = teamRole === 'lead';
    const isOrgOwnerOrAdmin = orgAuth.isAdmin; // Owner or Admin

    // If team is private and user is neither a team member nor org owner/admin, treat as not found
    if (team.is_private && !isTeamMember && !isOrgOwnerOrAdmin) {
      return {
        teamExists: false, // Anti-enumeration for private team
        isMember: false,
        isLead: false,
        isOrgOwnerOrAdmin: false,
      };
    }

    return {
      teamExists: true,
      isMember: isTeamMember,
      role: teamRole,
      isLead,
      orgRole: orgAuth.role,
      isOrgOwnerOrAdmin,
      organizationId: team.organization_id,
      team: teamRepository.mapTeam(team),
    };
  }

  /**
   * Resolves caller authorization for a channel.
   * Resolves hierarchy: Channel -> Team -> Organization -> Memberships.
   * If cross-tenant or private without membership/leadership, treats as not found (anti-IDOR 404).
   */
  async getChannelAuth(
    userId: string,
    channelId: string,
    db: Queryable = pool
  ): Promise<ChannelAuthResult> {
    const channel = await channelRepository.findById(channelId, db);
    if (!channel || channel.deleted_at !== null) {
      return {
        channelExists: false,
        canAccess: false,
        isPrivate: false,
        isChannelMember: false,
        isLeadOrOrgAdmin: false,
      };
    }

    // Resolve parent team
    const teamAuth = await this.getTeamAuth(userId, channel.team_id, db);
    if (!teamAuth.teamExists) {
      return {
        channelExists: false,
        canAccess: false,
        isPrivate: channel.is_private,
        isChannelMember: false,
        isLeadOrOrgAdmin: false,
      };
    }

    const isLeadOrOrgAdmin = teamAuth.isLead || teamAuth.isOrgOwnerOrAdmin;

    if (!channel.is_private) {
      // Public channel: accessible to team members, or org admins/owners
      const canAccess = teamAuth.isMember || teamAuth.isOrgOwnerOrAdmin;
      return {
        channelExists: true,
        canAccess,
        isPrivate: false,
        isChannelMember: true,
        teamRole: teamAuth.role,
        orgRole: teamAuth.orgRole,
        isLeadOrOrgAdmin,
        channel: channelRepository.mapChannel(channel),
        teamId: channel.team_id,
        organizationId: teamAuth.organizationId,
      };
    }

    // Private channel
    const channelMember = await channelRepository.getChannelMember(channelId, userId, db);
    const isChannelMember = channelMember !== null;
    // Team lead or org admin/owner can access even if not explicit member
    const canAccess = isChannelMember || isLeadOrOrgAdmin;

    if (!canAccess) {
      // Anti-enumeration for private channel
      return {
        channelExists: false,
        canAccess: false,
        isPrivate: true,
        isChannelMember: false,
        isLeadOrOrgAdmin,
      };
    }

    return {
      channelExists: true,
      canAccess: true,
      isPrivate: true,
      isChannelMember,
      teamRole: teamAuth.role,
      orgRole: teamAuth.orgRole,
      isLeadOrOrgAdmin,
      channel: channelRepository.mapChannel(channel),
      teamId: channel.team_id,
      organizationId: teamAuth.organizationId,
    };
  }
}

export const authorizationService = new AuthorizationService();
