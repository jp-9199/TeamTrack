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
