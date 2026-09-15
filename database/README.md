# TeamTrack Database Management & Migration Guide

This directory contains the database migration scripts, development seeds, and schema management conventions for TeamTrack.

---

## Directory Structure

```text
database/
├── migrations/         # Sequential, version-controlled SQL migration files
├── seeds/              # Development and staging seed datasets
│   └── README.md       # Seed usage guidelines
└── README.md           # This documentation
```

---

## Migration Execution Order

All migrations must be executed sequentially in strict chronological order. Each migration is self-contained and transaction-wrapped (`BEGIN; ... COMMIT;`):

| Sequence | Migration File | Description & Entities Created |
| :--- | :--- | :--- |
| **01** | `20260910120001_extensions_and_helpers.sql` | PostgreSQL 16+ setup, `set_updated_at()` trigger function. |
| **02** | `20260910120002_create_identity_tables.sql` | `users`, `user_sessions`, `user_devices`. |
| **03** | `20260910120003_create_organization_tables.sql` | `organizations`, `organization_members`. |
| **04** | `20260910120004_create_teams_and_channels_tables.sql` | `teams`, `team_members`, `channels`, `channel_members`. |
| **05** | `20260910120005_create_files_tables.sql` | `files` (object storage metadata; zero binary bytes). |
| **06** | `20260910120006_create_conversations_and_messages_tables.sql` | `conversations`, `conversation_members`, `messages`, `message_reactions`, `message_attachments`. |
| **07** | `20260910120007_create_meetings_and_calendar_tables.sql` | `meetings`, `meeting_participants`, `calendar_events`. |
| **08** | `20260910120008_create_notifications_and_audit_tables.sql` | `notifications`, `audit_logs`. |
| **09** | `20260911100001_create_user_credentials_table.sql` | `user_credentials`, session rotation fields (`previous_refresh_token_hash`, `rotated_at`, `rotation_counter`). |
| **10** | `20260911120001_create_channel_members_user_index.sql` | Fast user lookup index on `channel_members(user_id)`. |
| **11** | `20260912120001_create_messaging_enhancements.sql` | `uq_channels_team_name_lower` index, `messages.idempotency_key`, idempotency partial indexes, `channel_read_states`, keyset cursor indexes. |
| **12** | `20260912120002_create_meeting_enhancements.sql` | `meetings.waiting_room_enabled`, `meeting_participants` state machine (`status`), media states (`audio_enabled`, `video_enabled`, `screen_sharing`, `hand_raised`), `updated_at` trigger, and delta sync indexes. |
| **13** | `20260912120003_create_file_enhancements.sql` | `files.status` upload lifecycle (`uploading`, `ready`, `failed`), `files.upload_expires_at`, `files.updated_at` trigger, and expired upload index. |
| **14** | `20260913120001_create_notification_enhancements.sql` | `notifications` inbox enhancements (`actor_id`, `resource_type`, `resource_id`, `grouping_key`, `source_event_id`, `deleted_at`, `updated_at`, `sync_notification_read_status()` trigger, `uq_notifications_dedup` unique partial index, and keyset cursor indexes). |

---

## Migration File Naming Convention

All migration scripts follow the strict chronological naming format:

```text
YYYYMMDDHHMMSS_<descriptive_name>.sql
```

Where:
- `YYYYMMDD`: UTC Date (Year, Month, Day)
- `HHMMSS`: UTC Timestamp (Hour, Minute, Second)
- `<descriptive_name>`: Snake_case summary of the migration's intent

---

## Development Usage & Execution

When applying migrations against a local development PostgreSQL instance:

```bash
# Using standard PostgreSQL CLI (psql)
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120001_extensions_and_helpers.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120002_create_identity_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120003_create_organization_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120004_create_teams_and_channels_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120005_create_files_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120006_create_conversations_and_messages_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120007_create_meetings_and_calendar_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260910120008_create_notifications_and_audit_tables.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260911100001_create_user_credentials_table.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260911120001_create_channel_members_user_index.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260912120001_create_messaging_enhancements.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260912120002_create_meeting_enhancements.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260912120003_create_file_enhancements.sql
psql -d teamtrack_dev -U teamtrack_user -f database/migrations/20260913120001_create_notification_enhancements.sql
```

---

## Core Migration Principles & Safety Rules

### 1. Version Controlled
Every database schema change must be committed to Git. Direct manual modifications to database schemas in staging or production environments are strictly forbidden.

### 2. Transaction Safety
Every migration script must be wrapped in an explicit transaction block:

```sql
BEGIN;

-- DDL / DML operations here

COMMIT;
```

If any statement within the file encounters an error during execution, PostgreSQL will abort the transaction, guaranteeing zero partial or corrupted schema states.

### 3. Rollback Strategy
- For every forward migration script `YYYYMMDDHHMMSS_<name>.sql`, a corresponding rollback procedure must be documented.
- In production, rolling back should ideally be performed by applying a new forward migration that reverses the changes, maintaining an uninterrupted audit history of schema transitions.

### 4. Zero-Downtime Deployment Discipline
When running migrations against active production systems:
- **Avoid Long Locks**: Do not perform table-rewriting operations (`ALTER TABLE ... ADD COLUMN` without default, changing column types in place) during peak traffic.
- **Concurrent Indexes**: When adding indexes to populated tables, always utilize `CREATE INDEX CONCURRENTLY` outside of a transaction block to avoid locking reads and writes.
- **Expand-Contract Pattern**:
  1. *Expand*: Add new nullable column / new table.
  2. *Dual-Write*: Update backend code to write to both old and new schema.
  3. *Backfill*: Migrate existing data in batches.
  4. *Contract*: Remove reliance on old schema and drop old columns in a subsequent release.

### 5. Seed Isolation
- Files inside `database/seeds/` are strictly intended for local development, automated testing, and staging environments.
- Seed files must never be executed automatically against production databases.
- Seed data must never contain real personal identifiable information (PII) or production secrets.

### 6. Destructive Migration Precautions
- Commands containing `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` require explicit architectural review and multi-phase execution.
- Data must be verified as unreferenced before dropping columns or tables.
