-- ==============================================================================
-- TeamTrack Database Migration: 20260910120002_create_identity_tables.sql
-- Description: Core identity domain tables (users, user_sessions, user_devices)
-- ==============================================================================

BEGIN;

-- 1. Users Table
-- Primary account profile table. Passwords and credentials are not stored here.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(150) NULL,
  avatar_url VARCHAR(1024) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT chk_users_status CHECK (status IN ('active', 'suspended', 'deactivated'))
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. User Sessions Table
-- Tracks authenticated client refresh sessions. Foreign key cascades when a user is hard-deleted.
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  user_agent TEXT NULL,
  ip_address INET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_user_sessions_token_hash UNIQUE (refresh_token_hash)
);

-- Index for session verification on incoming token refresh requests
CREATE INDEX idx_user_sessions_lookup ON user_sessions(user_id, revoked_at, expires_at);

-- 3. User Devices Table
-- Physical hardware and push notification token registration (APNs / FCM).
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token VARCHAR(512) NOT NULL,
  platform VARCHAR(30) NOT NULL,
  device_model VARCHAR(100) NULL,
  app_version VARCHAR(50) NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_devices_token UNIQUE (device_token),
  CONSTRAINT chk_user_devices_platform CHECK (platform IN ('ios', 'android', 'windows', 'macos', 'linux', 'web'))
);

-- Index for targeting push notifications to active user devices
CREATE INDEX idx_user_devices_user ON user_devices(user_id, is_active);

COMMIT;
