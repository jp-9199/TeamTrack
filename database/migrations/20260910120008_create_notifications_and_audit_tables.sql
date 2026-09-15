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
