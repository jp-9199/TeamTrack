import { describe, it } from 'node:test';
import assert from 'node:assert';
import { wsTicketService } from '../src/realtime/wsTicket.service.js';
import { subscriptionManager, type AuthenticatedSocket } from '../src/realtime/subscription.manager.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { conversationRepository } from '../src/db/repositories/conversation.repository.js';
import type { RealtimeEnvelope } from '@teamtrack/shared-types';

describe('Phase 6: WebSocket Authentication, Subscriptions & Fan-Out', () => {
  describe('WebSocket Ticket Security Architecture', () => {
    it('generates a 32-byte cryptographically secure single-use ticket with 30s TTL', async () => {
      const ticketData = await wsTicketService.createTicket('user-100', 'session-100');

      assert.strictEqual(typeof ticketData.ticket, 'string');
      assert(ticketData.ticket.length >= 40, '32 bytes base64url is at least 43 characters');
      assert.strictEqual(ticketData.expiresInSeconds, 30);
      assert(new Date(ticketData.expiresAt).getTime() > Date.now());

      // First consumption succeeds
      const consumed = await wsTicketService.consumeTicket(ticketData.ticket);
      assert.notStrictEqual(consumed, null);
      assert.strictEqual(consumed?.userId, 'user-100');
      assert.strictEqual(consumed?.sessionId, 'session-100');

      // Second consumption fails (strict single-use guarantee)
      const secondAttempt = await wsTicketService.consumeTicket(ticketData.ticket);
      assert.strictEqual(secondAttempt, null, 'Ticket must NOT be reusable');
    });

    it('rejects nonexistent or malformed ticket', async () => {
      const res = await wsTicketService.consumeTicket('nonexistent-bogus-ticket');
      assert.strictEqual(res, null);

      const emptyRes = await wsTicketService.consumeTicket('');
      assert.strictEqual(emptyRes, null);
    });
  });

  describe('WebSocket Subscription Authorization & Room Isolation', () => {
    function createMockSocket(userId: string, sessionId: string): AuthenticatedSocket & { messages: string[] } {
      const messages: string[] = [];
      return {
        id: `mock-sock-${Math.random()}`,
        userId,
        sessionId,
        isAlive: true,
        messages,
        send: (data: string) => messages.push(data),
        close: () => {},
      };
    }

    it('allows subscription to authorized channel', async () => {
      const origAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        const socket = createMockSocket('user-1', 'sess-1');
        const res = await subscriptionManager.subscribe(socket, 'channel:chan-1');

        assert.strictEqual(res.success, true);
        assert(socket.messages.some((m) => m.includes('"type":"subscribed"') && m.includes('channel:chan-1')));

        subscriptionManager.removeSocket(socket);
      } finally {
        authorizationService.getChannelAuth = origAuth;
      }
    });

    it('denies subscription to unauthorized channel (anti-enumeration)', async () => {
      const origAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: false,
          canAccess: false,
          isPrivate: false,
          isChannelMember: false,
          isLeadOrOrgAdmin: false,
        });

        const socket = createMockSocket('user-1', 'sess-1');
        const res = await subscriptionManager.subscribe(socket, 'channel:forbidden-chan');

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'CHANNEL_ACCESS_DENIED');

        subscriptionManager.removeSocket(socket);
      } finally {
        authorizationService.getChannelAuth = origAuth;
      }
    });

    it('enforces strict user topic isolation: user can only subscribe to user:<their_own_id>', async () => {
      const socket = createMockSocket('user-1', 'sess-1');

      // Subscribing to own user topic succeeds
      const ownRes = await subscriptionManager.subscribe(socket, 'user:user-1');
      assert.strictEqual(ownRes.success, true);

      // Subscribing to another user's topic fails with FORBIDDEN_USER_TOPIC
      const victimRes = await subscriptionManager.subscribe(socket, 'user:victim-user-2');
      assert.strictEqual(victimRes.success, false);
      assert.strictEqual(victimRes.error, 'FORBIDDEN_USER_TOPIC');

      subscriptionManager.removeSocket(socket);
    });

    it('allows subscription to conversation if member, rejects if non-member', async () => {
      const origMember = conversationRepository.getMember;
      try {
        conversationRepository.getMember = async (convId, userId) => {
          if (userId === 'member-user') {
            return {
              id: 'cm-1',
              conversationId: convId,
              userId,
              joinedAt: new Date().toISOString(),
              lastReadAt: new Date().toISOString(),
            };
          }
          return null;
        };

        const memberSock = createMockSocket('member-user', 'sess-1');
        const memberRes = await subscriptionManager.subscribe(memberSock, 'conversation:conv-1');
        assert.strictEqual(memberRes.success, true);

        const intruderSock = createMockSocket('intruder-user', 'sess-2');
        const intruderRes = await subscriptionManager.subscribe(intruderSock, 'conversation:conv-1');
        assert.strictEqual(intruderRes.success, false);
        assert.strictEqual(intruderRes.error, 'CONVERSATION_ACCESS_DENIED');

        subscriptionManager.removeSocket(memberSock);
        subscriptionManager.removeSocket(intruderSock);
      } finally {
        conversationRepository.getMember = origMember;
      }
    });

    it('delivers broadcast events exclusively to matching subscribed sockets', async () => {
      const origAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        const socketA = createMockSocket('user-a', 'sess-a');
        const socketB = createMockSocket('user-b', 'sess-b');

        await subscriptionManager.subscribe(socketA, 'channel:room-1');
        // socketB does NOT subscribe to room-1

        const envelope: RealtimeEnvelope = {
          eventId: 'evt-uuid-1',
          event: 'message.created',
          topic: 'channel:room-1',
          payload: { text: 'Hello Room 1' },
          timestamp: new Date().toISOString(),
          version: 1,
        };

        const deliveredCount = subscriptionManager.broadcast(envelope);
        assert.strictEqual(deliveredCount, 1);
        assert(socketA.messages.some((m) => m.includes('Hello Room 1')));
        assert.strictEqual(socketB.messages.length, 0);

        subscriptionManager.removeSocket(socketA);
        subscriptionManager.removeSocket(socketB);
      } finally {
        authorizationService.getChannelAuth = origAuth;
      }
    });

    it('cleans up subscriptions on socket disconnect', async () => {
      const origAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: true,
          isPrivate: false,
          isChannelMember: true,
          isLeadOrOrgAdmin: false,
        });

        const socket = createMockSocket('user-a', 'sess-a');
        await subscriptionManager.subscribe(socket, 'channel:room-cleanup');
        assert.strictEqual(subscriptionManager.getSubscriberCount('channel:room-cleanup'), 1);

        subscriptionManager.removeSocket(socket);
        assert.strictEqual(subscriptionManager.getSubscriberCount('channel:room-cleanup'), 0);
      } finally {
        authorizationService.getChannelAuth = origAuth;
      }
    });
  });

  describe('Realtime Event Envelope Invariant', () => {
    it('produces compliant RealtimeEnvelope with eventId, timestamp, and version=1', async () => {
      const envelope = await eventPublisher.publish('reaction.added', 'channel:chan-99', {
        reactionCode: '🚀',
      });

      assert.strictEqual(typeof envelope.eventId, 'string');
      assert(envelope.eventId.length > 0);
      assert.strictEqual(envelope.event, 'reaction.added');
      assert.strictEqual(envelope.topic, 'channel:chan-99');
      assert.strictEqual(envelope.version, 1);
      assert(!isNaN(Date.parse(envelope.timestamp)));
      assert.strictEqual(envelope.payload.reactionCode, '🚀');
    });
  });
});
