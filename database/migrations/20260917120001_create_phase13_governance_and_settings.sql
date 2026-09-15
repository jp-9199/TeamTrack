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
