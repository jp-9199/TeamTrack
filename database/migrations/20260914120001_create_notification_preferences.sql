-- ==============================================================================
-- TeamTrack Database Migration: 20260914120001_create_notification_preferences.sql
-- Description: Notification preferences, per-notification-type overrides,
--              and channel mute state.
-- ==============================================================================

BEGIN;

-- 1. Global User Notification Preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  realtime_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Per-User Per-Notification-Type Preference Overrides
-- NULL value represents inheriting the user's global preference.
CREATE TABLE IF NOT EXISTS user_notification_type_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  realtime_enabled BOOLEAN NULL,
  push_enabled BOOLEAN NULL,
  email_enabled BOOLEAN NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type)
);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_user_notification_type_preferences_updated_at
  BEFORE UPDATE ON user_notification_type_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 3. Channel Notification Mutes
-- muted_until IS NULL: permanently muted.
-- muted_until > NOW(): temporarily muted.
-- muted_until <= NOW(): mute expired (treated as unmuted).
CREATE TABLE IF NOT EXISTS channel_notification_mutes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  muted_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

-- Index on channel_id to optimize cascade deletion queries
CREATE INDEX IF NOT EXISTS idx_channel_notification_mutes_channel
ON channel_notification_mutes(channel_id);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_channel_notification_mutes_updated_at
  BEFORE UPDATE ON channel_notification_mutes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
