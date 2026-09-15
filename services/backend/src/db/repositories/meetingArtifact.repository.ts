import type {
  MeetingArtifact,
  MeetingArtifactType,
  RecordingStatus,
  TranscriptStatus,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbArtifact {
  id: string;
  meeting_id: string;
  artifact_type: string;
  recording_id: string | null;
  transcript_id: string | null;
  created_by: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined status from referenced record
  artifact_status: string;
}

export class MeetingArtifactRepository {
  mapArtifact(row: DbArtifact): MeetingArtifact {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      artifactType: row.artifact_type as MeetingArtifactType,
      recordingId: row.recording_id,
      transcriptId: row.transcript_id,
      createdBy: row.created_by,
      title: row.title,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      status: row.artifact_status as RecordingStatus | TranscriptStatus,
    };
  }

  /**
   * Creates an artifact entry when a recording/transcript is successfully created.
   */
  async create(
    meetingId: string,
    createdBy: string,
    artifactType: MeetingArtifactType,
    params: {
      recordingId?: string;
      transcriptId?: string;
      title?: string;
    },
    db: Queryable = pool
  ): Promise<MeetingArtifact> {
    const query = `
      INSERT INTO meeting_artifacts (
        meeting_id, created_by, artifact_type, recording_id, transcript_id, title
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, $7::text AS artifact_status;
    `;
    const res = await db.query<DbArtifact>(query, [
      meetingId,
      createdBy,
      artifactType,
      params.recordingId || null,
      params.transcriptId || null,
      params.title || null,
      'REQUESTED',
    ]);
    return this.mapArtifact(res.rows[0]);
  }

  /**
   * Lists all artifacts for a meeting, joined with their current status from source tables.
   */
  async listByMeeting(
    meetingId: string,
    limit: number = 20,
    cursor?: string,
    db: Queryable = pool
  ): Promise<MeetingArtifact[]> {
    const query = `
      SELECT
        ma.*,
        COALESCE(mr.status, mt.status, 'UNKNOWN') AS artifact_status
      FROM meeting_artifacts ma
      LEFT JOIN meeting_recordings mr ON ma.recording_id = mr.id
      LEFT JOIN meeting_transcripts mt ON ma.transcript_id = mt.id
      WHERE ma.meeting_id = $1
        ${cursor ? 'AND ma.created_at < (SELECT created_at FROM meeting_artifacts WHERE id = $3)' : ''}
      ORDER BY ma.created_at DESC
      LIMIT $2;
    `;
    const params: unknown[] = cursor ? [meetingId, limit, cursor] : [meetingId, limit];
    const res = await db.query<DbArtifact>(query, params);
    return res.rows.map((r) => this.mapArtifact(r));
  }

  async findById(artifactId: string, db: Queryable = pool): Promise<MeetingArtifact | null> {
    const query = `
      SELECT
        ma.*,
        COALESCE(mr.status, mt.status, 'UNKNOWN') AS artifact_status
      FROM meeting_artifacts ma
      LEFT JOIN meeting_recordings mr ON ma.recording_id = mr.id
      LEFT JOIN meeting_transcripts mt ON ma.transcript_id = mt.id
      WHERE ma.id = $1;
    `;
    const res = await db.query<DbArtifact>(query, [artifactId]);
    return res.rows[0] ? this.mapArtifact(res.rows[0]) : null;
  }
}

export const meetingArtifactRepository = new MeetingArtifactRepository();
