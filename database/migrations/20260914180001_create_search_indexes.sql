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
