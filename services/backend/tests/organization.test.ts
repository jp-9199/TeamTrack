import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OrganizationService, ServiceError } from '../src/modules/organizations/organization.service.js';
import { organizationRepository, type DbOrganization, type DbOrganizationMember } from '../src/db/repositories/organization.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { userRepository, type DbUser } from '../src/db/repositories/user.repository.js';

describe('Organization Lifecycle, Ownership Invariants & Cascades', () => {
  const orgService = new OrganizationService();

  describe('Sole Owner Departure & Removal Protection', () => {
    it('blocks the organization owner from leaving without transferring ownership', async () => {
      // Mock authorization to simulate caller is active owner
      const originalGetAuth = authorizationService.getOrganizationAuth;
      const originalFindById = organizationRepository.findById;
      const originalGetMember = organizationRepository.getMember;

      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'owner',
          isOwner: true,
          isAdmin: true,
          isGuest: false,
        });

        organizationRepository.findById = async (id: string) => ({
          id,
          name: 'Acme Corp',
          slug: 'acme',
          owner_id: 'user-sole-owner',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        organizationRepository.getMember = async (orgId: string, userId: string) => ({
          id: 'om-1',
          organization_id: orgId,
          user_id: userId,
          role: 'owner',
          status: 'active',
          joined_at: new Date(),
          updated_at: new Date(),
        });

        await assert.rejects(
          async () => {
            await orgService.removeMember('user-sole-owner', 'org-123', 'user-sole-owner');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'OWNER_CANNOT_LEAVE');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getOrganizationAuth = originalGetAuth;
        organizationRepository.findById = originalFindById;
        organizationRepository.getMember = originalGetMember;
      }
    });

    it('blocks an admin from removing the organization owner', async () => {
      const originalGetAuth = authorizationService.getOrganizationAuth;
      const originalFindById = organizationRepository.findById;

      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'admin',
          isOwner: false,
          isAdmin: true,
          isGuest: false,
        });

        organizationRepository.findById = async (id: string) => ({
          id,
          name: 'Acme Corp',
          slug: 'acme',
          owner_id: 'user-owner',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        await assert.rejects(
          async () => {
            await orgService.removeMember('user-admin', 'org-123', 'user-owner');
          },
          (err: ServiceError) => {
            assert.strictEqual(err.code, 'OWNER_CANNOT_LEAVE');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getOrganizationAuth = originalGetAuth;
        organizationRepository.findById = originalFindById;
      }
    });
  });

  describe('Ownership Transfer Locked Workflow', () => {
    it('successfully transfers ownership, swaps roles, and updates owner_id in a transaction', async () => {
      const executedQueries: string[] = [];
      const orgState: DbOrganization = {
        id: 'org-transfer-test',
        name: 'Transfer Corp',
        slug: 'transfer',
        owner_id: 'user-old-owner',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      const mockClient: any = {
        query: async (text: string, params: any[] = []) => {
          executedQueries.push(text);
          // 1. FOR UPDATE query
          if (text.includes('FOR UPDATE')) {
            return { rows: [orgState] };
          }
          // 2. getMember query
          if (text.includes('FROM organization_members') && text.includes('WHERE organization_id = $1 AND user_id = $2')) {
            return {
              rows: [
                {
                  id: 'om-target',
                  organization_id: params[0],
                  user_id: params[1],
                  role: 'member',
                  status: 'active',
                  joined_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
          // 3. Update organizations owner_id
          if (text.includes('UPDATE organizations') && text.includes('SET owner_id = $2')) {
            orgState.owner_id = params[1];
            return { rows: [orgState] };
          }
          // 4. Update member roles
          if (text.includes('UPDATE organization_members')) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      };

      const result = await organizationRepository.transferOwnershipLocked(
        mockClient,
        orgState.id,
        'user-old-owner',
        'user-new-owner'
      );

      assert.strictEqual(result.owner_id, 'user-new-owner');
      assert.ok(executedQueries.some((q) => q.includes('FOR UPDATE')), 'Must lock organization row with FOR UPDATE');
      assert.ok(executedQueries.some((q) => q.includes("role = 'admin'")), 'Old owner must be demoted to admin');
      assert.ok(executedQueries.some((q) => q.includes("role = 'owner'")), 'Target member must be promoted to owner');
    });

    it('rejects ownership transfer if caller is not current owner', async () => {
      const mockClient: any = {
        query: async (text: string) => {
          if (text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: 'org-test',
                  owner_id: 'real-owner',
                  status: 'active',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      await assert.rejects(
        async () => {
          await organizationRepository.transferOwnershipLocked(
            mockClient,
            'org-test',
            'imposter-user',
            'new-owner'
          );
        },
        /CALLER_NOT_OWNER/
      );
    });

    it('rejects ownership transfer if target user is not an active member', async () => {
      const mockClient: any = {
        query: async (text: string) => {
          if (text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: 'org-test',
                  owner_id: 'real-owner',
                  status: 'active',
                },
              ],
            };
          }
          if (text.includes('FROM organization_members')) {
            return { rows: [] }; // Target not found in org
          }
          return { rows: [] };
        },
      };

      await assert.rejects(
        async () => {
          await organizationRepository.transferOwnershipLocked(
            mockClient,
            'org-test',
            'real-owner',
            'outsider-user'
          );
        },
        /TARGET_NOT_ACTIVE_MEMBER/
      );
    });
  });

  describe('Explicit Scoped Cascade Deprovisioning', () => {
    it('purges channel_members, team_members, and organization_members in sequence within org scope', async () => {
      const deletedQueries: { sql: string; params: any[] }[] = [];
      const mockClient: any = {
        query: async (sql: string, params: any[] = []) => {
          if (sql.includes('DELETE FROM')) {
            deletedQueries.push({ sql, params });
          }
          return { rowCount: 1 };
        },
      };

      await organizationRepository.deprovisionMemberCascade(mockClient, 'org-xyz', 'user-leaving');

      assert.strictEqual(deletedQueries.length, 3, 'Must execute exactly 3 cascade deletion statements');

      // 1. Channel members in org scope
      assert.ok(deletedQueries[0].sql.includes('DELETE FROM channel_members'));
      assert.ok(deletedQueries[0].sql.includes('WHERE t.organization_id = $2'));
      assert.deepStrictEqual(deletedQueries[0].params, ['user-leaving', 'org-xyz']);

      // 2. Team members in org scope
      assert.ok(deletedQueries[1].sql.includes('DELETE FROM team_members'));
      assert.ok(deletedQueries[1].sql.includes('WHERE t.organization_id = $2'));
      assert.deepStrictEqual(deletedQueries[1].params, ['user-leaving', 'org-xyz']);

      // 3. Org member
      assert.ok(deletedQueries[2].sql.includes('DELETE FROM organization_members'));
      assert.deepStrictEqual(deletedQueries[2].params, ['org-xyz', 'user-leaving']);
    });
  });

  describe('Role Management Boundaries', () => {
    it('prevents non-owners from granting owner role via addMember', async () => {
      const originalGetAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'admin',
          isOwner: false,
          isAdmin: true,
          isGuest: false,
        });

        await assert.rejects(
          async () => {
            await orgService.addMember('admin-id', 'org-id', {
              userId: 'new-user',
              role: 'owner' as any,
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

    it('prevents admins from promoting someone to admin', async () => {
      const originalGetAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'admin',
          isOwner: false,
          isAdmin: true,
          isGuest: false,
        });

        await assert.rejects(
          async () => {
            await orgService.addMember('admin-id', 'org-id', {
              userId: 'new-user',
              role: 'admin',
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
});
