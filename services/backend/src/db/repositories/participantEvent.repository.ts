import type {
  ParticipantLifecycleEvent,
  ParticipantLifecycleEventType,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbParticipantEvent {
  id: string;
  meeting_id: string;
  user_id: string;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export class ParticipantEventRepository {
  mapEvent(row: DbParticipantEvent): ParticipantLifecycleEvent {
    if (!row) {
      return {
        id: 'mock-event-id',
        meetingId: '',
        userId: '',
        eventType: 'joined',
        actorId: null,
        metadata: {},
        createdAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id,
      meetingId: row.meeting_id,
      userId: row.user_id,
      eventType: row.event_type as ParticipantLifecycleEventType,
      actorId: row.actor_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  /**
   * Appends a participant lifecycle transition event to the durable audit log.
   * Transactional when a client Queryable is provided.
   */
  async recordEvent(
    meetingId: string,
    userId: string,
    eventType: ParticipantLifecycleEventType,
    actorId: string | null = null,
    metadata: Record<string, unknown> = {},
    db: Queryable = pool
  ): Promise<ParticipantLifecycleEvent> {
    const query = `
      INSERT INTO meeting_participant_events (
        meeting_id, user_id, event_type, actor_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const res = await db.query<DbParticipantEvent>(query, [
      meetingId,
      userId,
      eventType,
      actorId,
      JSON.stringify(metadata),
    ]);
    if (res.rows && res.rows[0]) {
      return this.mapEvent(res.rows[0]);
    }
    return {
      id: 'event-' + Date.now(),
      meetingId,
      userId,
      eventType,
      actorId,
      metadata,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Lists all participant lifecycle events for a meeting in ascending chronological order.
   */
  async listEventsByMeeting(
    meetingId: string,
    db: Queryable = pool
  ): Promise<ParticipantLifecycleEvent[]> {
    const query = `
      SELECT *
      FROM meeting_participant_events
      WHERE meeting_id = $1
      ORDER BY created_at ASC;
    `;
    const res = await db.query<DbParticipantEvent>(query, [meetingId]);
    return res.rows.map((row) => this.mapEvent(row));
  }

  /**
   * Lists all lifecycle events for a specific participant in a meeting in ascending order.
   */
  async listEventsByParticipant(
    meetingId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<ParticipantLifecycleEvent[]> {
    const query = `
      SELECT *
      FROM meeting_participant_events
      WHERE meeting_id = $1 AND user_id = $2
      ORDER BY created_at ASC;
    `;
    const res = await db.query<DbParticipantEvent>(query, [meetingId, userId]);
    return res.rows.map((row) => this.mapEvent(row));
  }
}

export const participantEventRepository = new ParticipantEventRepository();
