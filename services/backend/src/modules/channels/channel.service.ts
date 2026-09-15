import { withTransaction } from '../../db/pool.js';
import { channelRepository, type DbChannel } from '../../db/repositories/channel.repository.js';
import { teamRepository } from '../../db/repositories/team.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { ServiceError } from '../organizations/organization.service.js';
import type {
  Channel,
  ChannelMember,
  ChannelMemberWithUser,
  CreateChannelRequest,
  UpdateChannelRequest,
  AddChannelMemberRequest,
} from '@teamtrack/shared-types';

export class ChannelService {
  async createChannel(
    userId: string,
    teamId: string,
    input: CreateChannelRequest
  ): Promise<Channel> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists || !auth.team) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canCreate = auth.isMember || auth.isOrgOwnerOrAdmin;
    if (!canCreate) {
      throw new ServiceError('FORBIDDEN', 'You must be a team member to create channels', 403);
    }

    if (auth.team.isArchived) {
      throw new ServiceError('TEAM_IS_ARCHIVED', 'Cannot create channels in an archived team', 400);
    }

    const trimmedName = input.name.trim();

    // Check case-insensitive uniqueness in team
    const existing = await channelRepository.findByName(teamId, trimmedName);
    if (existing) {
      throw new ServiceError('CHANNEL_ALREADY_EXISTS', 'A channel with this name already exists in this team', 409);
    }

    const isPrivate = input.isPrivate ?? false;

    return withTransaction(async (client) => {
      const channel = await channelRepository.createChannel(
        {
          teamId,
          name: trimmedName,
          description: input.description,
          isPrivate,
        },
        client
      );

      // If channel is private, automatically add creator as member
      if (isPrivate) {
        await channelRepository.addChannelMember(channel.id, userId, client);
      }

      return channelRepository.mapChannel(channel);
    });
  }

  async listChannels(userId: string, teamId: string): Promise<Channel[]> {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists) {
      throw new ServiceError('NOT_FOUND', 'Team not found', 404);
    }

    const canView = auth.isMember || auth.isOrgOwnerOrAdmin;
    if (!canView) {
      throw new ServiceError('FORBIDDEN', 'You must be a team member to list channels', 403);
    }

    const canAccessAllPrivate = auth.isLead || auth.isOrgOwnerOrAdmin;
    const rows = await channelRepository.listChannelsForUserInTeam(
      teamId,
      userId,
      canAccessAllPrivate
    );
    return rows.map((r) => channelRepository.mapChannel(r));
  }

  async getChannel(userId: string, channelId: string): Promise<Channel> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess || !auth.channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    return auth.channel;
  }

  async updateChannel(
    userId: string,
    channelId: string,
    input: UpdateChannelRequest
  ): Promise<Channel> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess || !auth.channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (!auth.isLeadOrOrgAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can update channel details', 403);
    }

    if (auth.channel.isArchived) {
      throw new ServiceError('CHANNEL_IS_ARCHIVED', 'Cannot update an archived channel', 400);
    }

    // Default general channel protection: cannot rename general
    if (auth.channel.name.toLowerCase() === 'general' && input.name && input.name.toLowerCase() !== 'general') {
      throw new ServiceError('CANNOT_MODIFY_GENERAL', 'The default general channel cannot be renamed', 400);
    }

    if (input.name) {
      const existing = await channelRepository.findByName(auth.channel.teamId, input.name.trim());
      if (existing && existing.id !== channelId) {
        throw new ServiceError('CHANNEL_ALREADY_EXISTS', 'A channel with this name already exists in this team', 409);
      }
    }

    const updated = await channelRepository.updateChannel(channelId, {
      name: input.name?.trim(),
      description: input.description,
    });
    if (!updated) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    return channelRepository.mapChannel(updated);
  }

  async archiveChannel(userId: string, channelId: string): Promise<Channel> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess || !auth.channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (!auth.isLeadOrOrgAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can archive a channel', 403);
    }

    // Invariant: cannot archive default "general" channel
    if (auth.channel.name.toLowerCase() === 'general') {
      throw new ServiceError('CANNOT_ARCHIVE_GENERAL', 'The default general channel cannot be archived', 400);
    }

    const archived = await channelRepository.archiveChannel(channelId);
    if (!archived) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    return channelRepository.mapChannel(archived);
  }

  async listChannelMembers(
    userId: string,
    channelId: string
  ): Promise<ChannelMemberWithUser[]> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (!auth.isPrivate) {
      throw new ServiceError('CHANNEL_IS_PUBLIC', 'Public channels do not have dedicated member lists; all team members have access', 400);
    }

    const rows = await channelRepository.listChannelMembers(channelId);
    return rows.map((r) => channelRepository.mapMemberWithUser(r));
  }

  async addChannelMember(
    userId: string,
    channelId: string,
    input: AddChannelMemberRequest
  ): Promise<ChannelMemberWithUser> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess || !auth.channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (!auth.isPrivate) {
      throw new ServiceError('CHANNEL_IS_PUBLIC', 'Public channels do not require explicit member assignment', 400);
    }

    // Private channel member addition: Team lead or Org admin/owner ONLY!
    if (!auth.isLeadOrOrgAdmin) {
      throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can add members to private channels', 403);
    }

    if (auth.channel.isArchived) {
      throw new ServiceError('CHANNEL_IS_ARCHIVED', 'Cannot add members to an archived channel', 400);
    }

    // Verify target user exists
    const targetUser = await userRepository.findById(input.userId);
    if (!targetUser) {
      throw new ServiceError('USER_NOT_FOUND', 'User does not exist', 404);
    }

    // Anti-Phantom Invariant: target user MUST be an active member of the parent team!
    const teamMember = await teamRepository.getTeamMember(auth.teamId!, input.userId);
    if (!teamMember) {
      throw new ServiceError('USER_NOT_IN_TEAM', 'Target user must be a member of the team to be added to this channel', 400);
    }

    // Check if already in channel
    const existing = await channelRepository.getChannelMember(channelId, input.userId);
    if (existing) {
      throw new ServiceError('MEMBER_ALREADY_EXISTS', 'User is already a member of this channel', 409);
    }

    const member = await channelRepository.addChannelMember(channelId, input.userId);
    return {
      ...channelRepository.mapMember(member),
      user: {
        id: targetUser.id,
        email: targetUser.email,
        displayName: targetUser.display_name,
        avatarUrl: targetUser.avatar_url,
      },
    };
  }

  async removeChannelMember(
    userId: string,
    channelId: string,
    targetUserId: string
  ): Promise<{ message: string }> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess || !auth.channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (!auth.isPrivate) {
      throw new ServiceError('CHANNEL_IS_PUBLIC', 'Cannot remove members from a public channel', 400);
    }

    const targetMember = await channelRepository.getChannelMember(channelId, targetUserId);
    if (!targetMember) {
      throw new ServiceError('MEMBER_NOT_FOUND', 'User is not a member of this channel', 404);
    }

    const isSelf = userId === targetUserId;
    if (!isSelf) {
      if (!auth.isLeadOrOrgAdmin) {
        throw new ServiceError('FORBIDDEN', 'Only team leads or organization admins can remove other members from private channels', 403);
      }
    }

    await channelRepository.removeChannelMember(channelId, targetUserId);
    return { message: isSelf ? 'Successfully left channel' : 'Channel member removed successfully' };
  }
}

export const channelService = new ChannelService();
