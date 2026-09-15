-- ==============================================================================
-- TeamTrack Database Migration: 20260910120005_create_files_tables.sql
-- Description: Object storage file metadata (zero binary content in PostgreSQL)
-- ==============================================================================

BEGIN;

-- 1. Files Table
-- Stores file metadata only. Actual binary payloads are stored in S3/object storage.
-- Referenced by message attachments and meeting recordings/transcripts.
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  storage_driver VARCHAR(50) NOT NULL DEFAULT 's3',
  storage_key VARCHAR(1024) NOT NULL,
  checksum_sha256 VARCHAR(64) NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_files_size_positive CHECK (file_size_bytes >= 0)
);

-- Index for listing non-deleted organization files chronologically
CREATE INDEX idx_files_org ON files(organization_id, created_at DESC) WHERE is_deleted = false;

-- Partial index for content-addressable deduplication lookups
CREATE INDEX idx_files_checksum ON files(organization_id, checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

COMMIT;
