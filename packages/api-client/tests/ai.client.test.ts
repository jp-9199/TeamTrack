import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';
import type {
  AIResponse,
  AIConversation,
  AIMessage,
  AIActionProposal,
} from '@teamtrack/shared-types';

describe('Phase 12: ApiClient AI Assistant & AI Workspace Methods', () => {
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

  it('1. sendAiChat sends POST to /api/v1/ai/chat with request body', async () => {
    const mockResponse: AIResponse = {
      conversationId: 'conv-123',
      message: {
        id: 'msg-1',
        conversationId: 'conv-123',
        role: 'assistant',
        content: 'I have scheduled your meeting.',
        createdAt: new Date().toISOString(),
      },
      executionTimeMs: 120,
    };

    setupMockFetch(mockResponse);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.sendAiChat({
      message: 'Schedule meeting tomorrow at 3pm',
      conversationId: 'conv-123',
      organizationId: 'org-1',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.conversationId, 'conv-123');
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/chat');
    assert.strictEqual(lastRequest?.body.message, 'Schedule meeting tomorrow at 3pm');
    assert.strictEqual(lastRequest?.body.organizationId, 'org-1');
  });

  it('2. listAiConversations sends GET to /api/v1/ai/conversations with optional org filter', async () => {
    const mockConversations: AIConversation[] = [
      {
        id: 'conv-1',
        userId: 'user-1',
        organizationId: 'org-1',
        title: 'Project Roadmap discussion',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    setupMockFetch({ conversations: mockConversations });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.listAiConversations('org-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.conversations.length, 1);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/conversations?organizationId=org-1');
  });

  it('3. getAiConversation sends GET to /api/v1/ai/conversations/:id', async () => {
    const mockData = {
      conversation: {
        id: 'conv-123',
        userId: 'user-1',
        organizationId: 'org-1',
        title: 'Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-123',
          role: 'user' as const,
          content: 'Hello',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    setupMockFetch(mockData);
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.getAiConversation('conv-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.conversation.id, 'conv-123');
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/conversations/conv-123');
  });

  it('4. deleteAiConversation sends DELETE to /api/v1/ai/conversations/:id', async () => {
    setupMockFetch({ message: 'Deleted' });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.deleteAiConversation('conv-123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/conversations/conv-123');
  });

  it('5. confirmAiAction sends POST to /api/v1/ai/actions/:id/confirm with confirmationToken', async () => {
    const mockProposal: AIActionProposal = {
      id: 'act-999',
      conversationId: 'conv-123',
      userId: 'user-1',
      organizationId: 'org-1',
      toolName: 'create_meeting',
      toolArguments: { title: 'Project Review' },
      status: 'EXECUTED',
      summary: 'Action proposal for create_meeting',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch({ action: mockProposal, result: { meetingId: 'meet-1' } });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.confirmAiAction('act-999', { confirmationToken: 'secret-token-abc' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.action.status, 'EXECUTED');
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/actions/act-999/confirm');
    assert.strictEqual(lastRequest?.body.confirmationToken, 'secret-token-abc');
  });

  it('6. cancelAiAction sends POST to /api/v1/ai/actions/:id/cancel', async () => {
    const mockProposal: AIActionProposal = {
      id: 'act-999',
      conversationId: 'conv-123',
      userId: 'user-1',
      organizationId: 'org-1',
      toolName: 'create_meeting',
      toolArguments: { title: 'Project Review' },
      status: 'CANCELLED',
      summary: 'Action proposal for create_meeting',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch({ action: mockProposal });
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    client.setAccessToken('test-token');

    const res = await client.cancelAiAction('act-999');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.action.status, 'CANCELLED');
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:3000/api/v1/ai/actions/act-999/cancel');
  });
});
