# TeamTrack Realtime & WebSocket Architecture

## 1. Overview & Principles
TeamTrack Phase 6 introduces real-time event delivery through WebSockets backed by Redis Pub/Sub for horizontal fan-out across multiple backend instances.

Key Security & Reliability Principles:
1. **PostgreSQL as Source of Truth**: Redis is fan-out transport only. Missing a Redis event must never permanently stale client state.
2. **Post-Commit Invariant**: Real-time events are published **only after** the PostgreSQL transaction has committed.
3. **No Long-Lived Credentials in URLs or Handshakes**: Refresh tokens (`teamtrack_rt`) remain HttpOnly cookies dedicated to token rotation. Access JWTs remain memory-only. WebSocket handshakes utilize short-lived, single-use tickets.
4. **Subprotocol Handshake**: Credentials are never placed in query strings (`?token=...`).

---

## 2. WebSocket Ticket Authentication Flow

```text
 Client (Web / Mobile / Desktop)                Backend REST                   WebSocket Server
        │                                             │                                │
        │ 1. POST /api/v1/auth/ws-ticket              │                                │
        │    Headers: Authorization: Bearer <JWT>     │                                │
        ├────────────────────────────────────────────►│                                │
        │                                             │ 2. Generate 32-byte ticket     │
        │                                             │    TTL = 30s; Store in Redis   │
        │ 3. 200 OK: { ticket, expiresAt }            │                                │
        │◄────────────────────────────────────────────┤                                │
        │                                                                              │
        │ 4. WebSocket Handshake (GET /ws)                                             │
        │    Sec-WebSocket-Protocol: teamtrack-ws, tt-ticket.<ticket>                  │
        ├─────────────────────────────────────────────────────────────────────────────►│
        │                                                                              │ 5. Parse subprotocol
        │                                                                              │ 6. Atomic GETDEL ticket
        │                                                                              │ 7. Validate user/session
        │ 8. 101 Switching Protocols                                                   │
        │    Sec-WebSocket-Protocol: teamtrack-ws (Ticket is NOT echoed)               │
        │◄─────────────────────────────────────────────────────────────────────────────┤
        │                                                                              │
        │ 9. Connected & Authenticated                                                 │
```

### Ticket Security Properties:
- **Entropy**: 32 cryptographically random bytes (256 bits) encoded as base64url.
- **Lifetime**: 30 seconds TTL.
- **Single-Use**: Consumed atomically via `GETDEL` (Redis) or memory store deletion.
- **Session Binding**: Bound to `{ userId, sessionId }` verified at generation time.
- **Zero Logging**: WebSocket tickets and authentication credentials are never logged.

---

## 3. Subscription & Room Authorization

Clients subscribe to topics after authentication:

```json
{"type": "subscribe", "topic": "channel:12345678-..."}
```

### Supported Topics & Authorization Rules:
1. `channel:<channelId>`:
   - Server invokes `authorizationService.getChannelAuth(userId, channelId)`.
   - Access denied if user lacks team/channel membership (returns 404/denial error).
2. `conversation:<conversationId>`:
   - Server verifies caller is a member in `conversation_members`.
   - Non-members are rejected with access denial.
3. `user:<userId>`:
   - **Strict Isolation**: A socket can **only** subscribe to `user:<authenticatedUserId>`.
   - Any attempt to subscribe to another user's topic is rejected with `FORBIDDEN_USER_TOPIC`.

---

## 4. Realtime Event Envelope Contract

All events distributed across the system implement the standard `RealtimeEnvelope<T>`:

```typescript
export interface RealtimeEnvelope<T = unknown> {
  eventId: string;          // Cryptographic UUIDv4 unique per event
  event: RealtimeEventName;  // E.g., 'message.created', 'message.updated'
  topic: string;            // E.g., 'channel:<id>', 'user:<id>'
  payload: T;               // Strongly typed payload
  timestamp: string;        // ISO-8601 UTC timestamp
  version: number;          // Envelope schema version (1)
}
```

### Supported Event Names:
- `message.created`
- `message.updated`
- `message.deleted`
- `reaction.added`
- `reaction.removed`
- `channel.read`
- `conversation.read`

---

## 5. Horizontal Fan-Out with Redis Pub/Sub

```text
  Instance A (Message Created)                Redis Pub/Sub                 Instance B (WebSocket Client)
        │                                           │                                     │
        │ 1. COMMIT to PostgreSQL                   │                                     │
        │ 2. PUBLISH teamtrack:realtime             │                                     │
        ├──────────────────────────────────────────►│                                     │
        │                                           │ 3. Distribute to subscribers        │
        │                                           ├────────────────────────────────────►│
        │                                           │                                     │ 4. subscriptionManager.broadcast()
        │                                           │                                     │ 5. Deliver to local WebSockets
        │                                           │                                     ▼
```

### Connection Management:
- Exactly **one** long-lived Redis subscriber connection is opened per backend instance, not one per WebSocket socket.
- If Redis is unavailable or offline (e.g. local development), an internal EventEmitter provides local fallback without degrading functionality.
- If Redis publish fails after commit, the message remains safely persisted in PostgreSQL; clients reconcile missed state on reconnect via the `/sync` API.

---

## 6. Multi-Device Synchronization

When a user has multiple active clients (Web, Electron Desktop, React Native Mobile):
1. **Message Sends**: The creating device receives the HTTP 201 response. All other devices subscribed to the channel/conversation receive the `message.created` event via WebSocket.
2. **Read Markers**: When read on one device, `channel.read` / `conversation.read` events are broadcast to `user:<userId>`, immediately synchronizing unread badges across all other client devices.
