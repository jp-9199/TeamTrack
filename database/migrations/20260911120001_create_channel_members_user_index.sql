-- ==============================================================================
-- TeamTrack Database Migration: 20260911120001_create_channel_members_user_index.sql
-- Description: Creates index on channel_members(user_id) for fast membership queries
-- ==============================================================================

BEGIN;

-- Fast index for looking up private channel memberships by user
CREATE INDEX IF NOT EXISTS idx_channel_members_user
  ON channel_members(user_id);

COMMIT;
