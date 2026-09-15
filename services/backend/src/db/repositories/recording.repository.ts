import type {
  MeetingRecording,
  RecordingStatus,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbRecording {
  id: string;
  meeting_id: string;
  started_by: string;
  stopped_by: string | null;
  status: string;
  storage_key: string | null;
  mime_type: string | null;
  file_size_bytes: string | null; // bigint returned as string from pg
  duration_seconds: number | null;
  provider: string;
  provider_recording_id: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  consent_notified_at: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const LEGAL_RECORDING_TRANSITIONS: Record<RecordingStatus, RecordingStatus[]> = {
  REQUESTED: ['STARTING', 'FAILED', 'CANCELLED'],
  STARTING: ['RECORDING', 'FAILED', 'CANCELLED'],
  RECORDING: ['STOPPING', 'FAILED'],
  STOPPING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class RecordingRepository {
  mapRecording(row: DbRecording): MeetingRecording {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      startedBy: row.started_by,
      stoppedBy: row.stopped_by,
      status: row.status as RecordingStatus,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : null,
      durationSeconds: row.duration_seconds,
      provider: row.provider,
      consentNotifiedAt: row.consent_notified_at ? new Date(row.consent_notified_at).toISOString() : null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Creates a new recording in REQUESTED state.
   * Idempotent guard: if there is already an active recording (REQUESTED/STARTING/RECORDING),
   * returns the existing one without creating a duplicate.
   */
  async createOrGetActive(
    meetingId: string,
    startedBy: string,
    provider: string,
    db: Queryable = pool
  ): Promise<{ recording: MeetingRecording; created: boolean }> {
    // Check for an already-active recording
    const existingQuery = `
      SELECT * FROM meeting_recordings
      WHERE meeting_id = $1
        AND status IN ('REQUESTED', 'STARTING', 'RECORDING')
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const existing = await db.query<DbRecording>(existingQuery, [meetingId]);
    if (existing.rows[0]) {
      return { recording: this.mapRecording(existing.rows[0]), created: false };
    }

    const insertQuery = `
      INSERT INTO meeting_recordings (meeting_id, started_by, status, provider)
      VALUES ($1, $2, 'REQUESTED', $3)
      RETURNING *;
    `;
    const res = await db.query<DbRecording>(insertQuery, [meetingId, startedBy, provider]);
    return { recording: this.mapRecording(res.rows[0]), created: true };
  }

  /**
   * Transitions a recording through its state machine.
   * Enforces legal transition graph, rejecting illegal transitions with 409 conflict.
   */
  async updateStatus(
    recordingId: string,
    status: RecordingStatus,
    fields: {
      stoppedBy?: string | null;
      storageKey?: string | null;
      mimeType?: string | null;
      fileSizeBytes?: number | null;
      durationSeconds?: number | null;
      providerRecordingId?: string | null;
      providerErrorCode?: string | null;
      providerErrorMessage?: string | null;
      startedAt?: Date | null;
      endedAt?: Date | null;
      consentNotifiedAt?: Date | null;
    } = {},
    db: Queryable = pool
  ): Promise<MeetingRecording | null> {
    const currentRes = await db.query<{ status: string }>(
      'SELECT status FROM meeting_recordings WHERE id = $1;',
      [recordingId]
    );
    if (!currentRes.rows[0]) return null;

    const currentStatus = currentRes.rows[0].status as RecordingStatus;
    const allowed = LEGAL_RECORDING_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      const err = new Error(`Illegal recording state transition from ${currentStatus} to ${status}`);
      (err as any).code = 'INVALID_RECORDING_STATE_TRANSITION';
      (err as any).statusCode = 409;
      throw err;
    }

    const sets: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [recordingId, status];
    let idx = 3;

    if (fields.stoppedBy !== undefined) { sets.push(`stopped_by = $${idx++}`); values.push(fields.stoppedBy); }
    // storageKey is internal-only and only set by the backend provider integration
    if (fields.storageKey !== undefined) { sets.push(`storage_key = $${idx++}`); values.push(fields.storageKey); }
    if (fields.mimeType !== undefined) { sets.push(`mime_type = $${idx++}`); values.push(fields.mimeType); }
    if (fields.fileSizeBytes !== undefined) { sets.push(`file_size_bytes = $${idx++}`); values.push(fields.fileSizeBytes); }
    if (fields.durationSeconds !== undefined) { sets.push(`duration_seconds = $${idx++}`); values.push(fields.durationSeconds); }
    if (fields.providerRecordingId !== undefined) { sets.push(`provider_recording_id = $${idx++}`); values.push(fields.providerRecordingId); }
    if (fields.providerErrorCode !== undefined) { sets.push(`provider_error_code = $${idx++}`); values.push(fields.providerErrorCode); }
    if (fields.providerErrorMessage !== undefined) { sets.push(`provider_error_message = $${idx++}`); values.push(fields.providerErrorMessage); }
    if (fields.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); values.push(fields.startedAt); }
    if (fields.endedAt !== undefined) { sets.push(`ended_at = $${idx++}`); values.push(fields.endedAt); }
    if (fields.consentNotifiedAt !== undefined) { sets.push(`consent_notified_at = $${idx++}`); values.push(fields.consentNotifiedAt); }

    const query = `
      UPDATE meeting_recordings
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;

    const res = await db.query<DbRecording>(query, values);
    return res.rows[0] ? this.mapRecording(res.rows[0]) : null;
  }

  async findById(recordingId: string, db: Queryable = pool): Promise<DbRecording | null> {
    const res = await db.query<DbRecording>(
      'SELECT * FROM meeting_recordings WHERE id = $1;',
      [recordingId]
    );
    return res.rows[0] || null;
  }

  async findByMeeting(meetingId: string, db: Queryable = pool): Promise<MeetingRecording[]> {
    const res = await db.query<DbRecording>(
      `SELECT * FROM meeting_recordings
       WHERE meeting_id = $1
       ORDER BY created_at DESC;`,
      [meetingId]
    );
    return res.rows.map((r) => this.mapRecording(r));
  }

  async getActiveRecording(meetingId: string, db: Queryable = pool): Promise<DbRecording | null> {
    const res = await db.query<DbRecording>(
      `SELECT * FROM meeting_recordings
       WHERE meeting_id = $1
         AND status IN ('REQUESTED', 'STARTING', 'RECORDING')
       ORDER BY created_at DESC
       LIMIT 1;`,
      [meetingId]
    );
    return res.rows[0] || null;
  }

  /**
   * Returns the storage key for a completed recording.
   * This method is INTERNAL ONLY — the key is never returned to API clients.
   */
  async getStorageKey(recordingId: string, db: Queryable = pool): Promise<string | null> {
    const res = await db.query<{ storage_key: string | null }>(
      'SELECT storage_key FROM meeting_recordings WHERE id = $1 AND status = $2;',
      [recordingId, 'COMPLETED']
    );
    return res.rows[0]?.storage_key || null;
  }

  async hasCompletedRecording(meetingId: string, db: Queryable = pool): Promise<boolean> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM meeting_recordings
       WHERE meeting_id = $1 AND status = 'COMPLETED';`,
      [meetingId]
    );
    return Number(res.rows[0]?.count || 0) > 0;
  }
}

export const recordingRepository = new RecordingRepository();
