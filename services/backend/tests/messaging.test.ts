import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MessagingService, MessagingServiceError } from '../src/modules/messaging/messaging.service.js';
import { messageRepository, type DbMessage } from '../src/db/repositories/message.repository.js';
import { reactionRepository } from '../src/db/repositories/reaction.repository.js';
import { channelReadStateRepository } from '../src/db/repositories/channelReadState.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { encodeCursor, decodeCursor, validateReactionCode } from '@teamtrack/validation';
import type { MessageWithSender } from '@teamtrack/shared-types';

describe('Phase 6: Messaging, Keyset Pagination, Reactions & Read State', () => {
  const messagingService = new MessagingService();

  let origPoolConnect: any;

  beforeEach(() => {
    origPoolConnect = pool.connect;
    pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    } as any);
  });

  afterEach(() => {
    pool.connect = origPoolConnect;
  });

  describe('Channel Message Creation & Authorization Boundaries', () => {
    it('creates a channel message successfully when authorized', async () => {
      const origAuth = authorizationService.getChannelAuth;
      const origInsert = messageRepository.insert;
      const origFind = messageRepository.findWithSenderById;
      const origPub = eventPublisher.publish;

      let publishedEvent: any = null;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        messageRepository.insert = async (params) => ({
          id: 'msg-101',
          channel_id: params.channelId || null,
          conversation_id: null,
          sender_id: params.senderId,
          parent_message_id: params.parentMessageId || null,
          content: params.content,
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date('2026-09-12T10:00:00.000Z'),
          updated_at: new Date('2026-09-12T10:00:00.000Z'),
          deleted_at: null,
          idempotency_key: params.idempotencyKey || null,
        });

        messageRepository.findWithSenderById = async (id) => ({
          id,
          channelId: 'chan-1',
          conversationId: null,
          senderId: 'user-1',
          parentMessageId: null,
          content: 'Hello TeamTrack!',
          contentType: 'text/plain',
          isEdited: false,
          isDeleted: false,
          createdAt: '2026-09-12T10:00:00.000Z',
          updatedAt: '2026-09-12T10:00:00.000Z',
          deletedAt: null,
          idempotencyKey: null,
          sender: {
            id: 'user-1',
            displayName: 'Alice',
            avatarUrl: null,
            email: 'alice@example.com',
          },
          reactions: [],
          attachments: [],
        });

        eventPublisher.publish = async (event, topic, payload) => {
          publishedEvent = { event, topic, payload };
          return {} as any;
        };

        const res = await messagingService.sendChannelMessage('chan-1', 'user-1', {
          content: 'Hello TeamTrack!',
        });

        assert.strictEqual(res.isIdempotentRetry, false);
        assert.strictEqual(res.message.id, 'msg-101');
        assert.strictEqual(res.message.content, 'Hello TeamTrack!');
        assert.strictEqual(publishedEvent?.event, 'message.created');
        assert.strictEqual(publishedEvent?.topic, 'channel:chan-1');
      } finally {
        authorizationService.getChannelAuth = origAuth;
        messageRepository.insert = origInsert;
        messageRepository.findWithSenderById = origFind;
        eventPublisher.publish = origPub;
      }
    });

    it('rejects cross-tenant message creation with 404 NOT_FOUND (anti-IDOR)', async () => {
      const origAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: false,
          canAccess: false,
          isPrivate: false,
          isChannelMember: false,
          isLeadOrOrgAdmin: false,
        });

        await assert.rejects(
          async () => {
            await messagingService.sendChannelMessage('foreign-chan', 'user-1', {
              content: 'Should fail',
            });
          },
          (err: MessagingServiceError) => {
            assert.strictEqual(err.code, 'NOT_FOUND');
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = origAuth;
      }
    });

    it('rejects parent message belonging to a different channel (PARENT_MESSAGE_TARGET_MISMATCH)', async () => {
      const origAuth = authorizationService.getChannelAuth;
      const origFind = messageRepository.findById;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        messageRepository.findById = async () => ({
          id: 'parent-msg-99',
          channel_id: 'different-chan',
          conversation_id: null,
          sender_id: 'user-2',
          parent_message_id: null,
          content: 'Parent on other channel',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        await assert.rejects(
          async () => {
            await messagingService.sendChannelMessage('chan-1', 'user-1', {
              content: 'Reply to wrong channel',
              parentMessageId: 'parent-msg-99',
            });
          },
          (err: MessagingServiceError) => {
            assert.strictEqual(err.code, 'PARENT_MESSAGE_TARGET_MISMATCH');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = origAuth;
        messageRepository.findById = origFind;
      }
    });
  });

  describe('Keyset Cursor Pagination', () => {
    it('correctly encodes and decodes cursor (created_at + id)', () => {
      const createdAt = '2026-09-12T12:30:00.000Z';
      const id = '12345678-1234-1234-1234-123456789abc';

      const cursor = encodeCursor(createdAt, id);
      assert.strictEqual(typeof cursor, 'string');
      assert(cursor.length > 0);

      const decoded = decodeCursor(cursor);
      assert.strictEqual(decoded.isValid, true);
      assert.strictEqual(decoded.data?.createdAt, createdAt);
      assert.strictEqual(decoded.data?.id, id);
    });

    it('rejects malformed or invalid base64 cursor', () => {
      const res1 = decodeCursor('not-valid-base64-url!!!@@@');
      assert.strictEqual(res1.isValid, false);

      const res2 = decodeCursor('');
      assert.strictEqual(res2.isValid, false);

      // Base64 containing no separator
      const res3 = decodeCursor(Buffer.from('nodateorid').toString('base64url'));
      assert.strictEqual(res3.isValid, false);

      // Base64 with invalid timestamp
      const res4 = decodeCursor(Buffer.from('not-a-date:12345678-1234-1234-1234-123456789abc').toString('base64url'));
      assert.strictEqual(res4.isValid, false);

      // Base64 with invalid UUID
      const res5 = decodeCursor(Buffer.from('2026-09-12T12:30:00.000Z:not-a-uuid').toString('base64url'));
      assert.strictEqual(res5.isValid, false);
    });

    it('handles identical timestamps deterministically with id tie-breaker', async () => {
      const origAuth = authorizationService.getChannelAuth;
      const origList = messageRepository.listChannelMessages;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        const sameTime = '2026-09-12T10:00:00.000Z';
        const mockMessages: MessageWithSender[] = [
          {
            id: 'b-uuid-2',
            channelId: 'chan-1',
            conversationId: null,
            senderId: 'user-1',
            parentMessageId: null,
            content: 'Message 2',
            contentType: 'text/plain',
            isEdited: false,
            isDeleted: false,
            createdAt: sameTime,
            updatedAt: sameTime,
            deletedAt: null,
            idempotencyKey: null,
            sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
          },
          {
            id: 'a-uuid-1',
            channelId: 'chan-1',
            conversationId: null,
            senderId: 'user-1',
            parentMessageId: null,
            content: 'Message 1',
            contentType: 'text/plain',
            isEdited: false,
            isDeleted: false,
            createdAt: sameTime,
            updatedAt: sameTime,
            deletedAt: null,
            idempotencyKey: null,
            sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
          },
        ];

        messageRepository.listChannelMessages = async () => mockMessages;

        const res = await messagingService.listChannelMessages('chan-1', 'user-1', { limit: 2 });
        assert.strictEqual(res.items.length, 2);
        assert.strictEqual(res.items[0].id, 'b-uuid-2');
        assert.strictEqual(res.items[1].id, 'a-uuid-1');
      } finally {
        authorizationService.getChannelAuth = origAuth;
        messageRepository.listChannelMessages = origList;
      }
    });
  });

  describe('Message Edit & Soft Delete', () => {
    it('allows author to edit message and publishes message.updated', async () => {
      const origFind = messageRepository.findById;
      const origEdit = messageRepository.edit;
      const origFindSender = messageRepository.findWithSenderById;
      const origPub = eventPublisher.publish;

      let publishedEvent: any = null;

      try {
        messageRepository.findById = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'author-1',
          parent_message_id: null,
          content: 'Original content',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        messageRepository.edit = async (id, content) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'author-1',
          parent_message_id: null,
          content,
          content_type: 'text/plain',
          is_edited: true,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        messageRepository.findWithSenderById = async (id) => ({
          id,
          channelId: 'chan-1',
          conversationId: null,
          senderId: 'author-1',
          parentMessageId: null,
          content: 'Edited content',
          contentType: 'text/plain',
          isEdited: true,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          idempotencyKey: null,
          sender: { id: 'author-1', displayName: 'Author', avatarUrl: null, email: 'auth@test.com' },
        });

        eventPublisher.publish = async (event, topic, payload) => {
          publishedEvent = { event, topic, payload };
          return {} as any;
        };

        const res = await messagingService.editMessage('msg-1', 'author-1', {
          content: 'Edited content',
        });

        assert.strictEqual(res.content, 'Edited content');
        assert.strictEqual(res.isEdited, true);
        assert.strictEqual(publishedEvent?.event, 'message.updated');
      } finally {
        messageRepository.findById = origFind;
        messageRepository.edit = origEdit;
        messageRepository.findWithSenderById = origFindSender;
        eventPublisher.publish = origPub;
      }
    });

    it('rejects editing by non-author with 403 NOT_MESSAGE_AUTHOR', async () => {
      const origFind = messageRepository.findById;
      try {
        messageRepository.findById = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'author-1',
          parent_message_id: null,
          content: 'Original content',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        await assert.rejects(
          async () => {
            await messagingService.editMessage('msg-1', 'intruder-2', { content: 'Hacked' });
          },
          (err: MessagingServiceError) => {
            assert.strictEqual(err.code, 'NOT_MESSAGE_AUTHOR');
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        messageRepository.findById = origFind;
      }
    });

    it('soft deletes message, clears content, and publishes message.deleted', async () => {
      const origFind = messageRepository.findById;
      const origSoftDelete = messageRepository.softDelete;
      const origFindSender = messageRepository.findWithSenderById;
      const origPub = eventPublisher.publish;

      let publishedEvent: any = null;

      try {
        messageRepository.findById = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'author-1',
          parent_message_id: null,
          content: 'Sensitive message',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        messageRepository.softDelete = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'author-1',
          parent_message_id: null,
          content: '',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: new Date(),
          idempotency_key: null,
        });

        messageRepository.findWithSenderById = async (id) => ({
          id,
          channelId: 'chan-1',
          conversationId: null,
          senderId: 'author-1',
          parentMessageId: null,
          content: '',
          contentType: 'text/plain',
          isEdited: false,
          isDeleted: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: new Date().toISOString(),
          idempotencyKey: null,
          sender: { id: 'author-1', displayName: 'Author', avatarUrl: null, email: 'auth@test.com' },
        });

        eventPublisher.publish = async (event, topic, payload) => {
          publishedEvent = { event, topic, payload };
          return {} as any;
        };

        const res = await messagingService.deleteMessage('msg-1', 'author-1');
        assert.strictEqual(res.isDeleted, true);
        assert.strictEqual(res.content, '');
        assert.strictEqual(publishedEvent?.event, 'message.deleted');
        assert.strictEqual(publishedEvent?.payload.id, 'msg-1');
      } finally {
        messageRepository.findById = origFind;
        messageRepository.softDelete = origSoftDelete;
        messageRepository.findWithSenderById = origFindSender;
        eventPublisher.publish = origPub;
      }
    });
  });

  describe('Reactions Validation & Aggregation', () => {
    it('validates reaction codes correctly (Unicode emojis, shortcodes, slugs)', () => {
      // Standard Unicode Emojis
      assert.strictEqual(validateReactionCode('👍').isValid, true);
      assert.strictEqual(validateReactionCode('❤️').isValid, true);
      assert.strictEqual(validateReactionCode('🚀').isValid, true);
      assert.strictEqual(validateReactionCode('🎉').isValid, true);

      // Shortcodes
      assert.strictEqual(validateReactionCode(':thumbsup:').isValid, true);
      assert.strictEqual(validateReactionCode(':heart:').isValid, true);
      assert.strictEqual(validateReactionCode(':+1:').isValid, true);

      // Slugs
      assert.strictEqual(validateReactionCode('plus_one').isValid, true);
      assert.strictEqual(validateReactionCode('like').isValid, true);

      // Invalid reactions
      assert.strictEqual(validateReactionCode('').isValid, false);
      assert.strictEqual(validateReactionCode('   ').isValid, false);
      assert.strictEqual(validateReactionCode('invalid code with spaces').isValid, false);
    });

    it('adds reaction and publishes reaction.added event', async () => {
      const origFind = messageRepository.findById;
      const origAuth = authorizationService.getChannelAuth;
      const origAdd = reactionRepository.addReaction;
      const origPub = eventPublisher.publish;

      let publishedEvent: any = null;

      try {
        messageRepository.findById = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'user-1',
          parent_message_id: null,
          content: 'Test message',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        reactionRepository.addReaction = async (messageId, userId, reactionCode) => ({
          reaction: {
            id: 'react-1',
            messageId,
            userId,
            reactionCode,
            createdAt: new Date().toISOString(),
          },
          created: true,
        });

        eventPublisher.publish = async (event, topic, payload) => {
          publishedEvent = { event, topic, payload };
          return {} as any;
        };

        const res = await messagingService.addReaction('msg-1', 'user-2', {
          reactionCode: '👍',
        });

        assert.strictEqual(res.reactionCode, '👍');
        assert.strictEqual(publishedEvent?.event, 'reaction.added');
        assert.strictEqual(publishedEvent?.payload.reactionCode, '👍');
      } finally {
        messageRepository.findById = origFind;
        authorizationService.getChannelAuth = origAuth;
        reactionRepository.addReaction = origAdd;
        eventPublisher.publish = origPub;
      }
    });

    it('removes reaction and publishes reaction.removed event', async () => {
      const origFind = messageRepository.findById;
      const origAuth = authorizationService.getChannelAuth;
      const origRemove = reactionRepository.removeReaction;
      const origPub = eventPublisher.publish;

      let publishedEvent: any = null;

      try {
        messageRepository.findById = async (id) => ({
          id,
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'user-1',
          parent_message_id: null,
          content: 'Test message',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        reactionRepository.removeReaction = async () => true;

        eventPublisher.publish = async (event, topic, payload) => {
          publishedEvent = { event, topic, payload };
          return {} as any;
        };

        await messagingService.removeReaction('msg-1', 'user-2', '👍');

        assert.strictEqual(publishedEvent?.event, 'reaction.removed');
        assert.strictEqual(publishedEvent?.payload.reactionCode, '👍');
      } finally {
        messageRepository.findById = origFind;
        authorizationService.getChannelAuth = origAuth;
        reactionRepository.removeReaction = origRemove;
        eventPublisher.publish = origPub;
      }
    });
  });

  describe('Channel Read State & Delta Synchronization', () => {
    it('marks channel read, persists last_read_at, and broadcasts channel.read', async () => {
      const origAuth = authorizationService.getChannelAuth;
      const origUpsert = channelReadStateRepository.upsertReadState;
      const origPub = eventPublisher.publish;

      const events: any[] = [];

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        channelReadStateRepository.upsertReadState = async (channelId, userId, msgId) => ({
          id: 'crs-1',
          channelId,
          userId,
          lastReadMessageId: msgId,
          lastReadAt: new Date().toISOString(),
        });

        eventPublisher.publish = async (event, topic, payload) => {
          events.push({ event, topic, payload });
          return {} as any;
        };

        const res = await messagingService.markChannelRead('chan-1', 'user-1');
        assert.strictEqual(res.channelId, 'chan-1');
        assert.strictEqual(res.userId, 'user-1');

        // Multi-device sync on user's private topic + channel topic
        assert(events.some((e) => e.topic === 'user:user-1'));
        assert(events.some((e) => e.topic === 'channel:chan-1'));
      } finally {
        authorizationService.getChannelAuth = origAuth;
        channelReadStateRepository.upsertReadState = origUpsert;
        eventPublisher.publish = origPub;
      }
    });

    it('delta synchronization discovers soft-deleted messages so clients remove them', async () => {
      const origAuth = authorizationService.getChannelAuth;
      const origSync = messageRepository.syncChannelMessages;
      const origReactions = reactionRepository.listReactionsSince;
      const origRead = channelReadStateRepository.getReadState;
      const origCount = channelReadStateRepository.countUnreadMessages;

      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        messageRepository.syncChannelMessages = async () => ({
          upserted: [
            {
              id: 'msg-created-1',
              channelId: 'chan-1',
              conversationId: null,
              senderId: 'user-1',
              parentMessageId: null,
              content: 'New message',
              contentType: 'text/plain',
              isEdited: false,
              isDeleted: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
              idempotencyKey: null,
              sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
            },
          ],
          deletedIds: ['msg-deleted-99'],
        });

        reactionRepository.listReactionsSince = async () => [];
        channelReadStateRepository.getReadState = async () => ({
          id: 'crs-1',
          channelId: 'chan-1',
          userId: 'user-1',
          lastReadMessageId: null,
          lastReadAt: new Date('2026-09-12T00:00:00Z').toISOString(),
        });
        channelReadStateRepository.countUnreadMessages = async () => 1;

        const res = await messagingService.syncChannel('chan-1', 'user-1', '2026-09-12T00:00:00Z');
        assert.strictEqual(res.channelId, 'chan-1');
        assert.strictEqual(res.messages.length, 1);
        assert.strictEqual(res.deletedMessageIds.length, 1);
        assert.strictEqual(res.deletedMessageIds[0], 'msg-deleted-99');
        assert.strictEqual(res.unreadCount, 1);
      } finally {
        authorizationService.getChannelAuth = origAuth;
        messageRepository.syncChannelMessages = origSync;
        reactionRepository.listReactionsSince = origReactions;
        channelReadStateRepository.getReadState = origRead;
        channelReadStateRepository.countUnreadMessages = origCount;
      }
    });
  });
});
