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
