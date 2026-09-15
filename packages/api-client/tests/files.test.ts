import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';

describe('Phase 8C: ApiClient File Management Methods', () => {
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

  it('createUploadIntent sends POST to canonical organization files route', async () => {
    setupMockFetch({
      fileId: 'file-123',
      uploadUrl: 'https://s3.example.com/upload',
      expiresAt: '2026-09-12T18:00:00Z',
    }, 201);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.createUploadIntent('org-456', {
      fileName: 'specs.pdf',
      fileSizeBytes: 5000,
      mimeType: 'application/pdf',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/organizations/org-456/files/upload-intent');
    assert.strictEqual(lastRequest?.body.fileName, 'specs.pdf');
    assert.strictEqual(lastRequest?.body.fileSizeBytes, 5000);
  });

  it('finalizeFile sends POST to /api/v1/files/:fileId/finalize', async () => {
    setupMockFetch({
      file: { id: 'file-123', status: 'ready', fileName: 'specs.pdf' },
    }, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.finalizeFile('file-123');

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/files/file-123/finalize');
  });

  it('getFile sends GET to /api/v1/files/:fileId', async () => {
    setupMockFetch({
      file: { id: 'file-123', status: 'ready', fileName: 'specs.pdf' },
    }, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.getFile('file-123');

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/files/file-123');
  });

  it('getFileDownloadUrl sends GET to /api/v1/files/:fileId/download-url', async () => {
    setupMockFetch({
      downloadUrl: 'https://s3.example.com/download-temp',
    }, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.getFileDownloadUrl('file-123');

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/files/file-123/download-url');
  });

  it('deleteFile sends DELETE to /api/v1/files/:fileId', async () => {
    setupMockFetch({
      message: 'File deleted successfully',
    }, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.deleteFile('file-123');

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/files/file-123');
  });

  it('listOrganizationFiles sends GET with query parameters to /api/v1/organizations/:orgId/files', async () => {
    setupMockFetch({
      items: [{ id: 'file-1' }, { id: 'file-2' }],
      nextCursor: 'cursor-token',
      hasMore: true,
    }, 200);

    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('valid-token');

    const res = await client.listOrganizationFiles('org-456', { cursor: 'prev-cursor', limit: 25 });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/organizations/org-456/files?cursor=prev-cursor&limit=25');
  });
});
