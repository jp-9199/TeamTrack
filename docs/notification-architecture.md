# TeamTrack Notification Architecture Specification

> **Phase**: Phase 9A — Notification Database Architecture  
> **Status**: Approved & Durably Implemented in PostgreSQL  
> **Target Database Engine**: PostgreSQL 16+  
> **Scope**: Structural database design, entity lifecycle, trigger-based read state synchronization, multi-device delta synchronization, deterministic keyset indexing, and idempotent deduplication.

---

## 1. Executive Summary & Architectural Scope

The TeamTrack notification system provides a durable, multi-tenant notification inbox for user alerts, message mentions, meeting lifecycle transitions, team events, and system notices.

### 1.1 Phase Boundaries
- **Phase 9A (Current)**: **Database Architecture Only**. Schema enhancements to the existing `notifications` table, trigger-based read-state synchronization, multi-device delta synchronization markers, deterministic keyset cursor indexes, idempotent deduplication constraints, shared TypeScript contracts, and static test suites.
- **Phase 9B (Future)**: Notification service, event listeners, authorization re-verification, transactional event ingestion, unread counters, and REST API controllers.
- **Phase 9C (Future)**: Realtime WebSocket notification delivery, ephemeral Redis pub/sub distribution, and reconnect synchronization.
- **Future Operational Phases**: User presence integration, push notification delivery (APNs/FCM via `user_devices`), email notifications, notification preferences table & user settings, and frontend notification UI.

---

## 2. Notification Domain Model & Core Entity

The persistent notification inbox is housed entirely within PostgreSQL. Notifications are user-facing, append-mostly historical records with explicit read-state progression and soft-deletion lifecycle.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL: notifications                         │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ id                │ UUID PRIMARY KEY (gen_random_uuid())                    │
│ recipient_id      │ UUID NOT NULL -> users(id) ON DELETE CASCADE            │
│ organization_id   │ UUID NULL -> organizations(id) ON DELETE CASCADE        │
│ actor_id          │ UUID NULL -> users(id) ON DELETE SET NULL               │
│ type              │ VARCHAR(50) NOT NULL (NotificationType)                 │
│ title             │ VARCHAR(200) NOT NULL                                   │
│ body              │ TEXT NOT NULL                                           │
│ resource_type     │ VARCHAR(50) NULL (NotificationResourceType)             │
│ resource_id       │ UUID NULL                                               │
│ data_payload      │ JSONB NOT NULL DEFAULT '{}'::jsonb                      │
│ is_read           │ BOOLEAN NOT NULL DEFAULT false (Synchronized legacy)    │
│ read_at           │ TIMESTAMPTZ NULL (Canonical semantic state)             │
│ grouping_key      │ VARCHAR(128) NULL (Future aggregation & digests)        │
│ source_event_id   │ VARCHAR(128) NULL (Originating domain event identifier) │
│ deleted_at        │ TIMESTAMPTZ NULL (User dismissal / soft deletion)       │
│ created_at        │ TIMESTAMPTZ NOT NULL DEFAULT NOW()                      │
│ updated_at        │ TIMESTAMPTZ NOT NULL DEFAULT NOW() (Maintained via trg) │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

---

## 3. Schema Evolution: Migration 08 to Migration 14

### 3.1 Initial State (Migration 08)
Created in `20260910120008_create_notifications_and_audit_tables.sql`:
- `id`, `recipient_id`, `organization_id`, `type`, `title`, `body`, `data_payload`, `is_read`, `read_at`, `created_at`.
- Existing indexes:
  - `idx_notifications_unread`: `(recipient_id, created_at DESC) WHERE is_read = false`
  - `idx_notifications_recipient_all`: `(recipient_id, created_at DESC)`

### 3.2 Enhancement Migration (Migration 14)
Created in `20260913120001_create_notification_enhancements.sql`:
- **Columns Added**:
  - `actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `resource_type VARCHAR(50) NULL`
  - `resource_id UUID NULL`
  - `grouping_key VARCHAR(128) NULL`
  - `source_event_id VARCHAR(128) NULL`
  - `deleted_at TIMESTAMPTZ NULL`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Triggers Established**:
  - `trg_notifications_updated_at`: Reusable `BEFORE UPDATE` trigger using `set_updated_at()`.
  - `trg_notifications_read_sync`: Bidirectional `BEFORE INSERT OR UPDATE` trigger using `sync_notification_read_status()`.
- **Existing Indexes Retained**: Both `idx_notifications_unread` and `idx_notifications_recipient_all` remain untouched to guarantee backward compatibility with existing query plans.
- **New Indexes Added**:
  - `idx_notifications_recipient_cursor`: Deterministic keyset pagination.
  - `idx_notifications_recipient_sync`: Multi-device delta synchronization.
  - `idx_notifications_org_cursor`: Tenant-scoped administrative querying.
  - `idx_notifications_resource`: Polymorphic resource lifecycle lookup.
  - `idx_notifications_grouping`: Grouping & digest lookup.
  - `uq_notifications_dedup`: Unique partial index on `(recipient_id, type, source_event_id) WHERE source_event_id IS NOT NULL AND deleted_at IS NULL`.

---

## 4. Recipient & Actor Model

### 4.1 Target Recipient (`recipient_id`)
- Every notification identifies a single target user (`recipient_id`).
- Foreign Key: `REFERENCES users(id) ON DELETE CASCADE`.
- If a user account is permanently deleted, their personal notification inbox is completely deleted.

### 4.2 Originating Actor (`actor_id`)
- Identifies the user who initiated the action (e.g., mentioner, caller, inviter).
- Foreign Key: `REFERENCES users(id) ON DELETE SET NULL`.
- If an actor user account is deleted, the historical notification received by other users is preserved, with `actor_id` set to `NULL`.
- Nullable by design: system-generated notices (e.g., security alerts, maintenance announcements) legitimately have `actor_id = NULL`.

---

## 5. Organization Context & Multi-Tenant Isolation

### 5.1 Dual-Scope Notification Model
- `organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE`.
- **Organization-Scoped Notifications**:
  - Direct channel messages, team invitations, channel mentions, and meeting alerts.
  - Always populate `organization_id` based on authoritative server-side domain verification.
  - Purged via `ON DELETE CASCADE` if the parent organization is deleted.
- **System / Platform Notifications**:
  - Account security notices, credential rotations, platform terms updates.
  - Legitimately have `organization_id = NULL`.

### 5.2 Strict Server-Side Authority
- In future notification generation (Phase 9B), the backend is the sole authority for determining `organization_id`.
- Client requests must never specify or override `organization_id` for notification delivery.

---

## 6. Critical Security Rule: Polymorphic Resource References

### 6.1 Polymorphic Resource Context
- `resource_type VARCHAR(50) NULL`: `'organization' | 'team' | 'channel' | 'conversation' | 'message' | 'meeting' | 'file' | 'user'`.
- `resource_id UUID NULL`: UUID of the referenced entity.

### 6.2 The Non-Authorizing Invariant
> [!CAUTION]
> **A notification NEVER grants authorization to access the referenced resource.**

1. A notification containing *"User Bob mentioned you in Private Channel #executive-planning"* grants **zero** access rights to `#executive-planning` or its messages.
2. When a user navigates to a resource referenced by a notification, client requests must route through canonical resource APIs (e.g., `GET /api/v1/channels/:id/messages`).
3. The underlying domain service executes independent, authoritative authorization checks against the caller's current organization, team, and channel memberships.
4. If a user was removed from a channel after a notification was sent, attempting to view the resource yields `403 FORBIDDEN` or `404 NOT_FOUND`.

---

## 7. Read / Unread Semantics & Trigger-Based Synchronization

### 7.1 Canonical Semantic State: `read_at`
- `read_at IS NULL` = **Unread**
- `read_at IS NOT NULL` = **Read** (`TIMESTAMPTZ` in UTC)

`is_read` exists purely for backward compatibility with existing schemas and queries.

### 7.2 Non-Recursive In-Place Trigger Synchronization
To guarantee that `read_at` and `is_read` can never desynchronize while preventing infinite trigger recursion, `sync_notification_read_status()` operates as a `BEFORE INSERT OR UPDATE` trigger:

```sql
CREATE OR REPLACE FUNCTION sync_notification_read_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Defense-in-depth recursion guard
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Case 1: INSERT operation
  IF TG_OP = 'INSERT' THEN
    IF NEW.read_at IS NOT NULL THEN
      NEW.is_read := true;
    ELSIF NEW.is_read IS TRUE THEN
      NEW.read_at := COALESCE(NEW.created_at, NOW());
    ELSE
      NEW.is_read := false;
      NEW.read_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Case 2: UPDATE operation
  IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    IF NEW.read_at IS NOT NULL THEN
      IF NEW.is_read IS NOT TRUE THEN
        NEW.is_read := true;
      END IF;
    ELSE
      IF NEW.is_read IS NOT FALSE THEN
        NEW.is_read := false;
      END IF;
    END IF;
  ELSIF NEW.is_read IS DISTINCT FROM OLD.is_read THEN
    IF NEW.is_read IS TRUE THEN
      IF NEW.read_at IS NULL THEN
        NEW.read_at := NOW();
      END IF;
    ELSE
      IF NEW.read_at IS NOT NULL THEN
        NEW.read_at := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### Why This Is Recursion-Free:
1. It executes `BEFORE INSERT OR UPDATE`, mutating `NEW` in-place in memory before row write.
2. It **never** issues an external `UPDATE notifications SET ...` SQL query.
3. Field changes only occur when the target field is out of sync (`IS NOT TRUE`, `IS NOT FALSE`, etc.).
4. `pg_trigger_depth() > 1` acts as a fail-safe defense-in-depth guard.

---

## 8. `updated_at` & Multi-Device Synchronization

### 8.1 Unified Write Lifecycle
- When an application updates `read_at`:
  - `trg_notifications_read_sync` syncs `NEW.is_read = true`.
  - `trg_notifications_updated_at` updates `NEW.updated_at = NOW()`.
  - Both mutations occur inside the single row write. No secondary SQL statements are executed.

### 8.2 Multi-Device Delta Catch-up Protocol
When a device reconnects (after sleep, network disconnection, or offline mode):
```sql
SELECT * FROM notifications
WHERE recipient_id = $userId
  AND (updated_at, id) > ($cursorUpdatedAt, $cursorId)
  AND deleted_at IS NULL
ORDER BY updated_at ASC, id ASC
LIMIT 100;
```
Because marking a notification read updates `updated_at`, all connected devices (web, desktop, mobile) synchronize both new notifications and read-state changes using the same deterministic delta index `idx_notifications_recipient_sync`.

---

## 9. Keyset Cursor Pagination

Offset-based pagination (`OFFSET N LIMIT M`) degrades linearly with inbox volume. TeamTrack uses composite keyset cursor pagination based on `(created_at, id)`.

```sql
SELECT * FROM notifications
WHERE recipient_id = $userId
  AND (created_at, id) < ($cursorCreatedAt, $cursorId)
  AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

This query is supported directly by the composite index:
`idx_notifications_recipient_cursor ON notifications(recipient_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;`

---

## 10. Source Event Deduplication (`source_event_id`)

### 10.1 Stable Originating Domain Event Identity
`source_event_id VARCHAR(128) NULL` stores the stable deterministic identifier of the **actual originating domain event**.
- It is **NOT** a random notification UUID.
- It is **NOT** merely an actor or user ID.

### 10.2 Domain Event Mapping Table
| Notification Type | Originating Domain Event Example | Format / Value |
| :--- | :--- | :--- |
| `mention` | Message send / mention event | `msg_evt_<uuid>` or `msg_<uuid>` |
| `channel_message` | Channel message broadcast event | `msg_<uuid>` |
| `reply` | Thread message event | `thread_msg_<uuid>` |
| `meeting_invite` | Meeting invitation event | `mtg_inv_<uuid>` |
| `meeting_started` | Meeting session start event | `mtg_start_<meeting_id>_<session_seq>` |
| `team_activity` | Team membership invitation event | `team_inv_<invitation_id>` |
| `system` | Security alert / system audit event | `sec_evt_<audit_log_id>` |

### 10.3 Deduplication Unique Index & Soft-Delete Semantics
```sql
CREATE UNIQUE INDEX uq_notifications_dedup
ON notifications(recipient_id, type, source_event_id)
WHERE source_event_id IS NOT NULL
  AND deleted_at IS NULL;
```

#### Soft-Delete Deduplication Behavior:
- **Active State (`deleted_at IS NULL`)**: Protects against concurrent message delivery retries, worker replays, or distributed pub/sub duplication.
- **Dismissed State (`deleted_at IS NOT NULL`)**: Excluded from the unique index. If a user dismisses a notification and the system legitimately re-emits the event later, the insertion succeeds without being blocked by discarded history.

---

## 11. Grouping Key (`grouping_key`)

- `grouping_key VARCHAR(128) NULL` provides an indexable bucket for future activity rollups (e.g., `thread:<message_id>`, `channel:<channel_id>:<date>`).
- It is **not** unique. Multiple notifications for the same recipient may share the same grouping key.
- Supported by index `idx_notifications_grouping ON notifications(recipient_id, grouping_key, created_at DESC) WHERE grouping_key IS NOT NULL AND deleted_at IS NULL`.
- **Zero Grouping Logic in Phase 9A**: Phase 9A only establishes the database column and index. Aggregation algorithms, bundling, and digest rollups belong to future phases.

---

## 12. Complete Index Strategy & Rationale

| Index Name | Type | Key Definition | Partial Predicate | Operational Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `idx_notifications_unread` | B-tree | `(recipient_id, created_at DESC)` | `WHERE is_read = false` | **Retained**: High-speed backward-compatible badge count queries. |
| `idx_notifications_recipient_all` | B-tree | `(recipient_id, created_at DESC)` | None | **Retained**: Legacy unpaged recipient queries. |
| `idx_notifications_recipient_cursor` | B-tree | `(recipient_id, created_at DESC, id DESC)` | `WHERE deleted_at IS NULL` | **New**: Deterministic keyset cursor pagination for active inboxes. |
| `idx_notifications_recipient_sync` | B-tree | `(recipient_id, updated_at ASC, id ASC)` | `WHERE deleted_at IS NULL` | **New**: Multi-device delta catch-up synchronization. |
| `idx_notifications_org_cursor` | B-tree | `(organization_id, created_at DESC, id DESC)` | `WHERE organization_id IS NOT NULL AND deleted_at IS NULL` | **New**: Tenant-scoped administrative querying. |
| `idx_notifications_resource` | B-tree | `(resource_type, resource_id)` | `WHERE resource_id IS NOT NULL AND deleted_at IS NULL` | **New**: Resource lifecycle lookup. |
| `idx_notifications_grouping` | B-tree | `(recipient_id, grouping_key, created_at DESC)` | `WHERE grouping_key IS NOT NULL AND deleted_at IS NULL` | **New**: Activity grouping and digest rollups. |
| `uq_notifications_dedup` | UNIQUE B-tree | `(recipient_id, type, source_event_id)` | `WHERE source_event_id IS NOT NULL AND deleted_at IS NULL` | **New**: Idempotent duplicate delivery prevention per recipient and event type. |

---

## 13. Separation of Persistence Model vs Client DTO

In `@teamtrack/shared-types`:
- **`NotificationRow`**: Exact PostgreSQL row mapping including all internal lifecycle and deduplication columns (`is_read`, `read_at`, `deleted_at`, `source_event_id`, `grouping_key`, `updated_at`).
- **`Notification`**: Sanitized client-facing DTO using `camelCase` properties (`id`, `recipientId`, `organizationId`, `actorId`, `type`, `title`, `body`, `resourceType`, `resourceId`, `dataPayload`, `readAt`, `createdAt`).
  - Internal database implementation details (`is_read`, `deleted_at`, `source_event_id`, `grouping_key`, DB metadata) are strictly omitted from public API contracts.

---

---

## 14. Phase 9B: Notification Backend & Service Architecture

Phase 9B provides the complete server-side notification business logic, PostgreSQL repository, recipient authorization layer, internal creation contract, and RESTful API endpoints.

### 14.1 Notification Repository Query Patterns
The `NotificationRepository` (`services/backend/src/db/repositories/notification.repository.ts`) executes raw, parameterized PostgreSQL queries using `pg.Pool` / `pg.PoolClient`:

1. **`createNotification(params, db?)`**:
   Uses the Phase 9A unique partial index constraint `uq_notifications_dedup`:
   ```sql
   INSERT INTO notifications (
     id, recipient_id, organization_id, actor_id, type,
     title, body, resource_type, resource_id, data_payload,
     grouping_key, source_event_id
   ) VALUES (
     COALESCE($1, gen_random_uuid()),
     $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
   )
   ON CONFLICT (recipient_id, type, source_event_id)
   WHERE source_event_id IS NOT NULL AND deleted_at IS NULL
   DO NOTHING
   RETURNING *;
   ```
   **Fallback SELECT on Concurrent / Duplicate Conflict**:
   If the insert returns zero rows because an active notification with the same `(recipient_id, type, source_event_id)` already exists, the repository immediately executes:
   ```sql
   SELECT * FROM notifications
   WHERE recipient_id = $1
     AND type = $2
     AND source_event_id = $3
     AND deleted_at IS NULL
   LIMIT 1;
   ```
   This guarantees:
   - Zero duplicate active notifications are created.
   - Concurrent duplicates never crash with a 500 error or SQL constraint violation.
   - The caller reliably receives the canonical active notification row.
   - If a notification was previously soft-deleted (`deleted_at IS NOT NULL`), the partial index does not conflict, allowing legitimate re-emission of notifications.

2. **Keyset Cursor Pagination (`findForRecipient` & `findUnreadForRecipient`)**:
   Pagination is strictly cursor-based using the composite key `(created_at DESC, id DESC)`. OFFSET pagination is prohibited.
   ```sql
   SELECT * FROM notifications
   WHERE recipient_id = $1
     AND (created_at, id) < ($2, $3)
     AND deleted_at IS NULL
   ORDER BY created_at DESC, id DESC
   LIMIT $4;
   ```
   For unread queries, `read_at IS NULL` is added to the predicate.
   The service queries for `limit + 1` rows to calculate `hasMore` without a separate count query. The cursor is base64url-encoded timestamp and UUID (`encodeCursor(createdAt, id)`).

3. **Read Mutation Operations**:
   - `markRead(id, recipientId)`:
     ```sql
     UPDATE notifications
     SET read_at = COALESCE(read_at, NOW()), is_read = true
     WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
     RETURNING *;
     ```
   - `markUnread(id, recipientId)`:
     ```sql
     UPDATE notifications
     SET read_at = NULL, is_read = false
     WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
     RETURNING *;
     ```
   - `markAllRead(recipientId, organizationId?)`:
     ```sql
     UPDATE notifications
     SET read_at = NOW(), is_read = true
     WHERE recipient_id = $1 AND deleted_at IS NULL AND read_at IS NULL
       [AND organization_id = $2]
     RETURNING id;
     ```
   - `softDelete(id, recipientId)`:
     ```sql
     UPDATE notifications
     SET deleted_at = NOW()
     WHERE id = $1 AND recipient_id = $2 AND deleted_at IS NULL
     RETURNING id;
     ```
   - `unreadCount(recipientId, organizationId?)`:
     ```sql
     SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE recipient_id = $1 AND deleted_at IS NULL AND read_at IS NULL
       [AND organization_id = $2];
     ```

### 14.2 Internal-Only Creation Contract
Notification creation is exclusively an internal backend/domain operation:
- **NO Public Route**: There is **strictly no** `POST /api/v1/notifications` endpoint.
- **NO Client Request Interface**: Clients and client SDKs cannot manufacture `recipientId`, `actorId`, `organizationId`, or `resourceId`.
- **Domain Verification**: Before creating a notification, `NotificationService.createNotification` verifies:
  1. Recipient exists in `users` and is active (`userRepository.findById`).
  2. Actor exists in `users` if provided (`userRepository.findById`).
  3. Referenced resource exists and matches organization context if provided:
     - `channel` -> `channelRepository.findById` + `teamRepository.findById`
     - `team` -> `teamRepository.findById`
     - `meeting` -> `meetingRepository.findById`
     - `file` -> `fileRepository.findById`
     - `message` -> `messageRepository.findById`
  4. `resource_id` is metadata only and never grants authorization to the underlying resource.

### 14.3 Recipient Authorization & Security Boundary
All notification operations enforce strict recipient-only authorization:
- `notification.recipient_id === authenticatedUserId AND notification.deleted_at === null`
- **Zero Existence Enumeration**: If user A queries or mutates a notification owned by user B, the service returns `404 NOT_FOUND` identically to a non-existent ID.
- **Organization Membership Validation**:
  When `organizationId` is passed as a filter to `getUnreadCount` or `markAllNotificationsRead`:
  1. Active organization membership is verified via `authorizationService.getOrganizationAuth(userId, organizationId)`.
  2. If the user is not an active member, the system returns `404 NOT_FOUND` (no leaking organization existence).
  3. Only after membership is verified is the query scoped by `organization_id`.

### 14.4 DTO / Internal Persistence Boundary
The repository method `mapNotification(row)` guarantees strict separation between persistence and client representation.
The client DTO `Notification` includes:
- `id`, `recipientId`, `organizationId`, `actorId`, `type`, `title`, `body`, `resourceType`, `resourceId`, `dataPayload`, `readAt`, `createdAt`.

The DTO **strictly omits**:
- `is_read` (legacy trigger-synced internal boolean)
- `deleted_at` (internal soft-delete timestamp)
- `source_event_id` (internal deduplication key)
- `grouping_key` (internal aggregation marker)
- `updated_at` (internal DB timestamp)

### 14.5 REST API Endpoints
Mounted at `/api/v1/notifications` with `requireAuth`:
1. `GET /api/v1/notifications` — Keyset cursor paginated list of active notifications.
2. `GET /api/v1/notifications/unread` — Keyset cursor paginated list of unread active notifications.
3. `GET /api/v1/notifications/unread-count[?organizationId=...]` — Count of unread active notifications.
4. `GET /api/v1/notifications/:notificationId` — Single notification retrieval (recipient-only).
5. `POST /api/v1/notifications/:notificationId/read` — Mark notification read (sets `read_at`).
6. `POST /api/v1/notifications/:notificationId/unread` — Mark notification unread (clears `read_at`).
7. `POST /api/v1/notifications/read-all` — Mark all unread notifications read for recipient.
8. `DELETE /api/v1/notifications/:notificationId` — Soft-delete notification for recipient.

### 14.6 Client SDK (`@teamtrack/api-client`)
Exposes only 8 matching client methods:
- `listNotifications(options?)`
- `listUnreadNotifications(options?)`
- `getUnreadNotificationCount(organizationId?)`
- `getNotification(id)`
- `markNotificationRead(id)`
- `markNotificationUnread(id)`
- `markAllNotificationsRead(organizationId?)`
- `deleteNotification(id)`
(Strictly no `createNotification` method).

---

---

## 15. Phase 9C Specification — Notification Realtime & Synchronization

### 15.1 Architectural Terminology & System Boundaries
The architecture enforces strict conceptual distinctions between system components:
- **Recipient Sequence**: Monotonic per-recipient mutation version allocator (`user_notification_state.last_mutation_seq`). Incremented under an exclusive atomic row lock to guarantee strict linear commit order.
- **Row `mutation_seq`**: Mutable current version of a notification row, **NOT** immutable history. Overwritten on each update or soft-deletion. This is strictly the current-state version of the row, never an audit log or historical event stream.
- **Snapshot**: Fixed upper bound sequence (`snapshotMutationSeq`) captured at the start of a particular sync pagination cycle.
- **PostgreSQL**: Authoritative durable state.
- **Redis**: Best-effort, ephemeral realtime transport.

### 15.2 Redis Failure Architecture & Convergence Guarantees
- **Durable Authority**: PostgreSQL guarantees durable authoritative notification state.
- **Client Convergence**: Client convergence occurs when an explicit reconciliation trigger runs, including reconnect, server resync signal, focus/visibility or notification-tray reconciliation, or sequence-gap detection.
- **No Unconditional Automatic Eventual Convergence**: Automatic eventual convergence is **NOT** claimed while periodic background polling is disabled.
- **Best-Effort Realtime Transport**: Redis Pub/Sub is best-effort and ephemeral.
- **Durable Commit Invariant**: A successful PostgreSQL commit is durable even if Redis publish fails.
- **Intentional Staleness Limitation**: If Redis remains unavailable and no reconciliation trigger occurs, a connected client may temporarily remain stale. This is an intentional limitation of the zero-background-polling design, not a correctness failure of PostgreSQL.

### 15.3 Migration 15 Specification & Locking Qualification
- **File**: `database/migrations/20260913120002_create_notification_mutation_sequence.sql`
- **Operations Performed**:
  1. Creates `user_notification_state` (`user_id UUID PRIMARY KEY`, `last_mutation_seq BIGINT NOT NULL DEFAULT 0`, `updated_at TIMESTAMPTZ`).
  2. Adds `notifications.mutation_seq BIGINT NULL`.
  3. Executes deterministic historical bootstrap backfill assigning contiguous sequences `1..N` per recipient.
  4. Initializes `user_notification_state` with `MAX(mutation_seq)` per recipient (or `0` for recipients without notifications).
  5. Enforces `ALTER TABLE notifications ALTER COLUMN mutation_seq SET NOT NULL`.
  6. Creates partial keyset indexes:
     - `idx_notifications_recipient_active_seq`: `(recipient_id, mutation_seq ASC, id ASC) WHERE deleted_at IS NULL`
     - `idx_notifications_recipient_deletion_seq`: `(recipient_id, mutation_seq ASC, id ASC) WHERE deleted_at IS NOT NULL`
- **Locking & Performance Qualification**:
  These operations perform table alterations, a full table backfill, NOT NULL constraint enforcement, and index creations. In production environments with large tables, these operations may require meaningful database work and table/row locking depending on table size and PostgreSQL deployment conditions. For the current development phase, Migration 15 is maintained as designed without zero-downtime multi-phase deployment wrappers.

### 15.4 Mutation Paths & Sequence Allocation
Every notification mutation path atomically allocates or updates `mutation_seq`:
1. `createNotification`: Atomically allocates recipient sequence via CTE and assigns `mutation_seq`.
2. `markRead`: Sets `read_at = NOW(), mutation_seq = nextMutationSeq`.
3. `markUnread`: Sets `read_at = NULL, mutation_seq = nextMutationSeq`.
4. `markAllRead`: Batch updates all unread active notifications, assigning the **exact same** sequence to all affected rows in a single atomic transaction.
5. `softDelete`: Sets `deleted_at = NOW(), mutation_seq = nextMutationSeq`.
No update or soft-delete path can bypass sequence allocation.

### 15.5 Bounded Snapshot Synchronization (`GET /api/v1/notifications/sync`)
- **Query Parameters**: `since` (cursor), `activeCursor`, `deletionCursor`, `snapshotMutationSeq`, `limit`.
- **Fixed Boundary**: If `snapshotMutationSeq` is supplied, queries enforce `mutation_seq <= $snapshotMutationSeq::bigint`. If absent, backend snapshots the current `user_notification_state.last_mutation_seq`.
- **Keyset Pagination**: Both active (`deleted_at IS NULL`) and deleted (`deleted_at IS NOT NULL`) streams paginate using `(mutation_seq, id) > ($cursorSeq::bigint, $cursorId)`.
- **Current Row Mutation > Snapshot (Test 9)**:
  Current row `mutation_seq > snapshot` and Redis event is missed $\implies$ next authoritative sync cycle returns the notification in the appropriate current-state stream:
  - Active/upserted if the row is active (`deleted_at IS NULL`)
  - `deletedIds` if the row is soft-deleted (`deleted_at IS NOT NULL`)

### 15.6 Client Sequence State Machine (`NotificationSyncManager`)
- `localSeq`: Tracks highest contiguous sequence processed.
- `pendingSequenceEvents`: Buffers out-of-order events (`incomingSeq > localSeq + 1n`).
- `gapResolutionTimer`: 500ms timer triggers catch-up sync if a gap is not filled by incoming events.
- **Sequence Gap Invariant**: `localSeq` never advances over an unresolved gap.
- **`read_all` Invariant**: `notification.read_all` arriving across a gap is buffered in `pendingSequenceEvents` and never mutates local cached rows while its sequence is unresolved.
- **Sync Reconciliation**: Authoritative sync advances `localSeq` directly to `snapshotMutationSeq`, reconciling current state without pretending to replay missing historical events.

### 15.7 64-Bit Integer Safety
PostgreSQL `BIGINT` exceeds `Number.MAX_SAFE_INTEGER`.
- Transmitted as `string` across SQL queries (`::text`), REST API JSON payloads, and WebSocket realtime envelopes.
- Client parses via native `BigInt(mutationSeq)`.

---

## 16. Explicit Phase 9D Boundary

The following are strictly reserved for Phase 9D and subsequent phases:
- APNs / FCM push notification delivery.
- Email notifications.
- User notification preferences & channel mute rules.
- Notification UI bell, tray, or toast components.
- Notification digest/bundling background workers.


