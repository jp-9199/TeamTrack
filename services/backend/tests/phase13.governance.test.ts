import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { governanceService, GovernanceServiceError } from '../src/modules/organizations/governance.service.js';
import { governanceRepository, type DbOrganizationGovernanceSettings } from '../src/db/repositories/governance.repository.js';
import { organizationService, ServiceError } from '../src/modules/organizations/organization.service.js';
import { organizationRepository } from '../src/db/repositories/organization.repository.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { aiService, AIServiceError } from '../src/modules/ai/ai.service.js';
import { aiConversationRepository, type DbAIActionProposal, type DbAIConversation } from '../src/db/repositories/aiConversation.repository.js';
import { notificationDeliveryPolicy } from '../src/modules/notifications/notification-delivery-policy.js';
import { notificationPreferencesRepository } from '../src/db/repositories/notification-preferences.repository.js';
import { auditLogRepository } from '../src/db/repositories/auditLog.repository.js';
import { pool } from '../src/db/pool.js';

describe('Phase 13: Governance Policies & Real Enforcement', () => {
  let memoryGovernance: Map<string, DbOrganizationGovernanceSettings>;
  let memoryProposals: Map<string, DbAIActionProposal>;
  let memoryConversations: Map<string, DbAIConversation>;
  let memoryUsers: Map<string, any>;
  let memoryMembers: Map<string, any>;

  const orgId = 'org-gov-test';

  beforeEach(() => {
    memoryGovernance = new Map();
    memoryProposals = new Map();
    memoryConversations = new Map();
    memoryUsers = new Map();
    memoryMembers = new Map();

    const defaultSettings: DbOrganizationGovernanceSettings = {
      organization_id: orgId,
      ai_assistant_enabled: true,
      allow_guest_invites: true,
      default_notification_behavior: 'all',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };
    memoryGovernance.set(orgId, { ...defaultSettings });

    // Users
    memoryUsers.set('user-admin', { id: 'user-admin', email: 'admin@acme.com', display_name: 'Admin User' });
    memoryUsers.set('user-member', { id: 'user-member', email: 'member@acme.com', display_name: 'Member User' });
    memoryUsers.set('user-guest-target', { id: 'user-guest-target', email: 'guest@acme.com', display_name: 'Guest Target' });

    // Members
    memoryMembers.set('user-admin', {
      id: 'om-admin',
      organization_id: orgId,
      user_id: 'user-admin',
      role: 'admin',
      status: 'active',
    });
    memoryMembers.set('user-member', {
      id: 'om-member',
      organization_id: orgId,
      user_id: 'user-member',
      role: 'member',
      status: 'active',
    });

    // Governance repo mock
    governanceRepository.getSettings = async (targetOrgId: string) => {
      let s = memoryGovernance.get(targetOrgId);
      if (!s) {
        s = {
          organization_id: targetOrgId,
          ai_assistant_enabled: true,
          allow_guest_invites: true,
          default_notification_behavior: 'all',
          created_at: new Date(),
          updated_at: new Date(),
        };
        memoryGovernance.set(targetOrgId, s);
      }
      return { ...s };
    };

    governanceRepository.updateSettings = async (targetOrgId: string, updates: any) => {
      let s = memoryGovernance.get(targetOrgId);
      if (!s) {
        s = {
          organization_id: targetOrgId,
          ai_assistant_enabled: true,
          allow_guest_invites: true,
          default_notification_behavior: 'all',
          created_at: new Date(),
          updated_at: new Date(),
        };
      }
      if (updates.aiAssistantEnabled !== undefined) s.ai_assistant_enabled = updates.aiAssistantEnabled;
      if (updates.allowGuestInvites !== undefined) s.allow_guest_invites = updates.allowGuestInvites;
      if (updates.defaultNotificationBehavior !== undefined) s.default_notification_behavior = updates.defaultNotificationBehavior;
      s.updated_at = new Date();
      memoryGovernance.set(targetOrgId, s);
      return { ...s };
    };

    // Auth mock
    authorizationService.getOrganizationAuth = async (userId: string, targetOrgId: string) => {
      if (targetOrgId !== orgId) return { isMember: false, role: null, isOwner: false, isAdmin: false, isGuest: false };
      const m = memoryMembers.get(userId);
      if (!m || m.status === 'suspended') return { isMember: false, role: null, isOwner: false, isAdmin: false, isGuest: false };
      return {
        isMember: true,
        role: m.role,
        isOwner: m.role === 'owner',
        isAdmin: m.role === 'admin' || m.role === 'owner',
        isGuest: m.role === 'guest',
      };
    };

    // User repo mock
    userRepository.findById = async (userId: string) => {
      return memoryUsers.get(userId) || null;
    };

    // Org repo mock
    organizationRepository.findById = async (id: string) => {
      if (id === orgId) return { id: orgId, name: 'Acme', slug: 'acme', owner_id: 'user-owner', status: 'active' } as any;
      return null;
    };
    organizationRepository.getMember = async (targetOrgId: string, userId: string) => {
      if (targetOrgId !== orgId) return null;
      return memoryMembers.get(userId) || null;
    };
    organizationRepository.addMember = async (targetOrgId: string, userId: string, role: any) => {
      const newMember = {
        id: 'om-' + userId,
        organization_id: targetOrgId,
        user_id: userId,
        role,
        status: 'active',
        joined_at: new Date(),
        updated_at: new Date(),
      };
      memoryMembers.set(userId, newMember);
      return newMember as any;
    };

    // AI Proposal repo mock
    aiConversationRepository.findProposalById = async (actionId: string) => {
      return memoryProposals.get(actionId) || null;
    };
    aiConversationRepository.updateProposalStatus = async (actionId: string, status: any, errorReason?: string) => {
      const p = memoryProposals.get(actionId);
      if (p) {
        p.status = status;
        if (errorReason) p.error_reason = errorReason;
      }
      return p as any;
    };

    // Notification repo mock (no user preference override)
    notificationPreferencesRepository.getUserPreferences = async () => null;
    notificationPreferencesRepository.getGlobalPreferences = async () => null;
    notificationPreferencesRepository.getTypePreference = async () => null;
    notificationPreferencesRepository.getChannelMute = async () => null;

    // Audit log mock (prevent DB calls from addMember/service operations)
    auditLogRepository.logAudit = async () => {};

    // Map member helper mock
    organizationRepository.mapMember = (m: any) => ({
      id: m.id,
      organizationId: m.organization_id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      updatedAt: m.updated_at,
    });

    // Pool mock
    pool.connect = (async () => {
      return {
        query: async () => ({ rows: [] }),
        release: () => {},
      } as any;
    }) as any;
    pool.query = (async () => ({ rows: [] })) as any;

    organizationRepository.findForUser = async (userId: string) => {
      const m = memoryMembers.get(userId);
      if (m && m.status === 'active') {
        return [{ id: orgId, name: 'Acme', slug: 'acme', owner_id: 'user-owner', status: 'active' } as any];
      }
      return [];
    };
  });

  describe('1. AI Assistant Governance Enforcement & TOCTOU Protection', () => {
    it('blocks AI chat interaction when ai_assistant_enabled is false', async () => {
      // Disable AI for org
      memoryGovernance.get(orgId)!.ai_assistant_enabled = false;

      await assert.rejects(
        async () => {
          await aiService.handleUserMessage({
            userId: 'user-member',
            organizationId: orgId,
            message: 'Schedule a team meeting',
          });
        },
        (err: AIServiceError) => {
          assert.strictEqual(err.code, 'AI_ORGANIZATION_DISABLED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    it('re-evaluates governance policy on action confirmation and blocks execution if AI was disabled post-proposal (TOCTOU)', async () => {
      // 1. Proposal was initially created while AI was enabled
      const actionId = 'proposal-meeting-1';
      const proposal: DbAIActionProposal = {
        id: actionId,
        conversation_id: 'conv-1',
        user_id: 'user-member',
        organization_id: orgId,
        tool_name: 'calendar_create_event',
        action_type: 'calendar',
        payload: { title: 'Strategy Sync', startTime: new Date().toISOString() },
        status: 'pending',
        confirmation_token: 'valid-token-12345',
        token_expires_at: new Date(Date.now() + 600000),
        error_reason: null,
        created_at: new Date(),
        executed_at: null,
      };
      memoryProposals.set(actionId, proposal);

      // 2. Organization admin now disables AI assistant
      memoryGovernance.get(orgId)!.ai_assistant_enabled = false;

      // 3. User attempts to confirm the previously created proposal
      await assert.rejects(
        async () => {
          await aiService.confirmAction(
            'user-member',
            actionId,
            { confirmationToken: 'valid-token-12345' }
          );
        },
        (err: AIServiceError) => {
          assert.strictEqual(err.code, 'AI_ORGANIZATION_DISABLED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      // Proposal status must be marked failed
      const updated = memoryProposals.get(actionId);
      assert.strictEqual(updated?.status, 'failed');
      assert.ok(updated?.error_reason?.includes('AI_ORGANIZATION_DISABLED'));
    });
  });

  describe('2. Guest Invites Governance Enforcement', () => {
    it('allows adding guest members when allow_guest_invites is true', async () => {
      memoryGovernance.get(orgId)!.allow_guest_invites = true;

      const res = await organizationService.addMember(
        'user-admin',
        orgId,
        { userId: 'user-guest-target', role: 'guest' }
      );

      assert.strictEqual(res.role, 'guest');
      assert.strictEqual(memoryMembers.get('user-guest-target')?.role, 'guest');
    });

    it('blocks adding guest members when allow_guest_invites is false', async () => {
      memoryGovernance.get(orgId)!.allow_guest_invites = false;

      await assert.rejects(
        async () => {
          await organizationService.addMember(
            'user-admin',
            orgId,
            { userId: 'user-guest-target', role: 'guest' }
          );
        },
        (err: ServiceError) => {
          assert.strictEqual(err.code, 'GUEST_INVITES_DISABLED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      // Verify guest was not added
      assert.strictEqual(memoryMembers.has('user-guest-target'), false);
    });
  });

  describe('3. Default Notification Behavior Enforcement', () => {
    it('allows delivery when org default is "all" and user has no preference override', async () => {
      memoryGovernance.get(orgId)!.default_notification_behavior = 'all';

      const decision = await notificationDeliveryPolicy.evaluate({
        userId: 'user-member',
        organizationId: orgId,
        notificationType: 'system_alert',
        channelId: undefined,
      });

      assert.strictEqual(decision.shouldDeliver, true);
    });

    it('suppresses non-mention notifications when org default is "mentions_only"', async () => {
      memoryGovernance.get(orgId)!.default_notification_behavior = 'mentions_only';

      // System alert without direct mention
      const decision = await notificationDeliveryPolicy.evaluate({
        userId: 'user-member',
        organizationId: orgId,
        notificationType: 'system_alert',
        channelId: undefined,
      });

      assert.strictEqual(decision.shouldDeliver, false);
      assert.ok(decision.suppressionReasons.includes('SUPPRESSED_BY_ORG_DEFAULT_MENTIONS_ONLY'));
    });

    it('allows mention notifications when org default is "mentions_only"', async () => {
      memoryGovernance.get(orgId)!.default_notification_behavior = 'mentions_only';

      const decision = await notificationDeliveryPolicy.evaluate({
        userId: 'user-member',
        organizationId: orgId,
        notificationType: 'channel_mention',
        channelId: undefined,
      });

      assert.strictEqual(decision.shouldDeliver, true);
    });

    it('suppresses notifications when org default is "muted"', async () => {
      memoryGovernance.get(orgId)!.default_notification_behavior = 'muted';

      const decision = await notificationDeliveryPolicy.evaluate({
        userId: 'user-member',
        organizationId: orgId,
        notificationType: 'meeting_invite',
        channelId: undefined,
      });

      assert.strictEqual(decision.shouldDeliver, false);
      assert.ok(decision.suppressionReasons.includes('SUPPRESSED_BY_ORG_DEFAULT_MUTED'));
    });
  });

  describe('4. Deferred Features Rule Check', () => {
    it('verifies retention_days is deferred and not exposed on governance settings', async () => {
      const settings = await governanceService.getSettings('user-admin', orgId);
      assert.strictEqual((settings as any).retention_days, undefined);
      assert.strictEqual((settings as any).retentionDays, undefined);
    });
  });
});
