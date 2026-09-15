-- ==============================================================================
-- TeamTrack Database Migration: 20260915200001_create_advanced_meetings.sql
-- Description: Phase 11 Advanced Meetings - Media Sessions, Recording,
--              Transcription, Artifacts, Meeting Lock, Network Quality,
--              Active Speaker tracking
-- ==============================================================================

BEGIN;

-- 1. Extend meetings table with Phase 11 fields
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS locked_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

-- 1b. Extend calendar_events with meeting lifecycle sync fields
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMPTZ NULL;

-- 2. Extend meeting_participants with Phase 11 media telemetry fields
ALTER TABLE meeting_participants
  ADD COLUMN IF NOT EXISTS network_quality VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS network_quality_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS active_speaker_at TIMESTAMPTZ NULL;

-- Check constraint for network quality
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_mp_network_quality'
  ) THEN
    ALTER TABLE meeting_participants
      ADD CONSTRAINT chk_mp_network_quality
      CHECK (network_quality IN ('UNKNOWN', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DISCONNECTED'));
  END IF;
END $$;

-- 3. Meeting Media Sessions
-- One logical media session per participant per meeting session.
-- On reconnect: upsert (update existing row, do not create duplicates).
CREATE TABLE IF NOT EXISTS meeting_media_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL DEFAULT 'p2p',
  provider_session_id VARCHAR(255) NULL,
  connection_state VARCHAR(30) NOT NULL DEFAULT 'connecting',
  audio_track_state VARCHAR(20) NOT NULL DEFAULT 'unpublished',
  video_track_state VARCHAR(20) NOT NULL DEFAULT 'unpublished',
  screen_track_state VARCHAR(20) NOT NULL DEFAULT 'unpublished',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconnect_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_media_session_participant UNIQUE (meeting_id, user_id),
  CONSTRAINT chk_media_session_connection_state CHECK (connection_state IN (
    'connecting', 'connected', 'reconnecting', 'failed', 'disconnected'
  )),
  CONSTRAINT chk_media_session_audio_track CHECK (audio_track_state IN ('published', 'unpublished', 'failed')),
  CONSTRAINT chk_media_session_video_track CHECK (video_track_state IN ('published', 'unpublished', 'failed')),
  CONSTRAINT chk_media_session_screen_track CHECK (screen_track_state IN ('published', 'unpublished', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_media_sessions_meeting ON meeting_media_sessions(meeting_id, connection_state);
CREATE INDEX IF NOT EXISTS idx_media_sessions_user ON meeting_media_sessions(user_id, meeting_id);

CREATE TRIGGER trg_media_sessions_updated_at
  BEFORE UPDATE ON meeting_media_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Meeting Recordings
-- Server-controlled. Binary data stored in object storage (NOT in DB).
-- Only metadata is persisted here.
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stopped_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  storage_key VARCHAR(1024) NULL,   -- Opaque, never exposed to clients directly
  mime_type VARCHAR(127) NULL,
  file_size_bytes BIGINT NULL,
  duration_seconds INT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'mock',
  provider_recording_id VARCHAR(255) NULL,
  provider_error_code VARCHAR(127) NULL,
  provider_error_message TEXT NULL,
  consent_notified_at TIMESTAMPTZ NULL,  -- When participants were notified
  started_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_recording_status CHECK (status IN (
    'REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'COMPLETED', 'FAILED', 'CANCELLED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_recordings_meeting ON meeting_recordings(meeting_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON meeting_recordings(status) WHERE status IN ('REQUESTED', 'STARTING', 'RECORDING', 'STOPPING');

CREATE TRIGGER trg_recordings_updated_at
  BEFORE UPDATE ON meeting_recordings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 5. Meeting Transcripts
-- Transcript metadata and processing state. Content stored in object storage.
CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  recording_id UUID NULL REFERENCES meeting_recordings(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  storage_key VARCHAR(1024) NULL,    -- Opaque, content stored in object storage
  mime_type VARCHAR(127) NULL DEFAULT 'application/json',
  language VARCHAR(20) NULL DEFAULT 'en-US',
  word_count INT NULL,
  speaker_count INT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'mock',
  provider_transcript_id VARCHAR(255) NULL,
  provider_error_code VARCHAR(127) NULL,
  provider_error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_transcript_status CHECK (status IN (
    'REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON meeting_transcripts(meeting_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording ON meeting_transcripts(recording_id) WHERE recording_id IS NOT NULL;

CREATE TRIGGER trg_transcripts_updated_at
  BEFORE UPDATE ON meeting_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 6. Meeting Artifacts (polymorphic index)
-- Provides a single list endpoint for all meeting artifacts.
CREATE TABLE IF NOT EXISTS meeting_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_type VARCHAR(30) NOT NULL,
  recording_id UUID NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  transcript_id UUID NULL REFERENCES meeting_transcripts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_artifact_type CHECK (artifact_type IN ('recording', 'transcript')),
  CONSTRAINT chk_artifact_has_ref CHECK (
    (artifact_type = 'recording' AND recording_id IS NOT NULL) OR
    (artifact_type = 'transcript' AND transcript_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_artifacts_meeting ON meeting_artifacts(meeting_id, artifact_type, created_at DESC);

CREATE TRIGGER trg_artifacts_updated_at
  BEFORE UPDATE ON meeting_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 7. Meeting Participant Events (Durable Participant Lifecycle History)
-- Append-only log of all participant state changes for auditability and reconstruction.
CREATE TABLE IF NOT EXISTS meeting_participant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type VARCHAR(30) NOT NULL,
  actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_participant_event_type CHECK (event_type IN (
    'waiting', 'admitted', 'denied', 'joined', 'left', 'rejoined', 'removed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_participant_events_meeting ON meeting_participant_events(meeting_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_participant_events_user ON meeting_participant_events(meeting_id, user_id, created_at ASC);

COMMIT;

