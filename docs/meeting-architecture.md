# TeamTrack Meeting Architecture (Phase 7)

## 1. Overview & Golden Architectural Rules

The TeamTrack Meeting System provides audio, video, and screen-sharing collaboration integrated into TeamTrack's multi-tenant organization boundaries.

```
ONE backend
ONE PostgreSQL source of truth
ONE authentication system (JWT + WS Tickets)
ONE WebSocket infrastructure
ONE realtime envelope (RealtimeEnvelope<T>)
ONE authorization model
```

- **WebSocket = Signaling & Control**: State transitions, waiting room admission, participant controls, reactions, and WebRTC SDP/ICE exchanges.
- **WebRTC = Media Transport**: Audio, camera video, and screen sharing travel peer-to-peer (or via SFU in future phases). Zero media frames traverse REST, WebSocket, PostgreSQL, or Redis.

---

## 2. Meeting State Machine

A meeting transitions through three durable states:

```
SCHEDULED
    ↓ (host/admin startMeeting)
 ACTIVE
    ↓ (host/admin endMeeting)
  ENDED
```

### State Transition Invariants
- `SCHEDULED → ACTIVE`: Valid transition via `POST /api/v1/meetings/:id/start`. Sets `actual_start_at`.
- `ACTIVE → ENDED`: Valid transition via `POST /api/v1/meetings/:id/end`. Sets `actual_end_at`.
- `ENDED → ACTIVE`: **FORBIDDEN**. Once ended, a meeting cannot be restarted.
- `ENDED → SCHEDULED`: **FORBIDDEN**.
- **Disconnection Invariant**: Network disconnects, tab closure, laptop sleep, host internet drops, or WebSocket dropouts **NEVER end a meeting**. The meeting remains `ACTIVE` until explicitly terminated by an authorized host/admin.
- **No Artificial Limit**: There is NO artificial 1-hour meeting timeout.

---

## 3. Logical Participant Model vs. Physical WebSocket Connections

**Golden Principle: ONE USER ≠ ONE WEBSOCKET CONNECTION.**

A single user may simultaneously connect from:
- Web browser client
- Desktop Electron client
- Mobile device

### Logical Participant States
Stored durably in PostgreSQL `meeting_participants`:
1. `WAITING`: In the meeting waiting room. Cannot send or receive media or WebRTC signaling.
2. `ADMITTED`: Admitted by host; eligible to join active media mesh.
3. `JOINED`: Actively joined in media and signaling.
4. `LEFT`: Voluntarily left the meeting. Allowed to rejoin later if meeting is still `ACTIVE`.
5. `REMOVED`: Ejected by meeting host/admin. Active subscriptions are forcefully terminated; re-entry is forbidden.

Physical WebSocket sockets are tracked independently by `SubscriptionManager.userToSockets`. When WebRTC signals or notifications target a user, all active sockets for that user receive the frame.

---

## 4. Waiting Room & Admission Policy

When a meeting has `waiting_room_enabled = true`:
1. **Host/Admin Bypass**: The meeting host and organization admins join directly in `JOINED` status.
2. **Attendee Admission**: Standard members join in `WAITING` status.
3. **Media Isolation**: Waiting participants do not receive audio/video streams, screen tracks, or WebRTC signaling frames.
4. **Host Admission Control**: `POST /api/v1/meetings/:id/participants/:userId/admit` transitions the participant from `WAITING` to `ADMITTED`. Realtime event `meeting.participant.admitted` is published to the meeting and target user.

---

## 5. Host Ownership & Transactional Transfer

Each meeting has an authoritative `host_id` derived exclusively by the server from the authenticated creator.

### Host Transfer (`POST /api/v1/meetings/:id/host-transfer`)
Guarantees strictly ONE host at all times using pessimistic PostgreSQL row locking:
```sql
BEGIN;
SELECT * FROM meetings WHERE id = $1 FOR UPDATE;
-- Verify current host identity and meeting status
-- Verify target participant is active in meeting
UPDATE meetings SET host_id = $2, updated_at = NOW() WHERE id = $1;
UPDATE meeting_participants SET role = 'attendee' WHERE meeting_id = $1 AND user_id = $old_host;
UPDATE meeting_participants SET role = 'host' WHERE meeting_id = $1 AND user_id = $new_host;
COMMIT;
```
Concurrent requests race on the row lock and fail safely, preventing dual-host anomalies.

---

## 6. Anti-IDOR / Anti-BOLA Security Boundary

Meeting endpoints enforce strict organization isolation:
1. `meetingAuthorizationService.getMeetingAuth` validates that the caller is an active member of the meeting's parent organization.
2. Cross-tenant access attempts return HTTP 404 (`MEETING_NOT_FOUND`) to prevent resource existence leaking.
3. Removed participants cannot subscribe to the meeting WebSocket topic or send signaling frames.

---

## 7. Meeting Sync & Recovery

```
GET /api/v1/meetings/:id/sync?since=<ISO8601>
```

Realtime events are an optimization; PostgreSQL remains the durable source of truth.
When a client reconnects after network loss:
1. Requests sync with the last received event timestamp.
2. Receives updated meeting state (e.g. if meeting ended while offline).
3. Receives delta participant list with updated audio/video/screen/hand states.
4. Receives `removedParticipantUserIds` so remote peer connections for ejected participants are immediately closed.
