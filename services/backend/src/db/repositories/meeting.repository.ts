import type { Meeting, MeetingWithHost, MeetingStatus } from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbMeeting {
  id: string;
  organization_id: string;
  host_id: string;
  title: string;
  description: string | null;
  scheduled_start_at: Date;
  scheduled_end_at: Date | null;
  actual_start_at: Date | null;
  actual_end_at: Date | null;
  status: string;
  waiting_room_enabled: boolean;
  is_locked?: boolean;
  locked_at?: Date | null;
  locked_by?: string | null;
  recording_file_id: string | null;
  transcription_file_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMeetingParams {
  organizationId: string;
  hostId: string;
  title: string;
  description?: string;
  scheduledStartAt?: string;
  waitingRoomEnabled?: boolean;
}

export class MeetingRepository {
  mapMeeting(row: DbMeeting): Meeting {
    if (!row) {
      return {
        id: '',
        organizationId: '',
        hostId: '',
        title: '',
        description: null,
        scheduledStartAt: new Date().toISOString(),
        scheduledEndAt: null,
        actualStartAt: null,
        actualEndAt: null,
        status: 'scheduled',
        waitingRoomEnabled: true,
        recordingFileId: null,
        transcriptionFileId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      hostId: row.host_id,
      title: row.title,
      description: row.description,
      scheduledStartAt: new Date(row.scheduled_start_at).toISOString(),
      scheduledEndAt: row.scheduled_end_at ? new Date(row.scheduled_end_at).toISOString() : null,
      actualStartAt: row.actual_start_at ? new Date(row.actual_start_at).toISOString() : null,
      actualEndAt: row.actual_end_at ? new Date(row.actual_end_at).toISOString() : null,
      startedAt: row.actual_start_at ? new Date(row.actual_start_at).toISOString() : null,
      endedAt: row.actual_end_at ? new Date(row.actual_end_at).toISOString() : null,
      status: row.status as MeetingStatus,
      waitingRoomEnabled: row.waiting_room_enabled,
      isLocked: row.is_locked,
      lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
      lockedBy: row.locked_by || null,
      recordingFileId: row.recording_file_id,
      transcriptionFileId: row.transcription_file_id,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async create(params: CreateMeetingParams, db: Queryable = pool): Promise<Meeting> {
    const scheduledAt = params.scheduledStartAt ? new Date(params.scheduledStartAt) : new Date();
    const waitingRoom = params.waitingRoomEnabled !== undefined ? params.waitingRoomEnabled : true;

    const query = `
      INSERT INTO meetings (
        organization_id,
        host_id,
        title,
        description,
        scheduled_start_at,
        waiting_room_enabled,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING *;
    `;

    const res = await db.query<DbMeeting>(query, [
      params.organizationId,
      params.hostId,
      params.title,
      params.description || null,
      scheduledAt,
      waitingRoom,
    ]);

    return this.mapMeeting(res.rows[0]);
  }

  async findById(meetingId: string, db: Queryable = pool): Promise<DbMeeting | null> {
    const query = `
      SELECT m.*
      FROM meetings m
      JOIN organizations o ON m.organization_id = o.id
      WHERE m.id = $1 AND o.deleted_at IS NULL;
    `;
    const res = await db.query<DbMeeting>(query, [meetingId]);
    return res.rows[0] || null;
  }

  async findForUpdate(meetingId: string, client: Queryable): Promise<DbMeeting | null> {
    const query = `
      SELECT m.*
      FROM meetings m
      JOIN organizations o ON m.organization_id = o.id
      WHERE m.id = $1 AND o.deleted_at IS NULL
      FOR UPDATE OF m;
    `;
    const res = await client.query<DbMeeting>(query, [meetingId]);
    return res.rows[0] || null;
  }

  async findByIdWithHost(meetingId: string, db: Queryable = pool): Promise<MeetingWithHost | null> {
    const query = `
      SELECT 
        m.*,
        u.display_name AS host_display_name,
        u.email AS host_email,
        u.avatar_url AS host_avatar_url
      FROM meetings m
      JOIN organizations o ON m.organization_id = o.id
      JOIN users u ON m.host_id = u.id
      WHERE m.id = $1 AND o.deleted_at IS NULL;
    `;

    const res = await db.query<DbMeeting & {
      host_display_name: string;
      host_email: string;
      host_avatar_url: string | null;
    }>(query, [meetingId]);

    const row = res.rows[0];
    if (!row) return null;

    return {
      ...this.mapMeeting(row),
      host: {
        id: row.host_id,
        displayName: row.host_display_name,
        email: row.host_email,
        avatarUrl: row.host_avatar_url,
      },
    };
  }

  async listByOrg(organizationId: string, db: Queryable = pool): Promise<MeetingWithHost[]> {
    const query = `
      SELECT 
        m.*,
        u.display_name AS host_display_name,
        u.email AS host_email,
        u.avatar_url AS host_avatar_url
      FROM meetings m
      JOIN users u ON m.host_id = u.id
      WHERE m.organization_id = $1
      ORDER BY m.created_at DESC;
    `;

    const res = await db.query<DbMeeting & {
      host_display_name: string;
      host_email: string;
      host_avatar_url: string | null;
    }>(query, [organizationId]);

    return res.rows.map((row) => ({
      ...this.mapMeeting(row),
      host: {
        id: row.host_id,
        displayName: row.host_display_name,
        email: row.host_email,
        avatarUrl: row.host_avatar_url,
      },
    }));
  }

  async startMeeting(meetingId: string, client: Queryable): Promise<Meeting> {
    const query = `
      UPDATE meetings
      SET status = 'active',
          actual_start_at = COALESCE(actual_start_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await client.query<DbMeeting>(query, [meetingId]);
    return this.mapMeeting(res.rows[0]);
  }

  async endMeeting(meetingId: string, client: Queryable): Promise<Meeting> {
    const query = `
      UPDATE meetings
      SET status = 'ended',
          actual_end_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await client.query<DbMeeting>(query, [meetingId]);
    return this.mapMeeting(res.rows[0]);
  }

  async updateHost(meetingId: string, newHostId: string, client: Queryable): Promise<Meeting> {
    const query = `
      UPDATE meetings
      SET host_id = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await client.query<DbMeeting>(query, [meetingId, newHostId]);
    return this.mapMeeting(res.rows[0]);
  }
}

export const meetingRepository = new MeetingRepository();
