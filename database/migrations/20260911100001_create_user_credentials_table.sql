-- ==============================================================================
-- TeamTrack Database Migration: 20260911100001_create_user_credentials_table.sql
-- Description: Creates user_credentials table and extends user_sessions for token rotation
-- ==============================================================================

BEGIN;

-- 1. User Credentials Table
-- Stores Argon2id password hashes isolated from public user profile queries.
CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintain updated_at timestamp on credential mutations using existing helper
CREATE TRIGGER trg_user_credentials_updated_at
  BEFORE UPDATE ON user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Extend User Sessions Table
-- Adds support for strict refresh-token rotation and reuse detection.
ALTER TABLE user_sessions
  ADD COLUMN previous_refresh_token_hash VARCHAR(255) NULL,
  ADD COLUMN rotated_at TIMESTAMPTZ NULL,
  ADD COLUMN rotation_counter INTEGER NOT NULL DEFAULT 0;

-- Partial index for fast lookups during token reuse detection
CREATE INDEX idx_user_sessions_prev_token
  ON user_sessions(previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;

COMMIT;
