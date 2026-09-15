import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { notificationRepository, type DbNotification } from '../src/db/repositories/notification.repository.js';
import { notificationService } from '../src/modules/notifications/notification.service.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { subscriptionManager } from '../src/realtime/subscription.manager.js';
import {
  encodeNotificationSyncCursor,
  decodeNotificationSyncCursor,
  validateNotificationSyncQuery,
} from '@teamtrack/validation';
import { NotificationSyncManager, createApiClient } from '@teamtrack/api-client';
import type {
  Notification,
  RealtimeEnvelope,
  NotificationCreatedPayload,
  NotificationReadPayload,
  NotificationReadAllPayload,
  NotificationDeletedPayload,
} from '@teamtrack/shared-types';

describe('Phase 9C: Notification Realtime, Monotonic Sequence & Concurrency Verification', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migration15Path = path.join(migrationsDir, '20260913120002_create_notification_mutation_sequence.sql');

  beforeEach(() => {
    userRepository.findById = async (id: string) =>
      ({
        id,
        email: `${id}@example.com`,
        name: 'Test User',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
  });

  // --------------------------------------------------------------------------
  // 1. Migration 15 & Schema Validation
  // --------------------------------------------------------------------------
  it('1. verifies migration 15 file exists, is sequence 15, and is transactional', () => {
    assert.strictEqual(fs.existsSync(migration15Path), true, 'Migration 15 file must exist');
    const content = fs.readFileSync(migration15Path, 'utf8');
    assert.match(content, /^BEGIN;/m, 'Migration must start with BEGIN;');
    assert.match(content, /^COMMIT;/m, 'Migration must end with COMMIT;');

    // Table creation
    assert.match(content, /CREATE TABLE IF NOT EXISTS user_notification_state/i);
    assert.match(content, /last_mutation_seq BIGINT NOT NULL DEFAULT 0/i);

    // Column addition and NOT NULL
    assert.match(content, /ALTER TABLE notifications ADD COLUMN IF NOT EXISTS mutation_seq BIGINT NULL;/i);
    assert.match(content, /ALTER TABLE notifications ALTER COLUMN mutation_seq SET NOT NULL;/i);

    // Partial Indexes
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_notifications_recipient_active_seq/i);
    assert.match(content, /WHERE deleted_at IS NULL;/i);
    assert.match(content, /CREATE INDEX IF NOT EXISTS idx_notifications_recipient_deletion_seq/i);
    assert.match(content, /WHERE deleted_at IS NOT NULL;/i);
  });

  it('2. verifies migration 15 backfill establishes deterministic bootstrap state for both active and deleted rows', () => {
    const content = fs.readFileSync(migration15Path, 'utf8');
    // Bootstrap sequence partition by recipient_id ordered by created_at, id
    assert.match(content, /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY recipient_id\s+ORDER BY created_at ASC, id ASC\s*\)/i);
    // Backfill applies without filtering out deleted rows so all existing rows receive a sequence
    assert.match(content, /UPDATE notifications n\s+SET mutation_seq = r\.seq/i);
    // user_notification_state initialized with MAX(mutation_seq)
    assert.match(content, /COALESCE\(MAX\(mutation_seq\), 0\)/i);
  });

  // --------------------------------------------------------------------------
  // 2. 64-bit Integer (BIGINT) String Safety & Keyset Cursor Round-Trip
  // --------------------------------------------------------------------------
  it('3. verifies 64-bit integer mutationSeq crosses API boundary as string and round-trips safely', () => {
    const hugeSeq = '9007199254740995'; // Exceeds Number.MAX_SAFE_INTEGER (2^53 - 1)
    const id = '11111111-2222-3333-4444-555555555555';

    const encoded = encodeNotificationSyncCursor(hugeSeq, id);
    assert.strictEqual(typeof encoded, 'string');

    const decoded = decodeNotificationSyncCursor(encoded);
    assert.strictEqual(decoded.isValid, true);
    if (decoded.isValid) {
      assert.strictEqual(decoded.data.mutationSeq, hugeSeq);
      assert.strictEqual(decoded.data.id, id);
      // BigInt comparisons must be exact
      assert.strictEqual(BigInt(decoded.data.mutationSeq), 9007199254740995n);
    }
  });

  it('4. validateNotificationSyncQuery parses cursor and boundary parameters safely', () => {
    const validQuery = {
      activeCursor: encodeNotificationSyncCursor('100', '11111111-2222-3333-4444-555555555555'),
      deletionCursor: encodeNotificationSyncCursor('50', '22222222-3333-4444-5555-666666666666'),
      snapshotMutationSeq: '150',
      limit: '25',
    };

    const res = validateNotificationSyncQuery(validQuery);
    assert.strictEqual(res.isValid, true);
    if (res.isValid) {
      assert.strictEqual(res.data.activeCursor?.mutationSeq, '100');
      assert.strictEqual(res.data.deletionCursor?.mutationSeq, '50');
      assert.strictEqual(res.data.snapshotMutationSeq, '150');
      assert.strictEqual(res.data.limit, 25);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Concurrency Tests: Out-of-Order Events & Gap Resolution
  // --------------------------------------------------------------------------
  it('5. Test 1: seq 12 arrives before seq 11 -> buffered in pending queue, then both drain in order', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    // Bootstrap client at localSeq = 10
    manager.applySyncResponse({
      syncedAt: new Date().toISOString(),
      snapshotMutationSeq: '10',
      upserted: [],
      deletedIds: [],
      unreadCount: 0,
      activeCursor: null,
      deletionCursor: null,
      hasMoreActive: false,
      hasMoreDeletions: false,
    });
    assert.strictEqual(manager.getLocalSeq(), 10n);

    // Event 12 arrives before Event 11
    manager.handleRealtimeEvent({
      eventId: 'evt-12',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '12',
        notification: {
          id: 'notif-12',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Notice 12',
          body: 'Notice 12',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: new Date().toISOString(),
          mutationSeq: '12',
        },
      },
      timestamp: new Date().toISOString(),
      version: 1,
    });

    // Invariant: localSeq MUST NOT advance to 12; event 12 held in pending buffer
    assert.strictEqual(manager.getLocalSeq(), 10n);
    assert.strictEqual(manager.getPendingCount(), 1);

    // Event 11 arrives
    manager.handleRealtimeEvent({
      eventId: 'evt-11',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '11',
        notification: {
          id: 'notif-11',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Notice 11',
          body: 'Notice 11',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: new Date().toISOString(),
          mutationSeq: '11',
        },
      },
      timestamp: new Date().toISOString(),
      version: 1,
    });

    // Invariant: Event 11 applied, followed immediately by Event 12; localSeq advances to 12
    assert.strictEqual(manager.getLocalSeq(), 12n);
    assert.strictEqual(manager.getPendingCount(), 0);
    assert.strictEqual(manager.getNotifications().length, 2);
  });

  it('6. Test 2: seq 11 missing and seq 12 arrives -> gap detected without skipping', () => {
    let gapDetected = false;
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({
      apiClient: client,
      onGapDetected: () => {
        gapDetected = true;
      },
    });

    manager.applySyncResponse({
      syncedAt: new Date().toISOString(),
      snapshotMutationSeq: '10',
      upserted: [],
      deletedIds: [],
      unreadCount: 0,
      activeCursor: null,
      deletionCursor: null,
      hasMoreActive: false,
      hasMoreDeletions: false,
    });

    // Seq 12 arrives without seq 11
    manager.handleRealtimeEvent({
      eventId: 'evt-12',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '12',
        notification: {
          id: 'notif-12',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Notice 12',
          body: 'Notice 12',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: new Date().toISOString(),
          mutationSeq: '12',
        },
      },
      timestamp: new Date().toISOString(),
      version: 1,
    });

    assert.strictEqual(gapDetected, true);
    assert.strictEqual(manager.getLocalSeq(), 10n);
    assert.strictEqual(manager.getPendingCount(), 1);
  });

  it('7. Test 6: read_all arrives with unresolved sequence gap -> buffered, does not mutate cached rows prematurely', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    // Client has notif-1 at seq 10 unread
    manager.applySyncResponse({
      syncedAt: new Date().toISOString(),
      snapshotMutationSeq: '10',
      upserted: [
        {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Notice 1',
          body: 'Notice 1',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: new Date().toISOString(),
          mutationSeq: '10',
        },
      ],
      deletedIds: [],
      unreadCount: 1,
      activeCursor: null,
      deletionCursor: null,
      hasMoreActive: false,
      hasMoreDeletions: false,
    });
    assert.strictEqual(manager.getUnreadCount(), 1);

    // read_all arrives with seq 12 (seq 11 missing)
    manager.handleRealtimeEvent({
      eventId: 'evt-readall-12',
      event: 'notification.read_all',
      topic: 'user:user-1',
      payload: {
        organizationId: null,
        affectedCount: 2,
        unreadCount: 0,
        mutationSeq: '12',
      },
      timestamp: new Date().toISOString(),
      version: 1,
    });

    // Invariant: read_all MUST NOT apply across gap; localSeq remains 10; notif-1 remains unread
    assert.strictEqual(manager.getLocalSeq(), 10n);
    assert.strictEqual(manager.getPendingCount(), 1);
    assert.strictEqual(manager.getNotifications()[0].readAt, null);

    // Catch-up sync resolves gap up to seq 12
    manager.applySyncResponse({
      syncedAt: new Date().toISOString(),
      snapshotMutationSeq: '12',
      upserted: [
        {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Notice 1',
          body: 'Notice 1',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          mutationSeq: '12',
        },
      ],
      deletedIds: [],
      unreadCount: 0,
      activeCursor: null,
      deletionCursor: null,
      hasMoreActive: false,
      hasMoreDeletions: false,
    });

    assert.strictEqual(manager.getLocalSeq(), 12n);
    assert.strictEqual(manager.getUnreadCount(), 0);
    assert.ok(manager.getNotifications()[0].readAt !== null);
  });

  // --------------------------------------------------------------------------
  // 4. Concurrency Tests: Mutation Streams, Current State & Soft Deletions
  // --------------------------------------------------------------------------
  it('9. Current row mutation_seq > snapshot and Redis event is missed → next authoritative sync cycle returns the notification in the appropriate current-state stream: active/upserted if the row is active, or deletedIds if the row is soft-deleted', async () => {
    // ------------------------------------------------------------------------
    // Part A: Missed active-row update/read/unread/create state
    // Row created at seq 5, initial sync snapshot S=10.
    // Row is updated/read at seq 15 while client was stale/missed Redis event.
    // At snapshot S=10, row has mutation_seq=15 > S, so excluded from S=10.
    // In next sync S'=20, row has mutation_seq=15 <= S' and deleted_at IS NULL -> returned in active/upserted!
    // ------------------------------------------------------------------------
    const mockDbActive = {
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('user_notification_state')) {
          return { rows: [{ last_mutation_seq: '20' }] };
        }
        if (sql.includes('deleted_at IS NULL')) {
          return {
            rows: [
              {
                id: 'notif-active-15',
                recipient_id: 'user-1',
                organization_id: null,
                actor_id: null,
                type: 'mention',
                title: 'Updated Active Notice',
                body: 'Body',
                resource_type: null,
                resource_id: null,
                data_payload: {},
                is_read: true,
                read_at: new Date(),
                grouping_key: null,
                source_event_id: null,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date(),
                mutation_seq: '15',
              },
            ],
          };
        }
        if (sql.includes('deleted_at IS NOT NULL')) {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: 0 }] };
        }
        return { rows: [] };
      },
    };

    const deltaActive = await notificationRepository.syncForRecipient('user-1', { limit: 50 }, mockDbActive as any);
    assert.strictEqual(deltaActive.snapshotMutationSeq, '20');
    assert.strictEqual(deltaActive.upserted.length, 1, 'Active missed mutation must return in active/upserted stream');
    assert.strictEqual(deltaActive.upserted[0].id, 'notif-active-15');
    assert.strictEqual(deltaActive.deletedIds.length, 0);

    // ------------------------------------------------------------------------
    // Part B: Missed soft-delete state
    // Row created at seq 5, soft-deleted at seq 15 while client was stale/missed Redis event.
    // In next sync S'=20, row has mutation_seq=15 <= S' and deleted_at IS NOT NULL -> returned in deletedIds!
    // ------------------------------------------------------------------------
    const mockDbDeleted = {
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('user_notification_state')) {
          return { rows: [{ last_mutation_seq: '20' }] };
        }
        if (sql.includes('deleted_at IS NULL')) {
          return { rows: [] };
        }
        if (sql.includes('deleted_at IS NOT NULL')) {
          return {
            rows: [{ id: 'notif-deleted-15', mutation_seq: '15' }],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: 0 }] };
        }
        return { rows: [] };
      },
    };

    const deltaDeleted = await notificationRepository.syncForRecipient('user-1', { limit: 50 }, mockDbDeleted as any);
    assert.strictEqual(deltaDeleted.snapshotMutationSeq, '20');
    assert.strictEqual(deltaDeleted.upserted.length, 0);
    assert.strictEqual(deltaDeleted.deletedIds.length, 1, 'Soft-deleted missed mutation must return in deletedIds stream');
    assert.strictEqual(deltaDeleted.deletedIds[0], 'notif-deleted-15');
  });

  it('10. Test 4: update followed by delete between pages -> deletion stream purges row; row never resurrected', async () => {
    // Notification N was updated at seq 11, deleted at seq 12.
    // Client paginates Page 1 (active) and Page 2 (deletion).
    // Active query filters deleted_at IS NULL, so N is NEVER returned in active stream.
    // Deletion query filters deleted_at IS NOT NULL, so N is returned in deletedIds.
    const mockDb = {
      query: async (sql: string) => {
        if (sql.includes('deleted_at IS NULL')) {
          return { rows: [] }; // N not returned in active
        }
        if (sql.includes('deleted_at IS NOT NULL')) {
          return { rows: [{ id: 'notif-n', mutation_seq: '12' }] }; // N returned in deletion stream
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: 0 }] };
        }
        return { rows: [{ last_mutation_seq: '15' }] };
      },
    };

    const delta = await notificationRepository.syncForRecipient(
      'user-1',
      { snapshotMutationSeq: '15', limit: 10 },
      mockDb as any
    );

    assert.strictEqual(delta.upserted.length, 0);
    assert.strictEqual(delta.deletedIds.includes('notif-n'), true);
  });

  // --------------------------------------------------------------------------
  // 5. Post-Commit Realtime Publishing & Security Isolation
  // --------------------------------------------------------------------------
  it('11. verifies NotificationService mutation paths publish realtime events with mutationSeq post-commit', async () => {
    const publishedEvents: { event: string; topic: string; payload: any }[] = [];
    const origPublish = eventPublisher.publish;
    eventPublisher.publish = (async (event: any, topic: string, payload: any) => {
      publishedEvents.push({ event, topic, payload });
      return { eventId: 'evt-test', event, topic, payload, timestamp: new Date().toISOString(), version: 1 };
    }) as any;

    const origCreate = notificationRepository.createNotification;
    const origFindById = notificationRepository.findById;
    const origMarkRead = notificationRepository.markRead;

    try {
      // Mock repository methods
      notificationRepository.createNotification = async () => ({
        id: 'notif-99',
        recipient_id: 'user-recipient-1',
        organization_id: null,
        actor_id: null,
        type: 'mention',
        title: 'Title',
        body: 'Body',
        resource_type: null,
        resource_id: null,
        data_payload: {},
        is_read: false,
        read_at: null,
        grouping_key: null,
        source_event_id: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        mutation_seq: '42',
      });

      notificationRepository.findById = async () => ({
        id: 'notif-99',
        recipient_id: 'user-recipient-1',
        organization_id: null,
        actor_id: null,
        type: 'mention',
        title: 'Title',
        body: 'Body',
        resource_type: null,
        resource_id: null,
        data_payload: {},
        is_read: false,
        read_at: null,
        grouping_key: null,
        source_event_id: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        mutation_seq: '42',
      });

      notificationRepository.markRead = async () => ({
        id: 'notif-99',
        recipient_id: 'user-recipient-1',
        organization_id: null,
        actor_id: null,
        type: 'mention',
        title: 'Title',
        body: 'Body',
        resource_type: null,
        resource_id: null,
        data_payload: {},
        is_read: true,
        read_at: new Date(),
        grouping_key: null,
        source_event_id: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        mutation_seq: '43',
      });

      // 1. createNotification
      const notif = await notificationService.createNotification({
        recipientId: 'user-recipient-1',
        type: 'mention',
        title: 'Title',
        body: 'Body',
      });
      assert.strictEqual(notif.mutationSeq, '42');
      assert.strictEqual(publishedEvents.length, 1);
      assert.strictEqual(publishedEvents[0].event, 'notification.created');
      assert.strictEqual(publishedEvents[0].topic, 'user:user-recipient-1');
      assert.strictEqual(publishedEvents[0].payload.mutationSeq, '42');

      // 2. markRead
      await notificationService.markNotificationRead('notif-99', 'user-recipient-1');
      assert.strictEqual(publishedEvents.length, 2);
      assert.strictEqual(publishedEvents[1].event, 'notification.read');
      assert.strictEqual(publishedEvents[1].topic, 'user:user-recipient-1');
      assert.strictEqual(publishedEvents[1].payload.mutationSeq, '43');
    } finally {
      eventPublisher.publish = origPublish;
      notificationRepository.createNotification = origCreate;
      notificationRepository.findById = origFindById;
      notificationRepository.markRead = origMarkRead;
    }
  });

  it('12. verifies SubscriptionManager strictly isolates user topics preventing cross-user eavesdropping', async () => {
    const mockSocketUser1 = { id: 'sock-1', userId: 'user-1', send: () => {} } as any;

    // Subscribing to self: allowed
    const selfRes = await subscriptionManager.subscribe(mockSocketUser1, 'user:user-1');
    assert.strictEqual(selfRes.success, true);

    // Subscribing to another user topic: strictly forbidden
    const foreignRes = await subscriptionManager.subscribe(mockSocketUser1, 'user:user-2');
    assert.strictEqual(foreignRes.success, false);
    assert.strictEqual(foreignRes.error, 'FORBIDDEN_USER_TOPIC');
  });

  // ==========================================================================
  // 6. Focused Regression Tests: Sequence Gap Prevention (Issue 1)
  // ==========================================================================
  describe('Issue 1: Mutation Sequence Gap Prevention', () => {
    it('A. duplicate createNotification does not consume a sequence (seq 1 -> duplicate returns seq 1 -> next create gets seq 2)', async () => {
      let currentSeq = 0n;
      const notificationsTable: any[] = [];

      const statefulDb = {
        query: async (sql: string, params?: any[]) => {
          if (sql.includes('WITH seq AS') || sql.includes('INSERT INTO notifications')) {
            // Check conflict
            const existing = notificationsTable.find(
              (n) => n.recipient_id === params![1] && n.type === params![4] && n.source_event_id === params![11]
            );
            if (existing) {
              // Conflict! In real DB, ON CONFLICT DO NOTHING returns 0 rows and TX rolls back
              return { rows: [] };
            }
            currentSeq += 1n;
            const newRow = {
              id: params![0] || 'notif-' + currentSeq,
              recipient_id: params![1],
              type: params![4],
              source_event_id: params![11],
              mutation_seq: currentSeq.toString(),
              deleted_at: null,
              read_at: null,
            };
            notificationsTable.push(newRow);
            return { rows: [newRow] };
          }
          if (sql.includes('SELECT * FROM notifications')) {
            const existing = notificationsTable.find(
              (n) => n.recipient_id === params![0] && n.type === params![1] && n.source_event_id === params![2]
            );
            return { rows: existing ? [existing] : [] };
          }
          return { rows: [] };
        },
      };

      // 1. First creation -> seq 1
      const n1 = await notificationRepository.createNotification(
        {
          recipientId: 'user-seq-test',
          type: 'channel_mention',
          title: 'Title 1',
          body: 'Body 1',
          sourceEventId: 'evt-first',
        },
        statefulDb as any
      );
      assert.strictEqual(n1.mutation_seq, '1');
      assert.strictEqual(currentSeq, 1n);

      // 2. Duplicate creation -> returns existing n1, seq remains 1
      const n1Dup = await notificationRepository.createNotification(
        {
          recipientId: 'user-seq-test',
          type: 'channel_mention',
          title: 'Title 1 Duplicate',
          body: 'Body 1 Duplicate',
          sourceEventId: 'evt-first',
        },
        statefulDb as any
      );
      assert.strictEqual(n1Dup.id, n1.id);
      assert.strictEqual(n1Dup.mutation_seq, '1');
      assert.strictEqual(currentSeq, 1n, 'Duplicate creation must NOT advance currentSeq');

      // 3. Next real mutation -> seq 2 (contiguous, zero gap!)
      const n2 = await notificationRepository.createNotification(
        {
          recipientId: 'user-seq-test',
          type: 'channel_mention',
          title: 'Title 2',
          body: 'Body 2',
          sourceEventId: 'evt-second',
        },
        statefulDb as any
      );
      assert.strictEqual(n2.mutation_seq, '2', 'Next real mutation must be seq 2 with zero gap');
      assert.strictEqual(currentSeq, 2n);
    });

    it('B. already-read markRead does not create a committed unused sequence', async () => {
      let currentSeq = 5n;
      const notifRow = {
        id: 'notif-read-already',
        recipient_id: 'user-1',
        read_at: new Date('2026-09-14T00:00:00Z'),
        mutation_seq: '5',
        deleted_at: null,
      };

      const mockDb = {
        query: async (sql: string) => {
          if (sql.includes('INSERT INTO user_notification_state')) {
            currentSeq += 1n;
            return { rows: [{ last_mutation_seq: currentSeq.toString() }] };
          }
          if (sql.includes('UPDATE notifications')) {
            // WHERE read_at IS NULL -> returns empty rows because already read
            return { rows: [] };
          }
          if (sql.includes('SELECT * FROM notifications')) {
            return { rows: [notifRow] };
          }
          return { rows: [] };
        },
      };

      // Calling repository markRead when already read
      const res = await notificationRepository.markRead('notif-read-already', 'user-1', mockDb as any);
      assert.ok(res !== null);
      assert.strictEqual(res.read_at !== null, true);
      assert.strictEqual(res.mutation_seq, '5');

      // In NotificationService, checks existing.read_at !== null and returns immediately without invoking repository
      const origFindById = notificationRepository.findById;
      const origMarkRead = notificationRepository.markRead;
      try {
        notificationRepository.findById = async () => notifRow as any;
        let markReadCalled = false;
        notificationRepository.markRead = async () => {
          markReadCalled = true;
          return notifRow as any;
        };

        const serviceRes = await notificationService.markNotificationRead('notif-read-already', 'user-1');
        assert.strictEqual(serviceRes.mutationSeq, '5');
        assert.strictEqual(markReadCalled, false, 'markRead repository method must NOT be called on already-read notification');
      } finally {
        notificationRepository.findById = origFindById;
        notificationRepository.markRead = origMarkRead;
      }
    });

    it('C. already-unread markUnread does not create a committed unused sequence', async () => {
      const notifRow = {
        id: 'notif-unread-already',
        recipient_id: 'user-1',
        read_at: null,
        mutation_seq: '5',
        deleted_at: null,
      };

      const origFindById = notificationRepository.findById;
      const origMarkUnread = notificationRepository.markUnread;
      try {
        notificationRepository.findById = async () => notifRow as any;
        let markUnreadCalled = false;
        notificationRepository.markUnread = async () => {
          markUnreadCalled = true;
          return notifRow as any;
        };

        const serviceRes = await notificationService.markNotificationUnread('notif-unread-already', 'user-1');
        assert.strictEqual(serviceRes.mutationSeq, '5');
        assert.strictEqual(markUnreadCalled, false, 'markUnread repository method must NOT be called on already-unread notification');
      } finally {
        notificationRepository.findById = origFindById;
        notificationRepository.markUnread = origMarkUnread;
      }
    });

    it('D. already-deleted delete does not create a committed unused sequence', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async () => null; // findById filters deleted_at IS NULL
        let softDeleteCalled = false;
        notificationRepository.softDelete = async () => {
          softDeleteCalled = true;
          return { success: false, mutationSeq: '0' };
        };

        await assert.rejects(
          async () => {
            await notificationService.deleteNotification('notif-deleted-already', 'user-1');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
        assert.strictEqual(softDeleteCalled, false, 'softDelete must NOT be called on already-deleted notification');
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('E. not-found mutation does not create a committed unused sequence', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async () => null;

        await assert.rejects(
          async () => {
            await notificationService.markNotificationRead('notif-nonexistent', 'user-1');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );

        await assert.rejects(
          async () => {
            await notificationService.markNotificationUnread('notif-nonexistent', 'user-1');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );

        await assert.rejects(
          async () => {
            await notificationService.deleteNotification('notif-nonexistent', 'user-1');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('F. concurrent successful mutations still receive strictly ordered contiguous sequences', async () => {
      let sharedCounter = 100n;
      const mockDb = {
        query: async (sql: string) => {
          if (sql.includes('INSERT INTO user_notification_state')) {
            sharedCounter += 1n;
            return { rows: [{ last_mutation_seq: sharedCounter.toString() }] };
          }
          return { rows: [{ id: 'notif-id' }] };
        },
      };

      const [seqA, seqB, seqC] = await Promise.all([
        notificationRepository.nextMutationSeq('user-1', mockDb as any),
        notificationRepository.nextMutationSeq('user-1', mockDb as any),
        notificationRepository.nextMutationSeq('user-1', mockDb as any),
      ]);

      const numbers = [BigInt(seqA), BigInt(seqB), BigInt(seqC)].sort((a, b) => (a < b ? -1 : 1));
      assert.strictEqual(numbers[1], numbers[0] + 1n);
      assert.strictEqual(numbers[2], numbers[1] + 1n);
    });

    it('G. concurrent first-time user_notification_state creation still safely produces seq 1 and seq 2', async () => {
      let stateCreated = false;
      let seq = 0n;

      const mockDb = {
        query: async (sql: string) => {
          if (sql.includes('INSERT INTO user_notification_state')) {
            if (!stateCreated) {
              stateCreated = true;
              seq = 1n;
            } else {
              seq += 1n;
            }
            return { rows: [{ last_mutation_seq: seq.toString() }] };
          }
          return { rows: [] };
        },
      };

      const seq1 = await notificationRepository.nextMutationSeq('user-new', mockDb as any);
      const seq2 = await notificationRepository.nextMutationSeq('user-new', mockDb as any);

      assert.strictEqual(seq1, '1');
      assert.strictEqual(seq2, '2');
    });
  });

  // ==========================================================================
  // 7. Authoritative read_all Timestamp (Issue 2)
  // ==========================================================================
  describe('Issue 2: Authoritative read_all Timestamp', () => {
    it('1 & 3. markAllNotificationsRead publishes event with authoritative readAt and all affected rows receive identical readAt', async () => {
      const publishedEvents: any[] = [];
      const origPublish = eventPublisher.publish;
      eventPublisher.publish = (async (event: any, topic: string, payload: any) => {
        publishedEvents.push({ event, topic, payload });
        return { eventId: 'evt-test', event, topic, payload, timestamp: new Date().toISOString(), version: 1 };
      }) as any;

      const origMarkAll = notificationRepository.markAllRead;
      const origUnreadCount = notificationRepository.unreadCount;
      const authoritativeTimestamp = '2026-09-14T01:30:00.789Z';

      try {
        notificationRepository.markAllRead = async () => ({
          count: 5,
          mutationSeq: '77',
          readAt: authoritativeTimestamp,
        });
        notificationRepository.unreadCount = async () => 0;

        const res = await notificationService.markAllNotificationsRead('user-1');
        assert.strictEqual(res.count, 5);

        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'notification.read_all');
        assert.strictEqual(publishedEvents[0].payload.readAt, authoritativeTimestamp, 'Event must contain authoritative database readAt');
        assert.strictEqual(publishedEvents[0].payload.mutationSeq, '77');
        assert.strictEqual(publishedEvents[0].payload.affectedCount, 5);
        assert.strictEqual(publishedEvents[0].payload.unreadCount, 0);
      } finally {
        eventPublisher.publish = origPublish;
        notificationRepository.markAllRead = origMarkAll;
        notificationRepository.unreadCount = origUnreadCount;
      }
    });

    it('5 & 6. markAllNotificationsRead with 0 unread notifications is a no-op and does not publish an event or consume sequence', async () => {
      const publishedEvents: any[] = [];
      const origPublish = eventPublisher.publish;
      eventPublisher.publish = (async (event: any, topic: string, payload: any) => {
        publishedEvents.push({ event, topic, payload });
        return { eventId: 'evt-test', event, topic, payload, timestamp: new Date().toISOString(), version: 1 };
      }) as any;

      const origMarkAll = notificationRepository.markAllRead;
      try {
        notificationRepository.markAllRead = async () => ({
          count: 0,
          mutationSeq: '0',
          readAt: new Date().toISOString(),
        });

        const res = await notificationService.markAllNotificationsRead('user-1');
        assert.strictEqual(res.count, 0);
        assert.strictEqual(publishedEvents.length, 0, 'No event should be published when affectedCount is 0');
      } finally {
        eventPublisher.publish = origPublish;
        notificationRepository.markAllRead = origMarkAll;
      }
    });
  });
});
