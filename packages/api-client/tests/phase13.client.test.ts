import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';
import type {
  UserProfile,
  UserSecuritySummary,
  UserSessionItem,
  OrganizationGovernanceSettings,
  AuditLogPaginatedResponse,
  OrganizationMemberWithUser,
} from '@teamtrack/shared-types';

describe('Phase 13: ApiClient User Settings, Security, Governance & Administration Methods', () => {
  let originalFetch: typeof globalThis.fetch;
  let lastRequest: { url: string; method: string; body?: any; headers?: any } | null = null;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupMockFetch(responseData: any, status = 200) {
    globalThis.fetch = (async (url: any, init: any) => {
      lastRequest = {
        url: url.toString(),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
        headers: init?.headers,
      };

      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: status >= 200 && status < 300,
          data: status >= 200 && status < 300 ? responseData : undefined,
          error: status >= 400 ? responseData : undefined,
          timestamp: new Date().toISOString(),
        }),
      } as any;
    }) as any;
  }

  // 1. User Profile
  it('1. getUserProfile sends GET to /api/v1/users/me', async () => {
    const mockProfile: UserProfile = {
      id: 'usr-1',
      email: 'alice@example.com',
      displayName: 'Alice Engineer',
      avatarUrl: null,
      timezone: 'America/New_York',
      locale: 'en-US',
      jobTitle: 'Principal Architect',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch(mockProfile);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getUserProfile();
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, mockProfile);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me');
    assert.strictEqual(lastRequest?.method, 'GET');
  });

  it('2. updateUserProfile sends PATCH to /api/v1/users/me with payload', async () => {
    const mockProfile: UserProfile = {
      id: 'usr-1',
      email: 'alice@example.com',
      displayName: 'Alice E.',
      avatarUrl: null,
      timezone: 'Europe/London',
      locale: 'en-GB',
      jobTitle: 'Staff Engineer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch(mockProfile);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.updateUserProfile({
      displayName: 'Alice E.',
      timezone: 'Europe/London',
      locale: 'en-GB',
      jobTitle: 'Staff Engineer',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me');
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.deepStrictEqual(lastRequest?.body, {
      displayName: 'Alice E.',
      timezone: 'Europe/London',
      locale: 'en-GB',
      jobTitle: 'Staff Engineer',
    });
  });

  // 2. User Security
  it('3. getUserSecurity sends GET to /api/v1/users/me/security without exposing secrets', async () => {
    const mockSecurity: UserSecuritySummary = {
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      activeSessionCount: 3,
      activeDeviceCount: 1,
      status: 'active',
    };

    setupMockFetch(mockSecurity);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getUserSecurity();
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, mockSecurity);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me/security');
  });

  it('4. changePassword sends POST to /api/v1/users/me/password', async () => {
    setupMockFetch({ message: 'Password changed successfully' });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.changePassword({
      currentPassword: 'OldPassword123!',
      newPassword: 'NewSecurePassword456!',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me/password');
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.body.currentPassword, 'OldPassword123!');
  });

  // 3. User Sessions
  it('5. getUserSessions sends GET to /api/v1/users/me/sessions', async () => {
    const mockSessions: UserSessionItem[] = [
      {
        id: 'sess-1',
        userAgent: 'Mozilla/5.0 Chrome/120',
        ipAddress: '192.168.1.1',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        isCurrent: true,
      },
      {
        id: 'sess-2',
        userAgent: 'Mobile Safari',
        ipAddress: '10.0.0.1',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        lastActivityAt: null,
        isCurrent: false,
      },
    ];

    setupMockFetch({ sessions: mockSessions });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getUserSessions();
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me/sessions');
    assert.strictEqual(res.data?.sessions.length, 2);
  });

  it('6. revokeSession sends POST to /api/v1/users/me/sessions/:sessionId/revoke', async () => {
    setupMockFetch({ message: 'Session revoked successfully' });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.revokeSession('sess-2');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me/sessions/sess-2/revoke');
    assert.strictEqual(lastRequest?.method, 'POST');
  });

  it('7. revokeAllSessions sends POST to /api/v1/users/me/sessions/revoke-all with preserveCurrent', async () => {
    setupMockFetch({ message: 'All other sessions revoked successfully', revokedCount: 2 });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.revokeAllSessions(true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/users/me/sessions/revoke-all');
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.deepStrictEqual(lastRequest?.body, { preserveCurrent: true });
  });

  // 4. Organization Governance
  it('8. getOrganizationGovernance sends GET to /api/v1/organizations/:id/governance', async () => {
    const mockGov: OrganizationGovernanceSettings = {
      organizationId: 'org-1',
      aiAssistantEnabled: true,
      allowGuestInvites: false,
      defaultNotificationBehavior: 'mentions_only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch(mockGov);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getOrganizationGovernance('org-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/organizations/org-1/governance');
    assert.deepStrictEqual(res.data, mockGov);
  });

  it('9. updateOrganizationGovernance sends PATCH to /api/v1/organizations/:id/governance', async () => {
    const mockGov: OrganizationGovernanceSettings = {
      organizationId: 'org-1',
      aiAssistantEnabled: false,
      allowGuestInvites: true,
      defaultNotificationBehavior: 'all',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch(mockGov);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.updateOrganizationGovernance('org-1', {
      aiAssistantEnabled: false,
      allowGuestInvites: true,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/organizations/org-1/governance');
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.deepStrictEqual(lastRequest?.body, {
      aiAssistantEnabled: false,
      allowGuestInvites: true,
    });
  });

  // 5. Organization Audit Logs
  it('10. getOrganizationAuditLogs sends GET with query parameters', async () => {
    const mockAudit: AuditLogPaginatedResponse = {
      items: [
        {
          id: 'audit-1',
          organizationId: 'org-1',
          actorId: 'usr-1',
          action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
          entityType: 'organization_member',
          entityId: 'usr-2',
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent',
          metadata: { oldRole: 'member', newRole: 'admin' },
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: 'audit-1',
      hasMore: false,
    };

    setupMockFetch(mockAudit);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getOrganizationAuditLogs('org-1', {
      action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
      limit: 10,
      cursor: 'cur-123',
    });

    assert.strictEqual(res.success, true);
    assert.ok(lastRequest?.url.includes('/api/v1/organizations/org-1/audit-logs'));
    assert.ok(lastRequest?.url.includes('action=ORGANIZATION_MEMBER_ROLE_CHANGED'));
    assert.ok(lastRequest?.url.includes('limit=10'));
    assert.ok(lastRequest?.url.includes('cursor=cur-123'));
    assert.strictEqual(res.data?.items.length, 1);
  });

  // 6. Organization Member Management (Role, Suspend, Restore)
  it('11. updateOrganizationMember sends PATCH to /api/v1/organizations/:id/members/:userId', async () => {
    const mockMember: OrganizationMemberWithUser = {
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'usr-2',
      role: 'admin',
      status: 'active',
      joinedAt: new Date().toISOString(),
      user: {
        id: 'usr-2',
        email: 'bob@example.com',
        displayName: 'Bob Admin',
        avatarUrl: null,
      },
    };

    setupMockFetch({ member: mockMember });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.updateOrganizationMember('org-1', 'usr-2', {
      role: 'admin',
      status: 'active',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/organizations/org-1/members/usr-2');
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.deepStrictEqual(lastRequest?.body, { role: 'admin', status: 'active' });
  });

  it('12. suspendOrganizationMember sends PATCH with status: "suspended"', async () => {
    setupMockFetch({ member: { id: 'mem-1', status: 'suspended' } });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.suspendOrganizationMember('org-1', 'usr-2');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/organizations/org-1/members/usr-2');
    assert.deepStrictEqual(lastRequest?.body, { status: 'suspended' });
  });

  it('13. restoreOrganizationMember sends PATCH with status: "active"', async () => {
    setupMockFetch({ member: { id: 'mem-1', status: 'active' } });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.restoreOrganizationMember('org-1', 'usr-2');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/organizations/org-1/members/usr-2');
    assert.deepStrictEqual(lastRequest?.body, { status: 'active' });
  });

  it('14. handles 403 AI_ORGANIZATION_DISABLED error correctly', async () => {
    setupMockFetch({ code: 'AI_ORGANIZATION_DISABLED', message: 'AI is disabled for this organization' }, 403);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.sendAiChat({
      message: 'Hello',
      organizationId: 'org-1',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'AI_ORGANIZATION_DISABLED');
  });
});
