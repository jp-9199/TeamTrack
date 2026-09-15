# TeamTrack Phase 5: Authorization & Resource Hierarchy Architecture

## 1. Overview & Security Principles

TeamTrack models collaboration using a strict multi-tenant structural hierarchy:
$$\text{User} \longrightarrow \text{Organization} \longrightarrow \text{Team} \longrightarrow \text{Channel} \longrightarrow \text{Membership \& Permissions}$$

This layer serves as the authoritative security boundary across all subsequent real-time, messaging, meetings, file, and notification features.

### Core Architectural Principles
1. **Server-Side Security Boundary**: Authorization is performed server-side using authenticated user identity (JWT `sub`) and authoritative PostgreSQL membership state. Client claims, client-provided roles, and client-supplied tenant IDs are never trusted.
2. **PostgreSQL Authoritative State**: While JWT establishes authenticated identity in-memory, every access decision to organizations, teams, and channels verifies live PostgreSQL row state.
3. **Anti-IDOR / Anti-BOLA by Design**: Access to any resource requires resolving the complete hierarchy back to active organization membership. Non-existent resources and resources across tenant boundaries return **HTTP 404 NOT_FOUND** (not 403 Forbidden) to eliminate resource ID enumeration.
4. **Explicit Application Invariants**: Phase 3 database constraints enforce single-table uniqueness and direct foreign keys. Higher-order invariants (e.g., cascade deprovisioning, phantom membership prevention, default "general" channel protection, and owner persistence) are enforced transactionally at the application service layer using row-level locking.

---

## 2. Resource Hierarchy & Verification Chain

When an incoming request attempts to access or mutate a channel, team, or member, the server-side authorization service resolves the ownership chain:

```
[Incoming Request with :channelId]
               │
               ▼
1. Fetch channel: channelId -> team_id, is_private, deleted_at
   (Return 404 NOT_FOUND if channel missing or soft-deleted)
               │
               ▼
2. Fetch team: team_id -> organization_id, is_private, is_archived, deleted_at
   (Return 404 NOT_FOUND if team missing or soft-deleted)
               │
               ▼
3. Verify Organization Membership:
   SELECT role, status FROM organization_members
   WHERE organization_id = $orgId AND user_id = $authUserId
   (If missing or status != 'active' -> Return 404 NOT_FOUND)
               │
               ▼
4. Verify Team Membership:
   SELECT role FROM team_members
   WHERE team_id = $teamId AND user_id = $authUserId
   (If missing -> Return 404 if team is private, or 403 if public team requires joining)
               │
               ▼
5. Verify Channel Membership (if is_private = true):
   If user is Org Owner / Org Admin / Team Lead -> Permitted
   Else: SELECT 1 FROM channel_members WHERE channel_id = $channelId AND user_id = $authUserId
   (If missing -> Return 404 NOT_FOUND)
               │
               ▼
         [ACCESS GRANTED]
```

---

## 3. Role Matrix & Permissions

### Organization Roles (`chk_org_members_role`)
- **`owner`**: Full organization control. Settings, archival, ownership transfer, member roles, team/channel management.
- **`admin`**: Operational organization management. Can update settings (except transfer/archival), manage normal members (`member`, `guest`), manage teams/channels. Cannot modify or demote owner, cannot promote to admin.
- **`member`**: Normal organization collaborator. Can create teams, self-join public teams, participate in channels of joined teams.
- **`guest`**: Restricted external collaborator (contractor/partner).
  - Cannot create teams.
  - Cannot self-join public teams.
  - Cannot browse organization directory or list all members.
  - Can only view and participate in specific teams and channels to which explicitly added.

### Team Roles (`chk_team_members_role`)
- **`lead`**: Team manager. Can update team details, archive team, add/remove team members (must be active org members), create channels, manage private channel memberships.
- **`member`**: Team member. Accesses public channels in the team. Cannot invite users to private channels or archive the team.

### Channel Roles
- **`member`**: Explicit private channel member.

---

## 4. Key Invariants & Transactional Protection

### 1. Owner Persistence Invariant
An organization must always have at least one active owner.
- **Sole Owner Protection**: When `removeOrganizationMember` is called for `organization.owner_id`, the request is rejected with HTTP 400 `OWNER_CANNOT_LEAVE`.
- **Ownership Transfer**: Performed in a transaction using `SELECT id, owner_id FROM organizations WHERE id = $orgId FOR UPDATE` row locking to prevent race conditions. Updates `organizations.owner_id`, demotes old owner to `admin`, and promotes target to `owner`.

### 2. Phantom Membership Prevention
Phase 3 schema does not cross-reference junction tables via foreign keys. Therefore:
- Adding a team member requires transactional verification that `targetUserId` has an active membership in `organization_members`.
- Adding a private channel member requires transactional verification that `targetUserId` has an active membership in `team_members`.

### 3. Explicit Transactional Cascades (Deprovisioning)
Deleting a row from `organization_members` or `team_members` does not automatically cascade to junction tables in PostgreSQL. The backend service layer executes explicit scoped purges inside transactions:
- **Organization Deprovisioning**:
  1. Purges `channel_members` for channels within the organization.
  2. Purges `team_members` for teams within the organization.
  3. Purges `organization_members` row.
- **Team Deprovisioning**:
  1. Purges `channel_members` for channels within the team.
  2. Purges `team_members` row.

### 4. Default General Channel Protection
Every team created receives a default `"general"` channel (`is_private = false`).
- Renaming `"general"` is rejected with HTTP 400 `CANNOT_MODIFY_GENERAL`.
- Archiving `"general"` is rejected with HTTP 400 `CANNOT_ARCHIVE_GENERAL`.
- Deleting `"general"` is rejected with HTTP 400 `CANNOT_DELETE_GENERAL`.

### 5. Private Channel Member Addition Restriction
Only Team `lead`, Org `admin`, or Org `owner` can add members to private channels. Normal members cannot expand private channel access, but may leave voluntarily.
