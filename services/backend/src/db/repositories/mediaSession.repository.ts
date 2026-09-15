import type {
  MediaSession,
  MediaSessionConnectionState,
  MediaTrackState,
  NetworkQuality,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbMediaSession {
  id: string;
  meeting_id: string;
  user_id: string;
  provider: string;
  provider_session_id: string | null;
  connection_state: string;
  audio_track_state: string;
  video_track_state: string;
  screen_track_state: string;
  joined_at: Date;
  left_at: Date | null;
  last_seen_at: Date;
  reconnect_count: number;
  created_at: Date;
  updated_at: Date;
}

export class MediaSessionRepository {
  mapSession(row: DbMediaSession): MediaSession {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      userId: row.user_id,
      provider: row.provider,
      providerSessionId: row.provider_session_id,
      connectionState: row.connection_state as MediaSessionConnectionState,
      audioTrackState: row.audio_track_state as MediaTrackState,
      videoTrackState: row.video_track_state as MediaTrackState,
      screenTrackState: row.screen_track_state as MediaTrackState,
      joinedAt: new Date(row.joined_at).toISOString(),
      leftAt: row.left_at ? new Date(row.left_at).toISOString() : null,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      reconnectCount: row.reconnect_count,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Upserts a media session for a participant.
   * If a session already exists (same meeting+user), updates it (reconnect).
   * reconnect_count increments on each reconnect.
   */
  async upsert(
    meetingId: string,
    userId: string,
    provider: string = 'p2p',
    providerSessionId: string | null = null,
    db: Queryable = pool
  ): Promise<MediaSession> {
    const query = `
      INSERT INTO meeting_media_sessions (
        meeting_id, user_id, provider, provider_session_id,
        connection_state, joined_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, 'connecting', NOW(), NOW())
      ON CONFLICT (meeting_id, user_id) DO UPDATE
      SET provider = EXCLUDED.provider,
          provider_session_id = COALESCE(EXCLUDED.provider_session_id, meeting_media_sessions.provider_session_id),
          connection_state = 'connecting',
          audio_track_state = 'unpublished',
          video_track_state = 'unpublished',
          screen_track_state = 'unpublished',
          left_at = NULL,
          last_seen_at = NOW(),
          reconnect_count = CASE
            WHEN meeting_media_sessions.connection_state = 'disconnected'
            THEN meeting_media_sessions.reconnect_count + 1
            ELSE meeting_media_sessions.reconnect_count
          END,
          updated_at = NOW()
      RETURNING *;
    `;
    const res = await db.query<DbMediaSession>(query, [meetingId, userId, provider, providerSessionId]);
    return this.mapSession(res.rows[0]);
  }

  async updateConnectionState(
    meetingId: string,
    userId: string,
    state: MediaSessionConnectionState,
    db: Queryable = pool
  ): Promise<MediaSession | null> {
    const leftAt = state === 'disconnected' ? 'NOW()' : 'NULL';
    const query = `
      UPDATE meeting_media_sessions
      SET connection_state = $3,
          left_at = CASE WHEN $3 = 'disconnected' THEN NOW() ELSE left_at END,
          last_seen_at = NOW(),
          updated_at = NOW()
      WHERE meeting_id = $1 AND user_id = $2
      RETURNING *;
    `;
    const res = await db.query<DbMediaSession>(query, [meetingId, userId, state]);
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  async markLeft(meetingId: string, userId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE meeting_media_sessions
       SET connection_state = 'disconnected',
           left_at = COALESCE(left_at, NOW()),
           updated_at = NOW()
       WHERE meeting_id = $1 AND user_id = $2;`,
      [meetingId, userId]
    );
  }

  async updateLastSeen(meetingId: string, userId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE meeting_media_sessions
       SET last_seen_at = NOW(), updated_at = NOW()
       WHERE meeting_id = $1 AND user_id = $2;`,
      [meetingId, userId]
    );
  }

  async find(meetingId: string, userId: string, db: Queryable = pool): Promise<DbMediaSession | null> {
    const res = await db.query<DbMediaSession>(
      'SELECT * FROM meeting_media_sessions WHERE meeting_id = $1 AND user_id = $2;',
      [meetingId, userId]
    );
    return res.rows[0] || null;
  }

  async listActiveSessions(meetingId: string, db: Queryable = pool): Promise<MediaSession[]> {
    const res = await db.query<DbMediaSession>(
      `SELECT * FROM meeting_media_sessions
       WHERE meeting_id = $1
         AND connection_state IN ('connecting', 'connected', 'reconnecting')
       ORDER BY joined_at ASC;`,
      [meetingId]
    );
    return res.rows.map((r) => this.mapSession(r));
  }

  /**
   * Updates network quality for a participant.
   * Also updates last_seen_at for session liveness.
   */
  async updateNetworkQuality(
    meetingId: string,
    userId: string,
    quality: NetworkQuality,
    db: Queryable = pool
  ): Promise<void> {
    // Network quality is tracked on meeting_participants, not media_sessions.
    // Media sessions track provider-level state.
    await db.query(
      `UPDATE meeting_participants
       SET network_quality = $3,
           network_quality_updated_at = NOW(),
           updated_at = NOW()
       WHERE meeting_id = $1 AND user_id = $2;`,
      [meetingId, userId, quality]
    );
    // Also touch media session for heartbeat
    await this.updateLastSeen(meetingId, userId, db);
  }

  /**
   * Updates active speaker timestamp for a participant.
   * Ephemeral — used for history/display, not for notification routing.
   */
  async markActiveSpeaker(meetingId: string, speakerUserId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE meeting_participants
       SET active_speaker_at = NOW(), updated_at = NOW()
       WHERE meeting_id = $1 AND user_id = $2;`,
      [meetingId, speakerUserId]
    );
  }
}

export const mediaSessionRepository = new MediaSessionRepository();
