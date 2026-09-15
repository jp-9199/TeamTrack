# TeamTrack Phase 4: Authentication & Identity Architecture Specification

## 1. Overview & Core Security Principles

TeamTrack implements a centralized, token-based authentication and identity architecture serving Web (Next.js), Desktop (Electron), and Mobile (React Native) applications against a Node.js Express backend and a persistent PostgreSQL 16+ database.

### Core Principles
1. **Backend as Sole Security Boundary**: Clients are untrusted. All authorization, token validation, credential verification, and session state transitions are enforced strictly on the backend.
2. **Zero Plaintext Token Storage**: Refresh tokens are generated with 48 bytes of cryptographically secure random entropy (`crypto.randomBytes(48).toString('hex')`) and persisted in PostgreSQL solely as SHA-256 digests (`user_sessions.refresh_token_hash`).
3. **Transport Segregation**:
   - **Web**: Refresh token is stored in an `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/v1/auth` browser cookie (`teamtrack_rt`). The refresh token is strictly omitted from Web JSON responses and never stored in `localStorage` or `sessionStorage`.
   - **Desktop / Mobile**: Refresh token is returned in JSON payloads and securely persisted using OS-level credential vaults (Electron `safeStorage` via DPAPI/Keychain/libsecret on desktop; iOS Keychain / Android Keystore on mobile).
4. **Memory-Only Access Tokens**: Access JWTs are held strictly in runtime application memory across all clients and are never persisted to disk or browser storage.
5. **No 30-Second Grace Window**: To ensure replacement refresh tokens are never recoverable from the database, TeamTrack implements **Client-Side Single-Flight Refresh + Server-Side Row Locking (`SELECT ... FOR UPDATE`) + Strict Reuse Detection (Immediate Revocation)**.

---

## 2. Database Schema (Phase 4 Migration)

Migration file: `database/migrations/20260911100001_create_user_credentials_table.sql`

### `user_credentials` Table
Isolates sensitive Argon2id password hashes from user profile tables:
- `user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
- `password_hash VARCHAR(255) NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Trigger: `trg_user_credentials_updated_at` maintaining `updated_at` via existing `set_updated_at()`.

### `user_sessions` Extensions
Extended to enforce atomic refresh token rotation and token reuse detection:
- `previous_refresh_token_hash VARCHAR(255) NULL`
- `rotated_at TIMESTAMPTZ NULL`
- `rotation_counter INTEGER NOT NULL DEFAULT 0`
- Partial Index: `idx_user_sessions_prev_token ON user_sessions(previous_refresh_token_hash) WHERE previous_refresh_token_hash IS NOT NULL`

---

## 3. Password Hashing & Timing Attack Mitigation

- **Algorithm**: Argon2id (`@node-rs/argon2`)
- **Parameters**: 19 MiB memory cost, 2 iterations, 1 thread parallelism (`argon2.Algorithm.Argon2id`).
- **Timing Discrepancy Defense**: When a login attempt specifies an unregistered email or an account without credentials, the backend executes `verifyDummyPassword()` against a pre-computed static valid Argon2id hash:
  `$argon2id$v=19$m=19456,t=2,p=1$Z3VpJA1w7teGR8Umwi5tUw$kVsVDbssLPV4lKbykt+D4NEbKK7qA568IkguGiv+Tns`
  This consumes the identical ~150ms CPU/memory key-derivation cost as an existing account, mitigating user enumeration timing attacks.
- **Generic Error Response**: Nonexistent accounts and incorrect passwords return identical generic `INVALID_CREDENTIALS` (HTTP 401) responses.

---

## 4. Access Tokens (JWT)

- **Lifetime**: 15 minutes (`ACCESS_TOKEN_TTL=15m`)
- **Algorithm**: Explicitly signed and verified with `HS256`. Asymmetric algorithm confusion or `'none'` algorithms are strictly rejected.
- **Claims**:
  ```json
  {
    "sub": "user_uuid",
    "sid": "session_uuid",
    "email": "user@example.com",
    "role": "user",
    "iss": "teamtrack-backend",
    "aud": "teamtrack-client",
    "iat": 1757580000,
    "exp": 1757580900
  }
  ```
- **Verification Policy**: Signature, algorithm whitelist, issuer, audience, and required claims (`sub`, `sid`, `email`) are verified in-memory on every protected request. Access tokens naturally expire after 15 minutes.

---

## 5. Refresh Token Rotation & Reuse Detection

All refresh token rotation operations execute within an isolated PostgreSQL transaction using pessimistic row locking (`SELECT ... FOR UPDATE`):

```sql
SELECT id, user_id, refresh_token_hash, previous_refresh_token_hash,
       user_agent, ip_address, expires_at, created_at, revoked_at,
       rotated_at, rotation_counter
FROM user_sessions
WHERE refresh_token_hash = $1 OR previous_refresh_token_hash = $1
FOR UPDATE
```

### State Machine Outcomes
1. **Case A (Valid Current Token)**:
   - Condition: `presentedHash == current refresh_token_hash` AND `revoked_at IS NULL` AND `expires_at > NOW()`.
   - Action: Generate new 48-byte token, hash it, set `previous_refresh_token_hash = current`, `refresh_token_hash = new`, `rotated_at = NOW()`, increment `rotation_counter`. Commit transaction.
2. **Case B (Token Reuse Detected)**:
   - Condition: `presentedHash == previous_refresh_token_hash`.
   - Action: Indicates that a previously rotated token was replayed (stolen token or compromised client). Immediately execute `UPDATE user_sessions SET revoked_at = NOW() WHERE id = $id`. Return HTTP 401 `SESSION_REVOKED`.
3. **Case C (Unknown Token)**:
   - Return HTTP 401 `INVALID_TOKEN`.
4. **Case D (Revoked Session)**:
   - Return HTTP 401 `SESSION_REVOKED`.
5. **Case E (Expired Session)**:
   - Return HTTP 401 `TOKEN_EXPIRED`.

---

## 6. Client Storage & Transport Architecture

### Web Application (Next.js)
- **Access Token**: In-memory React state / API client closure.
- **Refresh Token**: `teamtrack_rt` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=7d`).
- **Initial Bootstrap**: On initial load, Web client calls `POST /api/v1/auth/refresh` with `credentials: 'include'`. The browser automatically transmits the cookie, the backend rotates the session, issues a new cookie, and returns a fresh access token into memory.
- **CSRF Defense**: Strict CORS allowed origin validation and Origin/Referer header verification on cookie-authenticated auth endpoints.

### Desktop Application (Electron)
- **Access Token**: In-memory closure.
- **Refresh Token**: Received in JSON response body.
- **Storage Layer**: Handled in Electron main process using `safeStorage.encryptString()` / `safeStorage.decryptString()`. Persisted encrypted to `userData/session_rt.enc`.
- **Safety**: Checks `isSafeStorageAvailable()`. If encryption is unavailable on the platform, throws `SecureStorageUnavailableError` and fails safely without writing plaintext.

### Mobile Application (React Native)
- **Access Token**: In-memory closure.
- **Refresh Token**: Received in JSON response body.
- **Storage Layer**: Persisted in hardware-backed iOS Keychain / Android Keystore via `react-native-keychain` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Never stored in `AsyncStorage` or unencrypted preferences.

### Single-Flight Refresh Queue (`@teamtrack/api-client`)
- When multiple asynchronous requests detect an expired access token (HTTP 401), the client coalesces them into a single active refresh `Promise`.
- All waiting requests await the identical single refresh operation.
- Upon completion, the new access token is updated in memory, and pending requests are re-executed with the renewed token.
- If refresh fails, `handleAuthFailure()` clears in-memory state, wipes native storage, and triggers `onAuthFailure` callback.

---

## 7. Rate Limiting Architecture

- **Production Authority**: Redis (`ioredis`).
- **Endpoints & Limits**:
  - `POST /api/v1/auth/register`: 5 requests / 1 hour / IP (`rl:auth:register:<ip>`)
  - `POST /api/v1/auth/login`: 10 requests / 15 minutes / IP (`rl:auth:login:ip:<ip>`)
  - Account Brute-Force Limit: 5 failed attempts / 15 minutes / account hash (`rl:auth:login:account:<hash>`)
  - `POST /api/v1/auth/refresh`: 30 requests / 1 minute / IP (`rl:auth:refresh:<ip>`)
- **Fail-Closed Production Policy**: In production (`NODE_ENV=production`), if Redis is disconnected or unavailable, the rate limiter refuses to process auth requests (HTTP 503 / `RATE_LIMITED`) and emits a critical security log. Local in-memory fallback is strictly restricted to test and local development environments.

---

## 8. Environment Variables

| Variable | Required in Production | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Environment mode |
| `PORT` | No | `4000` | Backend listening port |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/teamtrack` | PostgreSQL 16+ connection URI |
| `ACCESS_TOKEN_SECRET` | Yes (min 32 chars) | *(cryptographic secret)* | HMAC-SHA256 signing secret |
| `ACCESS_TOKEN_TTL` | No | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | No | `7d` | Refresh token session expiration |
| `ACCESS_TOKEN_ISSUER` | No | `teamtrack-backend` | JWT issuer verification |
| `ACCESS_TOKEN_AUDIENCE` | No | `teamtrack-client` | JWT audience verification |
| `COOKIE_SECURE` | Yes (`true` for HTTPS) | `true` | Enforces Secure flag on cookie |
| `COOKIE_SAME_SITE` | No | `lax` | Cookie SameSite policy (`lax`, `strict`, `none`) |
| `CORS_ORIGIN` | Yes | `https://app.teamtrack.com` | Allowed Web origins for CORS |
| `REDIS_URL` | Yes (for rate limiting) | `redis://localhost:6379` | Production Redis cluster/instance |
