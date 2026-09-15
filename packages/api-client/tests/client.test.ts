import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApiClient, type NativeSecureStorage } from '../src/index.js';

describe('ApiClient (Single-Flight Refresh & Token Management)', () => {
  it('stores access token in-memory and returns it via getAccessToken()', () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:4000',
      platform: 'web',
    });

    assert.strictEqual(client.getAccessToken(), null);
    client.setAccessToken('sample-access-token-123');
    assert.strictEqual(client.getAccessToken(), 'sample-access-token-123');
    client.setAccessToken(null);
    assert.strictEqual(client.getAccessToken(), null);
  });

  it('delegates to native storage on desktop/mobile platform', async () => {
    let storedToken: string | null = null;
    const mockStorage: NativeSecureStorage = {
      async getRefreshToken() {
        return storedToken;
      },
      async setRefreshToken(token: string) {
        storedToken = token;
      },
      async removeRefreshToken() {
        storedToken = null;
      },
    };

    const client = createApiClient({
      baseUrl: 'http://localhost:4000',
      platform: 'desktop',
      secureStorage: mockStorage,
    });

    // Mock fetch for login
    globalThis.fetch = (async (url: any, init: any) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            user: { id: 'u1', email: 'test@teamtrack.dev' },
            tokens: {
              accessToken: 'at-123',
              refreshToken: 'rt-456',
              expiresIn: 900,
              tokenType: 'Bearer',
            },
          },
          timestamp: new Date().toISOString(),
        }),
      } as any;
    }) as any;

    const response = await client.login({
      email: 'test@teamtrack.dev',
      password: 'Password123!',
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(client.getAccessToken(), 'at-123');
    assert.strictEqual(storedToken, 'rt-456', 'Refresh token must be saved to secureStorage');
  });

  it('coalesces concurrent requests during 401 into a single refresh flight', async () => {
    let refreshCallCount = 0;

    const client = createApiClient({
      baseUrl: 'http://localhost:4000',
      platform: 'web',
    });

    client.setAccessToken('expired-token');

    // Mock fetch
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/api/v1/auth/refresh')) {
        refreshCallCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              tokens: {
                accessToken: 'fresh-new-access-token',
                expiresIn: 900,
                tokenType: 'Bearer',
              },
            },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }

      // First call with expired token returns 401
      const authHeader = init?.headers?.['Authorization'] || init?.headers?.get?.('Authorization');
      if (authHeader === 'Bearer expired-token') {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }

      // Retry with refreshed token succeeds
      if (authHeader === 'Bearer fresh-new-access-token') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { result: 'ok' },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }

      return { ok: false, status: 500 } as any;
    }) as any;

    // Fire 3 simultaneous authenticated requests
    const [res1, res2, res3] = await Promise.all([
      client.fetchWithAuth('/api/v1/resource1'),
      client.fetchWithAuth('/api/v1/resource2'),
      client.fetchWithAuth('/api/v1/resource3'),
    ]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res3.success, true);

    // CRITICAL: Exactly ONE refresh request should have occurred!
    assert.strictEqual(refreshCallCount, 1, 'Only 1 refresh request should execute for concurrent 401s');
    assert.strictEqual(client.getAccessToken(), 'fresh-new-access-token');
  });

  it('clears auth and notifies onAuthFailure when refresh fails', async () => {
    let authFailureCalled = false;

    const client = createApiClient({
      baseUrl: 'http://localhost:4000',
      platform: 'web',
      onAuthFailure: () => {
        authFailureCalled = true;
      },
    });

    client.setAccessToken('invalid-token');

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: { code: 'SESSION_REVOKED', message: 'Session revoked' },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }

      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Unauthorized' },
          timestamp: new Date().toISOString(),
        }),
      } as any;
    }) as any;

    const res = await client.fetchWithAuth('/api/v1/resource');
    assert.strictEqual(res.success, false);
    assert.strictEqual(authFailureCalled, true, 'onAuthFailure must be triggered');
    assert.strictEqual(client.getAccessToken(), null, 'Access token must be cleared');
  });

  describe('Phase 6: Messaging, Conversations & WS Ticket Client Methods', () => {
    it('requests a single-use WebSocket ticket without exposing token in URL', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:4000' });
      client.setAccessToken('valid-access-token');

      let capturedUrl = '';
      let capturedMethod = '';

      globalThis.fetch = (async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedMethod = init?.method;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              ticket: 'sample-ws-ticket-32-bytes',
              expiresAt: new Date(Date.now() + 30000).toISOString(),
              expiresInSeconds: 30,
            },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }) as any;

      const res = await client.requestWsTicket();
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.ticket, 'sample-ws-ticket-32-bytes');
      assert.strictEqual(capturedMethod, 'POST');
      assert(capturedUrl.endsWith('/api/v1/auth/ws-ticket'));
      assert(!capturedUrl.includes('token='), 'No token in URL');
    });

    it('sends channel message with content and idempotencyKey', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:4000' });
      client.setAccessToken('valid-access-token');

      let capturedBody: any = null;

      globalThis.fetch = (async (url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              message: {
                id: 'msg-1',
                channelId: 'chan-1',
                content: 'Hello World',
                idempotencyKey: 'idem-1',
              },
            },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }) as any;

      const res = await client.sendChannelMessage('chan-1', {
        content: 'Hello World',
        idempotencyKey: 'idem-1',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.message.content, 'Hello World');
      assert.strictEqual(capturedBody.idempotencyKey, 'idem-1');
    });

    it('syncs channel delta with since timestamp parameter', async () => {
      const client = createApiClient({ baseUrl: 'http://localhost:4000' });
      client.setAccessToken('valid-access-token');

      let capturedUrl = '';

      globalThis.fetch = (async (url: any) => {
        capturedUrl = String(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              channelId: 'chan-1',
              syncedAt: new Date().toISOString(),
              messages: [],
              deletedMessageIds: [],
              reactions: [],
              readState: null,
              unreadCount: 0,
            },
            timestamp: new Date().toISOString(),
          }),
        } as any;
      }) as any;

      const since = '2026-09-12T00:00:00.000Z';
      const res = await client.syncChannel('chan-1', since);

      assert.strictEqual(res.success, true);
      assert(capturedUrl.includes('/api/v1/channels/chan-1/sync?since='));
    });
  });
});
