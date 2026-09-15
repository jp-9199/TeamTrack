# TeamTrack — Phase 13 Role Permission Matrix

## Role Definitions

TeamTrack defines four distinct organization-level roles within `organization_members.role`:
1. **ORGANIZATION OWNER (`owner`)**: The primary administrative authority for the tenant. Exactly one active owner exists per organization.
2. **ORGANIZATION ADMIN (`admin`)**: Authorized administrators who manage members, teams, channels, and governance.
3. **ORGANIZATION MEMBER (`member`)**: Standard tenant members who participate in teams, channels, messaging, meetings, and own their personal account settings.
4. **ORGANIZATION GUEST (`guest`)**: Restricted external participants with scoped channel access and restricted directory visibility.

---

## Permission Matrix

| Capability / Resource Action | OWNER | ADMIN | MEMBER | GUEST | Enforcement Mechanism |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Manage Own Profile** (`GET/PATCH /users/me`) | ✅ | ✅ | ✅ | ✅ | Caller JWT identity |
| **Manage Own Security & Password** (`POST /users/me/password`) | ✅ | ✅ | ✅ | ✅ | Current password verification + Argon2id |
| **View / Revoke Own Sessions** (`/users/me/sessions/*`) | ✅ | ✅ | ✅ | ✅ | Caller `user_id` scope in DB |
| **View Organization Metadata** (`GET /organizations/:id`) | ✅ | ✅ | ✅ | ⚠️ (Scoped) | `authorizationService.getOrganizationAuth` |
| **Update Organization Settings** (`PATCH /organizations/:id`) | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin` check |
| **Transfer Organization Ownership** (`POST /organizations/:id/transfer-ownership`) | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | `auth.isOwner` check + atomic row lock |
| **Archive Organization** (`POST /organizations/:id/archive`) | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | `auth.isOwner` check |
| **List Organization Members** (`GET /organizations/:id/members`) | ✅ | ✅ | ✅ | ❌ (403) | Guest directory restriction |
| **Add Member / Guest** (`POST /organizations/:id/members`) | ✅ | ✅ | ❌ (403) | ❌ (403) | Admin/Owner check; Admin cannot add Owner/Admin |
| **Appoint / Demote Admins** (`PATCH /organizations/:id/members/:userId`) | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | `auth.isOwner` check |
| **Update Member Role (Member/Guest)** | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin` check; target cannot be owner/admin |
| **Suspend / Restore Member** | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin`; Admin cannot suspend owner/admin |
| **Remove Member** (`DELETE /organizations/:id/members/:userId`) | ✅ | ✅ | ❌ (403)* | ❌ (403)* | *Self-removal (leave) permitted; Owner cannot leave |
| **Manage Governance Settings** (`GET/PATCH /organizations/:id/governance`) | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin` check |
| **Query Organization Audit Logs** (`GET /organizations/:id/audit-logs`) | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin` check |
| **Create / Archive Teams** | ✅ | ✅ | ❌ (403) | ❌ (403) | `auth.isAdmin` check |
| **Manage Team Members** | ✅ | ✅ | Lead only | ❌ (403) | Team role check or org admin |
| **Manage Channels** | ✅ | ✅ | Lead only | ❌ (403) | Channel authorization |
| **AI Assistant Access** | ✅ | ✅ | ✅ | ✅ | Subject to `governance.ai_assistant_enabled` |

---

## Role Transition & Invariant Rules

1. **Sole Owner Invariant**:
   - An organization must always have exactly one active owner.
   - The owner cannot be removed, suspended, or demoted without first transferring ownership to another active organization member.
2. **No Privilege Escalation**:
   - Members cannot modify their own roles or the roles of others.
   - Admins cannot promote any member to Admin or Owner.
   - Admins cannot demote, suspend, or remove the Owner or other Admins.
   - Only the Owner can appoint, modify, or remove Admins.
3. **Strict Ownership Transfer**:
   - Caller must be the verified Owner (`org.owner_id === callerId`).
   - Target must be an active member of the same organization.
   - Executed inside a serializable/row-locked database transaction (`FOR UPDATE` on `organizations`).
   - Old owner is demoted to Admin; new owner becomes Owner.
4. **Member Suspension Boundary**:
   - Suspending an organization member sets `organization_members.status = 'suspended'`.
   - The user account remains intact globally, but all organization-scoped actions (HTTP APIs, WebSockets, meetings, files, messages, search, calendar, AI) are immediately blocked by `authorizationService.getOrganizationAuth`.
   - Realtime topics for that organization/team/channel are forcefully unsubscribed.
