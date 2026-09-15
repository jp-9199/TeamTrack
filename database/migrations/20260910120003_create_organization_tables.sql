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
