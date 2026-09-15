import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChannelService } from '../src/modules/channels/channel.service.js';
import { channelRepository } from '../src/db/repositories/channel.repository.js';
import { teamRepository } from '../src/db/repositories/team.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { ServiceError } from '../src/modules/organizations/organization.service.js';

describe('Channel Lifecycle, General Protection, Private Channel Isolation & Invariants', () => {
  const channelService = new ChannelService();

  describe('Default "General" Channel Invariant Protection', () => {
    it('blocks renaming the default "general" channel (CANNOT_MODIFY_GENERAL)', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: true,
          channel: {
            id: 'chan-gen-1',
            teamId: 'team-1',
            name: 'general',
            description: 'Default general channel',
            isPrivate: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        await assert.rejects(
          async () => {
            await channelService.updateChannel('lead-user', 'chan-gen-1', {
              name: 'renamed-general',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'CANNOT_MODIFY_GENERAL');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
      }
    });

    it('blocks archiving the default "general" channel (CANNOT_ARCHIVE_GENERAL)', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: true,
          channel: {
            id: 'chan-gen-1',
            teamId: 'team-1',
            name: 'general',
            description: 'Default general channel',
            isPrivate: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        await assert.rejects(
          async () => {
            await channelService.archiveChannel('lead-user', 'chan-gen-1');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'CANNOT_ARCHIVE_GENERAL');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
      }
    });
  });

  describe('Private Channel Membership Management Restrictions', () => {
    it('prohibits ordinary private channel members from adding other members', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: true,
          isChannelMember: true,
          isLeadOrOrgAdmin: false, // Ordinary member! Not lead, not admin!
          channel: {
            id: 'chan-priv-1',
            teamId: 'team-1',
            name: 'secret-ops',
            description: null,
            isPrivate: true,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        await assert.rejects(
          async () => {
            await channelService.addChannelMember('ordinary-member', 'chan-priv-1', {
              userId: 'friend-user',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'FORBIDDEN');
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
      }
    });

    it('allows team lead or org admin to add members to private channels', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      const originalFindUser = userRepository.findById;
      const originalGetTeamMember = teamRepository.getTeamMember;
      const originalGetChannelMember = channelRepository.getChannelMember;
      const originalAddChannelMember = channelRepository.addChannelMember;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: true,
          isChannelMember: true,
          isLeadOrOrgAdmin: true, // Authorized lead!
          teamId: 'team-1',
          channel: {
            id: 'chan-priv-1',
            teamId: 'team-1',
            name: 'secret-ops',
            description: null,
            isPrivate: true,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        userRepository.findById = async (id: string) => ({
          id,
          email: 'colleague@example.com',
          display_name: 'Colleague',
          full_name: null,
          avatar_url: null,
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        teamRepository.getTeamMember = async () => ({
          id: 'tm-1',
          team_id: 'team-1',
          user_id: 'colleague-user',
          role: 'member',
          joined_at: new Date(),
        });

        channelRepository.getChannelMember = async () => null; // Not yet in channel

        channelRepository.addChannelMember = async (chanId, userId) => ({
          id: 'cm-new',
          channel_id: chanId,
          user_id: userId,
          role: 'member',
          joined_at: new Date(),
        });

        const member = await channelService.addChannelMember('lead-user', 'chan-priv-1', {
          userId: 'colleague-user',
        });

        assert.strictEqual(member.userId, 'colleague-user');
        assert.strictEqual(member.role, 'member');
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
        userRepository.findById = originalFindUser;
        teamRepository.getTeamMember = originalGetTeamMember;
        channelRepository.getChannelMember = originalGetChannelMember;
        channelRepository.addChannelMember = originalAddChannelMember;
      }
    });

    it('allows an ordinary private channel member to leave voluntarily', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      const originalGetChannelMember = channelRepository.getChannelMember;
      const originalRemoveChannelMember = channelRepository.removeChannelMember;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: true,
          isChannelMember: true,
          isLeadOrOrgAdmin: false, // Ordinary member!
          channel: {
            id: 'chan-priv-1',
            teamId: 'team-1',
            name: 'secret-ops',
            description: null,
            isPrivate: true,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        channelRepository.getChannelMember = async () => ({
          id: 'cm-1',
          channel_id: 'chan-priv-1',
          user_id: 'leaving-user',
          role: 'member',
          joined_at: new Date(),
        });

        let removed = false;
        channelRepository.removeChannelMember = async () => {
          removed = true;
          return true;
        };

        const res = await channelService.removeChannelMember('leaving-user', 'chan-priv-1', 'leaving-user');
        assert.strictEqual(removed, true);
        assert.ok(res.message.includes('left'));
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
        channelRepository.getChannelMember = originalGetChannelMember;
        channelRepository.removeChannelMember = originalRemoveChannelMember;
      }
    });
  });

  describe('Anti-Phantom Channel Membership Invariant', () => {
    it('rejects adding a user to private channel if user is not in parent team (USER_NOT_IN_TEAM)', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      const originalFindUser = userRepository.findById;
      const originalGetTeamMember = teamRepository.getTeamMember;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: true,
          isChannelMember: true,
          isLeadOrOrgAdmin: true,
          teamId: 'team-1',
          channel: {
            id: 'chan-priv-1',
            teamId: 'team-1',
            name: 'secret-ops',
            description: null,
            isPrivate: true,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        userRepository.findById = async (id: string) => ({
          id,
          email: 'outsider@example.com',
          display_name: 'Outsider',
          full_name: null,
          avatar_url: null,
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        // User is NOT in team!
        teamRepository.getTeamMember = async () => null;

        await assert.rejects(
          async () => {
            await channelService.addChannelMember('lead-user', 'chan-priv-1', {
              userId: 'outsider-user',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'USER_NOT_IN_TEAM');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
        userRepository.findById = originalFindUser;
        teamRepository.getTeamMember = originalGetTeamMember;
      }
    });
  });

  describe('Case-Insensitive Channel Name Uniqueness', () => {
    it('rejects duplicate channel name differing only in case within same team', async () => {
      const originalGetTeamAuth = authorizationService.getTeamAuth;
      const originalFindByName = channelRepository.findByName;

      try {
        authorizationService.getTeamAuth = async () => ({
          teamExists: true,
          isMember: true,
          role: 'lead',
          isLead: true,
          isOrgOwnerOrAdmin: true,
          team: {
            id: 'team-1',
            organizationId: 'org-1',
            name: 'Eng',
            slug: 'eng',
            description: null,
            isPrivate: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        // Simulated findByName with LOWER(name) finds existing 'announcements'
        channelRepository.findByName = async (teamId, name) => ({
          id: 'chan-existing',
          team_id: teamId,
          name: 'announcements',
          description: null,
          is_private: false,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        await assert.rejects(
          async () => {
            await channelService.createChannel('lead-user', 'team-1', {
              name: 'ANNOUNCEMENTS', // Differing only by case
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'CHANNEL_ALREADY_EXISTS');
            assert.strictEqual(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        authorizationService.getTeamAuth = originalGetTeamAuth;
        channelRepository.findByName = originalFindByName;
      }
    });
  });
});
