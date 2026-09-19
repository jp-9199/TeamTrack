import { eventPublisher } from './event.publisher.js';
import { subscriptionManager } from './subscription.manager.js';
import type { RealtimeEventName } from '@teamtrack/shared-types';

export type UserPresenceStatus = 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline';

export interface UserPresenceInfo {
  userId: string;
  status: UserPresenceStatus;
  statusMessage?: string;
  lastActiveAt: string;
}

export class PresenceService {
  private presenceStore = new Map<string, UserPresenceInfo>();

  /**
   * Normalizes arbitrary client status strings (e.g. 'Available', 'BUSY', 'do_not_disturb')
   */
  normalizeStatus(rawStatus: string): UserPresenceStatus {
    const s = String(rawStatus || '').toLowerCase().trim().replace(/[-\s]/g, '_');
    if (s === 'available' || s === 'online') return 'available';
    if (s === 'busy' || s === 'in_call' || s === 'in_meeting') return 'busy';
    if (s === 'do_not_disturb' || s === 'dnd') return 'do_not_disturb';
    if (s === 'away' || s === 'be_right_back' || s === 'idle') return 'away';
    if (s === 'offline') return 'offline';
    return 'available';
  }

  /**
   * Updates a user's availability state and broadcasts to active sessions.
   */
  async setUserPresence(
    userId: string,
    statusInput: string,
    statusMessage?: string,
    organizationId?: string
  ): Promise<UserPresenceInfo> {
    const status = this.normalizeStatus(statusInput);
    const info: UserPresenceInfo = {
      userId,
      status,
      statusMessage: statusMessage !== undefined ? statusMessage : this.presenceStore.get(userId)?.statusMessage,
      lastActiveAt: new Date().toISOString(),
    };

    this.presenceStore.set(userId, info);

    // Broadcast update across active WebSocket client sessions
    const payload = { ...info, timestamp: info.lastActiveAt };
    await eventPublisher.publish('presence.update' as RealtimeEventName, `user:${userId}`, payload);

    if (organizationId) {
      await eventPublisher.publish('presence.update' as RealtimeEventName, `organization:${organizationId}`, payload);
    }

    return info;
  }

  /**
   * Retrieves presence for a specific user. Defaults to 'available' if connected, or 'offline'.
   */
  async getUserPresence(userId: string): Promise<UserPresenceInfo> {
    const existing = this.presenceStore.get(userId);
    if (existing) {
      return existing;
    }

    const activeSockets = subscriptionManager.getSocketsForUser(userId);
    const defaultStatus: UserPresenceStatus = activeSockets.length > 0 ? 'available' : 'offline';

    const info: UserPresenceInfo = {
      userId,
      status: defaultStatus,
      lastActiveAt: new Date().toISOString(),
    };
    this.presenceStore.set(userId, info);
    return info;
  }

  /**
   * Batch retrieves presence for a list of user IDs.
   */
  async batchGetPresence(userIds: string[]): Promise<Record<string, UserPresenceInfo>> {
    const result: Record<string, UserPresenceInfo> = {};
    for (const id of userIds) {
      result[id] = await this.getUserPresence(id);
    }
    return result;
  }

  /**
   * Hook for WebSocket connection events.
   */
  async onSocketConnected(userId: string, organizationId?: string): Promise<void> {
    const current = this.presenceStore.get(userId);
    if (!current || current.status === 'offline') {
      await this.setUserPresence(userId, 'available', undefined, organizationId);
    }
  }

  /**
   * Hook for WebSocket disconnect events.
   */
  async onSocketDisconnected(userId: string, organizationId?: string): Promise<void> {
    const activeSockets = subscriptionManager.getSocketsForUser(userId);
    if (activeSockets.length === 0) {
      await this.setUserPresence(userId, 'offline', undefined, organizationId);
    }
  }
}

export const presenceService = new PresenceService();
