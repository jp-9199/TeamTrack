-- ==============================================================================
-- TeamTrack Database Migration: 20260914140001_create_push_notification_tables.sql
-- Description: Push notification device registrations and durable delivery outbox.
-- ==============================================================================

BEGIN;

-- 1. Push Devices Table
-- Physical device registration for mobile (FCM / APNs) and desktop push notifications.
CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios', 'desktop')),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('fcm', 'apns')),
  push_token TEXT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  app_version VARCHAR(50) NULL,
  device_name VARCHAR(100) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_push_devices_token_hash UNIQUE (token_hash)
);

-- Index for finding active push devices for a recipient
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id, enabled);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_push_devices_updated_at
  BEFORE UPDATE ON push_devices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Push Notification Deliveries Table
-- Durable outbox tracking delivery status, attempts, error classification, and lease locks.
CREATE TABLE IF NOT EXISTS push_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DISABLED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NULL,
  provider_message_id VARCHAR(255) NULL,
  last_error_code VARCHAR(100) NULL,
  last_error_message VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_push_deliveries_notification_device UNIQUE (notification_id, device_id)
);

-- Index for pending and stale delivery job claiming (worker polling)
CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
ON push_notification_deliveries(status, next_attempt_at)
WHERE status IN ('PENDING', 'PROCESSING');

-- Indexes for foreign key lookup and status filtering
CREATE INDEX IF NOT EXISTS idx_push_deliveries_notification ON push_notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_device ON push_notification_deliveries(device_id);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_status ON push_notification_deliveries(status);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_push_deliveries_updated_at
  BEFORE UPDATE ON push_notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
