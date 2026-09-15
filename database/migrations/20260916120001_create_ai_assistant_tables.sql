-- ==============================================================================
-- TeamTrack Database Migration: 20260916120001_create_ai_assistant_tables.sql
-- Description: Phase 12 AI Assistant conversation history and action proposals
-- ==============================================================================

BEGIN;

-- 1. AI Conversations Table
-- Durable storage for user AI sessions isolated from human messaging channels.
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX idx_ai_conversations_org ON ai_conversations(organization_id, updated_at DESC);

-- 2. AI Messages Table
-- Append-only turn history for an AI conversation thread.
CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB NULL,
  tool_results JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_at ASC);

-- 3. AI Action Proposals Table
-- Secure write action proposal state machine (PROPOSED -> CONFIRMED -> EXECUTED/FAILED/CANCELLED).
-- SECURITY INVARIANT: Confirmation tokens are stored ONLY as SHA-256 hashes.
CREATE TABLE ai_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  tool_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'CONFIRMED', 'EXECUTED', 'FAILED', 'CANCELLED')),
  confirmation_token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  execution_result JSONB NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_action_proposals_lookup ON ai_action_proposals(id, user_id, status);
CREATE INDEX idx_ai_action_proposals_conv ON ai_action_proposals(conversation_id, created_at DESC);
CREATE INDEX idx_ai_action_proposals_expires ON ai_action_proposals(expires_at) WHERE status = 'PROPOSED';

COMMIT;
