import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OrganizationService, ServiceError } from '../src/modules/organizations/organization.service.js';
import { organizationRepository, type DbOrganization, type DbOrganizationMemberWithUser } from '../src/db/repositories/organization.repository.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { auditLogRepository } from '../src/db/repositories/auditLog.repository.js';
import { subscriptionManager } from '../src/realtime/subscription.manager.js';
import { pool } from '../src/db/pool.js';

describe('Phase 13: Organization Administration, Member Roles & Sole Owner Invariant', () => {
  const orgService = new OrganizationService();

  let memoryOrg: DbOrganization;
  let memoryMembers: Map<string, DbOrganizationMemberWithUser>;
  let memoryAuditLogs: any[];
  let invalidatedSubscriptions: Array<{ userId: string; orgId: string }>;

  beforeEach(() => {
    memoryOrg = {
      id: 'org-test-1',
      name: 'Acme Technologies',
      slug: 'acme-tech',
      owner_id: 'user-owner',
      status: 'active',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      deleted_at: null,
    };

    memoryMembers = new Map();
    memoryAuditLogs = [];
    invalidatedSubscriptions = [];

    const ownerMember: DbOrganizationMemberWithUser = {
      id: 'om-owner',
      organization_id: 'org-test-1',
      user_id: 'user-owner',
      role: 'owner',
      status: 'active',
      joined_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      email: 'owner@acme.com',
      display_name: 'The Owner',
      avatar_url: null,
    };

    const adminMember: DbOrganizationMemberWithUser = {
      id: 'om-admin',
      organization_id: 'org-test-1',
      user_id: 'user-admin',
      role: 'admin',
      status: 'active',
      joined_at: new Date('2026-01-02'),
      updated_at: new Date('2026-01-02'),
      email: 'admin@acme.com',
      display_name: 'Admin Bob',
      avatar_url: null,
    };

    const admin2Member: DbOrganizationMemberWithUser = {
      id: 'om-admin2',
      organization_id: 'org-test-1',
      user_id: 'user-admin2',
      role: 'admin',
      status: 'active',
      joined_at: new Date('2026-01-03'),
      updated_at: new Date('2026-01-03'),
      email: 'admin2@acme.com',
      display_name: 'Admin Carol',
      avatar_url: null,
    };

    const normalMember: DbOrganizationMemberWithUser = {
      id: 'om-member',
      organization_id: 'org-test-1',
      user_id: 'user-member',
      role: 'member',
      status: 'active',
      joined_at: new Date('2026-01-04'),
      updated_at: new Date('2026-01-04'),
      email: 'member@acme.com',
      display_name: 'Member Dave',
      avatar_url: null,
    };

    const guestMember: DbOrganizationMemberWithUser = {
      id: 'om-guest',
      organization_id: 'org-test-1',
      user_id: 'user-guest',
      role: 'guest',
      status: 'active',
      joined_at: new Date('2026-01-05'),
      updated_at: new Date('2026-01-05'),
      email: 'guest@acme.com',
      display_name: 'Guest Eve',
      avatar_url: null,
    };

    memoryMembers.set(ownerMember.user_id, ownerMember);
    memoryMembers.set(adminMember.user_id, adminMember);
    memoryMembers.set(admin2Member.user_id, admin2Member);
    memoryMembers.set(normalMember.user_id, normalMember);
    memoryMembers.set(guestMember.user_id, guestMember);

    // Repository mocks
    organizationRepository.findById = async (id: string) => {
      if (id === memoryOrg.id && !memoryOrg.deleted_at) return memoryOrg;
      return null;
    };

    organizationRepository.getMember = async (orgId: string, userId: string) => {
      if (orgId !== memoryOrg.id) return null;
      const m = memoryMembers.get(userId);
      return m ? { ...m } : null;
    };

    organizationRepository.listMembers = async (orgId: string, options: any = {}) => {
      if (orgId !== memoryOrg.id) return [];
      return Array.from(memoryMembers.values()).filter((m) => {
        if (options.includeSuspended) return true;
        return m.status === 'active';
      });
    };

    organizationRepository.updateMemberRoleAndStatus = async (orgId: string, userId: string, updates: any) => {
      const m = memoryMembers.get(userId);
      if (!m || m.organization_id !== orgId) return null;
      if (updates.role !== undefined) m.role = updates.role;
      if (updates.status !== undefined) m.status = updates.status;
      m.updated_at = new Date();
      return m;
    };

    organizationRepository.deprovisionMemberCascade = async (_client: any, orgId: string, userId: string) => {
      memoryMembers.delete(userId);
    };

    organizationRepository.transferOwnershipLocked = async (
      _client: any,
      orgId: string,
      oldOwnerId: string,
      newOwnerId: string
    ) => {
      const oldOwner = memoryMembers.get(oldOwnerId);
      const newOwner = memoryMembers.get(newOwnerId);
      if (!oldOwner || oldOwner.role !== 'owner') {
        throw new Error('CALLER_NOT_OWNER');
      }
      if (!newOwner || newOwner.status !== 'active') {
        throw new Error('TARGET_NOT_ACTIVE_MEMBER');
      }
      oldOwner.role = 'admin';
      newOwner.role = 'owner';
      memoryOrg.owner_id = newOwnerId;
      return memoryOrg;
    };

    userRepository.findById = async (userId: string) => {
      const m = memoryMembers.get(userId);
      if (!m) return null;
      return {
        id: m.user_id,
        email: m.email,
        display_name: m.display_name,
        full_name: m.display_name,
        avatar_url: m.avatar_url,
        status: m.status as any,
        created_at: m.joined_at,
        updated_at: m.updated_at,
        deleted_at: null,
      };
    };

    // Pool transaction mock
    pool.connect = (async () => {
      return {
        query: async () => ({ rows: [] }),
        release: () => {},
      } as any;
    }) as any;

    // Authorization mock reflecting current memory
    authorizationService.getOrganizationAuth = async (userId: string, orgId: string) => {
      if (orgId !== memoryOrg.id) {
        return { isMember: false, role: null, isOwner: false, isAdmin: false, isGuest: false };
      }
      const m = memoryMembers.get(userId);
      if (!m || m.status === 'suspended') {
        return { isMember: false, role: null, isOwner: false, isAdmin: false, isGuest: false };
      }
      return {
        isMember: true,
        role: m.role,
        isOwner: m.role === 'owner',
        isAdmin: m.role === 'owner' || m.role === 'admin',
        isGuest: m.role === 'guest',
      };
    };

    // Audit log mock
    auditLogRepository.logAudit = async (data: any) => {
      memoryAuditLogs.push(data);
      return { id: 'audit-' + memoryAuditLogs.length, ...data, created_at: new Date() };
    };

    // Subscription manager mock
    subscriptionManager.invalidateUserOrganizationSubscriptions = (userId: string, orgId: string) => {
      invalidatedSubscriptions.push({ userId, orgId });
    };
  });

  describe('1. Sole Owner Invariant Protection', () => {
    it('blocks the owner from leaving/removing themselves without prior transfer', async () => {
      await assert.rejects(
        async () => {
          await orgService.removeMember('user-owner', 'org-test-1', 'user-owner');
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'OWNER_CANNOT_LEAVE');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    it('blocks an admin from removing or modifying the owner', async () => {
      await assert.rejects(
        async () => {
          await orgService.removeMember('user-admin', 'org-test-1', 'user-owner');
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'OWNER_CANNOT_LEAVE');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await orgService.updateMember('user-admin', 'org-test-1', 'user-owner', { role: 'member' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_MODIFY_OWNER');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    it('blocks owner from self-demotion without ownership transfer', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-owner', 'org-test-1', 'user-owner', { role: 'admin' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_MODIFY_OWNER');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  describe('2. Admin Hierarchy & Privilege Escalation Defenses', () => {
    it('blocks admin from modifying or demoting another admin', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-admin', 'org-test-1', 'user-admin2', { role: 'member' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_MODIFY_ADMIN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('blocks admin from promoting any member to Admin', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-admin', 'org-test-1', 'user-member', { role: 'admin' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_PROMOTE_TO_ADMIN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('blocks admin from promoting any member to Owner', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-admin', 'org-test-1', 'user-member', { role: 'owner' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_PROMOTE_TO_OWNER');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('blocks normal Member and Guest from modifying any member roles or status', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-member', 'org-test-1', 'user-guest', { role: 'member' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await orgService.updateMember('user-guest', 'org-test-1', 'user-member', { status: 'suspended' });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  describe('3. Member Suspension & Realtime Invalidation', () => {
    it('allows Admin to suspend a normal member, invalidating their realtime subscriptions', async () => {
      const res = await orgService.updateMember('user-admin', 'org-test-1', 'user-member', {
        status: 'suspended',
      });

      assert.strictEqual(res.status, 'suspended');

      // Check subscription invalidation
      const inv = invalidatedSubscriptions.find(
        (i) => i.userId === 'user-member' && i.orgId === 'org-test-1'
      );
      assert.ok(inv, 'Realtime subscriptions must be invalidated upon member suspension');

      // Check audit log
      const audit = memoryAuditLogs.find((a) => a.action === 'MEMBER_SUSPENDED');
      assert.ok(audit);
      assert.strictEqual(audit.metadata.targetUserId, 'user-member');
    });

    it('blocks Admin from suspending another Admin or Owner', async () => {
      await assert.rejects(
        async () => {
          await orgService.updateMember('user-admin', 'org-test-1', 'user-admin2', {
            status: 'suspended',
          });
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'CANNOT_MODIFY_ADMIN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('allows restoring a suspended member to active status', async () => {
      // First suspend
      memoryMembers.get('user-member')!.status = 'suspended';

      const res = await orgService.updateMember('user-admin', 'org-test-1', 'user-member', {
        status: 'active',
      });

      assert.strictEqual(res.status, 'active');
      const audit = memoryAuditLogs.find(
        (a) => a.action === 'MEMBER_RESTORED'
      );
      assert.ok(audit);
    });
  });

  describe('4. Atomic Ownership Transfer', () => {
    it('executes atomic ownership transfer from current owner to active member', async () => {
      const updatedOrg = await orgService.transferOwnership('user-owner', 'org-test-1', 'user-admin');

      assert.strictEqual(updatedOrg.ownerId, 'user-admin');

      // Old owner must now be an admin
      const oldOwner = memoryMembers.get('user-owner');
      assert.strictEqual(oldOwner?.role, 'admin');

      // New owner must be owner
      const newOwner = memoryMembers.get('user-admin');
      assert.strictEqual(newOwner?.role, 'owner');

      // Audit log must be present
      const audit = memoryAuditLogs.find((a) => a.action === 'OWNERSHIP_TRANSFERRED');
      assert.ok(audit);
      assert.strictEqual(audit.metadata.oldOwnerId, 'user-owner');
      assert.strictEqual(audit.metadata.newOwnerId, 'user-admin');
    });

    it('blocks non-owner from transferring ownership', async () => {
      await assert.rejects(
        async () => {
          await orgService.transferOwnership('user-admin', 'org-test-1', 'user-member');
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('blocks ownership transfer to a suspended member', async () => {
      memoryMembers.get('user-member')!.status = 'suspended';

      await assert.rejects(
        async () => {
          await orgService.transferOwnership('user-owner', 'org-test-1', 'user-member');
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'USER_NOT_IN_ORG');
          return true;
        }
      );
    });
  });
});
