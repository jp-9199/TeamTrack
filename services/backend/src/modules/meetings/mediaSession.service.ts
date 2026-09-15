import type {
  MediaSession,
  NetworkQuality,
} from '@teamtrack/shared-types';
import { PHASE11_ERROR_CODES } from '@teamtrack/shared-types';
import { mediaSessionRepository } from '../../db/repositories/mediaSession.repository.js';
import { meetingArtifactRepository } from '../../db/repositories/meetingArtifact.repository.js';
import { meetingAuthorizationService } from './meeting.authorization.js';
import { eventPublisher } from '../../realtime/event.publisher.js';

export class MediaSessionServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'MediaSessionServiceError';
  }
}

// Network quality report throttle: min 5 seconds between reports per participant
const networkQualityLastReportedAt = new Map<string, number>();
const NETWORK_QUALITY_THROTTLE_MS = 5000;

// Active speaker throttle: min 1 second per meeting
const activeSpeakerLastReportedAt = new Map<string, number>();
const ACTIVE_SPEAKER_THROTTLE_MS = 1000;

export class MediaSessionService {
  /**
   * Creates or updates a media session for a participant joining media.
   * Upsert semantics: reconnects increment reconnect_count.
   *
   * IMPORTANT: A participant must be admitted/joined in meeting_participants
   * before they can join a media session.
   */
  async joinMediaSession(
    userId: string,
    meetingId: string,
    provider: string = 'p2p',
    providerSessionId?: string
  ): Promise<MediaSession> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.isAdmittedOrJoined) {
      throw new MediaSessionServiceError(
        PHASE11_ERROR_CODES.MEDIA_SESSION_ACCESS_DENIED,
        'You must be admitted to the meeting before joining the media session',
        403
      );
    }

    const session = await mediaSessionRepository.upsert(
      meetingId,
      userId,
      provider,
      providerSessionId || null
    );

    await eventPublisher.publish(
      'meeting.media_session.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        userId,
        connectionState: 'connecting',
        reconnectCount: session.reconnectCount,
        timestamp: new Date().toISOString(),
      }
    );

    return session;
  }

  /**
   * Marks a participant's media session as disconnected.
   */
  async leaveMediaSession(userId: string, meetingId: string): Promise<void> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_NOT_FOUND, 'Meeting not found', 404);
    }

    await mediaSessionRepository.markLeft(meetingId, userId);

    await eventPublisher.publish(
      'meeting.media_session.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        userId,
        connectionState: 'disconnected',
        reconnectCount: 0,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Reports network quality for a participant.
   * Throttled: one report per participant per 5 seconds.
   * Silently drops over-frequent reports (no error).
   * Validates quality enum strictly (returns 400 on invalid).
   */
  async updateNetworkQuality(
    userId: string,
    meetingId: string,
    quality: NetworkQuality
  ): Promise<void> {
    const ALLOWED_QUALITIES: NetworkQuality[] = [
      'UNKNOWN',
      'EXCELLENT',
      'GOOD',
      'FAIR',
      'POOR',
      'DISCONNECTED',
    ];
    if (!ALLOWED_QUALITIES.includes(quality)) {
      throw new MediaSessionServiceError(
        PHASE11_ERROR_CODES.INVALID_NETWORK_QUALITY,
        `Invalid network quality '${quality}'. Allowed values: ${ALLOWED_QUALITIES.join(', ')}`,
        400
      );
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.isAdmittedOrJoined) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_ACCESS_DENIED, 'Not admitted to meeting', 403);
    }

    // Rate limit per participant per meeting: 1 report every 5 seconds
    const throttleKey = `${meetingId}:${userId}`;
    const lastReported = networkQualityLastReportedAt.get(throttleKey) ?? 0;
    const now = Date.now();
    if (now - lastReported < NETWORK_QUALITY_THROTTLE_MS) {
      return; // Silently drop — rate limit enforced
    }
    networkQualityLastReportedAt.set(throttleKey, now);

    await mediaSessionRepository.updateNetworkQuality(meetingId, userId, quality);

    // Publish quality update to meeting topic (ephemeral)
    await eventPublisher.publish(
      'meeting.network_quality.changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        userId,
        quality,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Reports the active speaker in a meeting.
   * Active speaker telemetry is EPHEMERAL ONLY (no PostgreSQL writes).
   * Throttled: min 1 second per meeting.
   * SECURITY: A participant may only report themselves unless host/admin.
   */
  async reportActiveSpeaker(
    reporterUserId: string,
    meetingId: string,
    speakerUserId: string,
    audioLevel?: number
  ): Promise<void> {
    const auth = await meetingAuthorizationService.getMeetingAuth(reporterUserId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.isAdmittedOrJoined) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.MEDIA_SESSION_ACCESS_DENIED, 'Not in meeting', 403);
    }

    // Security: Participant may only report themselves, unless host/admin manager
    if (speakerUserId !== reporterUserId && !auth.canManage) {
      throw new MediaSessionServiceError(
        PHASE11_ERROR_CODES.MEDIA_SESSION_ACCESS_DENIED,
        'Cannot report active speaker for another participant',
        403
      );
    }

    // Verify speakerUserId is an active participant in this meeting
    const speakerAuth = await meetingAuthorizationService.getMeetingAuth(speakerUserId, meetingId);
    if (!speakerAuth.meetingExists || !speakerAuth.isAdmittedOrJoined) {
      throw new MediaSessionServiceError(
        PHASE11_ERROR_CODES.MEDIA_SESSION_ACCESS_DENIED,
        'Target speaker is not an admitted participant in this meeting',
        403
      );
    }

    // Throttle per meeting (not per user)
    const throttleKey = `active-speaker:${meetingId}`;
    const lastReported = activeSpeakerLastReportedAt.get(throttleKey) ?? 0;
    const now = Date.now();
    if (now - lastReported < ACTIVE_SPEAKER_THROTTLE_MS) {
      return;
    }
    activeSpeakerLastReportedAt.set(throttleKey, now);

    // Broadcast ephemeral event ONLY — do NOT persist to DB
    await eventPublisher.publish(
      'meeting.active_speaker.changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        speakerUserId,
        audioLevel,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Gets all artifacts for a meeting.
   */
  async getArtifacts(userId: string, meetingId: string, limit: number = 20, cursor?: string) {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.ARTIFACT_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.canAccess) {
      throw new MediaSessionServiceError(PHASE11_ERROR_CODES.ARTIFACT_ACCESS_DENIED, 'Access denied', 403);
    }

    return meetingArtifactRepository.listByMeeting(meetingId, limit, cursor);
  }
}

// Fix typo in the reportActiveSpeaker method
const PHASE11_ERROR_CALLS = PHASE11_ERROR_CODES;

export const mediaSessionService = new MediaSessionService();
