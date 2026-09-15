import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { ConversationService, ConversationServiceError } from '../src/modules/conversations/conversation.service.js';
import { conversationRepository, type DbConversation } from '../src/db/repositories/conversation.repository.js';
import { messageRepository } from '../src/db/repositories/message.repository.js';
import { organizationRepository } from '../src/db/repositories/organization.repository.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';

describe('Phase 6: Direct & Group Conversations', () => {
  const conversationService = new ConversationService();

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

  describe('Direct Conversation Lifecycle & Deduplication', () => {
    it('creates a direct conversation with deterministic direct_hash', async () => {
      const origFindOrgs = organizationRepository.findForUser;
      const origGetMember = organizationRepository.getMember;
      const origFindDirect = conversationRepository.findDirectByHash;
      const origCreateConv = conversationRepository.createConversation;
      const origFindByIdWithMembers = conversationRepository.findByIdWithMembers;

      let createdHash: string | null = null;

      try {
        organizationRepository.findForUser = async () => [
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme',
            owner_id: 'user-1',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ];

        organizationRepository.getMember = async () => ({
          id: 'mem-2',
          organization_id: 'org-1',
          user_id: 'user-2',
          role: 'member',
          status: 'active',
          joined_at: new Date(),
        });

        conversationRepository.findDirectByHash = async () => null; // Not found yet

        conversationRepository.createConversation = async (orgId, type, directHash, title, parts) => {
          createdHash = directHash;
          return {
            id: 'conv-direct-1',
            organization_id: orgId,
            type,
            direct_hash: directHash,
            title: null,
            is_archived: false,
            created_at: new Date(),
            updated_at: new Date(),
          };
        };

        conversationRepository.findByIdWithMembers = async (id) => ({
          id,
          organizationId: 'org-1',
          type: 'direct',
          directHash: createdHash,
          title: null,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          members: [
            {
              id: 'cm-1',
              conversationId: id,
              userId: 'user-1',
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
              user: { id: 'user-1', email: 'alice@acme.com', displayName: 'Alice', avatarUrl: null },
            },
            {
              id: 'cm-2',
              conversationId: id,
              userId: 'user-2',
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
              user: { id: 'user-2', email: 'bob@acme.com', displayName: 'Bob', avatarUrl: null },
            },
          ],
          unreadCount: 0,
        });

        const res = await conversationService.createConversation('user-1', {
          type: 'direct',
          participantIds: ['user-2'],
        });

        assert.strictEqual(res.id, 'conv-direct-1');
        assert.strictEqual(res.type, 'direct');
        assert.strictEqual(res.members.length, 2);

        // Verify direct_hash is deterministic regardless of participant order
        const hash1 = conversationRepository.computeDirectHash('user-1', 'user-2');
        const hash2 = conversationRepository.computeDirectHash('user-2', 'user-1');
        assert.strictEqual(hash1, hash2);
        assert.strictEqual(createdHash, hash1);
      } finally {
        organizationRepository.findForUser = origFindOrgs;
        organizationRepository.getMember = origGetMember;
        conversationRepository.findDirectByHash = origFindDirect;
        conversationRepository.createConversation = origCreateConv;
        conversationRepository.findByIdWithMembers = origFindByIdWithMembers;
      }
    });

    it('returns existing direct conversation when same pair creates again (deduplication)', async () => {
      const origFindOrgs = organizationRepository.findForUser;
      const origGetMember = organizationRepository.getMember;
      const origFindDirect = conversationRepository.findDirectByHash;
      const origCreateConv = conversationRepository.createConversation;
      const origFindByIdWithMembers = conversationRepository.findByIdWithMembers;

      let createCalled = false;

      try {
        organizationRepository.findForUser = async () => [
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme',
            owner_id: 'user-1',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ];

        organizationRepository.getMember = async () => ({
          id: 'mem-2',
          organization_id: 'org-1',
          user_id: 'user-2',
          role: 'member',
          status: 'active',
          joined_at: new Date(),
        });

        const expectedHash = conversationRepository.computeDirectHash('user-1', 'user-2');

        // Existing conversation found
        conversationRepository.findDirectByHash = async () => ({
          id: 'conv-existing-1',
          organization_id: 'org-1',
          type: 'direct',
          direct_hash: expectedHash,
          title: null,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        conversationRepository.createConversation = async () => {
          createCalled = true;
          throw new Error('Should not call create');
        };

        conversationRepository.findByIdWithMembers = async (id) => ({
          id,
          organizationId: 'org-1',
          type: 'direct',
          directHash: expectedHash,
          title: null,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          members: [],
          unreadCount: 0,
        });

        const res = await conversationService.createConversation('user-1', {
          type: 'direct',
          participantIds: ['user-2'],
        });

        assert.strictEqual(res.id, 'conv-existing-1');
        assert.strictEqual(createCalled, false);
      } finally {
        organizationRepository.findForUser = origFindOrgs;
        organizationRepository.getMember = origGetMember;
        conversationRepository.findDirectByHash = origFindDirect;
        conversationRepository.createConversation = origCreateConv;
        conversationRepository.findByIdWithMembers = origFindByIdWithMembers;
      }
    });

    it('rejects cross-organization direct conversation (INVALID_PARTICIPANTS)', async () => {
      const origFindOrgs = organizationRepository.findForUser;
      const origGetMember = organizationRepository.getMember;

      try {
        organizationRepository.findForUser = async () => [
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme',
            owner_id: 'user-1',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ];

        // Target user does NOT belong to Acme Corp
        organizationRepository.getMember = async () => null;

        await assert.rejects(
          async () => {
            await conversationService.createConversation('user-1', {
              type: 'direct',
              participantIds: ['stranger-from-other-org'],
            });
          },
          (err: ConversationServiceError) => {
            assert.strictEqual(err.code, 'INVALID_PARTICIPANTS');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        organizationRepository.findForUser = origFindOrgs;
        organizationRepository.getMember = origGetMember;
      }
    });
  });

  describe('Group Conversation Lifecycle', () => {
    it('creates group conversation with >=3 participants', async () => {
      const origFindOrgs = organizationRepository.findForUser;
      const origGetMember = organizationRepository.getMember;
      const origCreateConv = conversationRepository.createConversation;
      const origFindByIdWithMembers = conversationRepository.findByIdWithMembers;

      try {
        organizationRepository.findForUser = async () => [
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme',
            owner_id: 'user-1',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ];

        organizationRepository.getMember = async (orgId, userId) => ({
          id: `mem-${userId}`,
          organization_id: orgId,
          user_id: userId,
          role: 'member',
          status: 'active',
          joined_at: new Date(),
        });

        conversationRepository.createConversation = async (orgId, type, directHash, title) => ({
          id: 'conv-group-1',
          organization_id: orgId,
          type,
          direct_hash: null,
          title,
          is_archived: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        conversationRepository.findByIdWithMembers = async (id) => ({
          id,
          organizationId: 'org-1',
          type: 'group',
          directHash: null,
          title: 'Project Phoenix',
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          members: [
            {
              id: 'cm-1',
              conversationId: id,
              userId: 'user-1',
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
              user: { id: 'user-1', email: 'alice@acme.com', displayName: 'Alice', avatarUrl: null },
            },
            {
              id: 'cm-2',
              conversationId: id,
              userId: 'user-2',
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
              user: { id: 'user-2', email: 'bob@acme.com', displayName: 'Bob', avatarUrl: null },
            },
            {
              id: 'cm-3',
              conversationId: id,
              userId: 'user-3',
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
              user: { id: 'user-3', email: 'carol@acme.com', displayName: 'Carol', avatarUrl: null },
            },
          ],
          unreadCount: 0,
        });

        const res = await conversationService.createConversation('user-1', {
          type: 'group',
          participantIds: ['user-2', 'user-3'],
          title: 'Project Phoenix',
        });

        assert.strictEqual(res.id, 'conv-group-1');
        assert.strictEqual(res.type, 'group');
        assert.strictEqual(res.title, 'Project Phoenix');
        assert.strictEqual(res.members.length, 3);
      } finally {
        organizationRepository.findForUser = origFindOrgs;
        organizationRepository.getMember = origGetMember;
        conversationRepository.createConversation = origCreateConv;
        conversationRepository.findByIdWithMembers = origFindByIdWithMembers;
      }
    });

    it('rejects group conversation with fewer than 3 participants', async () => {
      const origFindOrgs = organizationRepository.findForUser;
      const origGetMember = organizationRepository.getMember;

      try {
        organizationRepository.findForUser = async () => [
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme',
            owner_id: 'user-1',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ];

        organizationRepository.getMember = async () => ({
          id: 'mem-1',
          organization_id: 'org-1',
          user_id: 'user-2',
          role: 'member',
          status: 'active',
          joined_at: new Date(),
        });

        await assert.rejects(
          async () => {
            await conversationService.createConversation('user-1', {
              type: 'group',
              participantIds: ['user-2'], // Only 1 other person (total 2)
            });
          },
          (err: ConversationServiceError) => {
            assert.strictEqual(err.code, 'INVALID_PARTICIPANTS');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        organizationRepository.findForUser = origFindOrgs;
        organizationRepository.getMember = origGetMember;
      }
    });
  });

  describe('Conversation Messaging & Multi-Device Sync', () => {
    it('sends message in conversation and publishes to conversation topic', async () => {
      const origMember = conversationRepository.getMember;
      const origInsert = messageRepository.insert;
      const origTouch = conversationRepository.touchUpdatedAt;
      const origFindSender = messageRepository.findWithSenderById;
      const origPub = eventPublisher.publish;

      let publishedTopic: string | null = null;

      try {
        conversationRepository.getMember = async () => ({
          id: 'cm-1',
          conversationId: 'conv-1',
          userId: 'user-1',
          joinedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        });

        messageRepository.insert = async (params) => ({
          id: 'conv-msg-1',
          channel_id: null,
          conversation_id: params.conversationId || null,
          sender_id: params.senderId,
          parent_message_id: null,
          content: params.content,
          content_type: 'text/plain',
          is_edited: false,
          is_deleted: false,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          idempotency_key: null,
        });

        conversationRepository.touchUpdatedAt = async () => {};

        messageRepository.findWithSenderById = async (id) => ({
          id,
          channelId: null,
          conversationId: 'conv-1',
          senderId: 'user-1',
          parentMessageId: null,
          content: 'Hey in DM',
          contentType: 'text/plain',
          isEdited: false,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          idempotencyKey: null,
          sender: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'a@test.com' },
        });

        eventPublisher.publish = async (event, topic) => {
          publishedTopic = topic;
          return {} as any;
        };

        const res = await conversationService.sendConversationMessage('conv-1', 'user-1', {
          content: 'Hey in DM',
        });

        assert.strictEqual(res.message.id, 'conv-msg-1');
        assert.strictEqual(publishedTopic, 'conversation:conv-1');
      } finally {
        conversationRepository.getMember = origMember;
        messageRepository.insert = origInsert;
        conversationRepository.touchUpdatedAt = origTouch;
        messageRepository.findWithSenderById = origFindSender;
        eventPublisher.publish = origPub;
      }
    });

    it('rejects sending conversation message if sender is not a member (404 NOT_FOUND)', async () => {
      const origMember = conversationRepository.getMember;
      try {
        conversationRepository.getMember = async () => null; // Not member

        await assert.rejects(
          async () => {
            await conversationService.sendConversationMessage('conv-1', 'intruder-9', {
              content: 'Should fail',
            });
          },
          (err: ConversationServiceError) => {
            assert.strictEqual(err.code, 'NOT_FOUND');
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        conversationRepository.getMember = origMember;
      }
    });
  });
});
