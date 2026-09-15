import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TeamService } from '../src/modules/teams/team.service.js';
import { teamRepository } from '../src/db/repositories/team.repository.js';
import { organizationRepository } from '../src/db/repositories/organization.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { ServiceError } from '../src/modules/organizations/organization.service.js';

describe('Team Lifecycle, Public Join, Anti-Phantom Invariants & Cascades', () => {
  const teamService = new TeamService();

  describe('Team Creation Permissions', () => {
    it('prohibits guest users from creating teams', async () => {
      const originalGetAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'guest',
          isOwner: false,
          isAdmin: false,
          isGuest: true,
        });

        await assert.rejects(
          async () => {
            await teamService.createTeam('guest-user', 'org-123', {
              name: 'Guest Prohibited Team',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'FORBIDDEN');
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        authorizationService.getOrganizationAuth = originalGetAuth;
      }
    });
  });

  describe('Public Team Joining (POST /api/v1/teams/:teamId/join)', () => {
    it('allows an active organization member to join a public team', async () => {
      const originalFindTeam = teamRepository.findById;
      const originalGetAuth = authorizationService.getOrganizationAuth;
      const originalGetMember = teamRepository.getTeamMember;
      const originalAddMember = teamRepository.addTeamMember;

      try {
        teamRepository.findById = async (id: string) => ({
          id,
          organization_id: 'org-abc',
          name: 'Public Team',
          slug: 'public-team',
          description: null,
          is_private: false,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'member',
          isOwner: false,
          isAdmin: false,
          isGuest: false,
        });

        teamRepository.getTeamMember = async () => null; // Not yet a member

        teamRepository.addTeamMember = async (teamId, userId, role) => ({
          id: 'tm-new',
          team_id: teamId,
          user_id: userId,
          role,
          joined_at: new Date(),
        });

        const member = await teamService.joinPublicTeam('user-joiner', 'team-pub');
        assert.strictEqual(member.userId, 'user-joiner');
        assert.strictEqual(member.role, 'member');
      } finally {
        teamRepository.findById = originalFindTeam;
        authorizationService.getOrganizationAuth = originalGetAuth;
        teamRepository.getTeamMember = originalGetMember;
        teamRepository.addTeamMember = originalAddMember;
      }
    });

    it('rejects self-joining a private team (requires invitation)', async () => {
      const originalFindTeam = teamRepository.findById;
      const originalGetAuth = authorizationService.getOrganizationAuth;

      try {
        teamRepository.findById = async (id: string) => ({
          id,
          organization_id: 'org-abc',
          name: 'Secret Team',
          slug: 'secret-team',
          description: null,
          is_private: true, // Private!
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'member',
          isOwner: false,
          isAdmin: false,
          isGuest: false,
        });

        await assert.rejects(
          async () => {
            await teamService.joinPublicTeam('user-joiner', 'team-priv');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'TEAM_IS_PRIVATE');
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        teamRepository.findById = originalFindTeam;
        authorizationService.getOrganizationAuth = originalGetAuth;
      }
    });

    it('rejects guest user from self-joining public team', async () => {
      const originalFindTeam = teamRepository.findById;
      const originalGetAuth = authorizationService.getOrganizationAuth;

      try {
        teamRepository.findById = async (id: string) => ({
          id,
          organization_id: 'org-abc',
          name: 'Public Team',
          slug: 'public-team',
          description: null,
          is_private: false,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'guest',
          isOwner: false,
          isAdmin: false,
          isGuest: true, // Guest!
        });

        await assert.rejects(
          async () => {
            await teamService.joinPublicTeam('user-guest', 'team-pub');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'FORBIDDEN');
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        teamRepository.findById = originalFindTeam;
        authorizationService.getOrganizationAuth = originalGetAuth;
      }
    });

    it('rejects duplicate membership in public team (409 Conflict)', async () => {
      const originalFindTeam = teamRepository.findById;
      const originalGetAuth = authorizationService.getOrganizationAuth;
      const originalGetMember = teamRepository.getTeamMember;

      try {
        teamRepository.findById = async (id: string) => ({
          id,
          organization_id: 'org-abc',
          name: 'Public Team',
          slug: 'public-team',
          description: null,
          is_private: false,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'member',
          isOwner: false,
          isAdmin: false,
          isGuest: false,
        });

        teamRepository.getTeamMember = async () => ({
          id: 'tm-existing',
          team_id: 'team-pub',
          user_id: 'user-joiner',
          role: 'member',
          joined_at: new Date(),
        });

        await assert.rejects(
          async () => {
            await teamService.joinPublicTeam('user-joiner', 'team-pub');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'MEMBER_ALREADY_EXISTS');
            assert.strictEqual(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        teamRepository.findById = originalFindTeam;
        authorizationService.getOrganizationAuth = originalGetAuth;
        teamRepository.getTeamMember = originalGetMember;
      }
    });
  });

  describe('Anti-Phantom Team Membership Invariant', () => {
    it('rejects adding a user to a team if user is not in parent organization (USER_NOT_IN_ORG)', async () => {
      const originalGetTeamAuth = authorizationService.getTeamAuth;
      const originalFindUser = userRepository.findById;
      const originalGetOrgMember = organizationRepository.getMember;

      try {
        authorizationService.getTeamAuth = async () => ({
          teamExists: true,
          isMember: true,
          role: 'lead',
          isLead: true,
          isOrgOwnerOrAdmin: false,
          organizationId: 'org-parent-123',
          team: {
            id: 'team-1',
            organizationId: 'org-parent-123',
            name: 'Eng',
            slug: 'eng',
            description: null,
            isPrivate: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        userRepository.findById = async (id: string) => ({
          id,
          email: 'target@example.com',
          display_name: 'Target User',
          full_name: null,
          avatar_url: null,
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        // Target user is NOT an organization member!
        organizationRepository.getMember = async () => null;

        await assert.rejects(
          async () => {
            await teamService.addTeamMember('lead-user', 'team-1', {
              userId: 'phantom-target',
              role: 'member',
            });
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'USER_NOT_IN_ORG');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getTeamAuth = originalGetTeamAuth;
        userRepository.findById = originalFindUser;
        organizationRepository.getMember = originalGetOrgMember;
      }
    });
  });

  describe('Team Member Removal & Cascade Deprovisioning', () => {
    it('purges user channel_members rows within that team upon leaving', async () => {
      const deletedQueries: { sql: string; params: any[] }[] = [];
      const mockClient: any = {
        query: async (sql: string, params: any[] = []) => {
          if (sql.includes('DELETE FROM')) {
            deletedQueries.push({ sql, params });
          }
          return { rowCount: 1 };
        },
      };

      await teamRepository.deprovisionTeamMemberCascade(mockClient, 'team-777', 'user-leaving-team');

      assert.strictEqual(deletedQueries.length, 2, 'Must execute exactly 2 cascade deletion statements');

      // 1. Channel members in that team
      assert.ok(deletedQueries[0].sql.includes('DELETE FROM channel_members'));
      assert.ok(deletedQueries[0].sql.includes('WHERE team_id = $2'));
      assert.deepStrictEqual(deletedQueries[0].params, ['user-leaving-team', 'team-777']);

      // 2. Team member row
      assert.ok(deletedQueries[1].sql.includes('DELETE FROM team_members'));
      assert.deepStrictEqual(deletedQueries[1].params, ['team-777', 'user-leaving-team']);
    });
  });
});
