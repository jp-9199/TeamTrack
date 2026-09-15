import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';

describe('Phase 9D-A: ApiClient Notification Preferences & Channel Mute Methods', () => {
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

  it('1. getNotificationPreferences sends GET to /api/v1/notifications/preferences', async () => {
    setupMockFetch({
      realtimeEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      updatedAt: '2026-09-14T00:00:00.000Z',
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getNotificationPreferences();
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/preferences');
    assert.strictEqual(res.data?.pushEnabled, true);
  });

  it('2. updateNotificationPreferences sends PATCH to /api/v1/notifications/preferences with body', async () => {
    setupMockFetch({
      realtimeEnabled: true,
      pushEnabled: false,
      emailEnabled: true,
      updatedAt: '2026-09-14T00:01:00.000Z',
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.updateNotificationPreferences({ pushEnabled: false });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/preferences');
    assert.deepStrictEqual(lastRequest?.body, { pushEnabled: false });
  });

  it('3. getNotificationTypePreferences sends GET to /api/v1/notifications/preferences/types', async () => {
    setupMockFetch({ preferences: [] });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getNotificationTypePreferences();
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/preferences/types');
  });

  it('4. updateNotificationTypePreference sends PATCH to /api/v1/notifications/preferences/types/:type with body', async () => {
    setupMockFetch({
      notificationType: 'direct_message',
      realtimeEnabled: true,
      pushEnabled: false,
      emailEnabled: null,
      updatedAt: '2026-09-14T00:02:00.000Z',
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.updateNotificationTypePreference('direct_message', {
      pushEnabled: false,
      emailEnabled: null,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/notifications/preferences/types/direct_message'
    );
    assert.deepStrictEqual(lastRequest?.body, { pushEnabled: false, emailEnabled: null });
  });

  it('5. getChannelNotificationMute sends GET to /api/v1/channels/:channelId/notification-mute', async () => {
    setupMockFetch({
      channelId: 'chan-123',
      muted: true,
      mutedUntil: null,
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getChannelNotificationMute('chan-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/channels/chan-123/notification-mute'
    );
    assert.strictEqual(res.data?.muted, true);
  });

  it('6. muteChannel sends PUT to /api/v1/channels/:channelId/notification-mute with body', async () => {
    const futureDate = '2026-09-15T12:00:00.000Z';
    setupMockFetch({
      channelId: 'chan-123',
      muted: true,
      mutedUntil: futureDate,
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.muteChannel('chan-123', { mutedUntil: futureDate });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'PUT');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/channels/chan-123/notification-mute'
    );
    assert.deepStrictEqual(lastRequest?.body, { mutedUntil: futureDate });
  });

  it('7. unmuteChannel sends DELETE to /api/v1/channels/:channelId/notification-mute', async () => {
    setupMockFetch({
      channelId: 'chan-123',
      muted: false,
      mutedUntil: null,
    });

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.unmuteChannel('chan-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/channels/chan-123/notification-mute'
    );
    assert.strictEqual(res.data?.muted, false);
  });
});
