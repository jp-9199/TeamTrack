-- ==============================================================================
-- TeamTrack Database Migration: 20260912120002_create_meeting_enhancements.sql
-- Description: Phase 7 Meeting enhancements (waiting room, participant state machine, media states, sync indexes)
-- ==============================================================================

BEGIN;

-- 1. Meetings Table Enhancements
-- Add waiting room configuration flag (defaults to true for enterprise privacy)
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS waiting_room_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. Meeting Participants Table Enhancements
-- Add logical participant state machine: waiting, admitted, joined, left, removed
ALTER TABLE meeting_participants 
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screen_sharing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hand_raised BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Check constraint for logical participant status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meeting_part_status'
  ) THEN
    ALTER TABLE meeting_participants
      ADD CONSTRAINT chk_meeting_part_status 
      CHECK (status IN ('waiting', 'admitted', 'joined', 'left', 'removed'));
  END IF;
END $$;

-- 3. Trigger for updated_at tracking on meeting_participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_meeting_participants_updated_at'
  ) THEN
    CREATE TRIGGER trg_meeting_participants_updated_at
      BEFORE UPDATE ON meeting_participants
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 4. Unique Logical Participant Constraint
-- Each user has exactly ONE logical participant record per meeting session.
-- (Reconnection & multi-device connections map to this single logical participant).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_meeting_participant_user'
  ) THEN
    ALTER TABLE meeting_participants
      ADD CONSTRAINT uq_meeting_participant_user 
      UNIQUE (meeting_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN
    NULL;
END $$;

-- 5. Delta Synchronization Index
-- Speeds up GET /api/v1/meetings/:meetingId/sync?since=<timestamp>
CREATE INDEX IF NOT EXISTS idx_meeting_participants_sync 
  ON meeting_participants(meeting_id, updated_at DESC);

-- Index for filtering participants by meeting and status (e.g. waiting room vs active joined)
CREATE INDEX IF NOT EXISTS idx_meeting_participants_status 
  ON meeting_participants(meeting_id, status);

COMMIT;
