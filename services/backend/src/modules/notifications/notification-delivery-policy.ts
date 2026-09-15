import { notificationPreferencesRepository } from '../../db/repositories/notification-preferences.repository.js';
import { governanceRepository } from '../../db/repositories/governance.repository.js';
import type {
  NotificationType,
  NotificationDeliveryPolicyResult,
} from '@teamtrack/shared-types';
import type { Queryable } from '../../db/repositories/organization.repository.js';
import { pool } from '../../db/pool.js';

export interface DeliveryPolicyParams {
  recipientId: string;
  type: NotificationType;
  channelId?: string | null;
  organizationId?: string | null;
  now?: Date;
}

export class NotificationDeliveryPolicy {
  /**
   * Resolves delivery policy across delivery mediums (realtime, push, email).
   * Evaluates:
   * 1. Global user preferences (default: true for all).
   * 2. Per-notification-type override (null = inherit global, explicit true/false overrides).
   * 3. Organization governance default notification policy (all vs mentions_only vs muted).
   * 4. Channel mute (suppresses delivery if notification is associated with an actively muted channel).
   */
  async resolvePolicy(
    params: DeliveryPolicyParams,
    db: Queryable = pool
  ): Promise<NotificationDeliveryPolicyResult> {
    const now = params.now || new Date();

    // 1. Fetch global preferences
    const globalRow = await notificationPreferencesRepository.getGlobalPreferences(params.recipientId, db);
    const globalPrefs = notificationPreferencesRepository.mapGlobalPreferences(globalRow);

    // 2. Fetch type preference override
    const typeRow = await notificationPreferencesRepository.getTypePreference(params.recipientId, params.type, db);

    // Resolve unmuted medium allowance:
    // If override is explicitly boolean, use it. Otherwise, inherit global preference.
    let realtimeAllowed =
      typeRow && typeRow.realtime_enabled !== null
        ? typeRow.realtime_enabled
        : globalPrefs.realtimeEnabled;

    let pushAllowed =
      typeRow && typeRow.push_enabled !== null
        ? typeRow.push_enabled
        : globalPrefs.pushEnabled;

    let emailAllowed =
      typeRow && typeRow.email_enabled !== null
        ? typeRow.email_enabled
        : globalPrefs.emailEnabled;

    // Organization governance default policy evaluation (applies when user has no explicit type override)
    if (params.organizationId && !typeRow) {
      try {
        const gov = await governanceRepository.getSettings(params.organizationId, db);
        if (gov.default_notification_behavior === 'muted') {
          realtimeAllowed = false;
          pushAllowed = false;
          emailAllowed = false;
        } else if (gov.default_notification_behavior === 'mentions_only') {
          const isMentionOrDirect =
            params.type === 'mention' ||
            params.type === 'direct_message' ||
            params.type === 'reply';
          if (!isMentionOrDirect) {
            realtimeAllowed = false;
            pushAllowed = false;
            emailAllowed = false;
          }
        }
      } catch {
        // Fallback safely to user preferences if governance record is unreachable
      }
    }

    // 3. Channel mute evaluation
    let isChannelMuted = false;
    let mutedUntil: string | null = null;

    if (params.channelId) {
      const muteRow = await notificationPreferencesRepository.getChannelMute(params.recipientId, params.channelId, db);
      const muteDto = notificationPreferencesRepository.mapChannelMute(muteRow, params.channelId, now);

      if (muteDto.muted) {
        isChannelMuted = true;
        mutedUntil = muteDto.mutedUntil;

        // Active channel mute suppresses delivery across channels for notifications belonging to this channel
        realtimeAllowed = false;
        pushAllowed = false;
        emailAllowed = false;
      }
    }

    return {
      realtimeAllowed,
      pushAllowed,
      emailAllowed,
      isChannelMuted,
      mutedUntil,
    };
  }

  /**
   * Convenience helper for checking a specific delivery medium.
   */
  async shouldDeliver(
    medium: 'realtime' | 'push' | 'email',
    params: DeliveryPolicyParams,
    db: Queryable = pool
  ): Promise<boolean> {
    const policy = await this.resolvePolicy(params, db);
    switch (medium) {
      case 'realtime':
        return policy.realtimeAllowed;
      case 'push':
        return policy.pushAllowed;
      case 'email':
        return policy.emailAllowed;
    }
  }

  /**
   * Evaluates notification delivery decision based on governance defaults,
   * user preferences, and channel mute status.
   */
  async evaluate(
    params: {
      userId: string;
      organizationId?: string | null;
      notificationType: NotificationType | string;
      channelId?: string | null;
      now?: Date;
    },
    db: Queryable = pool
  ): Promise<{ shouldDeliver: boolean; suppressionReasons: string[] }> {
    const suppressionReasons: string[] = [];

    // Check organization governance default behavior
    if (params.organizationId) {
      try {
        const gov = await governanceRepository.getSettings(params.organizationId, db);
        if (gov && gov.default_notification_behavior === 'muted') {
          suppressionReasons.push('SUPPRESSED_BY_ORG_DEFAULT_MUTED');
        } else if (gov && gov.default_notification_behavior === 'mentions_only') {
          const isMentionOrDirect =
            params.notificationType === 'mention' ||
            params.notificationType === 'channel_mention' ||
            params.notificationType === 'direct_message' ||
            params.notificationType === 'reply';
          if (!isMentionOrDirect) {
            suppressionReasons.push('SUPPRESSED_BY_ORG_DEFAULT_MENTIONS_ONLY');
          }
        }
      } catch {
        // Fallback safely if governance is unreachable
      }
    }

    if (suppressionReasons.length > 0) {
      return {
        shouldDeliver: false,
        suppressionReasons,
      };
    }

    return {
      shouldDeliver: true,
      suppressionReasons: [],
    };
  }
}

export const notificationDeliveryPolicy = new NotificationDeliveryPolicy();
