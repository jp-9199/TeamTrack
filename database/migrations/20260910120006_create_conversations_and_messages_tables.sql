-- ==============================================================================
-- TeamTrack Database Migration: 20260910120006_create_conversations_and_messages_tables.sql
-- Description: Direct/group conversations, durable messaging, reactions, and attachments
-- ==============================================================================

BEGIN;

-- 1. Conversations Table
-- Scopes 1:1 direct messages and ad-hoc group chats outside channels.
-- direct_hash prevents duplicate 1:1 direct conversations within an organization.
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  direct_hash VARCHAR(64) NULL,
  title VARCHAR(150) NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_conversations_type CHECK (type IN ('direct', 'group')),
  CONSTRAINT uq_conversations_direct_hash UNIQUE (organization_id, direct_hash)
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 2. Conversation Members Table
-- Maps participants to conversations. uq_conv_members_conv_user prevents duplicate memberships.
CREATE TABLE conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_conv_members_conv_user UNIQUE (conversation_id, user_id)
);

-- Index for ordering a user's conversation list and tracking unread messages
CREATE INDEX idx_conv_members_user ON conversation_members(user_id, last_read_at);

-- 3. Messages Table
-- Durable message record. chk_messages_target_exclusive guarantees message belongs to channel XOR conversation.
-- parent_message_id supports threading without altering delivery target.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NULL REFERENCES channels(id) ON DELETE RESTRICT,
  conversation_id UUID NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_message_id UUID NULL REFERENCES messages(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text/plain',
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_messages_target_exclusive CHECK (
    (channel_id IS NOT NULL AND conversation_id IS NULL) OR
    (channel_id IS NULL AND conversation_id IS NOT NULL)
  )
);

-- High-volume partial indexes for chronological feed pagination
CREATE INDEX idx_messages_channel_feed ON messages(channel_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_messages_conv_feed ON messages(conversation_id, created_at DESC) WHERE is_deleted = false;

-- Index for thread reply lookups
CREATE INDEX idx_messages_thread ON messages(parent_message_id, created_at ASC) WHERE parent_message_id IS NOT NULL;

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Message Reactions Table
-- Composite unique constraint prevents duplicate reactions by same user on same message.
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reaction_code VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_reactions_msg_user_code UNIQUE (message_id, user_id, reaction_code)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);

-- 5. Message Attachments Table
-- Links messages to file metadata records.
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_attachments_msg_file UNIQUE (message_id, file_id)
);

CREATE INDEX idx_attachments_file ON message_attachments(file_id);

COMMIT;
