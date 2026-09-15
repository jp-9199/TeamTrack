# TeamTrack Messaging & Conversations Architecture

## 1. Architectural Overview & Boundary
TeamTrack Phase 6 establishes durable messaging, direct/group conversations, message reactions, keyset pagination, and read-state synchronization across channel and direct conversation contexts.

```text
                           ┌────────────────────────────────────────┐
                           │      Client Application (Web/App)      │
                           └──────────────────┬─────────────────────┘
                                              │
                    REST (CRUD / Keyset / Sync)│ WebSocket (Live Fan-Out)
                                              ▼
                           ┌────────────────────────────────────────┐
                           │       Express API & Auth Boundary      │
                           │     - requireAuth (JWT verification)   │
                           │     - AuthorizationService (Anti-IDOR) │
                           │     - Strict Idempotency Check         │
                           └──────────────────┬─────────────────────┘
                                              │
                                              ▼
                           ┌────────────────────────────────────────┐
                           │        PostgreSQL Transaction          │
                           │    (Source of Truth & Exclusivity)     │
                           │  - messages (idempotency unique index) │
                           │  - channel_read_states                 │
                           │  - conversation_members                │
                           └──────────────────┬─────────────────────┘
                                              │ COMMIT
                                              ▼
                           ┌────────────────────────────────────────┐
                           │          Redis Pub/Sub Fan-Out         │
                           │  - Post-commit broadcast only          │
                           │  - Local fallback for dev/offline      │
                           └────────────────────────────────────────┘
```

---

## 2. Message Lifecycle & Immutability Guarantees

### A. Message Creation
1. **Target Exclusivity**: DB constraint `chk_messages_target_exclusive` guarantees that every message belongs to either `channel_id` XOR `conversation_id`.
2. **Sender Identity**: Derived strictly from authenticated JWT (`req.user.id`). Client-supplied sender IDs are rejected.
3. **Thread Reply Validation**: If `parent_message_id` is supplied:
   - Target must exist and not be soft-deleted.
   - Target must belong to the exact same channel or conversation (`PARENT_MESSAGE_TARGET_MISMATCH`).

### B. Message Editing
- **Author Only**: Only the author (`sender_id === userId`) may edit message content.
- **Soft Edit**: Sets `is_edited = true` and updates `updated_at = NOW()`.
- Deleted messages cannot be edited (`CANNOT_EDIT_DELETED_MESSAGE`).

### C. Message Deletion
- **Permissions**: Permitted for the author OR elevated roles (team lead / organization owner/admin in channels).
- **Soft Deletion**: Sets `is_deleted = true`, clears `content = ''`, and sets `deleted_at = NOW()`.
- Physical rows are never removed in Phase 6, preserving audit history and delta synchronization.

---

## 3. Strict Idempotency Semantics

To protect against duplicate sends during network timeouts, retries, and race conditions, messages enforce partial unique indexes:
- Channel messages: `uq_messages_channel_idempotency` on `(channel_id, sender_id, idempotency_key)`
- Conversation messages: `uq_messages_conv_idempotency` on `(conversation_id, sender_id, idempotency_key)`

### State Transition Table:
| Scenario | Pre-Check | DB Insert Result | HTTP Status | Realtime Event |
| :--- | :--- | :--- | :--- | :--- |
| **First Request** | Not found | Success | `201 Created` | Published (`message.created`) |
| **Identical Retry** | Found, content matches | Skipped | `200 OK` | **No duplicate event** |
| **Concurrent Duplicate** | Not found (race) | Unique violation `23505` | `200 OK` | **No duplicate event** |
| **Different Content** | Found, content differs | Aborted | `409 Conflict` (`IDEMPOTENCY_KEY_COLLISION`) | **No event** (Original untouched) |
| **Different Target** | Different scope | Success | `201 Created` | Published for target |

---

## 4. Keyset Cursor Pagination

### Order Tuple: `(created_at DESC, id DESC)`
PostgreSQL UUIDs are generated with `gen_random_uuid()` (v4) and have **no chronological monotonicity**. Keyset pagination uses `created_at` (TIMESTAMPTZ) as the primary chronological sorting dimension and `id` (UUID) strictly as a deterministic tie-breaker:

```sql
WHERE channel_id = $1 AND is_deleted = false
  AND (created_at < $2 OR (created_at = $2 AND id < $3))
ORDER BY created_at DESC, id DESC
LIMIT $limit;
```

### Cursor Format:
The cursor is a Base64URL-encoded string representing `<ISO-8601-Timestamp>:<UUID>`:
```text
encodeCursor: "2026-09-12T10:00:00.000Z:12345678-1234-1234-1234-123456789abc"
           -> MjAyNi0wOS0xMlQxMDowMDowMC4wMDBaOjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OWFiYw
```
Decoding parses via `lastIndexOf(':')` to isolate the ISO timestamp from the UUID without ambiguity.

---

## 5. Reconnect & State Synchronization

Clients reconnecting after WebSocket disconnection use the delta synchronization endpoints:
- `GET /api/v1/channels/:channelId/sync?since=<ISO_Timestamp>`
- `GET /api/v1/conversations/:conversationId/sync?since=<ISO_Timestamp>`

### The Missed-Event Guarantee:
> *"Missing realtime events must never cause permanently stale client state."*

The sync query explicitly queries `WHERE channel_id = $1 AND updated_at > $since` **without** filtering out `is_deleted = true`. This enables the client to discover:
1. **Newly Created Messages**: `is_deleted = false`, returned in `messages`.
2. **Edited Messages**: `updated_at > since` with updated content.
3. **Soft-Deleted Messages**: `is_deleted = true`, returned in `deletedMessageIds` so client local stores can purge previously displayed content.
4. **Reactions**: All reactions added/modified since the disconnect boundary.
5. **Read State**: Updated `last_read_at` and accurate `unreadCount`.

---

## 6. Channel Read State Semantics

```text
channel_read_states (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channel_read_states_user UNIQUE (channel_id, user_id)
);
```

### Authoritative Boundary Invariant:
- `last_read_at` is the **authoritative fallback boundary** for all unread calculations.
- `last_read_message_id` is an **optional precise marker**. If the referenced message is soft-deleted or purged, foreign key `ON DELETE SET NULL` zeroes the reference, but unread calculations continue without interruption via `last_read_at`:
  ```sql
  SELECT COUNT(*) FROM messages
  WHERE channel_id = $1
    AND created_at > $last_read_at
    AND is_deleted = false
    AND sender_id != $user_id;
  ```
- Read marker updates are broadcast via realtime to `user:<userId>` for cross-device synchronization (Web, Desktop, Mobile) and to `channel:<channelId>` for team presence.
