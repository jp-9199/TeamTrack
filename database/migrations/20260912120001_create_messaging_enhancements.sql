-- ==============================================================================
-- TeamTrack Database Migration: 20260912120001_create_messaging_enhancements.sql
-- Description: Channel case-insensitive uniqueness, message idempotency,
--              channel read states, and cursor-pagination keyset indexes.
-- ==============================================================================

BEGIN;

-- 1. Pre-flight check: Detect active channel name conflicts differing only in casing.
-- If duplicate lowercase names exist within the same team, the migration safely halts
-- without altering, deleting, or renaming any existing user data.
DO $$
DECLARE
  conflict_record RECORD;
  conflict_list TEXT := '';
BEGIN
  FOR conflict_record IN
    SELECT team_id, LOWER(name) AS lower_name, COUNT(*) AS count
    FROM channels
    WHERE deleted_at IS NULL
    GROUP BY team_id, LOWER(name)
    HAVING COUNT(*) > 1
  LOOP
    conflict_list := conflict_list || format(
      E'\n - Team ID: %s, Lowercase Name: "%s" (%s active channels)',
      conflict_record.team_id, conflict_record.lower_name, conflict_record.count
    );
  END LOOP;

  IF conflict_list <> '' THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Case-insensitive channel name conflicts detected in active channels:%
Please manually resolve these duplicate channel names before re-running this migration. Existing data was not altered.', conflict_list;
  END IF;
END $$;

-- 2. Case-Insensitive Channel Uniqueness Index
-- Enforces that within a team, no two active channels can share the same name ignoring case.
-- Coexists safely with Phase 3 exact-case constraint uq_channels_team_name.
CREATE UNIQUE INDEX uq_channels_team_name_lower
ON channels(team_id, LOWER(name))
WHERE deleted_at IS NULL;

-- 3. Message Idempotency Key
-- Adds idempotency_key to messages table for deduplication and race-free delivery.
ALTER TABLE messages ADD COLUMN idempotency_key VARCHAR(64) NULL;

-- Partial unique index for channel messages
CREATE UNIQUE INDEX uq_messages_channel_idempotency
ON messages(channel_id, sender_id, idempotency_key)
WHERE idempotency_key IS NOT NULL AND channel_id IS NOT NULL;

-- Partial unique index for conversation messages
CREATE UNIQUE INDEX uq_messages_conv_idempotency
ON messages(conversation_id, sender_id, idempotency_key)
WHERE idempotency_key IS NOT NULL AND conversation_id IS NOT NULL;

-- 4. Channel Read States Table
-- Tracks per-user read cursor in channels.
-- last_read_at is the authoritative fallback boundary.
-- last_read_message_id is an optional precise marker with ON DELETE SET NULL.
CREATE TABLE channel_read_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_channel_read_states_user UNIQUE (channel_id, user_id)
);

-- Fast lookup for a user's channel read states
CREATE INDEX idx_channel_read_states_user ON channel_read_states(user_id);

-- 5. Keyset Cursor Indexes for Messages
-- Optimized for deterministic keyset pagination (created_at DESC, id DESC).
CREATE INDEX idx_messages_channel_cursor
ON messages(channel_id, created_at DESC, id DESC)
WHERE is_deleted = false;

CREATE INDEX idx_messages_conv_cursor
ON messages(conversation_id, created_at DESC, id DESC)
WHERE is_deleted = false;

COMMIT;
