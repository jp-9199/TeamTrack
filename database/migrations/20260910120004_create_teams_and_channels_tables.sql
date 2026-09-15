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
