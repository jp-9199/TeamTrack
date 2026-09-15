import { pool, withTransaction } from '../../db/pool.js';
import { messageRepository } from '../../db/repositories/message.repository.js';
import { reactionRepository } from '../../db/repositories/reaction.repository.js';
import { channelReadStateRepository } from '../../db/repositories/channelReadState.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import {
  decodeCursor,
  encodeCursor,
} from '@teamtrack/validation';
import { fileService } from '../files/file.service.js';
import { FileServiceError } from '../files/file.errors.js';

import type {
  MessageWithSender,
  SendMessageRequest,
  EditMessageRequest,
  AddReactionRequest,
  CursorPaginatedResponse,
  ChannelSyncResponse,
  ChannelReadState,
  MessageReaction,
} from '@teamtrack/shared-types';

export class MessagingServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'MessagingServiceError';
  }
}

export class MessagingService {
  /**
   * Sends a message to a channel with strict idempotency and post-commit realtime broadcast.
   */
  async sendChannelMessage(
    channelId: string,
    senderId: string,
    req: SendMessageRequest
  ): Promise<{ message: MessageWithSender; isIdempotentRetry: boolean }> {
    // 1. Authorize sender for channel
    const auth = await authorizationService.getChannelAuth(senderId, channelId);
    if (!auth.canAccess) {
      throw new MessagingServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    // 2. Validate parent message if threading
    if (req.parentMessageId) {
      const parent = await messageRepository.findById(req.parentMessageId);
      if (!parent || parent.is_deleted) {
        throw new MessagingServiceError('PARENT_MESSAGE_NOT_FOUND', 'Parent thread message not found', 404);
      }
      if (parent.channel_id !== channelId) {
        throw new MessagingServiceError(
          'PARENT_MESSAGE_TARGET_MISMATCH',
          'Parent message belongs to a different channel',
          400
        );
      }
    }

    // 3. Idempotency pre-check
    if (req.idempotencyKey) {
      const existing = await messageRepository.findByIdempotencyKey({
        channelId,
        senderId,
        idempotencyKey: req.idempotencyKey,
      });

      if (existing) {
        if (existing.content === req.content) {
          const fullExisting = await messageRepository.findWithSenderById(existing.id, senderId);
          return { message: fullExisting!, isIdempotentRetry: true };
        } else {
          throw new MessagingServiceError(
            'IDEMPOTENCY_KEY_COLLISION',
            'Idempotency key already used with different message content',
            409
          );
        }
      }
    }

    // 3.5 Validate attachments if provided
    if (req.attachmentFileIds && req.attachmentFileIds.length > 0) {
      try {
        await fileService.validateMessageAttachments(req.attachmentFileIds, auth.organizationId!, senderId);
      } catch (err: any) {
        if (err instanceof FileServiceError) {
          throw new MessagingServiceError(err.code, err.message, err.statusCode);
        }
        throw err;
      }
    }

    // 4. Insert message transactionally
    let insertedMessageId: string;

    let isRetry = false;

    try {
      const result = await withTransaction(async (client) => {
        const msg = await messageRepository.insert(
          {
            channelId,
            senderId,
            parentMessageId: req.parentMessageId,
            content: req.content,
            contentType: req.contentType,
            idempotencyKey: req.idempotencyKey,
            attachmentFileIds: req.attachmentFileIds,
          },
          client
        );
        return msg;
      });
      insertedMessageId = result.id;
    } catch (err: any) {
      // Catch unique violation for concurrent duplicate requests (PostgreSQL 23505)
      if (err.code === '23505' && req.idempotencyKey) {
        const existing = await messageRepository.findByIdempotencyKey({
          channelId,
          senderId,
          idempotencyKey: req.idempotencyKey,
        });

        if (existing) {
          if (existing.content === req.content) {
            const fullExisting = await messageRepository.findWithSenderById(existing.id, senderId);
            return { message: fullExisting!, isIdempotentRetry: true };
          } else {
            throw new MessagingServiceError(
              'IDEMPOTENCY_KEY_COLLISION',
              'Idempotency key already used with different message content',
              409
            );
          }
        }
      }
      throw err;
    }

    // 5. Fetch full message with sender
    const fullMessage = await messageRepository.findWithSenderById(insertedMessageId, senderId);

    // 6. Post-commit realtime publication (ONLY on first successful creation)
    await eventPublisher.publish('message.created', `channel:${channelId}`, fullMessage);

    return { message: fullMessage!, isIdempotentRetry: false };
  }

  /**
   * Keyset pagination for channel messages: (created_at DESC, id DESC).
   */
  async listChannelMessages(
    channelId: string,
    userId: string,
    options: { cursor?: string; limit?: number }
  ): Promise<CursorPaginatedResponse<MessageWithSender>> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.canAccess) {
      throw new MessagingServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

    let decodedCursor: { createdAt: string; id: string } | undefined = undefined;
    if (options.cursor) {
      const cursorRes = decodeCursor(options.cursor);
      if (!cursorRes.isValid) {
        throw new MessagingServiceError('INVALID_CURSOR', 'Invalid pagination cursor', 400);
      }
      decodedCursor = cursorRes.data;
    }

    // Fetch limit + 1 to determine hasMore
    const items = await messageRepository.listChannelMessages(channelId, {
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
   * Reconnect synchronization delta: discovers created, edited, and soft-deleted messages.
   */
  async syncChannel(
    channelId: string,
    userId: string,
    sinceRaw: string
  ): Promise<ChannelSyncResponse> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.canAccess) {
      throw new MessagingServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    const parsedDate = Date.parse(sinceRaw);
    if (isNaN(parsedDate)) {
      throw new MessagingServiceError('VALIDATION_FAILED', 'Invalid since timestamp', 400);
    }
    const sinceDate = new Date(parsedDate);

    // Delta queries
    const { upserted, deletedIds } = await messageRepository.syncChannelMessages(
      channelId,
      sinceDate,
      userId
    );

    // Reactions delta
    const allMsgIds = [...upserted.map((m) => m.id), ...deletedIds];
    const reactions = await reactionRepository.listReactionsSince(allMsgIds, sinceDate);

    // Read state
    const readState = await channelReadStateRepository.getReadState(channelId, userId);
    const unreadCount = readState
      ? await channelReadStateRepository.countUnreadMessages(channelId, userId, new Date(readState.lastReadAt))
      : 0;

    return {
      channelId,
      syncedAt: new Date().toISOString(),
      messages: upserted,
      deletedMessageIds: deletedIds,
      reactions,
      readState,
      unreadCount,
    };
  }

  /**
   * Updates read state marker in a channel and synchronizes across user's devices.
   */
  async markChannelRead(
    channelId: string,
    userId: string,
    messageId?: string
  ): Promise<ChannelReadState> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.canAccess) {
      throw new MessagingServiceError('NOT_FOUND', 'Channel not found', 404);
    }

    if (messageId) {
      const msg = await messageRepository.findById(messageId);
      if (!msg || msg.channel_id !== channelId) {
        throw new MessagingServiceError('MESSAGE_NOT_FOUND', 'Message not found in channel', 404);
      }
    }

    const readState = await channelReadStateRepository.upsertReadState(
      channelId,
      userId,
      messageId || null,
      new Date()
    );

    // Multi-device sync: broadcast to user's private topic
    await eventPublisher.publish('channel.read', `user:${userId}`, readState);

    // Also notify channel subscribers of read boundary update
    await eventPublisher.publish('channel.read', `channel:${channelId}`, {
      userId,
      channelId,
      lastReadAt: readState.lastReadAt,
    });

    return readState;
  }

  /**
   * Retrieves a single message with sender info and reactions.
   */
  async getMessage(messageId: string, userId: string): Promise<MessageWithSender> {
    const msg = await messageRepository.findWithSenderById(messageId, userId);
    if (!msg) {
      throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
    }

    // Authorize access
    if (msg.channelId) {
      const auth = await authorizationService.getChannelAuth(userId, msg.channelId);
      if (!auth.canAccess) {
        throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
      }
    }

    return msg;
  }

  /**
   * Edits message content (author-only, soft edit).
   */
  async editMessage(
    messageId: string,
    userId: string,
    req: EditMessageRequest
  ): Promise<MessageWithSender> {
    const existing = await messageRepository.findById(messageId);
    if (!existing) {
      throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
    }

    if (existing.is_deleted) {
      throw new MessagingServiceError('CANNOT_EDIT_DELETED_MESSAGE', 'Cannot edit a deleted message', 400);
    }

    if (existing.sender_id !== userId) {
      throw new MessagingServiceError('NOT_MESSAGE_AUTHOR', 'Only the message author can edit this message', 403);
    }

    await messageRepository.edit(messageId, req.content);

    const updated = await messageRepository.findWithSenderById(messageId, userId);

    const topic = existing.channel_id
      ? `channel:${existing.channel_id}`
      : `conversation:${existing.conversation_id}`;

    await eventPublisher.publish('message.updated', topic, updated!);

    return updated!;
  }

  /**
   * Soft-deletes a message (author or elevated team lead/org admin).
   */
  async deleteMessage(
    messageId: string,
    userId: string
  ): Promise<MessageWithSender> {
    const existing = await messageRepository.findById(messageId);
    if (!existing) {
      throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
    }

    if (existing.is_deleted) {
      throw new MessagingServiceError('CANNOT_DELETE_DELETED_MESSAGE', 'Message is already deleted', 400);
    }

    // Check authorization: author or team lead / org admin
    if (existing.sender_id !== userId) {
      if (existing.channel_id) {
        const auth = await authorizationService.getChannelAuth(userId, existing.channel_id);
        if (!auth.isLeadOrOrgAdmin) {
          throw new MessagingServiceError('FORBIDDEN', 'Insufficient permissions to delete message', 403);
        }
      } else {
        throw new MessagingServiceError('FORBIDDEN', 'Only the author can delete conversation messages', 403);
      }
    }

    await messageRepository.softDelete(messageId);

    const deleted = await messageRepository.findWithSenderById(messageId, userId);

    const topic = existing.channel_id
      ? `channel:${existing.channel_id}`
      : `conversation:${existing.conversation_id}`;

    await eventPublisher.publish('message.deleted', topic, {
      id: messageId,
      channelId: existing.channel_id,
      conversationId: existing.conversation_id,
      deletedAt: deleted?.deletedAt,
    });

    return deleted!;
  }

  /**
   * Adds an emoji/reaction to a message.
   */
  async addReaction(
    messageId: string,
    userId: string,
    req: AddReactionRequest
  ): Promise<MessageReaction> {
    const existing = await messageRepository.findById(messageId);
    if (!existing || existing.is_deleted) {
      throw new MessagingServiceError('MESSAGE_NOT_FOUND', 'Target message not found', 404);
    }

    if (existing.channel_id) {
      const auth = await authorizationService.getChannelAuth(userId, existing.channel_id);
      if (!auth.canAccess) {
        throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
      }
    }

    const { reaction, created } = await reactionRepository.addReaction(
      messageId,
      userId,
      req.reactionCode
    );

    if (created) {
      const topic = existing.channel_id
        ? `channel:${existing.channel_id}`
        : `conversation:${existing.conversation_id}`;

      await eventPublisher.publish('reaction.added', topic, reaction);
    }

    return reaction;
  }

  /**
   * Removes a user's own reaction from a message.
   */
  async removeReaction(
    messageId: string,
    userId: string,
    reactionCode: string
  ): Promise<void> {
    const existing = await messageRepository.findById(messageId);
    if (!existing || existing.is_deleted) {
      throw new MessagingServiceError('MESSAGE_NOT_FOUND', 'Target message not found', 404);
    }

    if (existing.channel_id) {
      const auth = await authorizationService.getChannelAuth(userId, existing.channel_id);
      if (!auth.canAccess) {
        throw new MessagingServiceError('NOT_FOUND', 'Message not found', 404);
      }
    }

    const removed = await reactionRepository.removeReaction(messageId, userId, reactionCode);

    if (removed) {
      const topic = existing.channel_id
        ? `channel:${existing.channel_id}`
        : `conversation:${existing.conversation_id}`;

      await eventPublisher.publish('reaction.removed', topic, {
        messageId,
        userId,
        reactionCode,
      });
    }
  }
}

export const messagingService = new MessagingService();
