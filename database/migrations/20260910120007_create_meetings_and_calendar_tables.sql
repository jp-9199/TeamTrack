-- ==============================================================================
-- TeamTrack Database Migration: 20260910120007_create_meetings_and_calendar_tables.sql
-- Description: Meetings (unrestricted duration), attendee logs, and calendar events
-- ==============================================================================

BEGIN;

-- 1. Meetings Table
-- Realtime video/audio meeting sessions.
-- CRITICAL: Zero 60-minute duration limits or automatic expiration; persists until explicitly ended.
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NULL,
  actual_start_at TIMESTAMPTZ NULL,
  actual_end_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  recording_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  transcription_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_meetings_status CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled'))
);

CREATE INDEX idx_meetings_org_status ON meetings(organization_id, status, scheduled_start_at);
CREATE INDEX idx_meetings_host ON meetings(host_id, created_at DESC);

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Meeting Participants Table
-- Historical participation records tracking join/leave times and connection status.
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL DEFAULT 'attendee',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ NULL,
  connection_status VARCHAR(30) NOT NULL DEFAULT 'connected',

  CONSTRAINT uq_meeting_participants_session UNIQUE (meeting_id, user_id, joined_at),
  CONSTRAINT chk_meeting_part_role CHECK (role IN ('host', 'presenter', 'attendee'))
);

CREATE INDEX idx_meeting_part_meeting ON meeting_participants(meeting_id, user_id);

-- 3. Calendar Events Table
-- Organization calendar entries with chronology validation and optional meeting link.
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  meeting_id UUID NULL REFERENCES meetings(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  location VARCHAR(255) NULL,
  recurrence_rule TEXT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_calendar_event_chronology CHECK (end_time > start_time)
);

CREATE INDEX idx_calendar_org_time ON calendar_events(organization_id, start_time, end_time) WHERE is_cancelled = false;

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
