import { withTransaction } from '../../db/pool.js';
import { conversationRepository } from '../../db/repositories/conversation.repository.js';
import { messageRepository } from '../../db/repositories/message.repository.js';
import { reactionRepository } from '../../db/repositories/reaction.repository.js';
import { organizationRepository } from '../../db/repositories/organization.repository.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import {
  decodeCursor,
  encodeCursor,
} from '@teamtrack/validation';
import { fileService } from '../files/file.service.js';
import { FileServiceError } from '../files/file.errors.js';
import { notificationService } from '../notifications/notification.service.js';

import type {
  ConversationWithMembers,
  ConversationMember,
  MessageWithSender,
  CreateConversationRequest,
  SendMessageRequest,
  CursorPaginatedResponse,
  ConversationSyncResponse,
} from '@teamtrack/shared-types';

export class ConversationServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ConversationServiceError';
  }
}

export class ConversationService {
  /**
   * Creates a direct (1:1) or group conversation within a shared organization.
   */
  async createConversation(
    creatorId: string,
    req: CreateConversationRequest
  ): Promise<ConversationWithMembers> {
    // 1. Resolve participants: ensure creator is included and deduplicate
    const allParticipantIds = Array.from(new Set([creatorId, ...req.participantIds]));

    // 2. Derive authoritative common organization
    const creatorOrgs = await organizationRepository.findForUser(creatorId);
    if (creatorOrgs.length === 0) {
      throw new ConversationServiceError(
        'FORBIDDEN',
        'User does not belong to any active organization',
        403
      );
    }

    let sharedOrgId: string | null = null;
    for (const org of creatorOrgs) {
      let allBelong = true;
      for (const participantId of allParticipantIds) {
        if (participantId === creatorId) continue;
        const member = await organizationRepository.getMember(org.id, participantId);
        if (!member || member.status !== 'active') {
          allBelong = false;
          break;
        }
      }
      if (allBelong) {
        sharedOrgId = org.id;
        break;
      }
    }

    if (!sharedOrgId) {
      throw new ConversationServiceError(
        'INVALID_PARTICIPANTS',
        'All conversation participants must belong to a shared active organization',
        400
      );
    }

    if (req.type === 'direct') {
      if (allParticipantIds.length !== 2) {
        throw new ConversationServiceError(
          'INVALID_PARTICIPANTS',
          'Direct conversation must contain exactly two participants',
          400
        );
      }

      const directHash = conversationRepository.computeDirectHash(
        allParticipantIds[0],
        allParticipantIds[1]
      );

      // Check if existing direct conversation exists
      const existing = await conversationRepository.findDirectByHash(sharedOrgId, directHash);
      if (existing) {
        const full = await conversationRepository.findByIdWithMembers(existing.id, creatorId);
        return full!;
      }

      // Create new direct conversation transactionally
      try {
        const created = await withTransaction(async (client) => {
          return conversationRepository.createConversation(
            sharedOrgId,
            'direct',
            directHash,
            null,
            allParticipantIds,
            client
          );
        });

        const full = await conversationRepository.findByIdWithMembers(created.id, creatorId);
        return full!;
      } catch (err: any) {
        // Handle race condition on unique direct_hash
        if (err.code === '23505') {
          const raceExisting = await conversationRepository.findDirectByHash(sharedOrgId, directHash);
          if (raceExisting) {
            const full = await conversationRepository.findByIdWithMembers(raceExisting.id, creatorId);
            return full!;
          }
        }
        throw err;
      }
    } else {
      // Group conversation
      if (allParticipantIds.length < 3) {
        throw new ConversationServiceError(
          'INVALID_PARTICIPANTS',
          'Group conversation must have at least 3 participants',
          400
        );
      }

      const created = await withTransaction(async (client) => {
        return conversationRepository.createConversation(
          sharedOrgId,
          'group',
          null,
          req.title || null,
          allParticipantIds,
          client
        );
      });

      const full = await conversationRepository.findByIdWithMembers(created.id, creatorId);
      return full!;
    }
  }

  /**
   * Lists all conversations for the user with member profiles and unread counts.
   */
  async listConversations(userId: string): Promise<ConversationWithMembers[]> {
    return conversationRepository.listUserConversations(userId);
  }

  /**
   * Retrieves conversation details with member profiles and unread count.
   */
  async getConversation(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithMembers> {
    const member = await conversationRepository.getMember(conversationId, userId);
    if (!member) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    const conv = await conversationRepository.findByIdWithMembers(conversationId, userId);
    if (!conv) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    return conv;
  }

  /**
   * Sends a message in a conversation with idempotency and realtime broadcast.
   */
  async sendConversationMessage(
    conversationId: string,
    senderId: string,
    req: SendMessageRequest
  ): Promise<{ message: MessageWithSender; isIdempotentRetry: boolean }> {
    const member = await conversationRepository.getMember(conversationId, senderId);
    if (!member) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    if (req.parentMessageId) {
      const parent = await messageRepository.findById(req.parentMessageId);
      if (!parent || parent.is_deleted) {
        throw new ConversationServiceError('PARENT_MESSAGE_NOT_FOUND', 'Parent thread message not found', 404);
      }
      if (parent.conversation_id !== conversationId) {
        throw new ConversationServiceError(
          'PARENT_MESSAGE_TARGET_MISMATCH',
          'Parent message belongs to a different conversation',
          400
        );
      }
    }

    // Idempotency pre-check
    if (req.idempotencyKey) {
      const existing = await messageRepository.findByIdempotencyKey({
        conversationId,
        senderId,
        idempotencyKey: req.idempotencyKey,
      });

      if (existing) {
        if (existing.content === req.content) {
          const fullExisting = await messageRepository.findWithSenderById(existing.id, senderId);
          return { message: fullExisting!, isIdempotentRetry: true };
        } else {
          throw new ConversationServiceError(
            'IDEMPOTENCY_KEY_COLLISION',
            'Idempotency key already used with different message content',
            409
          );
        }
      }
    }

    // Validate attachments if provided
    if (req.attachmentFileIds && req.attachmentFileIds.length > 0) {
      const conv = await conversationRepository.findById(conversationId);
      if (!conv) {
        throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
      }
      try {
        await fileService.validateMessageAttachments(req.attachmentFileIds, conv.organization_id, senderId);
      } catch (err: any) {
        if (err instanceof FileServiceError) {
          throw new ConversationServiceError(err.code, err.message, err.statusCode);
        }
        throw err;
      }
    }

    let insertedMessageId: string;


    try {
      const result = await withTransaction(async (client) => {
        const msg = await messageRepository.insert(
          {
            conversationId,
            senderId,
            parentMessageId: req.parentMessageId,
            content: req.content,
            contentType: req.contentType,
            idempotencyKey: req.idempotencyKey,
            attachmentFileIds: req.attachmentFileIds,
          },
          client
        );
        await conversationRepository.touchUpdatedAt(conversationId, client);
        return msg;
      });
      insertedMessageId = result.id;
    } catch (err: any) {
      if (err.code === '23505' && req.idempotencyKey) {
        const existing = await messageRepository.findByIdempotencyKey({
          conversationId,
          senderId,
          idempotencyKey: req.idempotencyKey,
        });

        if (existing) {
          if (existing.content === req.content) {
            const fullExisting = await messageRepository.findWithSenderById(existing.id, senderId);
            return { message: fullExisting!, isIdempotentRetry: true };
          } else {
            throw new ConversationServiceError(
              'IDEMPOTENCY_KEY_COLLISION',
              'Idempotency key already used with different message content',
              409
            );
          }
        }
      }
      throw err;
    }

    const fullMessage = await messageRepository.findWithSenderById(insertedMessageId, senderId);

    // Post-commit realtime event
    await eventPublisher.publish('message.created', `conversation:${conversationId}`, fullMessage);

    // Phase 9/Requirement 6: Parse @mentions and notify mentioned users
    const mentionMatches = req.content.match(/@([a-zA-Z0-9._-]+)/g);
    if (mentionMatches && mentionMatches.length > 0) {
      try {
        const members = await conversationRepository.listMembers(conversationId);
        const sender = members.find((m) => m.userId === senderId);
        const senderName = sender?.user?.displayName || 'A team member';

        for (const mentionTag of mentionMatches) {
          const cleanTag = mentionTag.substring(1).toLowerCase();
          const targetMember = members.find((m) => {
            if (m.userId === senderId) return false;
            const userEmail = m.user.email.toLowerCase();
            const userName = m.user.displayName.toLowerCase().replace(/\s+/g, '');
            return userEmail.includes(cleanTag) || userName.includes(cleanTag);
          });

          if (targetMember) {
            await notificationService.createNotification({
              recipientId: targetMember.userId,
              actorId: senderId,
              type: 'mention',
              title: `${senderName} mentioned you`,
              body: req.content,
              resourceType: 'conversation',
              resourceId: conversationId,
            }).catch(() => {});
          }
        }
      } catch (notifErr) {
        console.warn('[Mentions] Failed to dispatch mention notification:', notifErr);
      }
    }

    return { message: fullMessage!, isIdempotentRetry: false };
  }

  /**
   * Keyset pagination for conversation messages: (created_at DESC, id DESC).
   */
  async listConversationMessages(
    conversationId: string,
    userId: string,
    options: { cursor?: string; limit?: number }
  ): Promise<CursorPaginatedResponse<MessageWithSender>> {
    const member = await conversationRepository.getMember(conversationId, userId);
    if (!member) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

    let decodedCursor: { createdAt: string; id: string } | undefined = undefined;
    if (options.cursor) {
      const cursorRes = decodeCursor(options.cursor);
      if (!cursorRes.isValid) {
        throw new ConversationServiceError('INVALID_CURSOR', 'Invalid pagination cursor', 400);
      }
      decodedCursor = cursorRes.data;
    }

    const items = await messageRepository.listConversationMessages(conversationId, {
      cursor: decodedCursor,
      limit: limit + 1,
      currentUserId: userId,
    });

    const hasMore = items.length > limit;
    const paginatedItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && paginatedItems.length > 0) {
      const last = paginatedItems[paginatedItems.length - 1];
      nextCursor = encodeCursor(last.createdAt, last.id);
    }

    return {
      items: paginatedItems,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Reconnect synchronization delta for conversations.
   */
  async syncConversation(
    conversationId: string,
    userId: string,
    sinceRaw: string
  ): Promise<ConversationSyncResponse> {
    const member = await conversationRepository.getMember(conversationId, userId);
    if (!member) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    const parsedDate = Date.parse(sinceRaw);
    if (isNaN(parsedDate)) {
      throw new ConversationServiceError('VALIDATION_FAILED', 'Invalid since timestamp', 400);
    }
    const sinceDate = new Date(parsedDate);

    const { upserted, deletedIds } = await messageRepository.syncConversationMessages(
      conversationId,
      sinceDate,
      userId
    );

    const allMsgIds = [...upserted.map((m) => m.id), ...deletedIds];
    const reactions = await reactionRepository.listReactionsSince(allMsgIds, sinceDate);

    const currentMember = await conversationRepository.getMember(conversationId, userId);
    const unreadCount = currentMember
      ? await conversationRepository.countUnreadMessages(
          conversationId,
          userId,
          new Date(currentMember.lastReadAt)
        )
      : 0;

    return {
      conversationId,
      syncedAt: new Date().toISOString(),
      messages: upserted,
      deletedMessageIds: deletedIds,
      reactions,
      readState: currentMember,
      unreadCount,
    };
  }

  /**
   * Marks conversation read for user and synchronizes across user's devices.
   */
  async markConversationRead(
    conversationId: string,
    userId: string
  ): Promise<ConversationMember> {
    const member = await conversationRepository.getMember(conversationId, userId);
    if (!member) {
      throw new ConversationServiceError('NOT_FOUND', 'Conversation not found', 404);
    }

    const updatedMember = await conversationRepository.updateLastRead(
      conversationId,
      userId,
      new Date()
    );

    // Multi-device sync: user's personal topic
    await eventPublisher.publish('conversation.read', `user:${userId}`, updatedMember!);

    // Conversation topic
    await eventPublisher.publish('conversation.read', `conversation:${conversationId}`, {
      conversationId,
      userId,
      lastReadAt: updatedMember!.lastReadAt,
    });

    return updatedMember!;
  }
}

export const conversationService = new ConversationService();
