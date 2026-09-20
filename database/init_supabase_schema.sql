-- ==========================================================================
-- TeamTrack Complete Consolidated Database Schema for Supabase / Cloud Postgres
-- ==========================================================================

-- Reset public schema cleanly to prevent relation conflicts
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
COMMENT ON SCHEMA public IS 'standard public schema';

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema Migrations Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- Migration: 20260910120001_extensions_and_helpers.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120001_extensions_and_helpers.sql
-- Description: Core database helper functions and configuration for PostgreSQL 16+
-- ==============================================================================

BEGIN;

-- PostgreSQL 16+ provides native gen_random_uuid() built-in; no external UUID extension required.

-- Helper trigger function to automatically update the updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS 'Reusable trigger function to maintain updated_at timestamps on mutated rows';

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120001_extensions_and_helpers.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120002_create_identity_tables.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260910120002_create_identity_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120003_create_organization_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120003_create_organization_tables.sql
-- Description: Multi-tenant organization boundaries and membership junction
-- ==============================================================================

BEGIN;

-- 1. Organizations Table
-- Top-level multi-tenant container. ON DELETE RESTRICT on owner_id prevents owner deletion while organization exists.
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_organizations_slug UNIQUE (slug),
  CONSTRAINT chk_organizations_status CHECK (status IN ('active', 'archived', 'suspended'))
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Organization Members Table
-- Membership mapping. uq_org_members_org_user prevents duplicate memberships.
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_org_members_org_user UNIQUE (organization_id, user_id),
  CONSTRAINT chk_org_members_role CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  CONSTRAINT chk_org_members_status CHECK (status IN ('active', 'invited', 'suspended'))
);

-- Fast lookup of all organizations a given user belongs to
CREATE INDEX idx_org_members_user ON organization_members(user_id);

CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120003_create_organization_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120004_create_teams_and_channels_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120004_create_teams_and_channels_tables.sql
-- Description: Functional teams, channels, and corresponding membership junctions
-- ==============================================================================

BEGIN;

-- 1. Teams Table
-- Functional sub-units inside an organization. Slugs are unique per organization.
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  description TEXT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_teams_org_slug UNIQUE (organization_id, slug)
);

-- Index for listing active teams within an organization
CREATE INDEX idx_teams_org ON teams(organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Team Members Table
-- Junction connecting users to teams. uq_team_members_team_user guarantees no duplicate memberships.
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_team_members_team_user UNIQUE (team_id, user_id),
  CONSTRAINT chk_team_members_role CHECK (role IN ('lead', 'member'))
);

CREATE INDEX idx_team_members_user ON team_members(user_id);

-- 3. Channels Table
-- Topic-based communication channels inside teams. Names are unique per team.
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_channels_team_name UNIQUE (team_id, name)
);

-- Index for listing non-deleted channels within a team
CREATE INDEX idx_channels_team ON channels(team_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Channel Members Table
-- Explicit membership for private channels.
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_channel_members_channel_user UNIQUE (channel_id, user_id)
);

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120004_create_teams_and_channels_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120005_create_files_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120005_create_files_tables.sql
-- Description: Object storage file metadata (zero binary content in PostgreSQL)
-- ==============================================================================

BEGIN;

-- 1. Files Table
-- Stores file metadata only. Actual binary payloads are stored in S3/object storage.
-- Referenced by message attachments and meeting recordings/transcripts.
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  storage_driver VARCHAR(50) NOT NULL DEFAULT 's3',
  storage_key VARCHAR(1024) NOT NULL,
  checksum_sha256 VARCHAR(64) NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_files_size_positive CHECK (file_size_bytes >= 0)
);

-- Index for listing non-deleted organization files chronologically
CREATE INDEX idx_files_org ON files(organization_id, created_at DESC) WHERE is_deleted = false;

-- Partial index for content-addressable deduplication lookups
CREATE INDEX idx_files_checksum ON files(organization_id, checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120005_create_files_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120006_create_conversations_and_messages_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120006_create_conversations_and_messages_tables.sql
-- Description: Direct/group conversations, durable messaging, reactions, and attachments
-- ==============================================================================

BEGIN;

-- 1. Conversations Table
-- Scopes 1:1 direct messages and ad-hoc group chats outside channels.
-- direct_hash prevents duplicate 1:1 direct conversations within an organization.
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  direct_hash VARCHAR(64) NULL,
  title VARCHAR(150) NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_conversations_type CHECK (type IN ('direct', 'group')),
  CONSTRAINT uq_conversations_direct_hash UNIQUE (organization_id, direct_hash)
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Conversation Members Table
-- Maps participants to conversations. uq_conv_members_conv_user prevents duplicate memberships.
CREATE TABLE conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_conv_members_conv_user UNIQUE (conversation_id, user_id)
);

-- Index for ordering a user's conversation list and tracking unread messages
CREATE INDEX idx_conv_members_user ON conversation_members(user_id, last_read_at);

-- 3. Messages Table
-- Durable message record. chk_messages_target_exclusive guarantees message belongs to channel XOR conversation.
-- parent_message_id supports threading without altering delivery target.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NULL REFERENCES channels(id) ON DELETE RESTRICT,
  conversation_id UUID NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text/plain',
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_messages_target_exclusive CHECK (
    (channel_id IS NOT NULL AND conversation_id IS NULL) OR
    (channel_id IS NULL AND conversation_id IS NOT NULL)
  )
);

-- High-volume partial indexes for chronological feed pagination
CREATE INDEX idx_messages_channel_feed ON messages(channel_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_messages_conv_feed ON messages(conversation_id, created_at DESC) WHERE is_deleted = false;

-- Index for thread reply lookups
CREATE INDEX idx_messages_thread ON messages(parent_message_id, created_at ASC) WHERE parent_message_id IS NOT NULL;

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Message Reactions Table
-- Composite unique constraint prevents duplicate reactions by same user on same message.
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reaction_code VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_reactions_msg_user_code UNIQUE (message_id, user_id, reaction_code)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);

-- 5. Message Attachments Table
-- Links messages to file metadata records.
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_attachments_msg_file UNIQUE (message_id, file_id)
);

CREATE INDEX idx_attachments_file ON message_attachments(file_id);

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120006_create_conversations_and_messages_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120007_create_meetings_and_calendar_tables.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260910120007_create_meetings_and_calendar_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260910120008_create_notifications_and_audit_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260910120008_create_notifications_and_audit_tables.sql
-- Description: User notification inbox and append-only governance audit logs
-- ==============================================================================

BEGIN;

-- 1. Notifications Table
-- User notification inbox for mentions, invites, and direct messages.
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for fast unread count queries and badge rendering
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, created_at DESC) WHERE is_read = false;

-- General index for paginated notification history
CREATE INDEX idx_notifications_recipient_all ON notifications(recipient_id, created_at DESC);

-- 2. Audit Logs Table
-- Append-only, immutable audit trail.
-- Set NULL on actor_id/organization_id preserves audit events even if an actor or tenant is purged.
-- Sensitive secrets (passwords, tokens, keys) must never be stored in metadata.
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tenant-scoped security audits and resource inspection
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260910120008_create_notifications_and_audit_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260911100001_create_user_credentials_table.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260911100001_create_user_credentials_table.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260911120001_create_channel_members_user_index.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260911120001_create_channel_members_user_index.sql
-- Description: Creates index on channel_members(user_id) for fast membership queries
-- ==============================================================================

BEGIN;

-- Fast index for looking up private channel memberships by user
CREATE INDEX IF NOT EXISTS idx_channel_members_user
  ON channel_members(user_id);

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260911120001_create_channel_members_user_index.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260912120001_create_messaging_enhancements.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260912120001_create_messaging_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260912120002_create_meeting_enhancements.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260912120002_create_meeting_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260912120003_create_file_enhancements.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260912120003_create_file_enhancements.sql
-- Description: File upload lifecycle (status state machine, upload expiry,
--              updated_at trigger, and expired upload index).
-- ==============================================================================

BEGIN;

-- 1. Status Column & Safe Migration for Existing Rows
-- Step 1a: Add status column as nullable initially
ALTER TABLE files ADD COLUMN status VARCHAR(20);

-- Step 1b: Safely populate existing rows with 'ready' so existing legitimate files are immediately ready
UPDATE files SET status = 'ready' WHERE status IS NULL;

-- Step 1c: Enforce NOT NULL and establish DEFAULT 'uploading' for all new upload intents
ALTER TABLE files ALTER COLUMN status SET NOT NULL;
ALTER TABLE files ALTER COLUMN status SET DEFAULT 'uploading';

-- Step 1d: Add check constraint for valid lifecycle states
ALTER TABLE files ADD CONSTRAINT chk_files_status
  CHECK (status IN ('uploading', 'ready', 'failed'));

-- 2. Upload Expiry Timestamp
-- Represents the expiry boundary for an upload intent (e.g. 15 minutes TTL).
ALTER TABLE files ADD COLUMN upload_expires_at TIMESTAMPTZ NULL;

-- 3. Updated At Timestamp & Trigger
-- Automatically maintained via existing set_updated_at() trigger function.
ALTER TABLE files ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Expiration Index
-- Efficiently supports sweeping expired upload intents:
-- WHERE status = 'uploading' AND upload_expires_at < NOW()
CREATE INDEX idx_files_upload_expiry
ON files(status, upload_expires_at)
WHERE status = 'uploading' AND upload_expires_at IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260912120003_create_file_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260913120001_create_notification_enhancements.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260913120001_create_notification_enhancements.sql
-- Description: User notification inbox enhancements (actor_id, polymorphic
--              resource references, grouping_key, source_event_id deduplication,
--              deleted_at soft delete, updated_at delta sync, read_at canonical
--              synchronization trigger, and keyset cursor indexes).
-- ==============================================================================

BEGIN;

-- 1. Add Enhancement Columns to notifications table
-- actor_id: User who triggered the event (nullable for system-generated notices).
-- Uses ON DELETE SET NULL to preserve historical inbox alerts if an actor account is deleted.
ALTER TABLE notifications ADD COLUMN actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;

-- Polymorphic resource references: identifies the target domain entity.
-- NOTE: resource_id is NOT an authorization grant. Underlying resources are independently authorized.
ALTER TABLE notifications ADD COLUMN resource_type VARCHAR(50) NULL;
ALTER TABLE notifications ADD COLUMN resource_id UUID NULL;

-- grouping_key: Non-unique bucket key for future notification aggregation and digest rollups.
ALTER TABLE notifications ADD COLUMN grouping_key VARCHAR(128) NULL;

-- source_event_id: Stable deterministic identity of the originating domain event.
-- Used for idempotent duplicate prevention. NOT a random notification ID or generic user ID.
ALTER TABLE notifications ADD COLUMN source_event_id VARCHAR(128) NULL;

-- deleted_at: Timestamp for user dismissal/soft-deletion. Excluded from normal active inbox views.
ALTER TABLE notifications ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- updated_at: Automatically maintained timestamp for multi-device delta synchronization.
ALTER TABLE notifications ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Safe Backfill for Existing Notification Rows
-- Synchronize existing data so that canonical read_at reflects historical is_read = true records.
UPDATE notifications
SET read_at = created_at
WHERE is_read = true
  AND read_at IS NULL;

-- Synchronize reverse inconsistency if any row was written with read_at but is_read = false.
UPDATE notifications
SET is_read = true
WHERE read_at IS NOT NULL
  AND is_read = false;

-- 3. Automatic updated_at Trigger
-- Reuses existing set_updated_at() trigger function from migration 01.
-- Modifies NEW.updated_at = NOW() in-place before row update without issuing secondary SQL statements.
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Bidirectional Non-Recursive read_at / is_read Synchronization Trigger
-- read_at is the canonical semantic state (NULL = unread, non-NULL = read).
-- is_read is maintained strictly for backward compatibility with existing queries.
-- Mutates NEW directly in-place. Never executes secondary UPDATE statements.
CREATE OR REPLACE FUNCTION sync_notification_read_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Defense-in-depth recursion guard
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Case 1: INSERT operation
  IF TG_OP = 'INSERT' THEN
    IF NEW.read_at IS NOT NULL THEN
      NEW.is_read := true;
    ELSIF NEW.is_read IS TRUE THEN
      NEW.read_at := COALESCE(NEW.created_at, NOW());
    ELSE
      NEW.is_read := false;
      NEW.read_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Case 2: UPDATE operation
  -- Check if read_at changed
  IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    IF NEW.read_at IS NOT NULL THEN
      IF NEW.is_read IS NOT TRUE THEN
        NEW.is_read := true;
      END IF;
    ELSE
      IF NEW.is_read IS NOT FALSE THEN
        NEW.is_read := false;
      END IF;
    END IF;
  -- Check if is_read changed while read_at did NOT change
  ELSIF NEW.is_read IS DISTINCT FROM OLD.is_read THEN
    IF NEW.is_read IS TRUE THEN
      IF NEW.read_at IS NULL THEN
        NEW.read_at := NOW();
      END IF;
    ELSE
      IF NEW.read_at IS NOT NULL THEN
        NEW.read_at := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_read_sync
  BEFORE INSERT OR UPDATE OF read_at, is_read ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION sync_notification_read_status();

-- 5. Specialized Indexes for Pagination, Sync, and Tenant Isolation
-- (Existing idx_notifications_unread and idx_notifications_recipient_all are explicitly retained)

-- 5a. Deterministic Keyset Cursor Pagination Index
-- Supports fast inbox fetching excluding soft-deleted records:
-- WHERE recipient_id = $1 AND (created_at, id) < ($cursorCreatedAt, $cursorId) AND deleted_at IS NULL
-- ORDER BY created_at DESC, id DESC
CREATE INDEX idx_notifications_recipient_cursor
ON notifications(recipient_id, created_at DESC, id DESC)
WHERE deleted_at IS NULL;

-- 5b. Multi-Device Delta Catch-up Synchronization Index
-- Powers reconnect synchronization across web, desktop, and mobile:
-- WHERE recipient_id = $1 AND (updated_at, id) > ($cursorUpdatedAt, $cursorId) AND deleted_at IS NULL
-- ORDER BY updated_at ASC, id ASC
CREATE INDEX idx_notifications_recipient_sync
ON notifications(recipient_id, updated_at ASC, id ASC)
WHERE deleted_at IS NULL;

-- 5c. Organization-Scoped Filtering Index
-- Supports tenant-scoped administrative queries and organization notification streams:
CREATE INDEX idx_notifications_org_cursor
ON notifications(organization_id, created_at DESC, id DESC)
WHERE organization_id IS NOT NULL
  AND deleted_at IS NULL;

-- 5d. Polymorphic Resource Lookup Index
-- Powers lookup when a resource (e.g., meeting, channel) undergoes lifecycle changes:
CREATE INDEX idx_notifications_resource
ON notifications(resource_type, resource_id)
WHERE resource_id IS NOT NULL
  AND deleted_at IS NULL;

-- 5e. Activity Grouping Lookup Index
-- Supports future digest queries and event rollups:
CREATE INDEX idx_notifications_grouping
ON notifications(recipient_id, grouping_key, created_at DESC)
WHERE grouping_key IS NOT NULL
  AND deleted_at IS NULL;

-- 5f. Idempotent Deduplication Unique Partial Index
-- Prevents duplicate notifications for the same originating domain event per recipient.
-- Soft-deleted records (deleted_at IS NOT NULL) are excluded so that dismissed events
-- can legitimately be re-emitted if the domain event reoccurs.
CREATE UNIQUE INDEX uq_notifications_dedup
ON notifications(recipient_id, type, source_event_id)
WHERE source_event_id IS NOT NULL
  AND deleted_at IS NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260913120001_create_notification_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260913120002_create_notification_mutation_sequence.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260913120002_create_notification_mutation_sequence.sql
-- Description: Per-recipient notification mutation sequence tracking for
--              deterministic multi-device catch-up synchronization.
--
-- NOTE: In development, this migration runs directly against the development database.
-- In high-volume production deployments, adding columns, backfilling, enforcing NOT NULL,
-- and building indexes can hold table locks and may require phased operations (e.g.
-- CREATE INDEX CONCURRENTLY, separate backfill workers).
-- ==============================================================================

BEGIN;

-- 1. Create per-recipient state table to anchor atomic sequence increments
CREATE TABLE IF NOT EXISTS user_notification_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_mutation_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add mutation_seq column to notifications table (initially nullable for backfill)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS mutation_seq BIGINT NULL;

-- 3. Deterministic Historical Bootstrap Backfill for Existing Notification Rows
-- Assigns a deterministic initial sequence per recipient for existing active and deleted rows.
-- NOTE: This establishes a consistent starting baseline for existing rows; it does NOT
-- attempt to reconstruct historical intermediate read/unread mutation states.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recipient_id
      ORDER BY created_at ASC, id ASC
    ) AS seq
  FROM notifications
)
UPDATE notifications n
SET mutation_seq = r.seq
FROM ranked r
WHERE n.id = r.id
  AND n.mutation_seq IS NULL;

-- 4. Initialize user_notification_state with the maximum backfilled sequence per recipient
INSERT INTO user_notification_state (user_id, last_mutation_seq, updated_at)
SELECT
  recipient_id,
  COALESCE(MAX(mutation_seq), 0),
  NOW()
FROM notifications
GROUP BY recipient_id
ON CONFLICT (user_id) DO UPDATE
SET last_mutation_seq = EXCLUDED.last_mutation_seq,
    updated_at = NOW();

-- Zero-initialize state for existing users with no notification records
INSERT INTO user_notification_state (user_id, last_mutation_seq, updated_at)
SELECT id, 0, NOW()
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- 5. Enforce NOT NULL constraint now that bootstrap data is initialized
ALTER TABLE notifications ALTER COLUMN mutation_seq SET NOT NULL;

-- 6. Specialized Keyset Pagination Indexes Powered by mutation_seq
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_active_seq
ON notifications(recipient_id, mutation_seq ASC, id ASC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_deletion_seq
ON notifications(recipient_id, mutation_seq ASC, id ASC)
WHERE deleted_at IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260913120002_create_notification_mutation_sequence.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260914120001_create_notification_preferences.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260914120001_create_notification_preferences.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260914140001_create_push_notification_tables.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260914140001_create_push_notification_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260914150001_create_email_notification_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260914150001_create_email_notification_tables.sql
-- Description: Email notification delivery outbox, tracking status, attempts,
--              error classification, and worker lease locks.
-- ==============================================================================

BEGIN;

-- 1. Email Notification Deliveries Table
-- Durable outbox tracking email delivery status, attempt counts, provider message IDs,
-- and safe worker lease locks for at-least-once delivery.
CREATE TABLE IF NOT EXISTS email_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_address_snapshot TEXT NOT NULL,
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

  CONSTRAINT uq_email_deliveries_notif_recipient UNIQUE (notification_id, recipient_user_id)
);

-- Index for pending and stale delivery job claiming (worker polling with SKIP LOCKED)
CREATE INDEX IF NOT EXISTS idx_email_deliveries_pending
ON email_notification_deliveries(status, next_attempt_at)
WHERE status IN ('PENDING', 'PROCESSING');

-- Indexes for foreign key lookups and status filtering
CREATE INDEX IF NOT EXISTS idx_email_deliveries_notification ON email_notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient ON email_notification_deliveries(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_status ON email_notification_deliveries(status);

-- Trigger for automatic updated_at timestamp on row mutation
CREATE TRIGGER trg_email_deliveries_updated_at
  BEFORE UPDATE ON email_notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260914150001_create_email_notification_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260914180001_create_search_indexes.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260914180001_create_search_indexes.sql
-- Description: Phase 9E Full-text search and lookup indexes for messages,
--              meetings, files, channels, teams, and users.
-- ==============================================================================

BEGIN;

-- 1. Full-text search index on non-deleted message content
CREATE INDEX IF NOT EXISTS idx_messages_search_content 
ON messages USING gin (to_tsvector('english', content))
WHERE is_deleted = false;

-- 2. Full-text search index on meeting titles
CREATE INDEX IF NOT EXISTS idx_meetings_search_title
ON meetings USING gin (to_tsvector('english', title));

-- 3. Lookup index on active file names
CREATE INDEX IF NOT EXISTS idx_files_search_name
ON files (file_name)
WHERE is_deleted = false;

-- 4. Lookup index on active channels
CREATE INDEX IF NOT EXISTS idx_channels_search_name
ON channels (name)
WHERE deleted_at IS NULL;

-- 5. Lookup index on active teams
CREATE INDEX IF NOT EXISTS idx_teams_search_name
ON teams (name)
WHERE deleted_at IS NULL;

-- 6. Lookup index on active users
CREATE INDEX IF NOT EXISTS idx_users_search_display_name
ON users (display_name)
WHERE deleted_at IS NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260914180001_create_search_indexes.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260915100001_create_calendar_enhancements.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260915100001_create_calendar_enhancements.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260915200001_create_advanced_meetings.sql
-- --------------------------------------------------------------------------
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

INSERT INTO schema_migrations (version) VALUES ('20260915200001_create_advanced_meetings.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260916120001_create_ai_assistant_tables.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260916120001_create_ai_assistant_tables.sql
-- Description: Phase 12 AI Assistant conversation history and action proposals
-- ==============================================================================

BEGIN;

-- 1. AI Conversations Table
-- Durable storage for user AI sessions isolated from human messaging channels.
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX idx_ai_conversations_org ON ai_conversations(organization_id, updated_at DESC);

-- 2. AI Messages Table
-- Append-only turn history for an AI conversation thread.
CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB NULL,
  tool_results JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_at ASC);

-- 3. AI Action Proposals Table
-- Secure write action proposal state machine (PROPOSED -> CONFIRMED -> EXECUTED/FAILED/CANCELLED).
-- SECURITY INVARIANT: Confirmation tokens are stored ONLY as SHA-256 hashes.
CREATE TABLE ai_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  tool_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'CONFIRMED', 'EXECUTED', 'FAILED', 'CANCELLED')),
  confirmation_token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  execution_result JSONB NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_action_proposals_lookup ON ai_action_proposals(id, user_id, status);
CREATE INDEX idx_ai_action_proposals_conv ON ai_action_proposals(conversation_id, created_at DESC);
CREATE INDEX idx_ai_action_proposals_expires ON ai_action_proposals(expires_at) WHERE status = 'PROPOSED';

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260916120001_create_ai_assistant_tables.sql') ON CONFLICT (version) DO NOTHING;

-- --------------------------------------------------------------------------
-- Migration: 20260917120001_create_phase13_governance_and_settings.sql
-- --------------------------------------------------------------------------
-- ==============================================================================
-- TeamTrack Database Migration: 20260917120001_create_phase13_governance_and_settings.sql
-- Description: User profile customization fields and organization-level governance
-- ==============================================================================

BEGIN;

-- 1. Extend Users Table with Profile Customizations
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS locale VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(150) NULL;

-- 2. Organization Governance Settings Table
-- Tracks enforceable tenant policies: AI assistant availability, guest invite policy,
-- and default notification delivery behavior.
CREATE TABLE IF NOT EXISTS organization_governance_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ai_assistant_enabled BOOLEAN NOT NULL DEFAULT true,
  allow_guest_invites BOOLEAN NOT NULL DEFAULT true,
  default_notification_behavior VARCHAR(50) NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_org_gov_notif_behavior CHECK (default_notification_behavior IN ('all', 'mentions_only', 'muted'))
);

-- Trigger for automatic updated_at maintenance
CREATE TRIGGER trg_organization_governance_settings_updated_at
  BEFORE UPDATE ON organization_governance_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('20260917120001_create_phase13_governance_and_settings.sql') ON CONFLICT (version) DO NOTHING;

