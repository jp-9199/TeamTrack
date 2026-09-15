import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApiClient, NotificationSyncManager } from '../src/index.js';
import type {
  Notification,
  NotificationSyncResponse,
  RealtimeEnvelope,
  NotificationCreatedPayload,
  NotificationReadPayload,
  NotificationUnreadPayload,
  NotificationReadAllPayload,
  NotificationDeletedPayload,
} from '@teamtrack/shared-types';

describe('Phase 9C: ApiClient Notification Sync & State Machine', () => {
  it('1. syncNotifications sends GET to /api/v1/notifications/sync with query params', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedMethod = init?.method || 'GET';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            syncedAt: '2026-09-14T00:00:00.000Z',
            snapshotMutationSeq: '100',
            upserted: [],
            deletedIds: [],
            unreadCount: 0,
            activeCursor: null,
            deletionCursor: null,
            hasMoreActive: false,
            hasMoreDeletions: false,
          },
          timestamp: '2026-09-14T00:00:00.000Z',
        }),
      } as any;
    }) as any;

    try {
      const client = createApiClient({ baseUrl: 'http://localhost:3000', platform: 'web' });
      client.setAccessToken('valid-token');
      const res = await client.syncNotifications({
        activeCursor: 'MTU6MDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAw',
        deletionCursor: 'MTA6MDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAw',
        snapshotMutationSeq: '100',
        limit: 25,
      });

      assert.strictEqual(capturedMethod, 'GET');
      assert.match(capturedUrl, /\/api\/v1\/notifications\/sync\?/);
      assert.match(capturedUrl, /activeCursor=MTU/);
      assert.match(capturedUrl, /deletionCursor=MTA/);
      assert.match(capturedUrl, /snapshotMutationSeq=100/);
      assert.match(capturedUrl, /limit=25/);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.snapshotMutationSeq, '100');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. NotificationSyncManager: in-order events advance localSeq sequentially', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    assert.strictEqual(manager.getLocalSeq(), 0n);
    assert.strictEqual(manager.getUnreadCount(), 0);

    const event1: RealtimeEnvelope<NotificationCreatedPayload> = {
      eventId: 'evt-1',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '1',
        notification: {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Hello',
          body: 'World',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          mutationSeq: '1',
        },
      },
      timestamp: '2026-09-14T00:00:00.000Z',
      version: 1,
    };

    manager.handleRealtimeEvent(event1);
    assert.strictEqual(manager.getLocalSeq(), 1n);
    assert.strictEqual(manager.getUnreadCount(), 1);
    assert.strictEqual(manager.getNotifications().length, 1);

    // Stale/duplicate event with seq 1 is safely ignored
    manager.handleRealtimeEvent(event1);
    assert.strictEqual(manager.getLocalSeq(), 1n);
    assert.strictEqual(manager.getUnreadCount(), 1);
  });

  it('3. NotificationSyncManager: handles out-of-order events without skipping (seq 3 before seq 2)', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    let gapDetectedCalled = false;
    const manager = new NotificationSyncManager({
      apiClient: client,
      onGapDetected: () => {
        gapDetectedCalled = true;
      },
    });

    // Sequence 1 arrives
    manager.handleRealtimeEvent({
      eventId: 'evt-1',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '1',
        notification: {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'First',
          body: 'Body',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          mutationSeq: '1',
        },
      },
      timestamp: '2026-09-14T00:00:00.000Z',
      version: 1,
    });
    assert.strictEqual(manager.getLocalSeq(), 1n);

    // Sequence 3 arrives before sequence 2
    manager.handleRealtimeEvent({
      eventId: 'evt-3',
      event: 'notification.read',
      topic: 'user:user-1',
      payload: {
        notificationId: 'notif-1',
        readAt: '2026-09-14T00:01:00.000Z',
        mutationSeq: '3',
      },
      timestamp: '2026-09-14T00:01:00.000Z',
      version: 1,
    });

    // localSeq MUST NOT advance to 3 while seq 2 is missing!
    assert.strictEqual(manager.getLocalSeq(), 1n);
    assert.strictEqual(manager.getPendingCount(), 1);
    assert.strictEqual(gapDetectedCalled, true);

    // Sequence 2 arrives
    manager.handleRealtimeEvent({
      eventId: 'evt-2',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '2',
        notification: {
          id: 'notif-2',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'direct_message',
          title: 'Second',
          body: 'Body',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:30.000Z',
          mutationSeq: '2',
        },
      },
      timestamp: '2026-09-14T00:00:30.000Z',
      version: 1,
    });

    // Both seq 2 and buffered seq 3 must now be drained and applied in order
    assert.strictEqual(manager.getLocalSeq(), 3n);
    assert.strictEqual(manager.getPendingCount(), 0);
    assert.strictEqual(manager.getNotifications().length, 2);
    // notif-1 should be read (from seq 3)
    const notif1 = manager.getNotifications().find((n) => n.id === 'notif-1');
    assert.ok(notif1?.readAt !== null, 'notif-1 must have readAt set');
  });

  it('4. NotificationSyncManager: read_all under sequence gap is buffered until continuity is restored', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    // localSeq = 1
    manager.handleRealtimeEvent({
      eventId: 'evt-1',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '1',
        notification: {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'One',
          body: 'One',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          mutationSeq: '1',
        },
      },
      timestamp: '2026-09-14T00:00:00.000Z',
      version: 1,
    });
    assert.strictEqual(manager.getLocalSeq(), 1n);

    // read_all with seq 3 arrives (seq 2 missing)
    const serverDbTimestamp = '2026-09-14T00:02:00.123Z';
    manager.handleRealtimeEvent({
      eventId: 'evt-3',
      event: 'notification.read_all',
      topic: 'user:user-1',
      payload: {
        organizationId: null,
        affectedCount: 2,
        unreadCount: 0,
        readAt: serverDbTimestamp,
        mutationSeq: '3',
      },
      timestamp: '2026-09-14T00:02:00.000Z',
      version: 1,
    });

    // read_all must NOT be applied across gap; localSeq remains 1; notif-1 remains unread
    assert.strictEqual(manager.getLocalSeq(), 1n);
    assert.strictEqual(manager.getPendingCount(), 1);
    assert.strictEqual(manager.getNotifications()[0].readAt, null);

    // seq 2 arrives
    manager.handleRealtimeEvent({
      eventId: 'evt-2',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '2',
        notification: {
          id: 'notif-2',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Two',
          body: 'Two',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:01:00.000Z',
          mutationSeq: '2',
        },
      },
      timestamp: '2026-09-14T00:01:00.000Z',
      version: 1,
    });

    // Continuity restored: seq 2 applied, then seq 3 (read_all) applied
    assert.strictEqual(manager.getLocalSeq(), 3n);
    assert.strictEqual(manager.getPendingCount(), 0);
    assert.strictEqual(manager.getUnreadCount(), 0);
    assert.strictEqual(manager.getNotifications()[0].readAt, serverDbTimestamp);
    assert.strictEqual(manager.getNotifications()[1].readAt, serverDbTimestamp);
  });

  it('5. NotificationSyncManager: applySyncResponse advances localSeq and reconciles state', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    const syncResponse: NotificationSyncResponse = {
      syncedAt: '2026-09-14T00:05:00.000Z',
      snapshotMutationSeq: '50',
      upserted: [
        {
          id: 'notif-10',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'Synced Notification',
          body: 'Synced Body',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          mutationSeq: '50',
        },
      ],
      deletedIds: ['notif-old'],
      unreadCount: 1,
      activeCursor: null,
      deletionCursor: null,
      hasMoreActive: false,
      hasMoreDeletions: false,
    };

    manager.applySyncResponse(syncResponse);
    assert.strictEqual(manager.getLocalSeq(), 50n);
    assert.strictEqual(manager.getUnreadCount(), 1);
    assert.strictEqual(manager.getNotifications().length, 1);
    assert.strictEqual(manager.getNotifications()[0].id, 'notif-10');
  });

  it('6. NotificationSyncManager: uses event.readAt rather than local device clock, applying identical timestamp across multiple affected rows', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000' });
    const manager = new NotificationSyncManager({ apiClient: client });

    manager.handleRealtimeEvent({
      eventId: 'evt-1',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '1',
        notification: {
          id: 'notif-1',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'mention',
          title: 'One',
          body: 'One',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          mutationSeq: '1',
        },
      },
      timestamp: '2026-09-14T00:00:00.000Z',
      version: 1,
    });

    manager.handleRealtimeEvent({
      eventId: 'evt-2',
      event: 'notification.created',
      topic: 'user:user-1',
      payload: {
        mutationSeq: '2',
        notification: {
          id: 'notif-2',
          recipientId: 'user-1',
          organizationId: null,
          actorId: null,
          type: 'direct_message',
          title: 'Two',
          body: 'Two',
          resourceType: null,
          resourceId: null,
          dataPayload: {},
          readAt: null,
          createdAt: '2026-09-14T00:00:10.000Z',
          mutationSeq: '2',
        },
      },
      timestamp: '2026-09-14T00:00:10.000Z',
      version: 1,
    });

    assert.strictEqual(manager.getUnreadCount(), 2);

    const authoritativeReadAt = '2026-09-14T01:15:30.456Z';
    manager.handleRealtimeEvent({
      eventId: 'evt-3',
      event: 'notification.read_all',
      topic: 'user:user-1',
      payload: {
        organizationId: null,
        affectedCount: 2,
        unreadCount: 0,
        readAt: authoritativeReadAt,
        mutationSeq: '3',
      },
      timestamp: '2026-09-14T01:15:30.500Z',
      version: 1,
    });

    assert.strictEqual(manager.getLocalSeq(), 3n);
    assert.strictEqual(manager.getUnreadCount(), 0);
    const notifs = manager.getNotifications();
    assert.strictEqual(notifs[0].readAt, authoritativeReadAt, 'Row 1 must receive authoritative readAt');
    assert.strictEqual(notifs[1].readAt, authoritativeReadAt, 'Row 2 must receive authoritative readAt');
    assert.strictEqual(notifs[0].mutationSeq, '3');
    assert.strictEqual(notifs[1].mutationSeq, '3');
  });
});
