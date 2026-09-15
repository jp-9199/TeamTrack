# TeamTrack Phase 9D-B: Push Notifications Architecture

## 1. Overview & Core Philosophy

Push notification delivery in TeamTrack is completely decoupled from durable notification persistence and Phase 9C realtime WebSocket synchronization.

### Guiding Principles:
1. **PostgreSQL Is the Durable Authority**: Notifications are persisted and assigned an authoritative monotonic `mutation_seq` inside PostgreSQL before any push outbox delivery is triggered.
2. **Push Failure Never Affects Notifications**: A network timeout, provider error, or rate-limiting event with FCM/APNs will never roll back or delete a durable notification row or alter its sequence.
3. **Phase 9C Realtime Correctness Is Maintained**: WebSocket catch-up sync, sequence gaps, and keyset pagination operate independently from push deliveries. Push state does not consume or alter `mutation_seq`.
4. **Zero Provider Secrets in Frontend / Git**: Provider credentials (FCM Service Account keys, APNs p8 keys/certificates) reside exclusively on the backend via environment variables and are never sent to clients or checked into source control.
5. **Push Token Confidentiality**: Push tokens are treated as sensitive secrets. Raw tokens are never logged, never returned over API endpoints (GET APIs return sanitized DTOs with SHA-256 `tokenHash`), and never broadcast over WebSockets.

---

## 2. Architectural Flow Diagram

```
Application Event
      |
      v
Durable PostgreSQL Notification (notifications table, monotonic mutation_seq)
      |
      +--> Phase 9C Realtime WebSocket Synchronization (Redis Pub/Sub -> WebSocket clients)
      |
      +--> Phase 9D-A Delivery Policy Evaluation (pushAllowed?)
                 |
        [If pushAllowed = true]
                 v
      Push Delivery Outbox (push_notification_deliveries table, status: PENDING)
                 |
                 v
      Push Worker (SKIP LOCKED atomic claim, sets lease_expires_at)
                 |
                 v
      Push Provider Abstraction (executed OUTSIDE database transaction)
                 |
          +------+------+
          |             |
        FCM            APNs
      (Android/       (iOS)
      Desktop)
```

---

## 3. Device Push Token Model (`push_devices`)

A dedicated `push_devices` table stores mobile and desktop push credentials, avoiding collision or regression with Phase 4's `user_devices` (which handles hardware authentication fingerprints and browser sessions):

```sql
CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  push_token TEXT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  app_version VARCHAR(50) NULL,
  device_name VARCHAR(100) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_devices_token_hash UNIQUE (token_hash),
  CONSTRAINT chk_push_devices_platform CHECK (platform IN ('android', 'ios', 'desktop')),
  CONSTRAINT chk_push_devices_provider CHECK (provider IN ('fcm', 'apns'))
);
```

### Key Properties:
- **`token_hash`**: SHA-256 digest of the push token, indexed uniquely. Used for deterministic UPSERT deduplication and lookup.
- **Token Rotation & Re-binding**: If a device rotates its push token or a new user signs into the app on the same physical device, the `ON CONFLICT (token_hash)` upsert safely updates ownership to the new user and resets `enabled = true`.
- **Sanitized DTOs**: The client-facing `PushDevice` DTO returns `id`, `userId`, `platform`, `provider`, `tokenHash`, `appVersion`, `deviceName`, `enabled`, `lastSeenAt`, `createdAt`, and `updatedAt`. The raw `push_token` is never exposed.

---

## 4. Push Device Registration API

Endpoints are mounted under `/api/v1/devices/push`:
- `POST /api/v1/devices/push`: Registers or updates a push token for the authenticated user.
- `GET /api/v1/devices/push`: Lists all registered push devices for the authenticated user (returns sanitized DTOs).
- `DELETE /api/v1/devices/push/:deviceId`: Deletes a registered push device.

### Security Rules:
- Authenticated user ID is derived solely from the cryptographically verified JWT access token (`req.user.id`).
- Any attempt by clients to pass a spoofed `userId` in the request body is rejected (`403 Forbidden`).
- Device deletion verifies ownership (`user_id = $2`); nonexistent or cross-user device IDs return `404 Not Found` to prevent device enumeration.
- Strict unknown field rejection prevents parameter pollution.
- Platform/provider compatibility validation:
  - `android` &rarr; `fcm`
  - `ios` &rarr; `apns`
  - `desktop` &rarr; `fcm`
  - Mismatched pairs (e.g. `android` + `apns`) are rejected with `400 Bad Request`.

---

## 5. Provider Abstraction

The backend uses a modular provider interface (`PushProviderClient`) registered in `PushProviderRegistry`:

```typescript
export interface PushProviderClient {
  readonly name: PushProvider;
  send(message: PushMessage): Promise<PushSendResult>;
  validateConfiguration(): { valid: boolean; reason?: string };
}
```

### Implementations:
- **`FCMPushProvider`**: Handles Android and Desktop pushes via Firebase Cloud Messaging HTTP v1 API.
- **`APNsPushProvider`**: Handles iOS pushes via Apple Push Notification service HTTP/2 API.
- **Pluggable Test Transports**: Both providers support custom transport hooks for deterministic unit testing without executing real network calls or requiring external credentials in CI.

---

## 6. Standardized Push Payload

The push payload is strictly an alerting mechanism; it is **not** the client's data authority. The client fetches authoritative updates via TeamTrack APIs upon interaction.

```typescript
export interface PushNotificationPayload {
  notificationId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  resourceType?: NotificationResourceType;
  resourceId?: string;
  channelId?: string;
  conversationId?: string;
  meetingId?: string;
  deepLink?: string;
}
```

### Exclusions:
- Passwords, access tokens, refresh tokens, push tokens, and authorization credentials are **strictly prohibited** from payloads.
- Sensitive message attachment contents or private secrets are never included.

---

## 7. Delivery Outbox & Transaction Boundaries

To guarantee high availability and prevent database connection exhaustion, external network calls to FCM and APNs **never occur inside PostgreSQL transactions**.

### Table: `push_notification_deliveries`
- `status`: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DISABLED`
- `attempt_count`: Tracks retries
- `lease_expires_at`: Timestamp lease for detecting and reclaiming crashed worker jobs
- `next_attempt_at`: Timestamp for exponential backoff scheduling
- `(notification_id, device_id)`: Unique constraint ensuring duplicate deliveries are never created for the same notification and device.

### Enqueueing Lifecycle (Transactional Outbox):
1. Client connects to database transaction (`BEGIN`).
2. Durable notification is inserted into `notifications` and assigned `mutation_seq` via Phase 9C sequence lock.
3. Centralized Phase 9D-A delivery policy resolves `pushAllowed` for recipient within the same transaction:
   - Evaluates global `push_enabled` (default `true`).
   - Evaluates per-type override (`push_enabled`).
   - Evaluates channel mute (only if notification has an associated `channelId`).
4. If `pushAllowed` is true, active enabled devices for recipient are fetched and batch-inserted into `push_notification_deliveries` on the transaction client with `ON CONFLICT (notification_id, device_id) DO NOTHING`.
5. Database transaction commits (`COMMIT`), persisting the notification and outbox delivery rows **atomically**.
6. Post-commit: Phase 9C realtime event is published to Redis.
7. Secondary Durable Reconciliation Safety Net: `pushDeliveryService.reconcileMissingOutboxDeliveries()` queries any historical notifications lacking outbox records and enqueues them, ensuring zero permanently lost work under any failure scenario.

### Token Ownership & Cross-User Device Migration:
When a push token is re-registered:
- If registered to the **same user**: Idempotently updates metadata (`app_version`, `device_name`, `last_seen_at`) and re-enables device if disabled.
- If registered to a **different user** (e.g. mobile app user logout/login on the same physical hardware):
  - The previous owner's device record is deleted.
  - Due to `ON DELETE CASCADE` on `push_notification_deliveries(device_id)`, all pending/un-sent deliveries for the previous user on that device are immediately and permanently purged!
  - A fresh device record with a new `id` is inserted for the new user.
  - Previous user can no longer view or delete the device (404 Not Found), and private notifications for the old user can never leak to the new user.


---

## 8. Push Worker Lifecycle & Safe Job Claiming

### Concurrency Safety (`FOR UPDATE OF d SKIP LOCKED`):
Multiple worker processes or threads can run concurrently without double-claiming jobs:

```sql
WITH claimable AS (
  SELECT d.id
  FROM push_notification_deliveries d
  JOIN push_devices dev ON dev.id = d.device_id
  WHERE (
    (d.status = 'PENDING' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW()))
    OR
    (d.status = 'PROCESSING' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at <= NOW())
  )
  AND dev.enabled = true
  ORDER BY COALESCE(d.next_attempt_at, d.created_at) ASC
  LIMIT $1
  FOR UPDATE OF d SKIP LOCKED
)
UPDATE push_notification_deliveries upd
SET
  status = 'PROCESSING',
  attempt_count = upd.attempt_count + 1,
  lease_expires_at = NOW() + ($2 || ' milliseconds')::interval,
  updated_at = NOW()
...
```

### Stale Job Recovery:
If a worker crashes while processing a job, the lease expires (`lease_expires_at <= NOW()`). Any surviving worker claims the job on its next poll, ensuring no job is permanently stuck.

### Error Classification & Retry Policy:
- **Success**: Status updated to `SENT`, `provider_message_id` recorded.
- **Permanent Token Invalidation** (`Unregistered`, `BadDeviceToken`, `INVALID_OR_UNREGISTERED_TOKEN`):
  - Delivery marked `DISABLED`.
  - Device row in `push_devices` updated to `enabled = false`.
  - Job is not retried.
- **Transient Failures** (HTTP 429, 500, 503, provider timeouts, `RESOURCE_EXHAUSTED`):
  - If `attempt_count < maxAttempts` (default 5): calculates exponential backoff with 20% jitter (`delay = min(maxDelay, baseDelay * 2^(attempt-1) + jitter)`) and updates status to `PENDING` with `next_attempt_at`.
  - If `attempt_count >= maxAttempts`: marks delivery `FAILED`.
- **Permanent Configuration / Auth Errors** (`UNAUTHENTICATED`, `BadCertificate`, missing credentials):
  - Marks delivery `FAILED` immediately to prevent infinite retry storms.

---

## 9. Production Environment Secrets

The following environment variables configure live FCM and APNs providers in production:

### Firebase Cloud Messaging (FCM):
- `FCM_PROJECT_ID`: Google Cloud / Firebase project identifier.
- `FCM_CLIENT_EMAIL`: Service account email with Firebase Cloud Messaging API permissions.
- `FCM_PRIVATE_KEY`: PEM-formatted private key for service account authentication.

### Apple Push Notification service (APNs):
- `APNS_KEY_ID`: 10-character Key ID from Apple Developer portal.
- `APNS_TEAM_ID`: 10-character Team ID from Apple Developer account.
- `APNS_PRIVATE_KEY`: PEM-formatted p8 private key.
- `APNS_TOPIC`: Bundle ID of the application (e.g., `com.teamtrack.app`).

---

## 10. Explicit Scope Boundaries

- **Phase 9D-B**: Implements backend device push token models, registration APIs, provider abstractions, delivery outbox, workers, error taxonomies, and api-client methods.
- **Phase 9D-C (Email Notifications)**: Explicitly deferred. Not implemented in this phase.
- **Phase 9D-D (Notification UI)**: Explicitly deferred. No UI components or screens were added in this phase.
- **Browser Push**: Not implemented in this phase (web uses WebSocket sync).
- **Digest / Batching Workers**: Not implemented in this phase.
