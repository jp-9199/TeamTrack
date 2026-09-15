# TeamTrack Phase 9E: Search & Discovery Architecture

## 1. Overview & Core Principles

Phase 9E implements TeamTrack's unified Search & Discovery system across Web, Desktop, and Mobile clients.

### Core Architectural Principle
> **SEARCH IS NOT AN AUTHORIZATION SYSTEM.**  
> Search is purely a discovery mechanism. Every search result returned by the backend is already authorized for the requesting user through strict server-side predicate pushdown. Opening or interacting with any discovered resource continues to enforce full backend authorization checks.

### Technology Stack
- **Engine**: PostgreSQL-native search capabilities (`to_tsvector`, `plainto_tsquery`, `ts_rank_cd`, GIN indexes, case-insensitive pattern matching).
- **Zero External Search Dependencies**: No Elasticsearch, OpenSearch, vector databases, or AI embeddings.
- **Client Decoupling**: Clients query the unified `/api/v1/search` endpoint via `@teamtrack/api-client`. Direct PostgreSQL queries from client devices are strictly prohibited.

---

## 2. System Architecture & Data Flow

```
[ Web / Desktop / Mobile Client ]
              │
              ▼  (GET /api/v1/search?q=...&type=...&cursor=...&limit=...)
     [ TeamTrack API ]
              │
              ▼  (requireAuth Middleware)
   [ SearchController & Validation ]
              │
              ▼
    [ SearchService ]
         │  1. Resolves caller's active organization memberships
         │  2. Decodes & validates opaque cursor
         │  3. Delegates to SearchRepository with authorized orgIds & callerId
         ▼
   [ SearchRepository (PostgreSQL) ]
         ├── Users: Active org co-members
         ├── Teams: Public teams in org, or private teams where caller is member/admin
         ├── Channels: Public channels in member teams, or private channels with membership/lead/admin
         ├── Conversations: Conversations where caller ∈ conversation_members
         ├── Messages: Channel messages in accessible channels + direct messages where caller is member
         ├── Meetings: Non-cancelled meetings in caller's active organizations
         └── Files: Ready, non-deleted files according to Phase 8 attachment context & org rules
              │
              ▼  (Ranked & deduplicated results)
      [ Response JSON ]
```

---

## 3. API Contracts

### Unified Search Endpoint
- **Route**: `GET /api/v1/search`
- **Authentication**: Bearer JWT in `Authorization` header or session cookie (`requireAuth`).

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | `string` | **Yes** | Search query string (1..200 characters, whitespace-trimmed). |
| `type` | `string` | No | Category filter: `'all'` (default), `'users'`, `'teams'`, `'channels'`, `'conversations'`, `'messages'`, `'meetings'`, `'files'`. |
| `limit` | `number` | No | Number of items per page (1..100, default 20). |
| `cursor` | `string` | No | Keyset pagination cursor from previous response. |
| `organizationId` | `UUID` | No | Restricts search to a specific organization. Caller must be an active member. |

#### Response Envelope
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "type": "message",
        "title": "Jane Doe",
        "subtitle": "#general",
        "snippet": "We finalized the project launch deadline for next Tuesday...",
        "timestamp": "2026-09-14T12:00:00.000Z",
        "relevance": 85.5,
        "resourceType": "message",
        "resourceId": "uuid",
        "organizationId": "uuid",
        "metadata": {
          "channelId": "uuid",
          "conversationId": null,
          "senderId": "uuid"
        }
      }
    ],
    "nextCursor": "eyJyIjo4NS41LCJjIjoiMjAyNi0wOS0xNFQ...",
    "hasMore": true,
    "totalMatches": 1,
    "grouped": {
      "user": [],
      "team": [],
      "channel": [],
      "conversation": [],
      "message": [...],
      "meeting": [],
      "file": []
    }
  },
  "timestamp": "2026-09-14T12:00:01.000Z"
}
```

### Search Suggestions Endpoint
- **Route**: `GET /api/v1/search/suggestions?q=:query`
- Returns top quick matches (people, channels, teams) for instant dropdown previews.

---

## 4. Searchable Entities & Authorization Rules

| Entity | Searchable Fields | Authorization Predicates Enforced in SQL |
|--------|-------------------|-------------------------------------------|
| **Users** | `display_name`, `full_name`, `email` | - Caller and target must share active membership in `organizations`.<br>- Target user must not be soft-deleted (`deleted_at IS NULL`, `status = 'active'`).<br>- Email is only matched and exposed if caller is owner/admin or self. Password hashes and credentials are never queried or returned. |
| **Teams** | `name`, `description` | - Belongs to caller's active organization.<br>- Not deleted (`deleted_at IS NULL`).<br>- If private: caller must be member (`team_members`) or org owner/admin.<br>- Guests only see teams they are explicit members of. |
| **Channels** | `name`, `description` | - Belongs to an accessible team.<br>- Not deleted (`deleted_at IS NULL`).<br>- Public channel: caller is team member or org admin.<br>- Private channel: caller is channel member, team lead, or org admin. Private channel names are never leaked to outsiders. |
| **Conversations** | `title`, participant names | - Caller must be an explicit participant (`conversation_members.user_id = callerId`).<br>- Non-archived conversations only. |
| **Messages** | `content` | - Not soft-deleted (`is_deleted = false`, `deleted_at IS NULL`).<br>- Channel message: Channel must be accessible to caller.<br>- Conversation message: Caller must belong to conversation.<br>- Snippets contain up to 180 characters of plain text. |
| **Meetings** | `title`, `description` | - Belongs to caller's active organization.<br>- Status is `scheduled`, `active`, or `ended` (cancelled meetings excluded).<br>- Caller is host, participant, or active organization member. |
| **Files** | `file_name` | - Not deleted (`is_deleted = false`), ready status (`status = 'ready'`).<br>- If attached to message: Caller must have access to parent channel or conversation.<br>- If unattached: Caller is uploader or org admin/member (guests only see their own uploads).<br>- Storage keys, credentials, and signed URLs are never exposed. |

---

## 5. Ranking & Relevance Algorithm

Search results are ranked deterministically:
1. **Exact Name / Content Match**: Score 100.
2. **Prefix Match**: Score 75.
3. **Substring Match**: Score 50 (messages receive 60).
4. **Full-Text GIN Search Bonus**: `ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', query)) * 20`.
5. **Secondary Tie-Breakers**: Chronological timestamp (`created_at DESC`) followed by deterministic UUID order (`id DESC`).

---

## 6. Keyset Cursor Pagination

- Pagination uses opaque base64url encoded cursor tokens containing:
  ```json
  { "r": 85.5, "c": "2026-09-14T12:00:00.000Z", "i": "uuid" }
  ```
- In PostgreSQL:
  ```sql
  WHERE (relevance < $cursorRelevance OR (relevance = $cursorRelevance AND (created_at < $cursorCreatedAt OR (created_at = $cursorCreatedAt AND id < $cursorId))))
  ORDER BY relevance DESC, created_at DESC, id DESC
  LIMIT $limit + 1
  ```
- Prevents row offset drift, duplicate items between pages, and performance degradation on large datasets.

---

## 7. Security Boundaries & Input Sanitization

1. **SQL Injection Prevention**: All queries use parameterized values (`$1`, `$2`, etc.). User strings are never concatenated into SQL statements.
2. **Full-Text Safety**: Uses `plainto_tsquery('english', $1)` which treats all user characters as plain words, neutralizing reserved tsquery operators (`&`, `|`, `!`, `*`).
3. **No Unsafe HTML**: UI components render all result titles and snippets as plain text strings. `dangerouslySetInnerHTML` is prohibited.
4. **Credential Isolation**: User credentials, password hashes, refresh tokens, session keys, and S3 credentials are strictly excluded from queries.
5. **Resource Authorization**: Having a search result `resourceId` confers zero access. Navigating to `/channels/:id`, `/meetings/:id`, or `/files/:id` triggers standard backend tenant and role checks.

---

## 8. Client UI Integration

### Web Application (`apps/web`)
- **Header Search Bar** (`SearchBar.tsx`):
  - Shortcut: `Ctrl+K`, `Ctrl+E`, or `/` focuses search.
  - Debounced input (250ms) querying `/api/v1/search?limit=7`.
  - Dropdown popover with category badges, snippets, keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`), and direct link to full search.
- **Dedicated Search Page** (`/search`):
  - Category tabs (All, Messages, People, Channels, Teams, Meetings, Files).
  - Cursor-based "Load more results" pagination.
  - Skeletons, empty state ("No results found"), and error/retry states.

### Desktop Application (`apps/desktop`)
- Reuses web search components and contracts within the Electron shell.

### Mobile Application (`apps/mobile`)
- Native touch-friendly `MobileSearchScreen.tsx`:
  - Quick text input with clear button.
  - Horizontal category selector pills.
  - Clean card layout with type badges and snippet previews.
  - Modal presentation with cancel action.

---

## 9. Performance & Indexing

Chronological migration [`20260914180001_create_search_indexes.sql`](file:///c:/Users/anime/.gemini/antigravity-ide/scratch/TeamTrack/database/migrations/20260914180001_create_search_indexes.sql) adds:
- `idx_messages_search_content`: GIN index on `to_tsvector('english', content)` WHERE `is_deleted = false`.
- `idx_meetings_search_title`: GIN index on `to_tsvector('english', title)`.
- `idx_files_search_name`: Index on `files(file_name)` WHERE `is_deleted = false`.
- `idx_channels_search_name`: Index on `channels(name)` WHERE `deleted_at IS NULL`.
- `idx_teams_search_name`: Index on `teams(name)` WHERE `deleted_at IS NULL`.
- `idx_users_search_display_name`: Index on `users(display_name)` WHERE `deleted_at IS NULL`.
