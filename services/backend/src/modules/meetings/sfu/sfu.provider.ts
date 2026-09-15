/**
 * SFU (Selective Forwarding Unit) Provider Interface.
 *
 * Defines the contract between the TeamTrack backend and an SFU media server.
 * Implementations may connect to LiveKit, Agora, Twilio, or any other compatible service.
 *
 * Phase 11 ships with the P2PFallbackSfuProvider which preserves existing WebRTC P2P
 * signaling behavior. A production SFU implementation would replace or augment it.
 *
 * Architecture invariant:
 * - All SFU provider calls occur OUTSIDE PostgreSQL transactions.
 * - SFU provider calls are fire-and-forget for non-critical operations.
 * - Meeting state is always the authoritative source of truth (PostgreSQL).
 * - SFU provider failures do not roll back meeting state (graceful degradation).
 */

export interface SfuRoomInfo {
  roomId: string;         // Provider's internal room identifier
  roomToken: string;      // Caller-agnostic JWT/token to join the room
  provider: string;       // Provider name for display/logging
  isLive: boolean;
}

export interface SfuParticipantSession {
  sessionId: string;
  participantToken: string;  // Short-lived credential for this participant to join
  provider: string;
  joinUrl?: string;          // Provider-specific join URL, if applicable
}

export interface SfuRoomState {
  roomId: string;
  provider: string;
  participantCount: number;
  isRecording: boolean;
  createdAt: Date;
}

export interface SfuTrackUpdate {
  audioPublished?: boolean;
  videoPublished?: boolean;
  screenPublished?: boolean;
}

export interface SfuProvider {
  /**
   * The provider name, used for logging and display.
   */
  readonly name: string;

  /**
   * Creates a media room for a meeting. Idempotent.
   * If the room already exists in the provider, returns existing room info.
   */
  createRoom(meetingId: string): Promise<SfuRoomInfo>;

  /**
   * Deletes/closes a media room when a meeting ends.
   * Idempotent on missing rooms (meeting already cleaned up).
   */
  deleteRoom(meetingId: string): Promise<void>;

  /**
   * Creates a participant session (join token) for the given user.
   * This token is used by the client to connect to the media room.
   * Token is short-lived (TTL enforced by provider).
   */
  createParticipantSession(
    meetingId: string,
    userId: string,
    displayName: string,
    role: 'host' | 'attendee'
  ): Promise<SfuParticipantSession>;

  /**
   * Signals a track publish/unpublish event to the provider.
   * This is advisory — the provider may already know from WebRTC.
   */
  updateTracks(
    meetingId: string,
    userId: string,
    tracks: SfuTrackUpdate
  ): Promise<void>;

  /**
   * Terminates a participant's session (e.g., when host removes them).
   * Idempotent on missing sessions.
   */
  terminateSession(meetingId: string, userId: string): Promise<void>;

  /**
   * Retrieves current room state from the provider.
   * Returns null if the room does not exist on the provider.
   */
  getRoomState(meetingId: string): Promise<SfuRoomState | null>;
}
