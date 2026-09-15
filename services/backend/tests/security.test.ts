import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OrganizationService } from '../src/modules/organizations/organization.service.js';
import { TeamService } from '../src/modules/teams/team.service.js';
import { ChannelService } from '../src/modules/channels/channel.service.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { ServiceError } from '../src/modules/organizations/organization.service.js';
import { organizationRepository, type DbOrganization } from '../src/db/repositories/organization.repository.js';
import { teamRepository, type DbTeam } from '../src/db/repositories/team.repository.js';
import { channelRepository, type DbChannel } from '../src/db/repositories/channel.repository.js';

describe('Security & Multi-Tenant Isolation (Anti-IDOR / Anti-BOLA)', () => {
  const orgService = new OrganizationService();
  const teamService = new TeamService();
  const channelService = new ChannelService();

  // Tenant A
  const orgA: DbOrganization = {
    id: 'org-tenant-a',
    name: 'Tenant A',
    slug: 'tenant-a',
    owner_id: 'user-a-owner',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  // Tenant B
  const orgB: DbOrganization = {
    id: 'org-tenant-b',
    name: 'Tenant B',
    slug: 'tenant-b',
    owner_id: 'user-b-owner',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const teamB: DbTeam = {
    id: 'team-b-secret',
    organization_id: orgB.id,
    name: 'B Confidential',
    slug: 'b-confidential',
    description: null,
    is_private: false,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const channelB: DbChannel = {
    id: 'channel-b-secret',
    team_id: teamB.id,
    name: 'confidential-chat',
    description: null,
    is_private: true,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const mockDb: any = {
    query: async (text: string, params: any[] = []) => {
      if (text.includes('FROM organizations WHERE id = $1')) {
        const org = [orgA, orgB].find((o) => o.id === params[0] && o.deleted_at === null);
        return { rows: org ? [org] : [] };
      }
      if (text.includes('FROM organization_members WHERE organization_id = $1 AND user_id = $2')) {
        // User A only belongs to Org A!
        if (params[0] === orgA.id && params[1] === 'user-a-attacker') {
          return { rows: [{ id: 'om-a', organization_id: orgA.id, user_id: 'user-a-attacker', role: 'member', status: 'active' }] };
        }
        return { rows: [] };
      }
      if (text.includes('FROM teams WHERE id = $1')) {
        return { rows: params[0] === teamB.id ? [teamB] : [] };
      }
      if (text.includes('FROM channels WHERE id = $1')) {
        return { rows: params[0] === channelB.id ? [channelB] : [] };
      }
      return { rows: [] };
    },
  };

  describe('Cross-Tenant Access Verification (User A cannot probe Org B)', () => {
    it('Anti-IDOR: User A accessing Org B returns 404 NOT_FOUND (anti-enumeration)', async () => {
      const auth = await authorizationService.getOrganizationAuth('user-a-attacker', orgB.id, mockDb);
      assert.strictEqual(auth.isMember, false);
    });

    it('Anti-IDOR: User A accessing Team B returns 404 NOT_FOUND', async () => {
      const auth = await authorizationService.getTeamAuth('user-a-attacker', teamB.id, mockDb);
      assert.strictEqual(auth.teamExists, false, 'Cross-tenant team access must return false to trigger 404 NOT_FOUND');
    });

    it('Anti-IDOR: User A accessing Channel B returns 404 NOT_FOUND', async () => {
      const auth = await authorizationService.getChannelAuth('user-a-attacker', channelB.id, mockDb);
      assert.strictEqual(auth.channelExists, false, 'Cross-tenant channel access must return false to trigger 404 NOT_FOUND');
      assert.strictEqual(auth.canAccess, false);
    });
  });

  describe('Archived Resource Mutation Protection', () => {
    it('rejects adding a member to an archived team (TEAM_IS_ARCHIVED)', async () => {
      const originalGetTeamAuth = authorizationService.getTeamAuth;
      try {
        authorizationService.getTeamAuth = async () => ({
          teamExists: true,
          isMember: true,
          role: 'lead',
          isLead: true,
          isOrgOwnerOrAdmin: true,
          team: {
            id: 'team-archived',
            organizationId: 'org-1',
            name: 'Old Team',
            slug: 'old-team',
            description: null,
            isPrivate: false,
            isArchived: true, // Archived!
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        await assert.rejects(
          async () => {
            await teamService.addTeamMember('lead-user', 'team-archived', {
              userId: 'some-user',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'TEAM_IS_ARCHIVED');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getTeamAuth = originalGetTeamAuth;
      }
    });

    it('rejects adding a member to an archived private channel (CHANNEL_IS_ARCHIVED)', async () => {
      const originalGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: true,
          isChannelMember: true,
          isLeadOrOrgAdmin: true,
          channel: {
            id: 'chan-archived',
            teamId: 'team-1',
            name: 'old-channel',
            description: null,
            isPrivate: true,
            isArchived: true, // Archived!
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        await assert.rejects(
          async () => {
            await channelService.addChannelMember('lead-user', 'chan-archived', {
              userId: 'some-user',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'CHANNEL_IS_ARCHIVED');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = originalGetChannelAuth;
      }
    });
  });

  describe('Soft-Deleted Resource Exclusion', () => {
    it('returns 404 NOT_FOUND when accessing soft-deleted organization', async () => {
      const softDeletedOrg: DbOrganization = {
        id: 'org-deleted',
        name: 'Deleted Corp',
        slug: 'deleted-corp',
        owner_id: 'user-1',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: new Date(), // Soft-deleted!
      };

      const mockDbDeleted: any = {
        query: async () => ({ rows: [softDeletedOrg] }),
      };

      const auth = await authorizationService.getOrganizationAuth('user-1', 'org-deleted', mockDbDeleted);
      assert.strictEqual(auth.isMember, false, 'Soft-deleted organizations must never grant membership or access');
    });
  });
});
