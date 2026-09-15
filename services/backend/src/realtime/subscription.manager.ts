import type { RealtimeEnvelope } from '@teamtrack/shared-types';
import { authorizationService } from '../modules/authorization/authorization.service.js';
import { conversationRepository } from '../db/repositories/conversation.repository.js';
import { meetingRepository } from '../db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../db/repositories/meetingParticipant.repository.js';

export interface AuthenticatedSocket {
  id: string;
  userId: string;
  sessionId: string;
  isAlive: boolean;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export class SubscriptionManager {
  private topicToSockets = new Map<string, Set<AuthenticatedSocket>>();
  private socketToTopics = new Map<AuthenticatedSocket, Set<string>>();
  private userToSockets = new Map<string, Set<AuthenticatedSocket>>();

  /**
   * Registers a connected socket for user-level tracking.
   */
  registerSocket(socket: AuthenticatedSocket): void {
    if (!this.userToSockets.has(socket.userId)) {
      this.userToSockets.set(socket.userId, new Set());
    }
    this.userToSockets.get(socket.userId)!.add(socket);
  }

  /**
   * Authorizes and subscribes a socket to a topic.
   * Topics supported:
   * - channel:<channelId>
   * - conversation:<conversationId>
   * - user:<userId>
   * - meeting:<meetingId>
   */
  async subscribe(socket: AuthenticatedSocket, topic: string): Promise<{ success: boolean; error?: string }> {
    const parts = topic.split(':');
    if (parts.length !== 2) {
      return { success: false, error: 'INVALID_TOPIC_FORMAT' };
    }

    const [resourceType, resourceId] = parts;

    if (resourceType === 'user') {
      // Users may ONLY subscribe to their own user topic
      if (resourceId !== socket.userId) {
        return { success: false, error: 'FORBIDDEN_USER_TOPIC' };
      }
    } else if (resourceType === 'channel') {
      const auth = await authorizationService.getChannelAuth(socket.userId, resourceId);
      if (!auth.canAccess) {
        return { success: false, error: 'CHANNEL_ACCESS_DENIED' };
      }
    } else if (resourceType === 'conversation') {
      const member = await conversationRepository.getMember(resourceId, socket.userId);
      if (!member) {
        return { success: false, error: 'CONVERSATION_ACCESS_DENIED' };
      }
    } else if (resourceType === 'meeting') {
      const meeting = await meetingRepository.findById(resourceId);
      if (!meeting) {
        return { success: false, error: 'MEETING_NOT_FOUND' };
      }

      // Check organization membership
      const orgAuth = await authorizationService.getOrganizationAuth(socket.userId, meeting.organization_id);
      if (!orgAuth.isMember) {
        return { success: false, error: 'MEETING_ACCESS_DENIED' };
      }

      // Check that participant is not marked as removed
      const participant = await meetingParticipantRepository.getParticipant(resourceId, socket.userId);
      if (participant && participant.status === 'removed') {
        return { success: false, error: 'PARTICIPANT_REMOVED' };
      }
    } else if (resourceType === 'organization') {
      const orgAuth = await authorizationService.getOrganizationAuth(socket.userId, resourceId);
      if (!orgAuth.isMember) {
        return { success: false, error: 'ORGANIZATION_ACCESS_DENIED' };
      }
    } else if (resourceType === 'team') {
      const teamAuth = await authorizationService.getTeamAuth(socket.userId, resourceId);
      if (!teamAuth.teamExists || (!teamAuth.isMember && !teamAuth.isOrgOwnerOrAdmin)) {
        return { success: false, error: 'TEAM_ACCESS_DENIED' };
      }
    } else {
      return { success: false, error: 'UNSUPPORTED_TOPIC_TYPE' };
    }

    // Add to topic -> sockets map
    if (!this.topicToSockets.has(topic)) {
      this.topicToSockets.set(topic, new Set());
    }
    this.topicToSockets.get(topic)!.add(socket);

    // Add to socket -> topics map
    if (!this.socketToTopics.has(socket)) {
      this.socketToTopics.set(socket, new Set());
    }
    this.socketToTopics.get(socket)!.add(topic);

    socket.send(JSON.stringify({ type: 'subscribed', topic }));
    return { success: true };
  }

  /**
   * Unsubscribes a socket from a topic.
   */
  unsubscribe(socket: AuthenticatedSocket, topic: string): void {
    const sockets = this.topicToSockets.get(topic);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.topicToSockets.delete(topic);
      }
    }

    const topics = this.socketToTopics.get(socket);
    if (topics) {
      topics.delete(topic);
    }

    socket.send(JSON.stringify({ type: 'unsubscribed', topic }));
  }

  /**
   * Cleans up all topic registrations for a disconnected socket.
   */
  removeSocket(socket: AuthenticatedSocket): void {
    const topics = this.socketToTopics.get(socket);
    if (topics) {
      for (const topic of topics) {
        const sockets = this.topicToSockets.get(topic);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) {
            this.topicToSockets.delete(topic);
          }
        }
      }
      this.socketToTopics.delete(socket);
    }

    // Clean up userToSockets
    const userSockets = this.userToSockets.get(socket.userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.userToSockets.delete(socket.userId);
      }
    }
  }

  /**
   * Forcefully removes all sockets of a user from a specific topic (e.g. when removed from meeting).
   */
  removeUserFromTopic(userId: string, topic: string): void {
    const userSockets = this.userToSockets.get(userId);
    if (!userSockets) return;

    for (const socket of userSockets) {
      const topics = this.socketToTopics.get(socket);
      if (topics?.has(topic)) {
        this.unsubscribe(socket, topic);
      }
    }
  }

  /**
   * Returns all active sockets for a specific user.
   */
  getSocketsForUser(userId: string): AuthenticatedSocket[] {
    return Array.from(this.userToSockets.get(userId) ?? []);
  }

  /**
   * Delivers an envelope to all local sockets registered for the envelope's topic.
   */
  broadcast(envelope: RealtimeEnvelope): number {
    const sockets = this.topicToSockets.get(envelope.topic);
    if (!sockets || sockets.size === 0) return 0;

    const message = JSON.stringify({
      type: 'event',
      ...envelope,
    });

    let delivered = 0;
    for (const socket of sockets) {
      try {
        socket.send(message);
        delivered++;
      } catch (err) {
        // Socket error, ignore or mark for cleanup
      }
    }

    return delivered;
  }

  /**
   * Diagnostic: returns active socket count for a topic.
   */
  getSubscriberCount(topic: string): number {
    return this.topicToSockets.get(topic)?.size ?? 0;
  }

  /**
   * Forcefully unsubscribes all sockets of a user from topics associated with an organization
   * when their membership is suspended or removed.
   */
  async invalidateUserOrganizationSubscriptions(userId: string, organizationId: string): Promise<void> {
    const userSockets = this.userToSockets.get(userId);
    if (!userSockets) return;

    for (const socket of userSockets) {
      const topics = Array.from(this.socketToTopics.get(socket) || []);
      for (const topic of topics) {
        if (topic === `organization:${organizationId}`) {
          this.unsubscribe(socket, topic);
        } else if (topic.startsWith('channel:')) {
          const channelId = topic.split(':')[1];
          const auth = await authorizationService.getChannelAuth(userId, channelId);
          if (!auth.canAccess) {
            this.unsubscribe(socket, topic);
          }
        } else if (topic.startsWith('team:')) {
          const teamId = topic.split(':')[1];
          const auth = await authorizationService.getTeamAuth(userId, teamId);
          if (!auth.teamExists || (!auth.isMember && !auth.isOrgOwnerOrAdmin)) {
            this.unsubscribe(socket, topic);
          }
        } else if (topic.startsWith('meeting:')) {
          const meetingId = topic.split(':')[1];
          const meeting = await meetingRepository.findById(meetingId);
          if (meeting && meeting.organization_id === organizationId) {
            this.unsubscribe(socket, topic);
          }
        }
      }
    }
  }

  /**
   * Diagnostic: returns all active topics for a socket.
   */
  getSocketTopics(socket: AuthenticatedSocket): string[] {
    return Array.from(this.socketToTopics.get(socket) ?? []);
  }
}

export const subscriptionManager = new SubscriptionManager();
