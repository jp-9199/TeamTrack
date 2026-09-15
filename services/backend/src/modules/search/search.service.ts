import { searchRepository } from '../../db/repositories/search.repository.js';
import { organizationRepository } from '../../db/repositories/organization.repository.js';
import {
  decodeSearchCursor,
  encodeSearchCursor,
} from '@teamtrack/validation';
import type {
  SearchRequestQuery,
  SearchResponseData,
  SearchResultItem,
  SearchResultType,
  SearchCursorData,
} from '@teamtrack/shared-types';

export class SearchServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

export class SearchService {
  /**
   * Resolves the list of active organization IDs the caller is permitted to search.
   * If caller requested a specific organizationId, verifies caller has active membership.
   */
  async resolveAuthorizedOrgIds(
    callerId: string,
    requestedOrgId?: string
  ): Promise<string[]> {
    const callerOrgs = await organizationRepository.findForUser(callerId);
    const activeOrgIds = callerOrgs.map((o) => o.id);

    if (requestedOrgId) {
      if (!activeOrgIds.includes(requestedOrgId)) {
        throw new SearchServiceError(
          'NOT_FOUND',
          'Organization not found or access denied',
          404
        );
      }
      return [requestedOrgId];
    }

    return activeOrgIds;
  }

  /**
   * Executes unified or category-filtered search with cursor pagination and authorization checks.
   */
  async search(
    callerId: string,
    query: SearchRequestQuery
  ): Promise<SearchResponseData> {
    const orgIds = await this.resolveAuthorizedOrgIds(callerId, query.organizationId);
    if (orgIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalMatches: 0,
      };
    }

    const limit = query.limit ?? 20;

    // Decode cursor if provided
    let cursorData: SearchCursorData | undefined = undefined;
    if (query.cursor) {
      const decoded = decodeSearchCursor(query.cursor);
      if (!decoded.isValid) {
        throw new SearchServiceError('INVALID_CURSOR', 'Invalid search cursor', 400);
      }
      cursorData = decoded.data;
    }

    const type = query.type ?? 'all';

    if (type !== 'all') {
      return this.searchSingleCategory(query.q, callerId, orgIds, type, limit, cursorData);
    }

    return this.searchAllCategories(query.q, callerId, orgIds, limit, cursorData);
  }

  /**
   * Executes search for a specific category with keyset pagination.
   */
  private async searchSingleCategory(
    q: string,
    callerId: string,
    orgIds: string[],
    category: string,
    limit: number,
    cursor?: SearchCursorData
  ): Promise<SearchResponseData> {
    const fetchLimit = limit + 1;
    let rawItems: SearchResultItem[] = [];

    switch (category) {
      case 'users':
        rawItems = await searchRepository.searchUsers(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'teams':
        rawItems = await searchRepository.searchTeams(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'channels':
        rawItems = await searchRepository.searchChannels(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'conversations':
        rawItems = await searchRepository.searchConversations(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'messages':
        rawItems = await searchRepository.searchMessages(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'meetings':
        rawItems = await searchRepository.searchMeetings(q, callerId, orgIds, fetchLimit, cursor);
        break;
      case 'files':
        rawItems = await searchRepository.searchFiles(q, callerId, orgIds, fetchLimit, cursor);
        break;
      default:
        throw new SearchServiceError('INVALID_SEARCH_TYPE', `Unknown category: ${category}`, 400);
    }

    const hasMore = rawItems.length > limit;
    const items = hasMore ? rawItems.slice(0, limit) : rawItems;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeSearchCursor({
        relevance: last.relevance,
        createdAt: last.timestamp || new Date().toISOString(),
        id: last.id,
      });
    }

    return {
      items,
      nextCursor,
      hasMore,
      totalMatches: items.length,
    };
  }

  /**
   * Executes unified search across all 7 categories and assembles ranked results.
   */
  private async searchAllCategories(
    q: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData
  ): Promise<SearchResponseData> {
    // Run category queries concurrently
    const [users, teams, channels, conversations, messages, meetings, files] = await Promise.all([
      searchRepository.searchUsers(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchTeams(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchChannels(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchConversations(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchMessages(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchMeetings(q, callerId, orgIds, limit + 1, cursor),
      searchRepository.searchFiles(q, callerId, orgIds, limit + 1, cursor),
    ]);

    const grouped: Partial<Record<SearchResultType, SearchResultItem[]>> = {
      user: users.slice(0, limit),
      team: teams.slice(0, limit),
      channel: channels.slice(0, limit),
      conversation: conversations.slice(0, limit),
      message: messages.slice(0, limit),
      meeting: meetings.slice(0, limit),
      file: files.slice(0, limit),
    };

    // Merge and sort all items by relevance DESC, timestamp DESC, id DESC
    const allCombined = [
      ...users,
      ...teams,
      ...channels,
      ...conversations,
      ...messages,
      ...meetings,
      ...files,
    ].sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return b.id.localeCompare(a.id);
    });

    const hasMore = allCombined.length > limit;
    const items = hasMore ? allCombined.slice(0, limit) : allCombined;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeSearchCursor({
        relevance: last.relevance,
        createdAt: last.timestamp || new Date().toISOString(),
        id: last.id,
      });
    }

    return {
      items,
      nextCursor,
      hasMore,
      totalMatches: items.length,
      grouped,
    };
  }

  /**
   * Returns lightweight suggestions for instant dropdown previews (top people, teams, channels).
   */
  async getSuggestions(
    callerId: string,
    query: string,
    organizationId?: string
  ): Promise<SearchResultItem[]> {
    const orgIds = await this.resolveAuthorizedOrgIds(callerId, organizationId);
    if (orgIds.length === 0) return [];

    const limit = 5;
    const [users, channels, teams] = await Promise.all([
      searchRepository.searchUsers(query, callerId, orgIds, limit),
      searchRepository.searchChannels(query, callerId, orgIds, limit),
      searchRepository.searchTeams(query, callerId, orgIds, limit),
    ]);

    return [...users, ...channels, ...teams]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }
}

export const searchService = new SearchService();
