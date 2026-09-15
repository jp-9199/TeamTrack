import { notificationPreferencesRepository } from '../../db/repositories/notification-preferences.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { NotificationServiceError } from './notification.errors.js';
import type {
  NotificationType,
  UserNotificationPreferences,
  UpdateNotificationPreferencesRequest,
  UserNotificationTypePreference,
  UpdateNotificationTypePreferenceRequest,
  ChannelNotificationMute,
} from '@teamtrack/shared-types';

export class NotificationPreferencesService {
  /**
   * Retrieves global notification preferences for the authenticated user.
   * Returns system defaults (all channels enabled) if no preference record exists.
   */
  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const row = await notificationPreferencesRepository.getGlobalPreferences(userId);
    return notificationPreferencesRepository.mapGlobalPreferences(row);
  }

  /**
   * Updates global notification preferences for the authenticated user via atomic upsert.
   */
  async updatePreferences(
    userId: string,
    updates: UpdateNotificationPreferencesRequest
  ): Promise<UserNotificationPreferences> {
    const row = await notificationPreferencesRepository.upsertGlobalPreferences(userId, updates);
    return notificationPreferencesRepository.mapGlobalPreferences(row);
  }

  /**
   * Retrieves all per-notification-type preference overrides for the authenticated user.
   */
  async getTypePreferences(userId: string): Promise<UserNotificationTypePreference[]> {
    const rows = await notificationPreferencesRepository.getTypePreferences(userId);
    return rows.map((r) => notificationPreferencesRepository.mapTypePreference(r));
  }

  /**
   * Updates or resets a per-notification-type preference override for the authenticated user.
   * Passing explicit null restores inheritance from the user's global preference.
   */
  async updateTypePreference(
    userId: string,
    type: NotificationType,
    updates: UpdateNotificationTypePreferenceRequest
  ): Promise<UserNotificationTypePreference> {
    const row = await notificationPreferencesRepository.upsertTypePreference(userId, type, updates);
    return notificationPreferencesRepository.mapTypePreference(row);
  }

  /**
   * Retrieves the current mute status of a channel for the authenticated user.
   * Enforces channel membership/access authorization (returns 404 for unauthorized/inaccessible channels).
   */
  async getChannelMute(userId: string, channelId: string): Promise<ChannelNotificationMute> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess) {
      throw new NotificationServiceError('CHANNEL_NOT_FOUND', 'Channel not found', 404);
    }

    const row = await notificationPreferencesRepository.getChannelMute(userId, channelId);
    return notificationPreferencesRepository.mapChannelMute(row, channelId);
  }

  /**
   * Mutes a channel permanently (mutedUntil === null) or temporarily (mutedUntil in the future).
   * Enforces channel membership/access authorization.
   */
  async muteChannel(
    userId: string,
    channelId: string,
    mutedUntil: Date | null
  ): Promise<ChannelNotificationMute> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess) {
      throw new NotificationServiceError('CHANNEL_NOT_FOUND', 'Channel not found', 404);
    }

    const row = await notificationPreferencesRepository.upsertChannelMute(userId, channelId, mutedUntil);
    return notificationPreferencesRepository.mapChannelMute(row, channelId);
  }

  /**
   * Unmutes a channel by removing the mute record.
   * Enforces channel membership/access authorization.
   */
  async unmuteChannel(userId: string, channelId: string): Promise<ChannelNotificationMute> {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess) {
      throw new NotificationServiceError('CHANNEL_NOT_FOUND', 'Channel not found', 404);
    }

    await notificationPreferencesRepository.deleteChannelMute(userId, channelId);
    return {
      channelId,
      muted: false,
      mutedUntil: null,
    };
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
