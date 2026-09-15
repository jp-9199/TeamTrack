import type {
  MeetingTranscript,
  TranscriptStatus,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbTranscript {
  id: string;
  meeting_id: string;
  recording_id: string | null;
  requested_by: string;
  status: string;
  storage_key: string | null;
  mime_type: string | null;
  language: string | null;
  word_count: number | null;
  speaker_count: number | null;
  provider: string;
  provider_transcript_id: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const LEGAL_TRANSCRIPT_TRANSITIONS: Record<TranscriptStatus, TranscriptStatus[]> = {
  REQUESTED: ['PROCESSING', 'FAILED', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class TranscriptRepository {
  mapTranscript(row: DbTranscript): MeetingTranscript {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      recordingId: row.recording_id,
      requestedBy: row.requested_by,
      status: row.status as TranscriptStatus,
      language: row.language,
      wordCount: row.word_count,
      speakerCount: row.speaker_count,
      provider: row.provider,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Creates a transcript request, preventing duplicates for the same meeting.
   * Idempotent: if a REQUESTED or PROCESSING transcript already exists, returns existing.
   */
  async createOrGetActive(
    meetingId: string,
    requestedBy: string,
    recordingId: string | null = null,
    provider: string = 'mock',
    language: string = 'en-US',
    db: Queryable = pool
  ): Promise<{ transcript: MeetingTranscript; created: boolean }> {
    const active = await db.query<DbTranscript>(
      `SELECT * FROM meeting_transcripts
       WHERE meeting_id = $1 AND status IN ('REQUESTED', 'PROCESSING')
       ORDER BY created_at DESC LIMIT 1;`,
      [meetingId]
    );
    if (active.rows[0]) {
      return { transcript: this.mapTranscript(active.rows[0]), created: false };
    }

    const insertQuery = `
      INSERT INTO meeting_transcripts (
        meeting_id, recording_id, requested_by, status, provider, language
      ) VALUES ($1, $2, $3, 'REQUESTED', $4, $5)
      RETURNING *;
    `;
    const res = await db.query<DbTranscript>(insertQuery, [
      meetingId,
      recordingId,
      requestedBy,
      provider,
      language,
    ]);
    return { transcript: this.mapTranscript(res.rows[0]), created: true };
  }

  async updateStatus(
    transcriptId: string,
    status: TranscriptStatus,
    fields: {
      storageKey?: string | null;
      wordCount?: number | null;
      speakerCount?: number | null;
      providerTranscriptId?: string | null;
      providerErrorCode?: string | null;
      providerErrorMessage?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
    } = {},
    db: Queryable = pool
  ): Promise<MeetingTranscript | null> {
    const currentRes = await db.query<{ status: string }>(
      'SELECT status FROM meeting_transcripts WHERE id = $1;',
      [transcriptId]
    );
    if (!currentRes.rows[0]) return null;

    const currentStatus = currentRes.rows[0].status as TranscriptStatus;
    const allowed = LEGAL_TRANSCRIPT_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      const err = new Error(`Illegal transcript state transition from ${currentStatus} to ${status}`);
      (err as any).code = 'INVALID_TRANSCRIPT_STATE_TRANSITION';
      (err as any).statusCode = 409;
      throw err;
    }

    const sets: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [transcriptId, status];
    let idx = 3;

    // storageKey is internal-only
    if (fields.storageKey !== undefined) { sets.push(`storage_key = $${idx++}`); values.push(fields.storageKey); }
    if (fields.wordCount !== undefined) { sets.push(`word_count = $${idx++}`); values.push(fields.wordCount); }
    if (fields.speakerCount !== undefined) { sets.push(`speaker_count = $${idx++}`); values.push(fields.speakerCount); }
    if (fields.providerTranscriptId !== undefined) { sets.push(`provider_transcript_id = $${idx++}`); values.push(fields.providerTranscriptId); }
    if (fields.providerErrorCode !== undefined) { sets.push(`provider_error_code = $${idx++}`); values.push(fields.providerErrorCode); }
    if (fields.providerErrorMessage !== undefined) { sets.push(`provider_error_message = $${idx++}`); values.push(fields.providerErrorMessage); }
    if (fields.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); values.push(fields.startedAt); }
    if (fields.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); values.push(fields.completedAt); }

    const query = `
      UPDATE meeting_transcripts
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;
    const res = await db.query<DbTranscript>(query, values);
    return res.rows[0] ? this.mapTranscript(res.rows[0]) : null;
  }

  async findById(transcriptId: string, db: Queryable = pool): Promise<DbTranscript | null> {
    const res = await db.query<DbTranscript>(
      'SELECT * FROM meeting_transcripts WHERE id = $1;',
      [transcriptId]
    );
    return res.rows[0] || null;
  }

  async findByMeeting(meetingId: string, db: Queryable = pool): Promise<MeetingTranscript[]> {
    const res = await db.query<DbTranscript>(
      `SELECT * FROM meeting_transcripts
       WHERE meeting_id = $1
       ORDER BY created_at DESC;`,
      [meetingId]
    );
    return res.rows.map((r) => this.mapTranscript(r));
  }

  async getLatestCompleted(meetingId: string, db: Queryable = pool): Promise<DbTranscript | null> {
    const res = await db.query<DbTranscript>(
      `SELECT * FROM meeting_transcripts
       WHERE meeting_id = $1 AND status = 'COMPLETED'
       ORDER BY completed_at DESC
       LIMIT 1;`,
      [meetingId]
    );
    return res.rows[0] || null;
  }

  /**
   * Returns storage key for a completed transcript.
   * INTERNAL ONLY — never expose storage key to clients.
   */
  async getStorageKey(transcriptId: string, db: Queryable = pool): Promise<string | null> {
    const res = await db.query<{ storage_key: string | null }>(
      'SELECT storage_key FROM meeting_transcripts WHERE id = $1 AND status = $2;',
      [transcriptId, 'COMPLETED']
    );
    return res.rows[0]?.storage_key || null;
  }

  async hasCompletedTranscript(meetingId: string, db: Queryable = pool): Promise<boolean> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM meeting_transcripts
       WHERE meeting_id = $1 AND status = 'COMPLETED';`,
      [meetingId]
    );
    return Number(res.rows[0]?.count || 0) > 0;
  }
}

export const transcriptRepository = new TranscriptRepository();
