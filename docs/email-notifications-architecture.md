# TeamTrack Phase 9D-C: Email Notifications Architecture

## 1. Executive Summary & Purpose
Phase 9D-C introduces a resilient, durable, decoupled email notification outbox system for TeamTrack. Building on top of Phase 9A (notification persistence), Phase 9C (`mutation_seq` / realtime sync), Phase 9D-A (preferences & delivery policy), and Phase 9D-B (push notifications), this architecture ensures that email notifications are delivered at-least-once, without introducing coupling, latency, or failure modes into core notification creation and realtime synchronization.

---

## 2. Core Architecture & Data Flow

```
[ Application Event ]
        │
        ▼
[ NotificationService.createNotification() ]
        │
        ├── 1. BEGIN DB Transaction (PostgreSQL)
        │      ├── Insert notification row (allocating Phase 9C mutation_seq)
        │      ├── Evaluate Push Policy & Insert push outbox rows (Phase 9D-B)
        │      └── Evaluate Email Policy & Insert email outbox row (Phase 9D-C)
        │          (ON CONFLICT (notification_id, recipient_user_id) DO NOTHING)
        ├── 2. COMMIT DB Transaction
        │
        ├── 3. Post-Commit: Publish WebSocket Realtime Event (Phase 9C)
        │
        ▼
[ Background EmailWorker ] (PostgreSQL Poll with FOR UPDATE SKIP LOCKED)
        │
        ├── Claims PENDING / Stale PROCESSING jobs (assigns lease_expires_at)
        ├── Renders escaped email content (HTML + Plain Text)
        ├── Calls EmailProvider.send() OUTSIDE DB Transaction
        │
        ├── Success ──► Mark SENT with provider_message_id
        ├── Transient Error ──► Exponential backoff with jitter (up to max_attempts)
        └── Permanent Error ──► Mark FAILED or DISABLED (no retry storm)
```

---

## 3. Email Eligibility & Preference Integration (Phase 9D-A)

Email delivery strictly honors the server-side delivery policy engine established in Phase 9D-A (`notificationDeliveryPolicy.resolvePolicy()`):

1. **Global User Preference:**
   - Evaluates `user_notification_preferences.email_enabled` (defaults to `TRUE`).
   - If `FALSE`, email delivery is completely suppressed.

2. **Per-Notification-Type Override:**
   - Evaluates `user_notification_type_preferences.email_enabled` for `(user_id, notification_type)`.
   - If explicitly `true` or `false`, this override supersedes the global preference.
   - If `NULL`, the setting inherits the global preference value.

3. **Channel Mute Scoping:**
   - Evaluates `channel_notification_mutes` for `(user_id, channel_id)`.
   - If actively muted (`muted_until > NOW()` or `muted_until IS NULL`), email delivery is suppressed **only** for notifications associated with that channel (`resource_type = 'channel'` or `data_payload.channelId`).
   - Direct messages, mentions, and meeting invites without a channel association are **never suppressed** by channel mutes.

---

## 4. Recipient Resolution & Verification

Recipient resolution is handled authoritatively on the server; clients can never specify or spoof recipient email addresses:
1. Recipient user record is retrieved from the `users` table (`userRepository.findById(recipientId)`).
2. The user account state must be active (`status = 'active'`) and not soft-deleted (`deleted_at IS NULL`).
3. The user must possess a valid, non-empty email address.
4. The verified email address is snapshotted into `email_notification_deliveries.email_address_snapshot` at enqueue time. This ensures subsequent user profile email updates do not corrupt in-flight delivery records.

---

## 5. Outbox Architecture & Schema

### Database Migration: `20260914150001_create_email_notification_tables.sql`

```sql
CREATE TABLE IF NOT EXISTS email_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_address_snapshot TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DISABLED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NULL,
  provider_message_id VARCHAR(255) NULL,
  last_error_code VARCHAR(100) NULL,
  last_error_message VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_email_deliveries_notif_recipient UNIQUE (notification_id, recipient_user_id)
);
```

### Uniqueness & Idempotency
- Uniqueness constraint `uq_email_deliveries_notif_recipient` ensures that only one email delivery record can ever exist for a given `(notification_id, recipient_user_id)`.
- Concurrent or duplicate enqueue attempts use `ON CONFLICT (notification_id, recipient_user_id) DO NOTHING`.

---

## 6. Transaction Boundaries & Atomicity

### Transactional Outbox
Notification creation and outbox row insertion are executed inside the same PostgreSQL transaction (`BEGIN ... COMMIT`):
- If the transaction commits, both the notification and the email delivery row are durably persisted.
- If the transaction rolls back, both are rolled back cleanly.
- Outbox insertion **never increments or alters `mutation_seq`**.

### Provider Call Isolation
External SMTP or API network calls are **never executed inside database transactions**. All provider communication is deferred to background worker processes that claim jobs outside transactional write locks.

---

## 7. Email Provider Abstraction & Registry

### Interfaces
- `EmailProvider`: Core contract exposing `send(params)` and `validateConfiguration()`.
- `SMTPEmailProvider`: Standard production SMTP implementation with environment-driven configuration:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `SMTP_SECURE`.
  - Supports pluggable custom transport for unit testing.
- `EmailProviderRegistry`: Manages active providers and returns the configured provider.

### Credential Protection
- Provider credentials are read strictly from backend environment variables.
- Credentials are never exposed to API endpoints, client bundles, or logged in server diagnostics.
- If credentials are missing, `validateConfiguration()` fails fast and reports clear operational errors without faking success.

---

## 8. Worker, Leasing, & Stale Job Recovery

### Concurrency & Job Claiming
The background `EmailWorker` claims pending jobs using PostgreSQL `FOR UPDATE SKIP LOCKED`:
```sql
WITH claimable AS (
  SELECT d.id
  FROM email_notification_deliveries d
  JOIN users u ON u.id = d.recipient_user_id
  WHERE (
    (d.status = 'PENDING' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW()))
    OR
    (d.status = 'PROCESSING' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at <= NOW())
  )
  AND u.status = 'active'
  AND u.deleted_at IS NULL
  ORDER BY COALESCE(d.next_attempt_at, d.created_at) ASC
  LIMIT $1
  FOR UPDATE OF d SKIP LOCKED
)
UPDATE email_notification_deliveries upd
SET
  status = 'PROCESSING',
  attempt_count = upd.attempt_count + 1,
  lease_expires_at = NOW() + ($2 || ' milliseconds')::interval,
  updated_at = NOW()
...
```

### Stale Job Recovery
If an `EmailWorker` crashes or suffers an unhandled timeout while processing a job, the job remains locked in `PROCESSING` until `lease_expires_at` (default 5 minutes). Once expired, any available worker will automatically reclaim and process the job on its next poll cycle.

---

## 9. Error Classification & Retry Policy

| Error Type | Examples | Classification | Action |
| :--- | :--- | :--- | :--- |
| **Permanent Address Error** | 550 Mailbox unavailable, 551 User not local, 553 Address rejected, malformed format | `isPermanentAddressInvalid: true` | Marks status `DISABLED` / `FAILED`. No retry. Prevents domain reputation damage. |
| **Transient Error** | ETIMEDOUT, ECONNRESET, 421/450/451/452 Temporary failure, rate limit | `isTransient: true` | Retried up to `maxAttempts` (default 5) with exponential backoff and 20% jitter. |
| **Configuration Error** | Missing SMTP_HOST, invalid auth credentials (535) | `isTransient: false` | Marks status `FAILED`. Fail-fast without generating retry storms. |

### Backoff Calculation
$$\text{delay} = \min(\text{maxDelay}, \text{initialDelay} \times 2^{\text{attemptCount} - 1} + \text{jitter})$$

---

## 10. Email Content & Sanitization

1. **Strict HTML Escaping:** All user-controlled text (`title`, `body`, resource names) is processed through `escapeHtml()` converting `&`, `<`, `>`, `"`, `'` into entity representations, preventing HTML injection and XSS.
2. **Dual Representation:** Every email includes both a styled, responsive HTML version and a formatted plain-text alternative.
3. **Zero Sensitive Data:** Email payloads never contain passwords, access tokens, refresh tokens, push tokens, or internal session identifiers. Deep links direct the user back to authenticated web/desktop app views (`/channels/:id`, `/meetings/:id`, etc.).

---

## 11. Subsystem Interactions & Boundaries

- **Phase 9C (Realtime & Mutation Sequences):** Email outbox enrollment and worker execution are completely decoupled from `user_notification_state` and `notifications.mutation_seq`. Sequences remain strictly monotonic and contiguous.
- **Phase 9D-A (Preferences):** Reuses the canonical delivery policy engine without altering preference schema.
- **Phase 9D-B (Push Notifications):** Push and email outbox rows are enrolled independently and processed by separate, decoupled worker subsystems.
- **Phase 9D-D (UI Boundary):** Phase 9D-C exposes **no public endpoints** for arbitrary email sending or outbox inspection. The notification center UI belongs exclusively to Phase 9D-D.
