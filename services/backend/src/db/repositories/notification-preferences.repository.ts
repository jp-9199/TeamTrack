import type { PoolClient } from 'pg';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';
import type {
  NotificationType,
  UserNotificationPreferences,
  UpdateNotificationPreferencesRequest,
  UserNotificationTypePreference,
  UpdateNotificationTypePreferenceRequest,
  ChannelNotificationMute,
} from '@teamtrack/shared-types';

export interface DbUserNotificationPreferences {
  user_id: string;
  realtime_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  updated_at: Date | string;
}

export interface DbUserNotificationTypePreference {
  user_id: string;
  notification_type: NotificationType;
  realtime_enabled: boolean | null;
  push_enabled: boolean | null;
  email_enabled: boolean | null;
  updated_at: Date | string;
}

export interface DbChannelNotificationMute {
  user_id: string;
  channel_id: string;
  muted_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class NotificationPreferencesRepository {
  /**
   * Maps a global preferences database row to a client DTO.
   * If null, returns the canonical system default (all channels enabled).
   */
  mapGlobalPreferences(row: DbUserNotificationPreferences | null): UserNotificationPreferences {
    if (!row) {
      return {
        realtimeEnabled: true,
        pushEnabled: true,
        emailEnabled: true,
        updatedAt: new Date(0).toISOString(),
      };
    }
    return {
      realtimeEnabled: row.realtime_enabled,
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  /**
   * Maps a per-type preference database row to a client DTO.
   */
  mapTypePreference(row: DbUserNotificationTypePreference): UserNotificationTypePreference {
    return {
      notificationType: row.notification_type,
      realtimeEnabled: row.realtime_enabled,
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  /**
   * Maps a channel mute database row to a client DTO, evaluating expiration against the current server time.
   */
  mapChannelMute(
    row: DbChannelNotificationMute | null,
    channelId: string,
    now: Date = new Date()
  ): ChannelNotificationMute {
    if (!row) {
      return {
        channelId,
        muted: false,
        mutedUntil: null,
      };
    }

    if (row.muted_until !== null) {
      const untilDate = row.muted_until instanceof Date ? row.muted_until : new Date(row.muted_until);
      if (untilDate.getTime() <= now.getTime()) {
        // Expired temporary mute behaves as unmuted
        return {
          channelId,
          muted: false,
          mutedUntil: null,
        };
      }
      return {
        channelId,
        muted: true,
        mutedUntil: untilDate.toISOString(),
      };
    }

    // Permanent mute (muted_until IS NULL)
    return {
      channelId,
      muted: true,
      mutedUntil: null,
    };
  }

  /**
   * Fetches global notification preferences for a user.
   */
  async getGlobalPreferences(
    userId: string,
    db: Queryable = pool
  ): Promise<DbUserNotificationPreferences | null> {
    const query = `
      SELECT user_id, realtime_enabled, push_enabled, email_enabled, updated_at
      FROM user_notification_preferences
      WHERE user_id = $1;
    `;
    const res = await db.query<DbUserNotificationPreferences>(query, [userId]);
    return res.rows[0] || null;
  }

  /**
   * Upserts global notification preferences with atomic concurrency safety.
   */
  async upsertGlobalPreferences(
    userId: string,
    prefs: UpdateNotificationPreferencesRequest,
    db: Queryable = pool
  ): Promise<DbUserNotificationPreferences> {
    const query = `
      INSERT INTO user_notification_preferences (
        user_id,
        realtime_enabled,
        push_enabled,
        email_enabled,
        updated_at
      ) VALUES (
        $1,
        COALESCE($2, true),
        COALESCE($3, true),
        COALESCE($4, true),
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        realtime_enabled = CASE WHEN $2::boolean IS NOT NULL THEN $2::boolean ELSE user_notification_preferences.realtime_enabled END,
        push_enabled = CASE WHEN $3::boolean IS NOT NULL THEN $3::boolean ELSE user_notification_preferences.push_enabled END,
        email_enabled = CASE WHEN $4::boolean IS NOT NULL THEN $4::boolean ELSE user_notification_preferences.email_enabled END,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      userId,
      prefs.realtimeEnabled !== undefined ? prefs.realtimeEnabled : null,
      prefs.pushEnabled !== undefined ? prefs.pushEnabled : null,
      prefs.emailEnabled !== undefined ? prefs.emailEnabled : null,
    ];

    const res = await db.query<DbUserNotificationPreferences>(query, values);
    return res.rows[0];
  }

  /**
   * Fetches all per-type preference overrides for a user.
   */
  async getTypePreferences(
    userId: string,
    db: Queryable = pool
  ): Promise<DbUserNotificationTypePreference[]> {
    const query = `
      SELECT user_id, notification_type, realtime_enabled, push_enabled, email_enabled, updated_at
      FROM user_notification_type_preferences
      WHERE user_id = $1
      ORDER BY notification_type ASC;
    `;
    const res = await db.query<DbUserNotificationTypePreference>(query, [userId]);
    return res.rows;
  }

  /**
   * Fetches a specific per-type preference override for a user.
   */
  async getTypePreference(
    userId: string,
    type: NotificationType,
    db: Queryable = pool
  ): Promise<DbUserNotificationTypePreference | null> {
    const query = `
      SELECT user_id, notification_type, realtime_enabled, push_enabled, email_enabled, updated_at
      FROM user_notification_type_preferences
      WHERE user_id = $1 AND notification_type = $2;
    `;
    const res = await db.query<DbUserNotificationTypePreference>(query, [userId, type]);
    return res.rows[0] || null;
  }

  /**
   * Upserts a per-type preference override with atomic concurrency safety.
   * Explicit nulls restore inheritance from global preferences.
   */
  async upsertTypePreference(
    userId: string,
    type: NotificationType,
    prefs: UpdateNotificationTypePreferenceRequest,
    db: Queryable = pool
  ): Promise<DbUserNotificationTypePreference> {
    const query = `
      INSERT INTO user_notification_type_preferences (
        user_id,
        notification_type,
        realtime_enabled,
        push_enabled,
        email_enabled,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
      ON CONFLICT (user_id, notification_type) DO UPDATE
      SET
        realtime_enabled = CASE WHEN $6::boolean THEN $3::boolean ELSE user_notification_type_preferences.realtime_enabled END,
        push_enabled = CASE WHEN $7::boolean THEN $4::boolean ELSE user_notification_type_preferences.push_enabled END,
        email_enabled = CASE WHEN $8::boolean THEN $5::boolean ELSE user_notification_type_preferences.email_enabled END,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      userId,
      type,
      prefs.realtimeEnabled !== undefined ? prefs.realtimeEnabled : null,
      prefs.pushEnabled !== undefined ? prefs.pushEnabled : null,
      prefs.emailEnabled !== undefined ? prefs.emailEnabled : null,
      prefs.realtimeEnabled !== undefined,
      prefs.pushEnabled !== undefined,
      prefs.emailEnabled !== undefined,
    ];

    const res = await db.query<DbUserNotificationTypePreference>(query, values);
    return res.rows[0];
  }

  /**
   * Fetches channel mute state for a user and channel.
   */
  async getChannelMute(
    userId: string,
    channelId: string,
    db: Queryable = pool
  ): Promise<DbChannelNotificationMute | null> {
    const query = `
      SELECT user_id, channel_id, muted_until, created_at, updated_at
      FROM channel_notification_mutes
      WHERE user_id = $1 AND channel_id = $2;
    `;
    const res = await db.query<DbChannelNotificationMute>(query, [userId, channelId]);
    return res.rows[0] || null;
  }

  /**
   * Upserts channel mute state atomically.
   */
  async upsertChannelMute(
    userId: string,
    channelId: string,
    mutedUntil: Date | null,
    db: Queryable = pool
  ): Promise<DbChannelNotificationMute> {
    const query = `
      INSERT INTO channel_notification_mutes (
        user_id,
        channel_id,
        muted_until,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, NOW(), NOW()
      )
      ON CONFLICT (user_id, channel_id) DO UPDATE
      SET
        muted_until = EXCLUDED.muted_until,
        updated_at = NOW()
      RETURNING *;
    `;
    const res = await db.query<DbChannelNotificationMute>(query, [userId, channelId, mutedUntil]);
    return res.rows[0];
  }

  /**
   * Removes a channel mute state for a user and channel.
   */
  async deleteChannelMute(
    userId: string,
    channelId: string,
    db: Queryable = pool
  ): Promise<boolean> {
    const query = `
      DELETE FROM channel_notification_mutes
      WHERE user_id = $1 AND channel_id = $2
      RETURNING user_id;
    `;
    const res = await db.query(query, [userId, channelId]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const notificationPreferencesRepository = new NotificationPreferencesRepository();
