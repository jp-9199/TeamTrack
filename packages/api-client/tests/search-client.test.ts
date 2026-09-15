import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';
import type { SearchResponseData, SearchResultItem } from '@teamtrack/shared-types';

describe('Phase 9E: ApiClient Search & Discovery Methods', () => {
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

  it('1. search sends GET to /api/v1/search with query string and options', async () => {
    const mockData: SearchResponseData = {
      items: [
        {
          id: 'item-1',
          type: 'message',
          title: 'Alice',
          subtitle: '#general',
          snippet: 'Hello team',
          relevance: 100,
          resourceType: 'message',
          resourceId: 'item-1',
        },
      ],
      nextCursor: 'cur-next',
      hasMore: true,
      totalMatches: 1,
    };

    setupMockFetch(mockData);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.search({
      q: 'Hello',
      type: 'messages',
      limit: 15,
      cursor: 'cur-prev',
      organizationId: 'org-111',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/search?q=Hello&type=messages&limit=15&cursor=cur-prev&organizationId=org-111'
    );
    assert.strictEqual(res.data.items.length, 1);
    assert.strictEqual(res.data.hasMore, true);
  });

  it('2. getSearchSuggestions sends GET to /api/v1/search/suggestions with query', async () => {
    const mockItems: SearchResultItem[] = [
      {
        id: 'user-1',
        type: 'user',
        title: 'Alice Wonder',
        relevance: 80,
        resourceType: 'user',
        resourceId: 'user-1',
      },
    ];

    setupMockFetch({ items: mockItems });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getSearchSuggestions('Ali', 'org-111');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/search/suggestions?q=Ali&organizationId=org-111'
    );
    assert.strictEqual(res.data.items.length, 1);
  });
});
