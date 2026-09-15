-- Migration: 20260915100001_create_calendar_enhancements.sql
-- Description: Enhance calendar_events table and create attendees and reminders tables for Phase 10

BEGIN;

-- 1. Modify calendar_events table
-- Allow personal events where organization_id is NULL
ALTER TABLE calendar_events ALTER COLUMN organization_id DROP NOT NULL;

-- Add optional team_id for team-scoped calendar events
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL;

-- Rename creator_id to organizer_user_id for clarity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE calendar_events RENAME COLUMN creator_id TO organizer_user_id;
  END IF;
END $$;

-- Rename start_time to start_at and end_time to end_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'start_time'
  ) THEN
    ALTER TABLE calendar_events RENAME COLUMN start_time TO start_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE calendar_events RENAME COLUMN end_time TO end_at;
  END IF;
END $$;

-- Add all_day flag
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false;

-- Add visibility constraint ('PRIVATE', 'ORGANIZATION', 'TEAM')
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'ORGANIZATION';
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_events_visibility;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_events_visibility CHECK (visibility IN ('PRIVATE', 'ORGANIZATION', 'TEAM'));

-- Add status constraint ('confirmed', 'tentative', 'cancelled')
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'confirmed';
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_events_status;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_events_status CHECK (status IN ('confirmed', 'tentative', 'cancelled'));

-- Add recurrence metadata
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMPTZ NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_timezone VARCHAR(50) NULL;

-- Add soft delete timestamp
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Adjust chronology constraint to support all_day events
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_event_chronology;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_event_chronology CHECK (end_at >= start_at);

-- 2. Create calendar_event_attendees table
CREATE TABLE IF NOT EXISTS calendar_event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  is_organizer BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_calendar_event_attendee UNIQUE (event_id, user_id),
  CONSTRAINT chk_calendar_attendee_response CHECK (response_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE'))
);

CREATE TRIGGER trg_calendar_event_attendees_updated_at
  BEFORE UPDATE ON calendar_event_attendees
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 3. Create calendar_event_reminders table
CREATE TABLE IF NOT EXISTS calendar_event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL CHECK (minutes_before > 0),
  is_sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_calendar_event_reminder UNIQUE (event_id, user_id, minutes_before)
);

CREATE TRIGGER trg_calendar_event_reminders_updated_at
  BEFORE UPDATE ON calendar_event_reminders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Native Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_window ON calendar_events(organization_id, start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_team_window ON calendar_events(team_id, start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_organizer ON calendar_events(organizer_user_id, start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_meeting ON calendar_events(meeting_id) WHERE meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_attendees_user_event ON calendar_event_attendees(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_attendees_event ON calendar_event_attendees(event_id, response_status);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_pending ON calendar_event_reminders(event_id, is_sent) WHERE is_sent = false;

COMMIT;
