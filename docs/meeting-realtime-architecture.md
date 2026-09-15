# TeamTrack Meeting Realtime & Signaling Architecture (Phase 7)

## 1. Overview & Golden Invariants

Phase 7 builds upon the TeamTrack Phase 6 WebSocket infrastructure to provide real-time coordination, participant lifecycle management, and WebRTC signaling for audio, video, and screen-sharing meetings.

```
ONE backend
ONE PostgreSQL source of truth
ONE authentication system (JWT + WS Tickets)
ONE WebSocket infrastructure
ONE realtime envelope (RealtimeEnvelope<T>)
ONE authorization boundary
```

### Architectural Division of Concerns
- **WebSocket (Signaling & State)**: Authenticated JSON message exchanges handling session setup, peer negotiation (SDP Offer/Answer, ICE Candidates), admission control, participant state (mute, camera, screen-share), reactions, and raised hands.
- **WebRTC (Media Transport)**: Direct peer-to-peer (or SFU in future phases) SRTP/DTLS media streams carrying raw audio, camera video, and screen capture.
- **Zero Media on Server**: No media frames, PCM buffers, or video packets ever touch Express REST endpoints, WebSocket connections, Redis, or PostgreSQL.

---

## 2. Realtime Event Envelope Specification

All meeting events emitted over WebSockets adhere to the canonical TeamTrack envelope format:

```typescript
export interface RealtimeEnvelope<T> {
  eventId: string;     // UUIDv4 unique identifier
  eventType: string;   // e.g., 'meeting.participant_joined'
  timestamp: string;   // ISO-8601 UTC timestamp
  version: 1;          // Schema version
  data: T;             // Strongly-typed payload
}
```

### Phase 7 Event Catalog

| Event Name | Scope / Target | Description |
| :--- | :--- | :--- |
| `meeting.started` | `meeting:<id>` | Meeting transitioned from `SCHEDULED` to `ACTIVE` |
| `meeting.ended` | `meeting:<id>` | Meeting terminated by host/admin |
| `meeting.host_transferred` | `meeting:<id>` | Host role transferred to another participant |
| `meeting.waiting_room_joined` | Host & Admins | Participant entered waiting room |
| `meeting.waiting_room_admitted`| Target User | Host admitted user; user is prompted to join |
| `meeting.participant_joined` | `meeting:<id>` | Admitted user connected and joined the call |
| `meeting.participant_left` | `meeting:<id>` | Participant voluntarily left the call |
| `meeting.participant_removed` | `meeting:<id>` | Participant ejected by host/admin |
| `meeting.media_updated` | `meeting:<id>` | Audio, video, or screen-sharing state toggled |
| `meeting.reaction` | `meeting:<id>` | Transient emoji reaction with ephemeral TTL |
| `meeting.hand_lowered` | `meeting:<id>` | Hand raised / lowered state change |
| `webrtc.offer` | Direct Target | WebRTC SDP Offer routed securely to target peer |
| `webrtc.answer` | Direct Target | WebRTC SDP Answer returned to initiating peer |
| `webrtc.ice_candidate` | Direct Target | Trickle ICE Candidate exchange between peers |
| `webrtc.renegotiate` | Direct Target | Renegotiation request triggered by track changes |
| `sync.requested` | Direct Target | Client requested state reconciliation |
| `sync.response` | Direct Target | Server returned delta participant state |

---

## 3. Subscription & Room Isolation (`meeting:<meetingId>`)

### Topic Authorization Protocol
When a client sends a subscription request:
```json
{ "type": "subscribe", "topic": "meeting:123e4567-e89b-12d3-a456-426614174000" }
```

1. **Anti-IDOR / Anti-BOLA Verification**: The server extracts `userId` from the authenticated WebSocket session and checks:
   - User exists and is active.
   - User belongs to the parent organization of the meeting.
   - If scoped to a team/channel, user has active membership in that team/channel.
   - User is NOT soft-deleted or ejected (`REMOVED` status).
2. **Waiting Room Isolation**:
   - Participants in `WAITING` status cannot receive media signaling or peer updates.
   - They receive only personal admission notifications (`meeting.waiting_room_admitted`) directed specifically to their `user:<userId>` topic.
3. **Ejection Enforcement (`removeUserFromTopic`)**:
   - When a host removes a participant (`POST /api/v1/meetings/:id/participants/:userId/remove`), the server immediately purges all active sockets belonging to that user from `meeting:<meetingId>`.
   - Any further inbound signaling from that user is blocked.

---

## 4. Multi-Device Tracking (`One User ≠ One Connection`)

TeamTrack strictly decouples the logical meeting participant from individual physical connections:
- A user may connect from a Web client, Desktop app, and Mobile device simultaneously.
- Sockets are registered in `SubscriptionManager.userToSockets: Map<string, Set<WebSocket>>`.
- When WebRTC signaling (`webrtc.offer`, `webrtc.answer`, `webrtc.ice_candidate`) targets a specific user, the server iterates through all active connections for that recipient.
- If a user closes one browser tab or drops Wi-Fi on a secondary device, their other connections remain alive, and the logical participant record remains `JOINED`.

---

## 5. Reconnection & Delta Synchronization

### Disconnection Invariants
- **A network disconnection NEVER ends a meeting.**
- A meeting remains `ACTIVE` until explicitly terminated by the host via `POST /api/v1/meetings/:id/end`.
- If a participant drops connection, their logical participant state remains in PostgreSQL.

### Delta Reconciliation Flow
Upon restoring network connectivity:
1. Client establishes a fresh WebSocket connection using a single-use WS ticket.
2. Client resubscribes to `meeting:<meetingId>`.
3. Client issues a delta sync request via REST:
   ```
   GET /api/v1/meetings/:meetingId/sync?since=2026-09-12T07:20:00.000Z
   ```
4. Server queries PostgreSQL for participant state changes where `updated_at > since`:
   - Returns `{ participants: MeetingParticipantWithUser[], removedUserIds: string[] }`.
5. Client reconciles local peer connections:
   - Tears down peers for any `removedUserIds` or users in `LEFT` status.
   - Updates audio/video/screen-sharing UI state for updated participants.
   - Triggers WebRTC renegotiation if new participants joined.

---

## 6. Production Redis Failure Semantics

- In production (`NODE_ENV === 'production'`), Redis Pub/Sub is mandatory for cluster-wide broadcast.
- The server will **fail closed** if Redis is unavailable; it does NOT allow silent in-memory fallback in production to guarantee that horizontal scale-out guarantees are never silently bypassed.
- In test environments (`NODE_ENV === 'test'`), an in-memory broadcast adapter is utilized for fast, deterministic unit and integration verification.
