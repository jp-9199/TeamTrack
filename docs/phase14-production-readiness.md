# Phase 14: Production Readiness Operations Guide

**TeamTrack Backend — Production Readiness, Reliability, Observability & Performance**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Environment Configuration](#environment-configuration)
4. [Health & Readiness Endpoints](#health--readiness-endpoints)
5. [Structured Logging](#structured-logging)
6. [Request Correlation & Tracing](#request-correlation--tracing)
7. [Central Error Handling](#central-error-handling)
8. [Database Reliability](#database-reliability)
9. [Redis Reliability](#redis-reliability)
10. [Graceful Shutdown](#graceful-shutdown)
11. [WebSocket Reliability](#websocket-reliability)
12. [Rate Limiting & Fail-Close Policy](#rate-limiting--fail-close-policy)
13. [Request Body Limits](#request-body-limits)
14. [API Client Health Methods](#api-client-health-methods)
15. [Security Hardening](#security-hardening)
16. [Operational Runbooks](#operational-runbooks)
17. [Verification Checklist](#verification-checklist)

---

## Overview

Phase 14 introduces production-grade reliability, observability, and performance hardening to the TeamTrack backend service. All existing Phase 1–13 capabilities and security invariants are preserved.

**Key deliverables:**
- Structured JSON logging with automatic sensitive-field redaction
- Request correlation IDs propagated end-to-end
- Production-safe error responses (no stack traces, no SQL leakage)
- Kubernetes-ready health and readiness probes
- PostgreSQL connection pool hardening
- Redis bounded reconnect backoff and `closeRedis()` lifecycle hook
- Ordered graceful shutdown (HTTP → WebSocket → Redis → PostgreSQL)
- 1 MB body size enforcement on all endpoints
- Fail-closed rate limiting when Redis is unavailable in production
- 57-scenario Phase 14 test suite (57/57 passing)

---

## Architecture Summary

```
Client Request
    │
    ├── requestIdMiddleware          (Phase 14: assign/validate X-Request-Id)
    ├── cors                         (origin allowlist with credentials)
    ├── cookieParser
    ├── express.json({ limit:'1mb'}) (Phase 14: 1MB body size enforcement)
    ├── express.urlencoded({ limit:'1mb' })
    ├── requestLogger                (Phase 14: structured HTTP access log)
    │
    ├── Routes (health, auth, users, orgs, teams, channels, ...)
    │       │
    │       └── Central errorHandler (Phase 14: sanitized production errors)
    │
WebSocket Upgrade
    └── wsTicketService → webSocketServer (heartbeat, maxPayload 64KB)

Shutdown (SIGTERM/SIGINT)
    1. Mark _isShuttingDown = true
    2. httpServer.close()
    3. webSocketServer.close()
    4. closeRedis()
    5. closePool()
    6. Force exit after 10s
```

---

## Environment Configuration

### Required in Production

| Variable | Description | Minimum |
|----------|-------------|---------|
| `ACCESS_TOKEN_SECRET` | JWT signing secret | 32 chars, no `insecure`/`dev` |
| `DATABASE_URL` | PostgreSQL connection string | Must not be default localhost |
| `STORAGE_DRIVER` | `s3` (never `mock`) | — |
| `S3_BUCKET` | S3 bucket name | Non-empty |

### Optional / Tunable

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | `json` (prod), `text` (dev) | Structured output format |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Hard-kill timeout in ms |
| `REQUEST_BODY_LIMIT` | `1mb` | Max request body size |
| `DB_POOL_MAX` | `20` | PostgreSQL max pool connections |
| `DB_STATEMENT_TIMEOUT_MS` | `30000` | Max SQL query time in ms |
| `REDIS_URL` | (none) | Redis connection string |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated CORS origins |

### Production Fail-Fast Validation

On startup with `NODE_ENV=production`, the service will **fail immediately** if:
- `ACCESS_TOKEN_SECRET` is missing, shorter than 32 chars, or contains `insecure`/`dev`
- `STORAGE_DRIVER=mock` is set
- `DATABASE_URL` is the default localhost value

---

## Health & Readiness Endpoints

### `GET /health` and `GET /live` — Liveness
```json
HTTP 200 OK
{
  "status": "ok",
  "service": "backend",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```
- **Purpose**: Process is alive and accepting traffic
- **Use**: Kubernetes `livenessProbe`
- **Never fails** due to database or Redis status

### `GET /ready` — Readiness
```json
HTTP 200 OK
{
  "status": "ready",
  "service": "backend",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": "up",
    "redis": "up"
  }
}
```
```json
HTTP 503 Service Unavailable
{
  "status": "unhealthy",
  "service": "backend",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": "down",
    "redis": "degraded"
  }
}
```
- **Purpose**: Service dependencies are ready to accept traffic
- **Use**: Kubernetes `readinessProbe`
- **Database check**: Executes `SELECT 1` with 2s timeout
- **Redis states**: `up` | `degraded` | `not_configured`
- **Returns 503 during graceful shutdown** so load balancers stop routing

> [!NOTE]
> All four endpoints (`/health`, `/live`, `/ready`, `/api/v1/health`, `/api/v1/live`, `/api/v1/ready`) are available at both root and `/api/v1/` prefix paths.

---

## Structured Logging

All log output flows through a single `Logger` instance (`src/observability/logger.ts`).

### Format

**Production (JSON):**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "severity": "info",
  "service": "backend",
  "environment": "production",
  "message": "HTTP GET /api/v1/users 200 in 12ms",
  "requestId": "a1b2c3d4-...",
  "statusCode": 200,
  "durationMs": 12
}
```

**Development (text):**
```
[2024-01-15T10:30:00.000Z] [INFO] HTTP GET /api/v1/users 200 in 12ms {"requestId":"a1b2c3d4-..."}
```

### Automatic Secret Redaction

The logger **automatically redacts** the following fields at any nesting depth:

| Field Pattern | Result |
|---------------|--------|
| `password`, `currentPassword`, `newPassword` | `[REDACTED]` |
| `token`, `accessToken`, `refreshToken` | `[REDACTED]` |
| `authorization`, `cookie`, `cookies` | `[REDACTED]` |
| `secret`, `apiKey`, `api_key` | `[REDACTED]` |
| `secretAccessKey`, `accessKeyId` | `[REDACTED]` |
| `confirmationToken`, `tokenHash` | `[REDACTED]` |
| `credentials`, `turnCredential` | `[REDACTED]` |
| String values starting with `Bearer ` | `Bearer [REDACTED]` |

**Depth limit**: 8 levels deep. Deeper structures are replaced with `[DEPTH_LIMIT]`.

### Log Levels

Set via `LOG_LEVEL` environment variable:

| Level | Use Case |
|-------|----------|
| `debug` | Verbose development tracing |
| `info` | Normal operations (default) |
| `warn` | Degraded conditions, recoverable errors |
| `error` | Errors requiring attention |

---

## Request Correlation & Tracing

Every request is assigned a unique correlation ID that flows through the entire request lifecycle.

### Behavior

1. If `X-Request-Id` or `X-Correlation-Id` header is present and matches `^[a-zA-Z0-9_-]{1,64}$`, it is used as-is
2. Otherwise, a fresh UUIDv4 is generated
3. The ID is set on `req.id` and echoed in response headers:
   - `X-Request-Id: <id>`
   - `X-Correlation-Id: <id>`
4. All log lines include `requestId`
5. All error responses include `requestId` in `error.requestId`

### Example

```
→ GET /api/v1/meetings  X-Request-Id: my-trace-123
← HTTP 200              X-Request-Id: my-trace-123
                         X-Correlation-Id: my-trace-123
```

---

## Central Error Handling

All errors flow through a single authoritative error handler (`src/middleware/errorHandler.ts`).

### Response Shape

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "requestId": "a1b2c3d4-..."
  }
}
```

### Error Code Mapping

| Scenario | HTTP | Code |
|----------|------|------|
| CORS blocked origin | 403 | `FORBIDDEN` |
| Body > 1MB | 413 | `PAYLOAD_TOO_LARGE` |
| Malformed JSON | 400 | `BAD_REQUEST` |
| Service/domain errors | Varies | Error-specific code |
| Unhandled 5xx | 500 | `INTERNAL_ERROR` |

### Production Safety

- **5xx responses**: Client message is replaced with `"An internal server error occurred"` — no internal details
- **Sensitive patterns**: Messages containing `password`, `token`, `SELECT`, `INSERT`, `UPDATE` are sanitized to `"A database or security processing error occurred"`
- **Stack traces**: Never included in production responses
- **Detail field**: Only included in development/test if `err.details` is present

---

## Database Reliability

### Connection Pool Settings

```typescript
pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.database.poolMax,           // Default: 20
  idleTimeoutMillis: 30_000,              // 30s idle release
  connectionTimeoutMillis: 5_000,         // 5s acquire timeout
  statement_timeout: 30_000,             // 30s max query time
});
```

### `checkDatabaseHealth(timeoutMs = 2000)`

Executes `SELECT 1` with a configurable timeout. Returns `boolean`. Used by `/ready` probe. Never throws.

### `withTransaction(callback)`

Guarantees:
- `BEGIN` before callback
- `COMMIT` on success
- `ROLLBACK` on any error (rollback errors are logged but do not mask the original error)
- `client.release()` in `finally` — always returns the client to the pool

### `closePool()`

Called during graceful shutdown. Drains in-flight queries, then closes the pool.

---

## Redis Reliability

### Bounded Reconnect Strategy

```typescript
retryStrategy = (times: number) => Math.min(times * 200, 3_000)
// 1st retry: 200ms, 2nd: 400ms, ..., 15th+: 3000ms (cap)
```

### `isRedisConnected(): boolean`

Reflects current connection state. Flips to `false` on any error or disconnect event.

### `closeRedis(): Promise<void>`

Gracefully disconnects both `publisherClient` and `subscriberClient` using `QUIT`, with a fallback to `disconnect()` if `QUIT` fails. Sets `redisAvailable = false` before disconnecting.

### `getRedisPublisher() / getRedisSubscriber()`

Returns the client only when `redisAvailable = true`. Returns `null` when Redis is down, allowing callers to handle unavailability gracefully.

---

## Graceful Shutdown

### Shutdown Sequence

On `SIGTERM` or `SIGINT`:

```
1. Set _isShuttingDown = true
   └── /ready now returns 503 (stops load balancer traffic)

2. httpServer.close()
   └── Existing HTTP connections drain; no new connections accepted

3. webSocketServer.close()
   └── All active WebSocket connections closed with code 1001 (Going Away)

4. closeRedis()
   └── QUIT sent to publisher and subscriber clients

5. closePool()
   └── PostgreSQL pool drained and closed

6. process.exit(0)
```

**Hard timeout**: If shutdown takes longer than `SHUTDOWN_TIMEOUT_MS` (default: 10s), `process.exit(1)` is called to prevent hung processes.

### Configuration

```bash
SHUTDOWN_TIMEOUT_MS=10000  # Hard kill boundary in milliseconds
```

---

## WebSocket Reliability

### Max Payload Enforcement

WebSocket frames are rejected if they exceed **64 KB** (`maxPayload: 64 * 1024`).

### Heartbeat

- Server pings all connected clients every **30 seconds**
- Clients that do not respond with `pong` are terminated on the next cycle
- Client-side ping/pong is also supported via JSON `{ type: "ping" }` → `{ type: "pong" }`

### Upgrade Security

All WebSocket upgrade requests are validated:
- Must use `/ws` or `/api/v1/ws` path (others → 404)
- Must include `teamtrack-ws` subprotocol (otherwise → 400)
- Must include `tt-ticket.<token>` subprotocol (otherwise → 401)
- Credentials in query string (`?token=`, `?ticket=`) are rejected with 400

---

## Rate Limiting & Fail-Close Policy

### Production Invariant

When `NODE_ENV=production` and Redis is **unavailable**, rate-limited endpoints return:

```json
HTTP 503 Service Unavailable
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Service temporarily unable to process request due to rate limit verification failure"
  }
}
```

This **fail-closed** behavior prevents abuse during Redis outages. In-memory fallback is **strictly disabled** in production (`config.rateLimit.allowMemoryFallback = false`).

### Development / Test

In-memory fallback is permitted when `NODE_ENV !== 'production'`.

---

## Request Body Limits

All endpoints enforce a **1 MB maximum body size**:

```typescript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

Requests exceeding the limit receive:

```json
HTTP 413 Payload Too Large
{
  "success": false,
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request payload exceeds maximum allowed size of 1MB",
    "requestId": "..."
  }
}
```

---

## API Client Health Methods

The `@teamtrack/api-client` package exposes two Phase 14 methods:

```typescript
// Liveness check — returns ApiHealthResponse
const health = await client.getHealth();
// { status: 'ok', service: 'backend', timestamp: '...' }

// Readiness check — returns ApiReadyResponse, optionally forwarding a correlation ID
const ready = await client.getReady('my-trace-id');
// { status: 'ready', service: 'backend', timestamp: '...', checks: { database: 'up', redis: 'up' } }
```

`checkHealth()` (legacy) remains available as an alias for `getHealth()`.

---

## Security Hardening

### CORS

- Explicit allowlist (`CORS_ORIGIN` env var, comma-separated)
- `X-Request-Id` and `X-Correlation-Id` added to `allowedHeaders`
- `X-Request-Id` and `X-Correlation-Id` exposed to browser clients via `exposedHeaders`
- Blocked origins return `HTTP 403 FORBIDDEN` (not a generic error)

### Authentication

All API routes (except `/health`, `/live`, `/ready`, `/api/v1/auth/*`) require a valid Bearer access token. Unauthenticated requests receive:

```json
HTTP 401 Unauthorized
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "requestId": "..."
  }
}
```

### Production Startup Validation

Automatically enforced via `validateProductionConfig()` at startup.

---

## Operational Runbooks

### Runbook: Health/Readiness Probe Failures

```bash
# Check liveness (should always return 200 if process is running)
curl http://localhost:4000/health

# Check readiness (200 = ready, 503 = degraded)
curl http://localhost:4000/ready

# If /ready returns 503 with database:down:
#   1. Check PostgreSQL connectivity
#   2. Check DATABASE_URL configuration
#   3. Check network/firewall rules

# If /ready returns with redis:degraded:
#   1. Check Redis connectivity
#   2. Check REDIS_URL configuration
#   3. Note: Server can still serve traffic when Redis is degraded (non-critical features degraded)
```

### Runbook: Graceful Shutdown Verification

```bash
# 1. Start the server
node dist/server.js

# 2. Send SIGTERM (what Kubernetes sends)
kill -SIGTERM <pid>

# Expected log output:
# [INFO] Received SIGTERM — initiating graceful shutdown
# [INFO] HTTP server closed — no new connections accepted
# [INFO] WebSocket server closed
# [INFO] Redis clients disconnected
# [INFO] PostgreSQL pool closed
# [INFO] Graceful shutdown complete
```

### Runbook: Verifying Secret Redaction

```bash
# In development, trigger a log line that includes sensitive data:
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"mypassword123"}'

# Verify server logs do NOT contain "mypassword123" — only "[REDACTED]"
```

### Runbook: Testing 1MB Body Enforcement

```bash
# Generate a 1.1MB payload and send it
python3 -c "import sys; sys.stdout.write('{\"data\":\"' + 'x' * 1100000 + '\"}')" | \
  curl -X POST http://localhost:4000/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    --data-binary @-
# Expected: HTTP 413 Payload Too Large
```

---

## Verification Checklist

| Check | Status |
|-------|--------|
| `npm run typecheck` — all 9 workspaces | ✅ 0 errors |
| Phase 14 test suite (57 scenarios) | ✅ 57/57 pass |
| Full backend test suite (1,124 tests) | ✅ 1,124/1,124 pass |
| `GET /health` returns 200 | ✅ Verified |
| `GET /live` returns 200 | ✅ Verified |
| `GET /ready` returns 200 with DB | ✅ Verified |
| `GET /ready` returns 503 when DB fails | ✅ Verified |
| X-Request-Id generated when missing | ✅ Verified |
| X-Request-Id propagated when valid | ✅ Verified |
| Malformed request ID sanitized | ✅ Verified |
| Malformed JSON → 400 (no stack leak) | ✅ Verified |
| Logger redacts 14+ sensitive field types | ✅ Verified |
| DB pool releases on error | ✅ Verified |
| withTransaction rolls back on error | ✅ Verified |
| Redis fail-closed in production | ✅ Verified |
| 1MB body limit enforced (413) | ✅ Verified |
| WebSocket without ticket → 401 | ✅ Verified |
| WebSocket invalid path → 404 | ✅ Verified |
| Graceful shutdown exports correct | ✅ Verified |
| `api-client.getHealth()` works | ✅ Verified |
| `api-client.getReady()` works | ✅ Verified |
| Cross-org access denied (401) | ✅ Verified |
| Governance endpoints require admin auth | ✅ Verified |
| Audit logs require admin auth | ✅ Verified |
