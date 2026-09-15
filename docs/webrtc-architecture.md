# TeamTrack WebRTC & Media Architecture (Phase 7)

## 1. Architectural Separation: Media vs. Signaling

```
+-------------------------------------------------------------+
|                         Meeting UI                          |
+-------------------------------------------------------------+
               |                               |
       (Control & Signals)               (Raw Tracks)
               |                               |
               v                               v
    +----------------------+       +-----------------------+
    |   WebSocket Client   |       |     MediaProvider     |
    +----------------------+       +-----------------------+
               |                               |
    (ws ticket auth/JSON)         (RTCPeerConnection audio/video)
               |                               |
               v                               v
    +----------------------+       +-----------------------+
    |  WebSocket Server    |       |   Peer-to-Peer Mesh   |
    |  (Signaling Router)  |       | (or Future SFU Nodes) |
    +----------------------+       +-----------------------+
```

### Protocol Rules
- **Signaling**: JSON messages (`webrtc.offer`, `webrtc.answer`, `webrtc.ice_candidate`, `webrtc.renegotiate`) delivered via secure WebSockets with server-derived sender identity.
- **Media**: Opus audio, VP8/H.264 camera video, and screen-sharing display tracks routed via standard WebRTC SRTP/DTLS.
- **Zero Media Overhead on Backend**: No media packets or frame buffers touch Express REST endpoints, WebSocket connections, Redis, or PostgreSQL.

---

## 2. MediaProvider Abstraction (SFU-Ready Design)

To prevent UI and business logic from hardcoding P2P WebRTC mesh assumptions, Phase 7 establishes the `MediaProvider` abstraction contract in `@teamtrack/shared-utils`:

```typescript
export interface MediaProvider {
  readonly providerType: 'p2p' | 'sfu';

  initialize(events: MediaProviderEvents): Promise<void>;
  startLocalMedia(constraints?: MediaConstraints): Promise<MediaStream>;
  stopLocalMedia(): void;

  setAudioEnabled(enabled: boolean): boolean;
  setVideoEnabled(enabled: boolean): boolean;

  startScreenShare(): Promise<MediaStreamTrack | null>;
  stopScreenShare(): void;
  isScreenSharing(): boolean;

  handleRemoteSignal(
    senderUserId: string,
    signalType: 'offer' | 'answer' | 'ice_candidate' | 'renegotiate',
    data: any
  ): Promise<void>;

  connectToPeer(targetUserId: string, isInitiator: boolean): Promise<void>;
  disconnectFromPeer(userId: string): void;

  destroy(): void;
}
```

### Implementations
1. **`P2PMediaProvider`** (Implemented in Phase 7):
   - Full mesh RTCPeerConnection management for small group meetings.
   - Trickle ICE with STUN servers (`stun:stun.l.google.com:19302`).
   - Handles track lifecycle, browser mute/unmute, and screen-share renegotiation.
2. **`SFUMediaProvider`** (Architecture Stub in Phase 7):
   - Outlines future selective forwarding unit integration (e.g. LiveKit / Pion / Mediasoup).
   - Switching providers in future phases requires zero changes to meeting controllers, authorization logic, or UI components.
   - **No fake SFU**: Phase 7 does not claim an SFU exists when operating on P2P.

---

## 3. Screen Sharing Architecture

Screen sharing utilizes native browser capabilities:
```typescript
navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
```
- The screen track replaces the camera video track on existing peer connections using `RTCRtpSender.replaceTrack()`, or adds a secondary track.
- Standard browser "Stop Sharing" controls are bound via `screenTrack.onended` to restore camera feeds and notify meeting participants.
- Screen sharing status is tracked durably in PostgreSQL and broadcast via `meeting.participant.screen_share_changed`.

---

## 4. Participant Media State & Self-Control Invariant

Participants retain strict self-control over their hardware states:
- A user can only mutate **their own** media states via `PATCH /api/v1/meetings/:id/media-state`.
- The server rejects requests from participants in `WAITING` status (`MEDIA_STATE_FORBIDDEN`).
- Granular realtime events (`meeting.participant.audio_changed`, `meeting.participant.video_changed`, `meeting.participant.screen_share_changed`, `meeting.hand_raised`, `meeting.hand_lowered`) inform other peers without full re-syncs.
