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
