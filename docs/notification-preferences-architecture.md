# TeamTrack Phase 9D-A: Notification Preferences & Channel Mute Architecture

## 1. Overview & Core Architectural Invariants

Phase 9D-A establishes the centralized, authoritative server-side foundation for user notification preferences, per-notification-type overrides, and channel mute rules.

> [!IMPORTANT]
> **Durable Notification Decoupling**:
> Notification creation and notification delivery are separate concepts:
> 1. **Durable Persistence**: Creating a notification *always* inserts the row into PostgreSQL, assigns a monotonic `mutation_seq`, and commits.
> 2. **Delivery Policy**: Notification preferences and channel mute rules govern delivery decisions (`realtimeAllowed`, `pushAllowed`, `emailAllowed`).
> 3. **Non-Destructive Guarantee**: Preferences and channel mutes **NEVER** delete, suppress, alter, or mutate durable notification rows in PostgreSQL, nor do they modify `mutation_seq` or read/unread state.

---

## 2. Data Model

### 2.1 Global Preferences (`user_notification_preferences`)

Captures global notification channel enablement per user:

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE` | Owner identity |
| `realtime_enabled` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Realtime alerts allowed |
| `push_enabled` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Push notifications allowed |
| `email_enabled` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Email delivery allowed |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Automatically maintained via `set_updated_at()` trigger |

### 2.2 Per-Notification-Type Overrides (`user_notification_type_preferences`)

Allows users to override delivery behavior for specific canonical notification types:

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Owner identity |
| `notification_type` | `VARCHAR(50)` | `NOT NULL` | Canonical `NotificationType` |
| `realtime_enabled` | `BOOLEAN` | `NULL` | Explicit boolean override, or `NULL` to inherit |
| `push_enabled` | `BOOLEAN` | `NULL` | Explicit boolean override, or `NULL` to inherit |
| `email_enabled` | `BOOLEAN` | `NULL` | Explicit boolean override, or `NULL` to inherit |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Trigger-maintained timestamp |

- **Primary Key**: `(user_id, notification_type)`
- **Inheritance Semantics**: An explicit `NULL` indicates inheritance from the user's global preference. Explicit `true` or `false` overrides the global preference.

### 2.3 Channel Notification Mutes (`channel_notification_mutes`)

Maintains user-scoped channel mute state:

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Muting user |
| `channel_id` | `UUID` | `NOT NULL REFERENCES channels(id) ON DELETE CASCADE` | Target channel |
| `muted_until` | `TIMESTAMPTZ` | `NULL` | Expiration boundary (NULL = permanent) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Initial mute timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Trigger-maintained timestamp |

- **Primary Key**: `(user_id, channel_id)`
- **Index**: `idx_channel_notification_mutes_channel ON channel_notification_mutes(channel_id)` to optimize cascade deletes.

---

## 3. Preference Resolution & Precedence Rules

The centralized delivery engine (`NotificationDeliveryPolicy`) evaluates delivery channels (`realtimeAllowed`, `pushAllowed`, `emailAllowed`) using strict precedence:

```
                  ┌───────────────────────────────┐
                  │ Does Channel Mute Apply?     │
                  │ (channelId provided & active) │
                  └───────────────┬───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                   YES                          NO
                    │                           │
          ┌──────────────────┐        ┌───────────────────────────────┐
          │ ALL DELIVERIES   │        │ Check Type Preference         │
          │ SUPPRESSED       │        │ for the Medium                │
          │ (false)          │        └───────────────┬───────────────┘
          └──────────────────┘                        │
                                        ┌─────────────┴─────────────┐
                                     EXPLICIT                     NULL /
                                  (true / false)                 NO ROW
                                        │                           │
                              ┌──────────────────┐        ┌──────────────────┐
                              │ Use Type         │        │ Inherit Global   │
                              │ Override         │        │ Preference       │
                              └──────────────────┘        │ (defaults: true) │
                                                          └──────────────────┘
```

### Precedence Details:
1. **Channel Association Guard**: Channel mute rules apply *only* when the notification is associated with a channel (`channelId` provided). Non-channel notifications (e.g., direct messages, calendar invites, system alerts) are never suppressed by channel mutes.
2. **Channel Mute Evaluation**:
   - `muted_until IS NULL`: Permanently muted.
   - `muted_until > NOW()`: Temporarily muted.
   - `muted_until <= NOW()`: Mute has expired; evaluates as unmuted without requiring a background cron job.
   - If actively muted: `realtimeAllowed = false`, `pushAllowed = false`, `emailAllowed = false`.
3. **Type Override Evaluation**:
   - If type preference has an explicit boolean (`true` or `false`), that boolean overrides the global preference.
   - If type preference is `null` or no row exists, the global user preference is inherited.
4. **Default Fallback**: If no global preference record exists for the user, all channels default to `true`.

---

## 4. Authorization & Security

1. **User Identity Boundary**: Identity is extracted exclusively from verified authentication context (`req.user.id`). User IDs provided in request bodies are ignored.
2. **Channel Access Verification**: Channel mute/unmute operations call `AuthorizationService.getChannelAuth(userId, channelId)`. If the channel does not exist, belongs to another organization, or is a private channel to which the user has no access, the server responds with anti-enumeration `404 NOT_FOUND`.
3. **Input Validation**:
   - All preference request bodies reject unknown fields.
   - Channel IDs must be valid UUIDs.
   - Notification types must match canonical `NotificationType` enum values.
   - `mutedUntil` must be a valid ISO-8601 string representing a future timestamp (or `null` for permanent mute).

---

## 5. Relationship to Phase 9C Realtime Synchronization

Phase 9C guarantees multi-device state convergence via PostgreSQL as the durable source of truth and monotonic `mutation_seq` tracking.

- **Sync Transport Integrity**: Preference resolution must **never** break the sequence continuity of Phase 9C synchronization.
- **Realtime Delivery vs. State Sync**: The realtime event `notification.created` serves as the live synchronization transport that allows client state machines (`NotificationSyncManager`) to advance `localSeq` without gaps. The `realtimeAllowed` flag provides the presentation layer with server policy on whether an intrusive alert, banner, or toast should be triggered, but does **not** suppress the durable synchronization stream or corrupt sequence contiguousness.

---

## 6. REST API Endpoints

### Global Preferences
- `GET /api/v1/notifications/preferences` -> `{ success: true, data: UserNotificationPreferences }`
- `PATCH /api/v1/notifications/preferences` -> `{ success: true, data: UserNotificationPreferences }`
  - Body: `{ realtimeEnabled?: boolean, pushEnabled?: boolean, emailEnabled?: boolean }`

### Per-Type Preferences
- `GET /api/v1/notifications/preferences/types` -> `{ success: true, data: { preferences: UserNotificationTypePreference[] } }`
- `PATCH /api/v1/notifications/preferences/types/:notificationType` -> `{ success: true, data: UserNotificationTypePreference }`
  - Body: `{ realtimeEnabled?: boolean | null, pushEnabled?: boolean | null, emailEnabled?: boolean | null }`

### Channel Notification Mutes
- `GET /api/v1/channels/:channelId/notification-mute` -> `{ success: true, data: ChannelNotificationMute }`
- `PUT /api/v1/channels/:channelId/notification-mute` -> `{ success: true, data: ChannelNotificationMute }`
  - Body: `{ mutedUntil?: string | null }`
- `DELETE /api/v1/channels/:channelId/notification-mute` -> `{ success: true, data: ChannelNotificationMute }`

---

## 7. Explicit Phase Boundaries (What is NOT in Phase 9D-A)

Phase 9D-A deliberately excludes:
- Push notification provider SDKs (FCM, APNs).
- Device push token registration endpoints and tables.
- Push delivery workers.
- Email transport providers (SMTP, SES, SendGrid).
- Email delivery workers.
- Digest aggregation background jobs.
- Notification UI components (notification bell, drawer, toasts, sound toggles).

These capabilities will be built on top of this centralized policy engine in Phase 9D-B, 9D-C, and 9D-D.
