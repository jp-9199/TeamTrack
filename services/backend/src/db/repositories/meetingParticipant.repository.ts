import type {
  MeetingParticipant,
  MeetingParticipantWithUser,
  MeetingParticipantRole,
  MeetingParticipantStatus,
  UpdateMediaStateRequest,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbMeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: Date;
  left_at: Date | null;
  connection_status: string;
  audio_enabled: boolean;
  video_enabled: boolean;
  screen_sharing: boolean;
  hand_raised: boolean;
  updated_at: Date;
}

export interface UpsertParticipantParams {
  meetingId: string;
  userId: string;
  role?: MeetingParticipantRole;
  status?: MeetingParticipantStatus;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
  handRaised?: boolean;
}

export class MeetingParticipantRepository {
  mapParticipant(row: DbMeetingParticipant): MeetingParticipant {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      userId: row.user_id,
      role: row.role as MeetingParticipantRole,
      status: row.status as MeetingParticipantStatus,
      joinedAt: new Date(row.joined_at).toISOString(),
      leftAt: row.left_at ? new Date(row.left_at).toISOString() : null,
      connectionStatus: row.connection_status,
      audioEnabled: row.audio_enabled,
      videoEnabled: row.video_enabled,
      screenSharing: row.screen_sharing,
      handRaised: row.hand_raised,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async upsertParticipant(
    params: UpsertParticipantParams,
    db: Queryable = pool
  ): Promise<MeetingParticipant> {
    const role = params.role || 'attendee';
    const status = params.status || 'waiting';
    const audio = params.audioEnabled ?? false;
    const video = params.videoEnabled ?? false;
    const screen = params.screenSharing ?? false;
    const hand = params.handRaised ?? false;

    const query = `
      INSERT INTO meeting_participants (
        meeting_id,
        user_id,
        role,
        status,
        audio_enabled,
        video_enabled,
        screen_sharing,
        hand_raised,
        connection_status,
        joined_at,
        left_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'connected', NOW(), NULL, NOW())
      ON CONFLICT (meeting_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          audio_enabled = EXCLUDED.audio_enabled,
          video_enabled = EXCLUDED.video_enabled,
          screen_sharing = EXCLUDED.screen_sharing,
          hand_raised = EXCLUDED.hand_raised,
          connection_status = 'connected',
          left_at = NULL,
          updated_at = NOW()
      RETURNING *;
    `;

    const res = await db.query<DbMeetingParticipant>(query, [
      params.meetingId,
      params.userId,
      role,
      status,
      audio,
      video,
      screen,
      hand,
    ]);

    return this.mapParticipant(res.rows[0]);
  }

  async getParticipant(
    meetingId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<DbMeetingParticipant | null> {
    const query = `
      SELECT *
      FROM meeting_participants
      WHERE meeting_id = $1 AND user_id = $2;
    `;
    const res = await db.query<DbMeetingParticipant>(query, [meetingId, userId]);
    return res.rows[0] || null;
  }

  async getParticipantWithUser(
    meetingId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<MeetingParticipantWithUser | null> {
    const query = `
      SELECT 
        mp.*,
        u.display_name,
        u.email,
        u.avatar_url
      FROM meeting_participants mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.meeting_id = $1 AND mp.user_id = $2;
    `;

    const res = await db.query<DbMeetingParticipant & {
      display_name: string;
      email: string;
      avatar_url: string | null;
    }>(query, [meetingId, userId]);

    const row = res.rows[0];
    if (!row) return null;

    return {
      ...this.mapParticipant(row),
      user: {
        id: row.user_id,
        displayName: row.display_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      },
    };
  }

  async listParticipants(
    meetingId: string,
    db: Queryable = pool
  ): Promise<MeetingParticipantWithUser[]> {
    const query = `
      SELECT 
        mp.*,
        u.display_name,
        u.email,
        u.avatar_url
      FROM meeting_participants mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.meeting_id = $1
      ORDER BY 
        CASE mp.role WHEN 'host' THEN 1 WHEN 'presenter' THEN 2 ELSE 3 END,
        mp.joined_at ASC;
    `;

    const res = await db.query<DbMeetingParticipant & {
      display_name: string;
      email: string;
      avatar_url: string | null;
    }>(query, [meetingId]);

    return res.rows.map((row) => ({
      ...this.mapParticipant(row),
      user: {
        id: row.user_id,
        displayName: row.display_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      },
    }));
  }

  async listActiveJoined(
    meetingId: string,
    db: Queryable = pool
  ): Promise<MeetingParticipantWithUser[]> {
    const query = `
      SELECT 
        mp.*,
        u.display_name,
        u.email,
        u.avatar_url
      FROM meeting_participants mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.meeting_id = $1 AND mp.status IN ('joined', 'admitted')
      ORDER BY mp.joined_at ASC;
    `;

    const res = await db.query<DbMeetingParticipant & {
      display_name: string;
      email: string;
      avatar_url: string | null;
    }>(query, [meetingId]);

    return res.rows.map((row) => ({
      ...this.mapParticipant(row),
      user: {
        id: row.user_id,
        displayName: row.display_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      },
    }));
  }

  async updateStatus(
    meetingId: string,
    userId: string,
    status: MeetingParticipantStatus,
    leftAt: Date | null = null,
    db: Queryable = pool
  ): Promise<MeetingParticipant | null> {
    const query = `
      UPDATE meeting_participants
      SET status = $3,
          left_at = CASE WHEN $4::timestamptz IS NOT NULL THEN $4::timestamptz ELSE left_at END,
          connection_status = CASE WHEN $3 = 'left' OR $3 = 'removed' THEN 'disconnected' ELSE 'connected' END,
          updated_at = NOW()
      WHERE meeting_id = $1 AND user_id = $2
      RETURNING *;
    `;

    const res = await db.query<DbMeetingParticipant>(query, [
      meetingId,
      userId,
      status,
      leftAt,
    ]);

    if (!res.rows[0]) return null;
    return this.mapParticipant(res.rows[0]);
  }

  async updateRole(
    meetingId: string,
    userId: string,
    role: MeetingParticipantRole,
    db: Queryable = pool
  ): Promise<MeetingParticipant | null> {
    const query = `
      UPDATE meeting_participants
      SET role = $3,
          updated_at = NOW()
      WHERE meeting_id = $1 AND user_id = $2
      RETURNING *;
    `;
    const res = await db.query<DbMeetingParticipant>(query, [meetingId, userId, role]);
    if (!res.rows[0]) return null;
    return this.mapParticipant(res.rows[0]);
  }

  async updateMediaState(
    meetingId: string,
    userId: string,
    media: UpdateMediaStateRequest,
    db: Queryable = pool
  ): Promise<MeetingParticipant | null> {
    const sets: string[] = ['updated_at = NOW()'];
    const values: any[] = [meetingId, userId];
    let idx = 3;

    if (media.audioEnabled !== undefined) {
      sets.push(`audio_enabled = $${idx++}`);
      values.push(media.audioEnabled);
    }
    if (media.videoEnabled !== undefined) {
      sets.push(`video_enabled = $${idx++}`);
      values.push(media.videoEnabled);
    }
    if (media.screenSharing !== undefined) {
      sets.push(`screen_sharing = $${idx++}`);
      values.push(media.screenSharing);
    }
    if (media.handRaised !== undefined) {
      sets.push(`hand_raised = $${idx++}`);
      values.push(media.handRaised);
    }

    const query = `
      UPDATE meeting_participants
      SET ${sets.join(', ')}
      WHERE meeting_id = $1 AND user_id = $2
      RETURNING *;
    `;

    const res = await db.query<DbMeetingParticipant>(query, values);
    if (!res.rows[0]) return null;
    return this.mapParticipant(res.rows[0]);
  }

  async syncParticipants(
    meetingId: string,
    since: Date,
    db: Queryable = pool
  ): Promise<{ participants: MeetingParticipantWithUser[]; removedUserIds: string[] }> {
    const query = `
      SELECT 
        mp.*,
        u.display_name,
        u.email,
        u.avatar_url
      FROM meeting_participants mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.meeting_id = $1 AND mp.updated_at > $2
      ORDER BY mp.updated_at ASC;
    `;

    const res = await db.query<DbMeetingParticipant & {
      display_name: string;
      email: string;
      avatar_url: string | null;
    }>(query, [meetingId, since]);

    const participants: MeetingParticipantWithUser[] = [];
    const removedUserIds: string[] = [];

    for (const row of res.rows) {
      if (row.status === 'removed') {
        removedUserIds.push(row.user_id);
      }
      participants.push({
        ...this.mapParticipant(row),
        user: {
          id: row.user_id,
          displayName: row.display_name,
          email: row.email,
          avatarUrl: row.avatar_url,
        },
      });
    }

    return { participants, removedUserIds };
  }
}

export const meetingParticipantRepository = new MeetingParticipantRepository();
