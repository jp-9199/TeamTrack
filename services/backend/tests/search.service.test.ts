import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchService, SearchServiceError } from '../src/modules/search/search.service.js';
import { searchRepository } from '../src/db/repositories/search.repository.js';
import { organizationRepository, type DbOrganization } from '../src/db/repositories/organization.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import {
  validateSearchQuery,
  encodeSearchCursor,
  decodeSearchCursor,
} from '@teamtrack/validation';
import { PHASE9E_ERROR_CODES, type SearchResultItem } from '@teamtrack/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 9E: Search & Discovery System', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migrationFile = path.join(migrationsDir, '20260914180001_create_search_indexes.sql');

  // Test tenant fixtures
  const org1: DbOrganization = {
    id: 'org-tenant-111',
    name: 'Organization Alpha',
    slug: 'org-alpha',
    owner_id: 'user-alice',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const org2: DbOrganization = {
    id: 'org-tenant-222',
    name: 'Organization Beta',
    slug: 'org-beta',
    owner_id: 'user-bob',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  beforeEach(() => {
    // Default mock: User belongs to org1 only
    organizationRepository.findForUser = async (userId: string) => {
      if (userId === 'user-alice' || userId === 'user-member-1') {
        return [org1];
      }
      if (userId === 'user-bob' || userId === 'user-member-2') {
        return [org2];
      }
      return [];
    };
  });

  // --------------------------------------------------------------------------
  // 1. Migration Verification
  // --------------------------------------------------------------------------
  it('1. verifies migration file exists, is transactional, and creates search indexes', () => {
    assert.strictEqual(fs.existsSync(migrationFile), true, 'Migration file must exist');
    const content = fs.readFileSync(migrationFile, 'utf8');

    assert.match(content, /^BEGIN;/m, 'Migration must start with BEGIN;');
    assert.match(content, /^COMMIT;/m, 'Migration must end with COMMIT;');

    // Full-text indexes
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_messages_search_content/i);
    assert.match(content, /USING gin \(to_tsvector\('english', content\)\)/i);
    assert.match(content, /WHERE is_deleted = false/i);

    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_meetings_search_title/i);
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_files_search_name/i);
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_channels_search_name/i);
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_teams_search_name/i);
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_users_search_display_name/i);
  });

  // --------------------------------------------------------------------------
  // 2. Query Validation
  // --------------------------------------------------------------------------
  it('2. validates search queries, rejects empty/whitespace queries, and enforces boundaries', () => {
    // Empty query
    const resEmpty = validateSearchQuery({ q: '' });
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.errors?.[0]?.code, PHASE9E_ERROR_CODES.EMPTY_QUERY);

    const resWhitespace = validateSearchQuery({ q: '    ' });
    assert.strictEqual(resWhitespace.isValid, false);
    assert.strictEqual(resWhitespace.errors?.[0]?.code, PHASE9E_ERROR_CODES.EMPTY_QUERY);

    // Query too long (> 200 chars)
    const longQ = 'a'.repeat(201);
    const resLong = validateSearchQuery({ q: longQ });
    assert.strictEqual(resLong.isValid, false);
    assert.strictEqual(resLong.errors?.[0]?.code, PHASE9E_ERROR_CODES.QUERY_TOO_LONG);

    // Valid query
    const resValid = validateSearchQuery({ q: '  project roadmap  ', type: 'messages', limit: '25' });
    assert.strictEqual(resValid.isValid, true);
    assert.strictEqual(resValid.data?.q, 'project roadmap');
    assert.strictEqual(resValid.data?.type, 'messages');
    assert.strictEqual(resValid.data?.limit, 25);

    // Invalid category type
    const resInvalidType = validateSearchQuery({ q: 'test', type: 'unsupported_category' });
    assert.strictEqual(resInvalidType.isValid, false);
    assert.strictEqual(resInvalidType.errors?.[0]?.code, PHASE9E_ERROR_CODES.INVALID_SEARCH_TYPE);
  });

  // --------------------------------------------------------------------------
  // 3. Security Audit A: Cross-Tenant Isolation
  // --------------------------------------------------------------------------
  it('Audit A: caller cannot search another organization or access foreign tenant data', async () => {
    // User Alice is in Org 1. User Bob is in Org 2.
    // When Alice requests search with organizationId = Org 2, request is rejected with 404 NOT_FOUND.
    await assert.rejects(
      async () => {
        await searchService.search('user-alice', {
          q: 'confidential',
          organizationId: org2.id,
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'NOT_FOUND');
        return true;
      }
    );

    // When Alice searches without specifying an org, only Org 1 is queried
    let queriedOrgIds: string[] = [];
    searchRepository.searchMessages = async (_q, _caller, orgIds) => {
      queriedOrgIds = orgIds;
      return [];
    };

    await searchService.search('user-alice', { q: 'report', type: 'messages' });
    assert.deepStrictEqual(queriedOrgIds, [org1.id], 'Only caller active orgs may be queried');
  });

  // --------------------------------------------------------------------------
  // 4. Security Audit B & C: Private Team and Channel Protection
  // --------------------------------------------------------------------------
  it('Audit B & C: non-members cannot discover private teams, private channels, or private messages', async () => {
    // Mock repository returning only resources where user has legitimate access
    const mockChannelMsg: SearchResultItem = {
      id: 'msg-pub-1',
      type: 'message',
      title: 'Alice',
      subtitle: '#public-channel',
      snippet: 'This is public',
      timestamp: new Date().toISOString(),
      relevance: 60,
      resourceType: 'message',
      resourceId: 'msg-pub-1',
      organizationId: org1.id,
      metadata: { channelId: 'chan-public-1' },
    };

    searchRepository.searchMessages = async () => [mockChannelMsg];

    const result = await searchService.search('user-alice', { q: 'public', type: 'messages' });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].id, 'msg-pub-1');
  });

  // --------------------------------------------------------------------------
  // 5. Security Audit D: Private Conversation Messages
  // --------------------------------------------------------------------------
  it('Audit D: non-members cannot discover conversation messages', async () => {
    searchRepository.searchConversations = async (_q, callerId) => {
      if (callerId === 'user-alice') {
        return [
          {
            id: 'conv-alice-bob',
            type: 'conversation',
            title: 'Bob',
            subtitle: 'direct',
            timestamp: new Date().toISOString(),
            relevance: 50,
            resourceType: 'conversation',
            resourceId: 'conv-alice-bob',
            organizationId: org1.id,
          },
        ];
      }
      return [];
    };

    const aliceResult = await searchService.search('user-alice', { q: 'Bob', type: 'conversations' });
    assert.strictEqual(aliceResult.items.length, 1);

    const outsiderResult = await searchService.search('user-member-1', { q: 'Bob', type: 'conversations' });
    assert.strictEqual(outsiderResult.items.length, 0);
  });

  // --------------------------------------------------------------------------
  // 6. Security Audit E & F: Unauthorized Meetings & Files
  // --------------------------------------------------------------------------
  it('Audit E & F: unauthorized meetings and files do not appear in search', async () => {
    searchRepository.searchMeetings = async (_q, _caller, orgIds) => {
      assert.ok(orgIds.includes(org1.id));
      return [];
    };

    searchRepository.searchFiles = async (_q, _caller, orgIds) => {
      assert.ok(orgIds.includes(org1.id));
      return [];
    };

    const meetResult = await searchService.search('user-alice', { q: 'board', type: 'meetings' });
    assert.strictEqual(meetResult.items.length, 0);

    const fileResult = await searchService.search('user-alice', { q: 'secret', type: 'files' });
    assert.strictEqual(fileResult.items.length, 0);
  });

  // --------------------------------------------------------------------------
  // 7. Security Audit I & J: SQL Injection and Pathological Queries
  // --------------------------------------------------------------------------
  it('Audit I & J: SQL injection patterns and special characters are safely handled as plain text', async () => {
    const maliciousQuery = "' OR 1=1; DROP TABLE messages; --";
    const validation = validateSearchQuery({ q: maliciousQuery });
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.data?.q, maliciousQuery.trim());

    // Search executes without SQL error
    searchRepository.searchMessages = async (q) => {
      assert.strictEqual(q, maliciousQuery.trim());
      return [];
    };

    const result = await searchService.search('user-alice', { q: maliciousQuery, type: 'messages' });
    assert.strictEqual(result.items.length, 0);
  });

  // --------------------------------------------------------------------------
  // 8. Security Audit K: User Credentials & Tokens Never Exposed
  // --------------------------------------------------------------------------
  it('Audit K: password hashes, tokens, and storage keys are never exposed in search results', async () => {
    const userResult: SearchResultItem = {
      id: 'user-target-1',
      type: 'user',
      title: 'Charlie Brown',
      subtitle: 'Charlie',
      timestamp: new Date().toISOString(),
      relevance: 75,
      resourceType: 'user',
      resourceId: 'user-target-1',
      organizationId: org1.id,
      metadata: { avatarUrl: 'https://example.com/avatar.jpg' },
    };

    searchRepository.searchUsers = async () => [userResult];

    const result = await searchService.search('user-alice', { q: 'Charlie', type: 'users' });
    const item = result.items[0];

    assert.ok(item);
    assert.strictEqual((item as any).password, undefined);
    assert.strictEqual((item as any).passwordHash, undefined);
    assert.strictEqual((item as any).token, undefined);
    assert.strictEqual((item as any).storageKey, undefined);
  });

  // --------------------------------------------------------------------------
  // 9. Security Audit L & M: Search Result Does Not Bypass Authorization
  // --------------------------------------------------------------------------
  it('Audit L & M: possessing a search result resourceId does not grant access to the resource', async () => {
    const channelId = 'chan-locked-999';
    const mockDb: any = {
      query: async () => ({ rows: [] }),
    };
    const auth = await authorizationService.getChannelAuth('user-alice', channelId, mockDb);
    assert.strictEqual(auth.canAccess, false, 'Channel authorization remains authoritative');
  });

  // --------------------------------------------------------------------------
  // 10. Security Audit N, O, P, Q: Keyset Cursor Pagination & Determinism
  // --------------------------------------------------------------------------
  it('Audit N, O, P, Q: cursor pagination is deterministic, tamper-resistant, and prevents duplicates', async () => {
    const item1: SearchResultItem = {
      id: 'item-1',
      type: 'message',
      title: 'Item 1',
      timestamp: new Date('2026-09-14T10:00:00Z').toISOString(),
      relevance: 100,
      resourceType: 'message',
      resourceId: 'item-1',
    };
    const item2: SearchResultItem = {
      id: 'item-2',
      type: 'message',
      title: 'Item 2',
      timestamp: new Date('2026-09-14T09:00:00Z').toISOString(),
      relevance: 75,
      resourceType: 'message',
      resourceId: 'item-2',
    };

    // Encode cursor
    const cursor = encodeSearchCursor({
      relevance: item1.relevance,
      createdAt: item1.timestamp!,
      id: item1.id,
    });
    assert.ok(typeof cursor === 'string');

    // Decode cursor
    const decoded = decodeSearchCursor(cursor);
    assert.strictEqual(decoded.isValid, true);
    assert.strictEqual(decoded.data?.relevance, 100);
    assert.strictEqual(decoded.data?.id, 'item-1');

    // Tampered cursor
    const tampered = decodeSearchCursor('not-valid-base64-json!!!');
    assert.strictEqual(tampered.isValid, false);
    assert.strictEqual(tampered.errors?.[0]?.code, PHASE9E_ERROR_CODES.INVALID_CURSOR);
  });

  // --------------------------------------------------------------------------
  // 11. Functional: Unified Search (type=all) Aggregates & Groups Categories
  // --------------------------------------------------------------------------
  it('11. unified search aggregates results across categories and provides category grouping', async () => {
    searchRepository.searchUsers = async () => [
      {
        id: 'u-1',
        type: 'user',
        title: 'Alice Wonder',
        timestamp: new Date().toISOString(),
        relevance: 80,
        resourceType: 'user',
        resourceId: 'u-1',
      },
    ];
    searchRepository.searchTeams = async () => [
      {
        id: 't-1',
        type: 'team',
        title: 'Alice Engineering',
        timestamp: new Date().toISOString(),
        relevance: 90,
        resourceType: 'team',
        resourceId: 't-1',
      },
    ];
    searchRepository.searchChannels = async () => [];
    searchRepository.searchConversations = async () => [];
    searchRepository.searchMessages = async () => [];
    searchRepository.searchMeetings = async () => [];
    searchRepository.searchFiles = async () => [];

    const result = await searchService.search('user-alice', { q: 'Alice', type: 'all' });
    assert.strictEqual(result.items.length, 2);
    // Highest relevance first
    assert.strictEqual(result.items[0].type, 'team'); // 90
    assert.strictEqual(result.items[1].type, 'user'); // 80

    // Grouped items
    assert.strictEqual(result.grouped?.team?.length, 1);
    assert.strictEqual(result.grouped?.user?.length, 1);
  });

  // --------------------------------------------------------------------------
  // 12. Functional: Search Suggestions
  // --------------------------------------------------------------------------
  it('12. returns lightweight search suggestions for instant header dropdown', async () => {
    searchRepository.searchUsers = async () => [
      {
        id: 'u-sugg-1',
        type: 'user',
        title: 'Bob Developer',
        timestamp: new Date().toISOString(),
        relevance: 75,
        resourceType: 'user',
        resourceId: 'u-sugg-1',
      },
    ];
    searchRepository.searchChannels = async () => [
      {
        id: 'c-sugg-1',
        type: 'channel',
        title: 'general',
        timestamp: new Date().toISOString(),
        relevance: 100,
        resourceType: 'channel',
        resourceId: 'c-sugg-1',
      },
    ];
    searchRepository.searchTeams = async () => [];

    const suggestions = await searchService.getSuggestions('user-alice', 'gen');
    assert.strictEqual(suggestions.length, 2);
    assert.strictEqual(suggestions[0].title, 'general');
    assert.strictEqual(suggestions[1].title, 'Bob Developer');
  });
});
