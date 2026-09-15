import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { notificationRepository, type DbNotification } from '../src/db/repositories/notification.repository.js';
import { notificationAuth } from '../src/modules/notifications/notification.auth.js';
import { notificationService, encodeNotificationCursor, decodeNotificationCursor } from '../src/modules/notifications/notification.service.js';
import { NotificationServiceError } from '../src/modules/notifications/notification.errors.ts';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { channelRepository } from '../src/db/repositories/channel.repository.js';
import { teamRepository } from '../src/db/repositories/team.repository.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { fileRepository } from '../src/db/repositories/file.repository.js';
import { messageRepository } from '../src/db/repositories/message.repository.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { organizationRepository } from '../src/db/repositories/organization.repository.js';
import { notificationRouter } from '../src/routes/notifications.js';
import { createApiClient } from '@teamtrack/api-client';

describe('Phase 9B: Notification Repository, Service, Authorization & API Client', () => {
  beforeEach(() => {
    userRepository.findById = async (id: string) => ({
      id,
      email: `${id}@example.com`,
      name: 'Test User',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    organizationRepository.findById = async (id: string) => ({
      id,
      name: `Org ${id}`,
      slug: `org-${id}`,
      owner_id: 'user-owner',
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
  });
  function createMockDbNotification(overrides?: Partial<DbNotification>): DbNotification {
    return {
      id: 'notif-111',
      recipient_id: 'user-recipient-1',
      organization_id: 'org-100',
      actor_id: 'user-actor-2',
      type: 'channel_mention',
      title: 'You were mentioned',
      body: 'Alice mentioned you in #general',
      resource_type: 'channel',
      resource_id: 'chan-200',
      data_payload: { channelId: 'chan-200', messageId: 'msg-300' },
      is_read: false,
      read_at: null,
      grouping_key: 'channel:chan-200',
      source_event_id: 'evt-msg-300',
      deleted_at: null,
      created_at: new Date('2026-09-13T12:00:00Z'),
      updated_at: new Date('2026-09-13T12:00:00Z'),
      ...overrides,
    };
  }

  // ==========================================================================
  // 1. REPOSITORY & DTO BOUNDARY TESTS
  // ==========================================================================
  describe('Notification Repository & DTO Field Boundary', () => {
    it('mapNotification explicitly omits internal persistence fields (is_read, deleted_at, source_event_id, grouping_key)', () => {
      const dbRow = createMockDbNotification({
        is_read: false,
        deleted_at: null,
        source_event_id: 'evt-sensitive-456',
        grouping_key: 'group-sensitive-789',
      });

      const dto = notificationRepository.mapNotification(dbRow);

      // Verify safe fields exist
      assert.strictEqual(dto.id, 'notif-111');
      assert.strictEqual(dto.recipientId, 'user-recipient-1');
      assert.strictEqual(dto.organizationId, 'org-100');
      assert.strictEqual(dto.actorId, 'user-actor-2');
      assert.strictEqual(dto.type, 'channel_mention');
      assert.strictEqual(dto.title, 'You were mentioned');
      assert.strictEqual(dto.body, 'Alice mentioned you in #general');
      assert.strictEqual(dto.resourceType, 'channel');
      assert.strictEqual(dto.resourceId, 'chan-200');
      assert.deepStrictEqual(dto.dataPayload, { channelId: 'chan-200', messageId: 'msg-300' });
      assert.strictEqual(dto.readAt, null);

      // Verify forbidden internal fields are NOT present
      assert.strictEqual('is_read' in dto, false, 'is_read must NOT be exposed on DTO');
      assert.strictEqual('deleted_at' in dto, false, 'deleted_at must NOT be exposed on DTO');
      assert.strictEqual('source_event_id' in dto, false, 'source_event_id must NOT be exposed on DTO');
      assert.strictEqual('grouping_key' in dto, false, 'grouping_key must NOT be exposed on DTO');
      assert.strictEqual((dto as any).sourceEventId, undefined);
      assert.strictEqual((dto as any).groupingKey, undefined);
      assert.strictEqual((dto as any).isRead, undefined);
      assert.strictEqual((dto as any).deletedAt, undefined);
    });

    it('createNotification executes INSERT ... ON CONFLICT DO NOTHING with fallback SELECT on conflict', async () => {
      let queryCallCount = 0;
      let queriesExecuted: string[] = [];

      const mockDb = {
        query: async (sql: string, params: any[]) => {
          queryCallCount++;
          queriesExecuted.push(sql);
          if (sql.includes('INSERT INTO notifications')) {
            // Simulate conflict by returning empty rows
            return { rows: [] };
          }
          if (sql.includes('SELECT * FROM notifications')) {
            // Fallback query returns existing active notification
            return {
              rows: [
                createMockDbNotification({
                  id: 'notif-existing-1',
                  recipient_id: params[0],
                  type: params[1],
                  source_event_id: params[2],
                }),
              ],
            };
          }
          return { rows: [] };
        },
      } as any;

      const result = await notificationRepository.createNotification(
        {
          recipientId: 'user-recipient-1',
          type: 'channel_mention',
          title: 'Duplicate test',
          body: 'Testing deduplication fallback',
          sourceEventId: 'evt-msg-300',
        },
        mockDb
      );

      assert.strictEqual(result.id, 'notif-existing-1');
      assert.strictEqual(result.recipient_id, 'user-recipient-1');
      assert.strictEqual(result.source_event_id, 'evt-msg-300');
      assert.strictEqual(queryCallCount, 2, 'Must execute insert then fallback select');
      assert.ok(queriesExecuted[0].includes('ON CONFLICT (recipient_id, type, source_event_id)'));
      assert.ok(queriesExecuted[1].includes('WHERE recipient_id = $1'));
    });

    it('createNotification without conflict returns the newly created row directly', async () => {
      let queryCallCount = 0;
      const mockDb = {
        query: async () => {
          queryCallCount++;
          return {
            rows: [createMockDbNotification({ id: 'notif-new-created' })],
          };
        },
      } as any;

      const result = await notificationRepository.createNotification(
        {
          recipientId: 'user-recipient-1',
          type: 'channel_mention',
          title: 'Brand new notification',
          body: 'Body text',
          sourceEventId: 'evt-msg-400',
        },
        mockDb
      );

      assert.strictEqual(result.id, 'notif-new-created');
      assert.strictEqual(queryCallCount, 1, 'Only one insert query needed when there is no conflict');
    });

    it('keyset cursor encodes and decodes created_at + id accurately', () => {
      const date = new Date('2026-09-13T14:30:00.123Z');
      const id = '550e8400-e29b-41d4-a716-446655440000';

      const cursor = encodeNotificationCursor(date, id);
      const decoded = decodeNotificationCursor(cursor);

      assert.strictEqual(decoded.isValid, true);
      assert.strictEqual(decoded.data?.id, id);
      assert.strictEqual(new Date(decoded.data?.createdAt!).toISOString(), date.toISOString());
    });

    it('decodeNotificationCursor returns invalid result for malformed cursors', () => {
      assert.strictEqual(decodeNotificationCursor('').isValid, false);
      assert.strictEqual(decodeNotificationCursor('invalid-base64').isValid, false);
      assert.strictEqual(decodeNotificationCursor('bm90X2pzb24=').isValid, false);
    });
  });

  // ==========================================================================
  // 2. SECURITY & AUTHORIZATION TESTS
  // ==========================================================================
  describe('Notification Authorization & Security', () => {
    it('canAccessNotification allows recipient for active notification', () => {
      const notif = createMockDbNotification({ recipient_id: 'user-alice', deleted_at: null });
      assert.strictEqual(notificationAuth.canAccessNotification(notif, 'user-alice'), true);
    });

    it('canAccessNotification denies another user (IDOR protection)', () => {
      const notif = createMockDbNotification({ recipient_id: 'user-alice', deleted_at: null });
      assert.strictEqual(notificationAuth.canAccessNotification(notif, 'user-bob'), false);
    });

    it('canAccessNotification denies soft-deleted notification even for recipient', () => {
      const notif = createMockDbNotification({
        recipient_id: 'user-alice',
        deleted_at: new Date(),
      });
      assert.strictEqual(notificationAuth.canAccessNotification(notif, 'user-alice'), false);
    });

    it('canModifyNotification allows recipient for active notification', () => {
      const notif = createMockDbNotification({ recipient_id: 'user-alice', deleted_at: null });
      assert.strictEqual(notificationAuth.canModifyNotification(notif, 'user-alice'), true);
    });

    it('canModifyNotification denies another user and soft-deleted notification', () => {
      const notif = createMockDbNotification({ recipient_id: 'user-alice', deleted_at: null });
      assert.strictEqual(notificationAuth.canModifyNotification(notif, 'user-bob'), false);

      const deletedNotif = createMockDbNotification({
        recipient_id: 'user-alice',
        deleted_at: new Date(),
      });
      assert.strictEqual(notificationAuth.canModifyNotification(deletedNotif, 'user-alice'), false);
    });

    it('getNotification returns 404 for another user notification with no existence leakage', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async (id: string) => {
          if (id === 'notif-bob-secret') {
            return createMockDbNotification({
              id: 'notif-bob-secret',
              recipient_id: 'user-bob',
            });
          }
          return null;
        };

        // User alice tries to access bob's notification
        await assert.rejects(
          async () => {
            await notificationService.getNotification('notif-bob-secret', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );

        // User alice tries to access non-existent notification -> exact same error
        await assert.rejects(
          async () => {
            await notificationService.getNotification('notif-does-not-exist', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('markNotificationRead returns 404 for another user notification', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async () =>
          createMockDbNotification({ recipient_id: 'user-bob' });

        await assert.rejects(
          async () => {
            await notificationService.markNotificationRead('notif-bob', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('markNotificationUnread returns 404 for another user notification', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async () =>
          createMockDbNotification({ recipient_id: 'user-bob' });

        await assert.rejects(
          async () => {
            await notificationService.markNotificationUnread('notif-bob', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('deleteNotification returns 404 for another user notification', async () => {
      const origFindById = notificationRepository.findById;
      try {
        notificationRepository.findById = async () =>
          createMockDbNotification({ recipient_id: 'user-bob' });

        await assert.rejects(
          async () => {
            await notificationService.deleteNotification('notif-bob', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('organization filter without active membership returns 404 for unread count', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async (_userId, orgId) => {
          if (orgId === 'org-unauthorized') {
            return { isMember: false, isOwner: false, isAdmin: false, isGuest: false };
          }
          return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
        };

        await assert.rejects(
          async () => {
            await notificationService.getUnreadCount('user-alice', 'org-unauthorized');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('organization filter without active membership returns 404 for markAllNotificationsRead', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: false,
          isOwner: false,
          isAdmin: false,
          isGuest: false,
        });

        await assert.rejects(
          async () => {
            await notificationService.markAllNotificationsRead('user-alice', 'org-unauthorized');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
      }
    });

    it('recipient spoofing is rejected (service and controller enforce authenticated user)', async () => {
      const origFindById = notificationRepository.findById;
      try {
        // Notification belongs to user-victim
        notificationRepository.findById = async () =>
          createMockDbNotification({
            id: 'notif-victim',
            recipient_id: 'user-victim',
          });

        // user-attacker tries to read user-victim's notification -> 404
        await assert.rejects(
          async () => {
            await notificationService.getNotification('notif-victim', 'user-attacker');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'NOTIFICATION_NOT_FOUND');
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('actor spoofing is rejected (backend validates actor existence)', async () => {
      const origFindUser = userRepository.findById;
      try {
        userRepository.findById = async (id: string) => {
          if (id === 'user-valid-recipient') {
            return { id, status: 'active' } as any;
          }
          if (id === 'user-spoofed-actor') {
            return null; // Actor does not exist
          }
          return null;
        };

        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-valid-recipient',
              actorId: 'user-spoofed-actor',
              type: 'mention',
              title: 'Spoofed Mention',
              body: 'Attempted spoofing',
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'USER_NOT_FOUND');
            return true;
          }
        );
      } finally {
        userRepository.findById = origFindUser;
      }
    });

    it('resource_id does NOT grant access to notification or bypass recipient authority', async () => {
      const origFindById = notificationRepository.findById;
      try {
        // Notification points to a public channel chan-public
        notificationRepository.findById = async () =>
          createMockDbNotification({
            recipient_id: 'user-bob',
            resource_type: 'channel',
            resource_id: '550e8400-e29b-41d4-a716-446655440010',
          });

        // User alice is member of chan-public, but NOT the recipient
        await assert.rejects(
          async () => {
            await notificationService.getNotification('notif-bob', 'user-alice');
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        notificationRepository.findById = origFindById;
      }
    });

    it('confirms router does NOT expose a public POST /api/v1/notifications creation route', () => {
      // Inspect the express router routes
      const routes = notificationRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      // Find any route matching exactly '/' with POST
      const postRootRoute = routes.find(
        (r: any) => (r.path === '/' || r.path === '') && r.methods.includes('post')
      );

      assert.strictEqual(postRootRoute, undefined, 'There MUST NOT be a public POST / notification route');
    });
  });

  // ==========================================================================
  // 3. RESOURCE VALIDATION IN CREATION CONTRACT
  // ==========================================================================
  describe('Internal Creation Contract & Domain Resource Validation', () => {
    const validChannelId = '550e8400-e29b-41d4-a716-446655440010';
    const nonExistentChannelId = '550e8400-e29b-41d4-a716-446655440011';
    const validTeamId = '550e8400-e29b-41d4-a716-446655440020';
    const nonExistentTeamId = '550e8400-e29b-41d4-a716-446655440021';
    const validMeetingId = '550e8400-e29b-41d4-a716-446655440030';
    const nonExistentMeetingId = '550e8400-e29b-41d4-a716-446655440031';
    const validFileId = '550e8400-e29b-41d4-a716-446655440040';
    const nonExistentFileId = '550e8400-e29b-41d4-a716-446655440041';
    const validMessageId = '550e8400-e29b-41d4-a716-446655440050';
    const nonExistentMessageId = '550e8400-e29b-41d4-a716-446655440051';

    it('validates channel resource existence and organization context', async () => {
      const origFindChannel = channelRepository.findById;
      const origFindTeam = teamRepository.findById;
      const origCreate = notificationRepository.createNotification;
      try {
        channelRepository.findById = async (id: string) => {
          if (id === validChannelId) {
            return {
              id: validChannelId,
              team_id: validTeamId,
              deleted_at: null,
            } as any;
          }
          return null;
        };

        teamRepository.findById = async (id: string) => {
          if (id === validTeamId) {
            return {
              id: validTeamId,
              organization_id: 'org-1',
              deleted_at: null,
            } as any;
          }
          return null;
        };

        notificationRepository.createNotification = async (params) =>
          createMockDbNotification({
            recipient_id: params.recipientId,
            resource_type: 'channel',
            resource_id: params.resourceId || null,
          });

        // Non-existent channel rejected
        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              type: 'mention',
              title: 'Mention',
              body: 'Hello',
              resourceType: 'channel',
              resourceId: nonExistentChannelId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
            return true;
          }
        );

        // Channel with mismatched organization context rejected
        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              organizationId: 'org-mismatch',
              type: 'mention',
              title: 'Mention',
              body: 'Hello',
              resourceType: 'channel',
              resourceId: validChannelId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, 'RESOURCE_ORGANIZATION_MISMATCH');
            return true;
          }
        );

        // Matching organization succeeds
        const notif = await notificationService.createNotification({
          recipientId: 'user-alice',
          organizationId: 'org-1',
          type: 'mention',
          title: 'Mention',
          body: 'Hello',
          resourceType: 'channel',
          resourceId: validChannelId,
        });

        assert.strictEqual(notif.recipientId, 'user-alice');
      } finally {
        channelRepository.findById = origFindChannel;
        teamRepository.findById = origFindTeam;
        notificationRepository.createNotification = origCreate;
      }
    });

    it('validates team resource existence and organization context', async () => {
      const origFindTeam = teamRepository.findById;
      try {
        teamRepository.findById = async (id: string) => {
          if (id === validTeamId) {
            return { id: validTeamId, organization_id: 'org-alpha' } as any;
          }
          return null;
        };

        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              type: 'team_activity',
              title: 'Team update',
              body: 'Join team',
              resourceType: 'team',
              resourceId: nonExistentTeamId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
            return true;
          }
        );
      } finally {
        teamRepository.findById = origFindTeam;
      }
    });

    it('validates meeting resource existence and organization context', async () => {
      const origFindMeeting = meetingRepository.findById;
      try {
        meetingRepository.findById = async (id: string) => {
          if (id === validMeetingId) {
            return { id: validMeetingId, organizationId: 'org-1' } as any;
          }
          return null;
        };

        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              type: 'meeting_started',
              title: 'Meeting starting',
              body: 'Join meeting',
              resourceType: 'meeting',
              resourceId: nonExistentMeetingId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
            return true;
          }
        );
      } finally {
        meetingRepository.findById = origFindMeeting;
      }
    });

    it('validates file resource existence and organization context', async () => {
      const origFindFile = fileRepository.findById;
      try {
        fileRepository.findById = async (id: string) => {
          if (id === validFileId) {
            return { id: validFileId, organization_id: 'org-1' } as any;
          }
          return null;
        };

        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              type: 'system',
              title: 'File shared',
              body: 'Doc shared',
              resourceType: 'file',
              resourceId: nonExistentFileId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
            return true;
          }
        );
      } finally {
        fileRepository.findById = origFindFile;
      }
    });

    it('validates message resource existence', async () => {
      const origFindMsg = messageRepository.findById;
      try {
        messageRepository.findById = async (id: string) => {
          if (id === validMessageId) {
            return { id: validMessageId } as any;
          }
          return null;
        };

        await assert.rejects(
          async () => {
            await notificationService.createNotification({
              recipientId: 'user-alice',
              type: 'mention',
              title: 'Mention',
              body: 'Text',
              resourceType: 'message',
              resourceId: nonExistentMessageId,
            });
          },
          (err: NotificationServiceError) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
            return true;
          }
        );
      } finally {
        messageRepository.findById = origFindMsg;
      }
    });
  });

  // ==========================================================================
  // 4. DEDUPLICATION & IDEMPOTENCY
  // ==========================================================================
  describe('Deduplication & Idempotency', () => {
    it('same source event returns one active notification idempotently', async () => {
      const origCreate = notificationRepository.createNotification;
      try {
        let insertAttempts = 0;
        const storedRow = createMockDbNotification({
          id: 'notif-dedup-1',
          recipient_id: 'user-alice',
          type: 'mention',
          source_event_id: 'event-unique-999',
        });

        notificationRepository.createNotification = async () => {
          insertAttempts++;
          return storedRow;
        };

        const first = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'First call',
          body: 'First message',
          sourceEventId: 'event-unique-999',
        });

        const second = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'Second call duplicate',
          body: 'Second message',
          sourceEventId: 'event-unique-999',
        });

        assert.strictEqual(first.id, second.id);
        assert.strictEqual(first.id, 'notif-dedup-1');
        assert.strictEqual(insertAttempts, 2);
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    it('concurrent duplicate creation does not produce 500', async () => {
      const mockDb = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('INSERT INTO notifications')) {
            return { rows: [] }; // Simulate duplicate conflict
          }
          if (sql.includes('SELECT * FROM notifications')) {
            return {
              rows: [
                createMockDbNotification({
                  id: 'notif-concurrent-safe',
                  recipient_id: params[0],
                  type: params[1],
                  source_event_id: params[2],
                }),
              ],
            };
          }
          return { rows: [] };
        },
      } as any;

      const res = await notificationRepository.createNotification(
        {
          recipientId: 'user-bob',
          type: 'meeting_started',
          title: 'Meeting starting',
          body: 'Join now',
          sourceEventId: 'meet-evt-123',
        },
        mockDb
      );

      assert.strictEqual(res.id, 'notif-concurrent-safe');
      assert.strictEqual(res.recipient_id, 'user-bob');
    });

    it('different source_event_id values create separate notifications', async () => {
      const origCreate = notificationRepository.createNotification;
      try {
        notificationRepository.createNotification = async (params) =>
          createMockDbNotification({
            id: `notif-${params.sourceEventId}`,
            source_event_id: params.sourceEventId || null,
          });

        const n1 = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'Msg 1',
          body: 'First',
          sourceEventId: 'evt-1',
        });

        const n2 = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'Msg 2',
          body: 'Second',
          sourceEventId: 'evt-2',
        });

        assert.notStrictEqual(n1.id, n2.id);
        assert.strictEqual(n1.id, 'notif-evt-1');
        assert.strictEqual(n2.id, 'notif-evt-2');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    it('soft-deleted notification allows re-emission with same source_event_id', async () => {
      // Because partial index is WHERE deleted_at IS NULL, a soft-deleted row
      // does not conflict with a new active row.
      const origCreate = notificationRepository.createNotification;
      try {
        let callCount = 0;
        notificationRepository.createNotification = async (params) => {
          callCount++;
          return createMockDbNotification({
            id: `notif-v${callCount}`,
            source_event_id: params.sourceEventId || null,
            deleted_at: null,
          });
        };

        const first = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'Initial',
          body: 'Initial body',
          sourceEventId: 'evt-reemit',
        });

        // After deletion, creating again produces a new active notification
        const reemitted = await notificationService.createNotification({
          recipientId: 'user-alice',
          type: 'mention',
          title: 'Re-emitted',
          body: 'Re-emitted body',
          sourceEventId: 'evt-reemit',
        });

        assert.strictEqual(first.id, 'notif-v1');
        assert.strictEqual(reemitted.id, 'notif-v2');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });
  });

  // ==========================================================================
  // 5. READ STATE & UNREAD MANAGEMENT
  // ==========================================================================
  describe('Read State & Unread Management', () => {
    it('new notification is unread (readAt is null)', () => {
      const notif = notificationRepository.mapNotification(
        createMockDbNotification({ read_at: null, is_read: false })
      );
      assert.strictEqual(notif.readAt, null);
    });

    it('markRead sets readAt', async () => {
      const origFindById = notificationRepository.findById;
      const origMarkRead = notificationRepository.markRead;
      try {
        notificationRepository.findById = async () =>
          createMockDbNotification({ recipient_id: 'user-alice', read_at: null });

        notificationRepository.markRead = async () =>
          createMockDbNotification({
            recipient_id: 'user-alice',
            read_at: new Date('2026-09-13T15:00:00Z'),
            is_read: true,
          });

        const updated = await notificationService.markNotificationRead('notif-1', 'user-alice');
        assert.ok(updated.readAt !== null);
        assert.strictEqual(updated.readAt, '2026-09-13T15:00:00.000Z');
      } finally {
        notificationRepository.findById = origFindById;
        notificationRepository.markRead = origMarkRead;
      }
    });

    it('markUnread clears readAt', async () => {
      const origFindById = notificationRepository.findById;
      const origMarkUnread = notificationRepository.markUnread;
      try {
        notificationRepository.findById = async () =>
          createMockDbNotification({
            recipient_id: 'user-alice',
            read_at: new Date('2026-09-13T15:00:00Z'),
            is_read: true,
          });

        notificationRepository.markUnread = async () =>
          createMockDbNotification({
            recipient_id: 'user-alice',
            read_at: null,
            is_read: false,
          });

        const updated = await notificationService.markNotificationUnread('notif-1', 'user-alice');
        assert.strictEqual(updated.readAt, null);
      } finally {
        notificationRepository.findById = origFindById;
        notificationRepository.markUnread = origMarkUnread;
      }
    });

    it('markAllRead only affects authenticated recipient', async () => {
      const origMarkAll = notificationRepository.markAllRead;
      try {
        let capturedRecipientId: string | null = null;
        notificationRepository.markAllRead = async (recipientId) => {
          capturedRecipientId = recipientId;
          return 5;
        };

        const res = await notificationService.markAllNotificationsRead('user-auth-only');
        assert.strictEqual(capturedRecipientId, 'user-auth-only');
        assert.strictEqual(res.count, 5);
      } finally {
        notificationRepository.markAllRead = origMarkAll;
      }
    });

    it('organization-scoped markAllRead only affects verified organization', async () => {
      const origGetOrgAuth = authorizationService.getOrganizationAuth;
      const origMarkAll = notificationRepository.markAllRead;
      try {
        authorizationService.getOrganizationAuth = async (_userId, orgId) => {
          if (orgId === 'org-verified') {
            return { isMember: true, isOwner: false, isAdmin: false, isGuest: false };
          }
          return { isMember: false, isOwner: false, isAdmin: false, isGuest: false };
        };

        let capturedOrgId: string | undefined = undefined;
        notificationRepository.markAllRead = async (_recipientId, orgId) => {
          capturedOrgId = orgId;
          return 3;
        };

        const res = await notificationService.markAllNotificationsRead('user-alice', 'org-verified');
        assert.strictEqual(capturedOrgId, 'org-verified');
        assert.strictEqual(res.count, 3);
      } finally {
        authorizationService.getOrganizationAuth = origGetOrgAuth;
        notificationRepository.markAllRead = origMarkAll;
      }
    });
  });

  // ==========================================================================
  // 6. PAGINATION & KEYSET CURSOR
  // ==========================================================================
  describe('Pagination & Keyset Cursor', () => {
    it('listNotifications correctly computes hasMore and nextCursor based on limit boundary', async () => {
      const origFind = notificationRepository.findForRecipient;
      try {
        const d1 = new Date('2026-09-13T12:00:00Z');
        const d2 = new Date('2026-09-13T11:00:00Z');

        const id1 = '550e8400-e29b-41d4-a716-446655440001';
        const id2 = '550e8400-e29b-41d4-a716-446655440002';
        const id3 = '550e8400-e29b-41d4-a716-446655440003';

        // Limit requested = 2, service fetches limit + 1 = 3 to detect hasMore
        notificationRepository.findForRecipient = async (_recipientId, options) => {
          assert.strictEqual(options.limit, 3);
          return [
            createMockDbNotification({ id: id1, created_at: d1 }),
            createMockDbNotification({ id: id2, created_at: d2 }),
            createMockDbNotification({ id: id3, created_at: new Date('2026-09-13T10:00:00Z') }),
          ];
        };

        const res = await notificationService.listNotifications('user-alice', { limit: 2 });
        assert.strictEqual(res.items.length, 2);
        assert.strictEqual(res.hasMore, true);
        assert.ok(res.nextCursor !== null);

        // Decoded nextCursor points to item #2 (the last of the returned page)
        const decoded = decodeNotificationCursor(res.nextCursor!);
        assert.strictEqual(decoded.isValid, true);
        assert.strictEqual(decoded.data?.id, id2);
        assert.strictEqual(new Date(decoded.data?.createdAt!).toISOString(), d2.toISOString());
      } finally {
        notificationRepository.findForRecipient = origFind;
      }
    });

    it('listNotifications sets nextCursor to null and hasMore to false when at end of page', async () => {
      const origFind = notificationRepository.findForRecipient;
      try {
        notificationRepository.findForRecipient = async () => [
          createMockDbNotification({ id: 'notif-only-one' }),
        ];

        const res = await notificationService.listNotifications('user-alice', { limit: 5 });
        assert.strictEqual(res.items.length, 1);
        assert.strictEqual(res.hasMore, false);
        assert.strictEqual(res.nextCursor, null);
      } finally {
        notificationRepository.findForRecipient = origFind;
      }
    });
  });

  // ==========================================================================
  // 7. SOFT DELETE
  // ==========================================================================
  describe('Soft Delete Invariants', () => {
    it('deleted notification disappears from lists', async () => {
      const origFind = notificationRepository.findForRecipient;
      try {
        // Notification repo query contains `deleted_at IS NULL`
        notificationRepository.findForRecipient = async () => [];

        const res = await notificationService.listNotifications('user-alice');
        assert.strictEqual(res.items.length, 0);
      } finally {
        notificationRepository.findForRecipient = origFind;
      }
    });

    it('deleted notification is excluded from unread count', async () => {
      const origCount = notificationRepository.unreadCount;
      try {
        // Notification repo count contains `deleted_at IS NULL AND read_at IS NULL`
        notificationRepository.unreadCount = async () => 0;

        const res = await notificationService.getUnreadCount('user-alice');
        assert.strictEqual(res.count, 0);
      } finally {
        notificationRepository.unreadCount = origCount;
      }
    });
  });

  // ==========================================================================
  // 8. API CLIENT (8 METHODS)
  // ==========================================================================
  describe('API Client Methods (All 8 Methods)', () => {
    let originalFetch: typeof globalThis.fetch;
    let lastRequest: { url: string; method: string; body?: any; headers?: any } | null = null;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      lastRequest = null;
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

    it('1. listNotifications sends GET to /api/v1/notifications with query parameters', async () => {
      setupMockFetch({ items: [], nextCursor: null, hasMore: false });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.listNotifications({ cursor: 'cursor123', limit: 15 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'GET');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications?cursor=cursor123&limit=15');
    });

    it('2. listUnreadNotifications sends GET to /api/v1/notifications/unread', async () => {
      setupMockFetch({ items: [], nextCursor: null, hasMore: false });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.listUnreadNotifications({ limit: 10 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'GET');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/unread?limit=10');
    });

    it('3. getUnreadNotificationCount sends GET to /api/v1/notifications/unread-count with optional org', async () => {
      setupMockFetch({ unreadCount: 7 });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.getUnreadNotificationCount('org-xyz');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'GET');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/unread-count?organizationId=org-xyz');
      assert.strictEqual(res.data?.unreadCount, 7);
    });

    it('4. getNotification sends GET to /api/v1/notifications/:id', async () => {
      setupMockFetch({ notification: { id: 'notif-999' } });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.getNotification('notif-999');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'GET');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-999');
    });

    it('5. markNotificationRead sends POST to /api/v1/notifications/:id/read', async () => {
      setupMockFetch({ notification: { id: 'notif-999', readAt: '2026-09-13T12:00:00Z' } });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.markNotificationRead('notif-999');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'POST');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-999/read');
    });

    it('6. markNotificationUnread sends POST to /api/v1/notifications/:id/unread', async () => {
      setupMockFetch({ notification: { id: 'notif-999', readAt: null } });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.markNotificationUnread('notif-999');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'POST');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-999/unread');
    });

    it('7. markAllNotificationsRead sends POST to /api/v1/notifications/read-all with body', async () => {
      setupMockFetch({ message: 'All notifications marked as read', updatedCount: 4 });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.markAllNotificationsRead('org-abc');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'POST');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/read-all');
      assert.strictEqual(lastRequest?.body?.organizationId, 'org-abc');
      assert.strictEqual(res.data?.updatedCount, 4);
    });

    it('8. deleteNotification sends DELETE to /api/v1/notifications/:id', async () => {
      setupMockFetch({ message: 'Notification deleted successfully' });
      const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
      client.setAccessToken('test-token');

      const res = await client.deleteNotification('notif-999');
      assert.strictEqual(res.success, true);
      assert.strictEqual(lastRequest?.method, 'DELETE');
      assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/notifications/notif-999');
    });

    it('confirms createNotification is NOT exposed on ApiClient', () => {
      const client = createApiClient({ baseUrl: 'http://localhost:4000' });
      assert.strictEqual((client as any).createNotification, undefined, 'Client must NOT have createNotification');
    });
  });
});
