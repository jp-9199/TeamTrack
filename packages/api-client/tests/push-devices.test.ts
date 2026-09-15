import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';
import type { PushDevice, RegisterPushDeviceRequest } from '@teamtrack/shared-types';

describe('Phase 9D-B: ApiClient Push Device Methods', () => {
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
        json: async () => {
          if (status >= 200 && status < 300) {
            return {
              success: true,
              data: responseData,
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: false,
            error: responseData,
            timestamp: new Date().toISOString(),
          };
        },
      } as any;
    }) as any;
  }

  it('1. registerPushDevice sends POST to /api/v1/devices/push with request body', async () => {
    const mockDevice: PushDevice = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      platform: 'android',
      provider: 'fcm',
      tokenHash: 'sha256-hash-of-token',
      appVersion: '1.0.0',
      deviceName: 'Pixel 8',
      enabled: true,
      lastSeenAt: '2026-09-14T00:00:00.000Z',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    };

    setupMockFetch(mockDevice, 201);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'mobile' });
    client.setAccessToken('auth-token-123');

    const req: RegisterPushDeviceRequest = {
      platform: 'android',
      provider: 'fcm',
      pushToken: 'sample-fcm-token-1234567890',
      appVersion: '1.0.0',
      deviceName: 'Pixel 8',
    };

    const res = await client.registerPushDevice(req);
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/devices/push');
    assert.strictEqual(lastRequest?.body?.platform, 'android');
    assert.strictEqual(lastRequest?.body?.provider, 'fcm');
    assert.strictEqual(res.data?.id, mockDevice.id);
    assert.strictEqual(res.data?.tokenHash, mockDevice.tokenHash);
  });

  it('2. listPushDevices sends GET to /api/v1/devices/push', async () => {
    const mockDevices: PushDevice[] = [
      {
        id: 'device-1',
        userId: 'user-1',
        platform: 'ios',
        provider: 'apns',
        tokenHash: 'hash-1',
        appVersion: '2.0.0',
        deviceName: 'iPhone',
        enabled: true,
        lastSeenAt: '2026-09-14T00:00:00.000Z',
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      },
    ];

    setupMockFetch(mockDevices, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'mobile' });
    client.setAccessToken('auth-token-123');

    const res = await client.listPushDevices();
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/devices/push');
    assert.strictEqual(res.data?.length, 1);
  });

  it('3. deletePushDevice sends DELETE to /api/v1/devices/push/:deviceId', async () => {
    setupMockFetch(null, 204);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'mobile' });
    client.setAccessToken('auth-token-123');

    const res = await client.deletePushDevice('11111111-1111-4111-8111-111111111111');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/devices/push/11111111-1111-4111-8111-111111111111'
    );
  });

  it('4. handles server validation errors correctly', async () => {
    setupMockFetch(
      { code: 'VALIDATION_ERROR', message: 'Android devices must use the "fcm" provider' },
      400
    );

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'mobile' });
    client.setAccessToken('auth-token-123');

    const res = await client.registerPushDevice({
      platform: 'android',
      provider: 'apns', // Invalid combination
      pushToken: 'token-1234567890',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'VALIDATION_ERROR');
    assert.match(res.error?.message || '', /Android devices must use the "fcm" provider/);
  });
});
