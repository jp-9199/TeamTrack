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
