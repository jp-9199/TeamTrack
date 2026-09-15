import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MessagingService, MessagingServiceError } from '../src/modules/messaging/messaging.service.js';
import { messageRepository, type DbMessage } from '../src/db/repositories/message.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';

describe('Phase 6: Strict Message Idempotency Semantics', () => {
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

  it('FIRST REQUEST: inserts message, publishes message.created, and returns 201', async () => {
    const origAuth = authorizationService.getChannelAuth;
    const origIdempFind = messageRepository.findByIdempotencyKey;
    const origInsert = messageRepository.insert;
    const origFind = messageRepository.findWithSenderById;
    const origPub = eventPublisher.publish;

    let publishedCount = 0;

    try {
      authorizationService.getChannelAuth = async () => ({
        channelExists: true,
        canAccess: true,
        isPrivate: false,
        isChannelMember: true,
        isLeadOrOrgAdmin: false,
      });

      messageRepository.findByIdempotencyKey = async () => null; // Not found yet

      messageRepository.insert = async (params) => ({
        id: 'msg-idemp-1',
        channel_id: params.channelId || null,
        conversation_id: null,
        sender_id: params.senderId,
        parent_message_id: null,
        content: params.content,
        content_type: 'text/plain',
        is_edited: false,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        idempotency_key: params.idempotencyKey || null,
      });

      messageRepository.findWithSenderById = async (id) => ({
        id,
        channelId: 'chan-1',
        conversationId: null,
        senderId: 'user-1',
        parentMessageId: null,
        content: 'Original message',
        contentType: 'text/plain',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        idempotencyKey: 'key-abc-123',
        sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
      });

      eventPublisher.publish = async () => {
        publishedCount++;
        return {} as any;
      };

      const res = await messagingService.sendChannelMessage('chan-1', 'user-1', {
        content: 'Original message',
        idempotencyKey: 'key-abc-123',
      });

      assert.strictEqual(res.isIdempotentRetry, false);
      assert.strictEqual(res.message.id, 'msg-idemp-1');
      assert.strictEqual(publishedCount, 1);
    } finally {
      authorizationService.getChannelAuth = origAuth;
      messageRepository.findByIdempotencyKey = origIdempFind;
      messageRepository.insert = origInsert;
      messageRepository.findWithSenderById = origFind;
      eventPublisher.publish = origPub;
    }
  });

  it('IDENTICAL RETRY: returns original message, isIdempotentRetry=true, and zero duplicate events', async () => {
    const origAuth = authorizationService.getChannelAuth;
    const origIdempFind = messageRepository.findByIdempotencyKey;
    const origInsert = messageRepository.insert;
    const origFind = messageRepository.findWithSenderById;
    const origPub = eventPublisher.publish;

    let publishedCount = 0;
    let insertCalled = false;

    try {
      authorizationService.getChannelAuth = async () => ({
        channelExists: true,
        canAccess: true,
        isPrivate: false,
        isChannelMember: true,
        isLeadOrOrgAdmin: false,
      });

      // Existing message found on idempotency pre-check
      messageRepository.findByIdempotencyKey = async () => ({
        id: 'msg-idemp-1',
        channel_id: 'chan-1',
        conversation_id: null,
        sender_id: 'user-1',
        parent_message_id: null,
        content: 'Original message',
        content_type: 'text/plain',
        is_edited: false,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        idempotency_key: 'key-abc-123',
      });

      messageRepository.insert = async () => {
        insertCalled = true;
        throw new Error('Should not insert on retry');
      };

      messageRepository.findWithSenderById = async (id) => ({
        id,
        channelId: 'chan-1',
        conversationId: null,
        senderId: 'user-1',
        parentMessageId: null,
        content: 'Original message',
        contentType: 'text/plain',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        idempotencyKey: 'key-abc-123',
        sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
      });

      eventPublisher.publish = async () => {
        publishedCount++;
        return {} as any;
      };

      const res = await messagingService.sendChannelMessage('chan-1', 'user-1', {
        content: 'Original message',
        idempotencyKey: 'key-abc-123',
      });

      assert.strictEqual(res.isIdempotentRetry, true);
      assert.strictEqual(res.message.id, 'msg-idemp-1');
      assert.strictEqual(insertCalled, false);
      assert.strictEqual(publishedCount, 0, 'Must NOT publish duplicate event on retry');
    } finally {
      authorizationService.getChannelAuth = origAuth;
      messageRepository.findByIdempotencyKey = origIdempFind;
      messageRepository.insert = origInsert;
      messageRepository.findWithSenderById = origFind;
      eventPublisher.publish = origPub;
    }
  });

  it('SAME KEY + DIFFERENT CONTENT: rejects with 409 IDEMPOTENCY_KEY_COLLISION and does NOT mutate original', async () => {
    const origAuth = authorizationService.getChannelAuth;
    const origIdempFind = messageRepository.findByIdempotencyKey;
    const origEdit = messageRepository.edit;

    let editCalled = false;

    try {
      authorizationService.getChannelAuth = async () => ({
        channelExists: true,
        canAccess: true,
        isPrivate: false,
        isChannelMember: true,
        isLeadOrOrgAdmin: false,
      });

      messageRepository.findByIdempotencyKey = async () => ({
        id: 'msg-idemp-1',
        channel_id: 'chan-1',
        conversation_id: null,
        sender_id: 'user-1',
        parent_message_id: null,
        content: 'First content',
        content_type: 'text/plain',
        is_edited: false,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        idempotency_key: 'key-collision',
      });

      messageRepository.edit = async () => {
        editCalled = true;
        return null;
      };

      await assert.rejects(
        async () => {
          await messagingService.sendChannelMessage('chan-1', 'user-1', {
            content: 'Totally different content with same key!',
            idempotencyKey: 'key-collision',
          });
        },
        (err: MessagingServiceError) => {
          assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_COLLISION');
          assert.strictEqual(err.statusCode, 409);
          return true;
        }
      );

      assert.strictEqual(editCalled, false, 'Original message must NEVER be mutated on key collision');
    } finally {
      authorizationService.getChannelAuth = origAuth;
      messageRepository.findByIdempotencyKey = origIdempFind;
      messageRepository.edit = origEdit;
    }
  });

  it('CONCURRENT DUPLICATE RACE: handles PostgreSQL 23505 collision, recovers original, and emits zero duplicate events', async () => {
    const origAuth = authorizationService.getChannelAuth;
    const origIdempFind = messageRepository.findByIdempotencyKey;
    const origInsert = messageRepository.insert;
    const origFind = messageRepository.findWithSenderById;
    const origPub = eventPublisher.publish;

    let publishCount = 0;

    try {
      authorizationService.getChannelAuth = async () => ({
        channelExists: true,
        canAccess: true,
        isPrivate: false,
        isChannelMember: true,
        isLeadOrOrgAdmin: false,
      });

      // Step 1: Pre-check says "not found" (simulating concurrent race)
      let lookupCount = 0;
      messageRepository.findByIdempotencyKey = async () => {
        lookupCount++;
        if (lookupCount === 1) return null; // First check passes
        // Second check (after catching 23505) finds winner's row:
        return {
          id: 'msg-concurrent-winner',
          channel_id: 'chan-1',
          conversation_id: null,
          sender_id: 'user-1',
          parent_message_id: null,
          content: 'Concurrent message',
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: 'key-race-1',
        };
      };

      // Step 2: Insert hits unique violation
      messageRepository.insert = async () => {
        const err: any = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      };

      messageRepository.findWithSenderById = async (id) => ({
        id,
        channelId: 'chan-1',
        conversationId: null,
        senderId: 'user-1',
        parentMessageId: null,
        content: 'Concurrent message',
        contentType: 'text/plain',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        idempotencyKey: 'key-race-1',
        sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
      });

      eventPublisher.publish = async () => {
        publishCount++;
        return {} as any;
      };

      const res = await messagingService.sendChannelMessage('chan-1', 'user-1', {
        content: 'Concurrent message',
        idempotencyKey: 'key-race-1',
      });

      assert.strictEqual(res.isIdempotentRetry, true);
      assert.strictEqual(res.message.id, 'msg-concurrent-winner');
      assert.strictEqual(publishCount, 0, 'Loser of concurrent race must not publish a second event');
    } finally {
      authorizationService.getChannelAuth = origAuth;
      messageRepository.findByIdempotencyKey = origIdempFind;
      messageRepository.insert = origInsert;
      messageRepository.findWithSenderById = origFind;
      eventPublisher.publish = origPub;
    }
  });
});
