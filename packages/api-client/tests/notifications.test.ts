import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';

describe('Phase 9B: ApiClient Notification Management Methods', () => {
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
          data: responseData,
          timestamp: new Date().toISOString(),
        }),
      } as any;
    }) as any;
  }

  it('1. listNotifications sends GET to /api/v1/notifications with query parameters', async () => {
    setupMockFetch({ items: [], nextCursor: null, hasMore: false });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.listNotifications({ cursor: 'cur-123', limit: 25 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications?cursor=cur-123&limit=25');
  });

  it('2. listUnreadNotifications sends GET to /api/v1/notifications/unread', async () => {
    setupMockFetch({ items: [], nextCursor: null, hasMore: false });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.listUnreadNotifications({ limit: 10 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/unread?limit=10');
  });

  it('3. getUnreadNotificationCount sends GET to /api/v1/notifications/unread-count with optional org', async () => {
    setupMockFetch({ unreadCount: 5 });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.getUnreadNotificationCount('org-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/unread-count?organizationId=org-123');
    assert.strictEqual(res.data?.unreadCount, 5);
  });

  it('4. getNotification sends GET to /api/v1/notifications/:id', async () => {
    setupMockFetch({ notification: { id: 'notif-123' } });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.getNotification('notif-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-123');
  });

  it('5. markNotificationRead sends POST to /api/v1/notifications/:id/read', async () => {
    setupMockFetch({ notification: { id: 'notif-123', readAt: '2026-09-13T12:00:00Z' } });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.markNotificationRead('notif-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-123/read');
  });

  it('6. markNotificationUnread sends POST to /api/v1/notifications/:id/unread', async () => {
    setupMockFetch({ notification: { id: 'notif-123', readAt: null } });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.markNotificationUnread('notif-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-123/unread');
  });

  it('7. markAllNotificationsRead sends POST to /api/v1/notifications/read-all with body', async () => {
    setupMockFetch({ message: 'All notifications marked as read', updatedCount: 3 });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.markAllNotificationsRead('org-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/read-all');
    assert.strictEqual(lastRequest?.body?.organizationId, 'org-123');
    assert.strictEqual(res.data?.updatedCount, 3);
  });

  it('8. deleteNotification sends DELETE to /api/v1/notifications/:id', async () => {
    setupMockFetch({ message: 'Notification deleted successfully' });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.deleteNotification('notif-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-123');
  });

  it('confirms createNotification is NOT exposed on ApiClient', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:4000' });
    assert.strictEqual((client as any).createNotification, undefined, 'Client must NOT expose createNotification');
  });
});
