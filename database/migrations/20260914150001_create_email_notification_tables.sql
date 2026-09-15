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
