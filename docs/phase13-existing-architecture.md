# TeamTrack — Phase 13 Existing Architecture Discovery

## Overview
This document records the architectural inspection of TeamTrack prior to implementing Phase 13: Administration, Governance, User Settings & Security Management. It addresses points A through J specified in the Phase 13 requirements, detailing the database schemas, authorization paths, repositories, and conventions across the codebase.

---

### A. Existing User Table Structure
- **Migration Location**: `database/migrations/20260910120002_create_identity_tables.sql`
- **Table**: `users`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `email VARCHAR(255) NOT NULL UNIQUE`
  - `display_name VARCHAR(100) NOT NULL`
  - `full_name VARCHAR(150) NULL`
  - `avatar_url VARCHAR(1024) NULL`
  - `status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `deleted_at TIMESTAMPTZ NULL`
- **Credentials Separation**: `database/migrations/20260911100001_create_user_credentials_table.sql`
  - `user_credentials` table stores `password_hash VARCHAR(255) NOT NULL` (Argon2id) separate from `users` to prevent credential exposure in profile queries.
- **Phase 13 Delta**: Add `timezone VARCHAR(100) NULL`, `locale VARCHAR(20) NULL`, and `job_title VARCHAR(150) NULL` to `users` via migration.

---

### B. Existing Organization Membership Structure
- **Migration Location**: `database/migrations/20260910120003_create_organization_tables.sql`
- **Table**: `organizations`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `name VARCHAR(150) NOT NULL`
  - `slug VARCHAR(80) NOT NULL UNIQUE`
  - `owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
  - `status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'suspended'))`
  - `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ
- **Table**: `organization_members`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
  - `role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest'))`
  - `status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended'))`
  - `joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `CONSTRAINT uq_org_members_org_user UNIQUE (organization_id, user_id)`

---

### C. Existing Role Representation
- **Organization Roles**: `'owner' | 'admin' | 'member' | 'guest'`
  - Stored in `organization_members.role` and validated against `chk_org_members_role`.
- **Team Roles**: `'lead' | 'member'`
  - Stored in `team_members.role` and validated against `chk_team_members_role` (`20260910120004_create_teams_and_channels_tables.sql`).
- **Channel Roles**: `'member'`
  - Stored in `channel_members.role` (`20260910120004_create_teams_and_channels_tables.sql`).
- **Meeting Roles**: `'host' | 'presenter' | 'attendee'`
  - Stored in `meeting_participants.role` (`20260910120007_create_meetings_and_calendar_tables.sql`).

---

### D. Existing Session & Device Representation
- **Table**: `user_sessions`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `refresh_token_hash VARCHAR(255) NOT NULL UNIQUE`
  - `previous_refresh_token_hash VARCHAR(255) NULL`
  - `user_agent TEXT NULL`
  - `ip_address INET NULL`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `revoked_at TIMESTAMPTZ NULL`
  - `rotated_at TIMESTAMPTZ NULL`
  - `rotation_counter INTEGER NOT NULL DEFAULT 0`
  - **Index**: `idx_user_sessions_lookup ON user_sessions(user_id, revoked_at, expires_at)`
- **Table**: `user_devices`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `device_token VARCHAR(512) NOT NULL UNIQUE`
  - `platform VARCHAR(30) NOT NULL CHECK (platform IN ('ios', 'android', 'windows', 'macos', 'linux', 'web'))`
  - `device_model VARCHAR(100) NULL`
  - `app_version VARCHAR(50) NULL`
  - `is_active BOOLEAN NOT NULL DEFAULT true`
  - `last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

### E. Existing Audit Log Schema
- **Migration Location**: `database/migrations/20260910120008_create_notifications_and_audit_tables.sql`
- **Table**: `audit_logs`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `organization_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL`
  - `actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `action VARCHAR(100) NOT NULL`
  - `entity_type VARCHAR(50) NOT NULL`
  - `entity_id UUID NOT NULL`
  - `ip_address INET NULL`
  - `user_agent TEXT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Indexes**:
  - `idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC)`
  - `idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC)`
- **Existing Repository**: `services/backend/src/db/repositories/auditLog.repository.ts`
  - Provides `logAudit(entry: CreateAuditLogEntry)` with automatic recursive sanitization of secret fields (`password`, `token`, `secret`, `key`, `hash`).

---

### F. Existing Team/Channel Membership Authorization
- **Service Location**: `services/backend/src/modules/authorization/authorization.service.ts`
- **Resolution Hierarchy**:
  1. `getOrganizationAuth(userId, orgId)`:
     - Verifies organization exists and is not deleted.
     - Verifies `organization_members.status === 'active'`. Inactive or suspended members fail check (`isMember: false`).
     - Computes `isOwner`, `isAdmin`, `isGuest`.
  2. `getTeamAuth(userId, teamId)`:
     - Verifies team exists.
     - Calls `getOrganizationAuth` for team's parent organization.
     - If user is not an active org member, returns `teamExists: false` (anti-enumeration 404).
     - If team is private and user is not a team member and not an org admin/owner, returns `teamExists: false`.
  3. `getChannelAuth(userId, channelId)`:
     - Verifies channel exists.
     - Resolves parent team via `getTeamAuth`.
     - For private channels, verifies `channel_members` or team lead / org admin. Non-members receive `channelExists: false`.

---

### G. Existing Notification Preferences
- **Migration Location**: `database/migrations/20260914120001_create_notification_preferences.sql`
- **Tables**:
  - `user_notification_preferences` (global `realtime_enabled`, `push_enabled`, `email_enabled`)
  - `user_notification_type_preferences` (per-notification-type overrides)
  - `channel_notification_mutes` (per-channel mute state with `muted_until`)

---

### H. Existing Profile-Related Fields
- Currently in `users`: `display_name`, `full_name`, `avatar_url`.
- Required additions for Phase 13: `timezone`, `locale`, `job_title`.

---

### I. Existing Route, Controller & Service Patterns
- **Routes**: Mounted in `services/backend/src/routes/` and central `server.ts`.
- **Middleware**: `requireAuth` populates `req.user: { id, email, sessionId }`.
- **Services**: Instantiate `ServiceError(code, message, statusCode)`.
- **Controllers**: Thin controllers unpacking `req.body`/`req.params`, invoking services, returning standard envelope `{ success: true, data: ... }` or `{ success: false, error: ... }`.
- **Repositories**: In `services/backend/src/db/repositories/`, using PostgreSQL connection pool and explicit `withTransaction(async (client) => ...)`.

---

### J. Existing Shared API-Client Conventions
- **Contract Package**: `packages/shared-types/src/index.ts`
  - Strongly typed request/response DTOs, domain models, and typed error constants.
- **Client Package**: `packages/api-client/src/index.ts`
  - `ApiClient` interface and `TeamTrackApiClient` implementation.
  - Automatically handles single-flight refresh on 401, timeout aborts, and cross-platform native storage via `NativeSecureStorage`.
