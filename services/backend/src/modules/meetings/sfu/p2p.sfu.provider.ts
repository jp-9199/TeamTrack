import type {
  SfuProvider,
  SfuRoomInfo,
  SfuParticipantSession,
  SfuRoomState,
  SfuTrackUpdate,
} from './sfu.provider.js';

/**
 * P2P Fallback SFU Provider.
 *
 * This provider implements the SfuProvider interface for the existing
 * Phase 7 P2P (peer-to-peer) WebRTC mode. In P2P mode, there is no
 * centralized SFU; media flows directly between participants via
 * WebRTC offer/answer signaling through the TeamTrack WebSocket server.
 *
 * This adapter ensures backward compatibility with Phase 7 while providing
 * the Phase 11 clean abstraction boundary.
 *
 * IMPORTANT: This provider does not make any external network calls.
 * Room tokens are advisory identifiers only; actual P2P coordination
 * happens through the existing WebSocket signaling layer (webrtc.* events).
 *
 * When a production SFU is configured (LiveKit, Agora, etc.), replace
 * this factory entry with the real implementation.
 */
export class P2PFallbackSfuProvider implements SfuProvider {
  readonly name = 'p2p';

  /**
   * In P2P mode, "creating a room" is a no-op.
   * The meeting itself serves as the logical room.
   */
  async createRoom(meetingId: string): Promise<SfuRoomInfo> {
    return {
      roomId: `p2p:${meetingId}`,
      roomToken: `p2p-session-${meetingId}`,
      provider: this.name,
      isLive: true,
    };
  }

  /**
   * In P2P mode, deleting a room is a no-op.
   * Session cleanup happens naturally when participants disconnect.
   */
  async deleteRoom(_meetingId: string): Promise<void> {
    // No-op for P2P
  }

  /**
   * Returns a P2P session token. The actual negotiation uses the WebSocket
   * signaling layer (webrtc.offer/answer/ice_candidate events).
   */
  async createParticipantSession(
    meetingId: string,
    userId: string,
    _displayName: string,
    _role: 'host' | 'attendee'
  ): Promise<SfuParticipantSession> {
    return {
      sessionId: `p2p:${meetingId}:${userId}`,
      participantToken: `p2p-participant-${userId}`,
      provider: this.name,
      joinUrl: undefined, // P2P uses WebSocket signaling, not a provider URL
    };
  }

  /**
   * Track updates in P2P mode are reflected via the existing media_state
   * update mechanism (meeting_participants columns), not forwarded to an SFU.
   */
  async updateTracks(
    _meetingId: string,
    _userId: string,
    _tracks: SfuTrackUpdate
  ): Promise<void> {
    // No-op for P2P: track state is already managed by meeting.service.ts updateMediaState
  }

  /**
   * In P2P mode, "terminating" a session means the participant has already
   * been removed via the meeting service (participant status = 'removed').
   * No external call needed.
   */
  async terminateSession(_meetingId: string, _userId: string): Promise<void> {
    // No-op for P2P
  }

  async getRoomState(meetingId: string): Promise<SfuRoomState | null> {
    // P2P mode always reports the room as existing (no provider to query)
    return {
      roomId: `p2p:${meetingId}`,
      provider: this.name,
      participantCount: -1, // Unknown in P2P; controlled by meeting_participants table
      isRecording: false,
      createdAt: new Date(),
    };
  }
}
