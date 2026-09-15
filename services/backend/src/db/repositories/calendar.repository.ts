import type {
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventAttendeeWithUser,
  CalendarReminder,
  CalendarEventVisibility,
  CalendarEventStatus,
  CalendarAttendeeResponseStatus,
} from '@teamtrack/shared-types';
import { pool } from '../pool.js';
import type { Queryable } from './organization.repository.js';

export interface DbCalendarEvent {
  id: string;
  organization_id: string | null;
  team_id: string | null;
  organizer_user_id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: Date;
  end_at: Date;
  timezone: string;
  all_day: boolean;
  visibility: CalendarEventVisibility;
  status: CalendarEventStatus;
  recurrence_rule: string | null;
  recurrence_until: Date | null;
  recurrence_timezone: string | null;
  actual_start_at?: Date | null;
  actual_end_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DbCalendarEventAttendee {
  id: string;
  event_id: string;
  user_id: string;
  response_status: CalendarAttendeeResponseStatus;
  is_organizer: boolean;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbCalendarEventReminder {
  id: string;
  event_id: string;
  user_id: string;
  minutes_before: number;
  is_sent: boolean;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEventDbParams {
  id?: string;
  organizationId?: string | null;
  teamId?: string | null;
  organizerUserId: string;
  meetingId?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  allDay: boolean;
  visibility: CalendarEventVisibility;
  status?: CalendarEventStatus;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  recurrenceTimezone?: string | null;
}

export interface UpdateEventDbParams {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  allDay?: boolean;
  visibility?: CalendarEventVisibility;
  status?: CalendarEventStatus;
  meetingId?: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  recurrenceTimezone?: string | null;
}

export class CalendarRepository {
  mapEvent(row: DbCalendarEvent): CalendarEvent {
    return {
      id: row.id,
      organizationId: row.organization_id,
      teamId: row.team_id,
      organizerUserId: row.organizer_user_id,
      title: row.title,
      description: row.description,
      location: row.location,
      startAt: new Date(row.start_at).toISOString(),
      endAt: new Date(row.end_at).toISOString(),
      timezone: row.timezone,
      allDay: row.all_day,
      visibility: row.visibility,
      status: row.status,
      meetingId: row.meeting_id,
      actualStartAt: row.actual_start_at ? new Date(row.actual_start_at).toISOString() : null,
      actualEndAt: row.actual_end_at ? new Date(row.actual_end_at).toISOString() : null,
      recurrenceRule: row.recurrence_rule,
      recurrenceUntil: row.recurrence_until ? new Date(row.recurrence_until).toISOString() : null,
      recurrenceTimezone: row.recurrence_timezone,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }

  mapAttendee(row: DbCalendarEventAttendee): CalendarEventAttendee {
    return {
      id: row.id,
      eventId: row.event_id,
      userId: row.user_id,
      responseStatus: row.response_status,
      isOrganizer: row.is_organizer,
      respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  mapReminder(row: DbCalendarEventReminder): CalendarReminder {
    return {
      id: row.id,
      eventId: row.event_id,
      userId: row.user_id,
      minutesBefore: row.minutes_before,
      isSent: row.is_sent,
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async createEvent(params: CreateEventDbParams, db: Queryable = pool): Promise<CalendarEvent> {
    const query = `
      INSERT INTO calendar_events (
        ${params.id ? 'id,' : ''}
        organization_id,
        team_id,
        organizer_user_id,
        meeting_id,
        title,
        description,
        location,
        start_at,
        end_at,
        timezone,
        all_day,
        visibility,
        status,
        recurrence_rule,
        recurrence_until,
        recurrence_timezone
      ) VALUES (
        ${params.id ? '$1,' : ''}
        $${params.id ? '2' : '1'},
        $${params.id ? '3' : '2'},
        $${params.id ? '4' : '3'},
        $${params.id ? '5' : '4'},
        $${params.id ? '6' : '5'},
        $${params.id ? '7' : '6'},
        $${params.id ? '8' : '7'},
        $${params.id ? '9' : '8'},
        $${params.id ? '10' : '9'},
        $${params.id ? '11' : '10'},
        $${params.id ? '12' : '11'},
        $${params.id ? '13' : '12'},
        $${params.id ? '14' : '13'},
        $${params.id ? '15' : '14'},
        $${params.id ? '16' : '15'},
        $${params.id ? '17' : '16'}
      )
      RETURNING *;
    `;

    const values = [
      ...(params.id ? [params.id] : []),
      params.organizationId || null,
      params.teamId || null,
      params.organizerUserId,
      params.meetingId || null,
      params.title,
      params.description || null,
      params.location || null,
      new Date(params.startAt),
      new Date(params.endAt),
      params.timezone || 'UTC',
      params.allDay || false,
      params.visibility || 'ORGANIZATION',
      params.status || 'confirmed',
      params.recurrenceRule || null,
      params.recurrenceUntil ? new Date(params.recurrenceUntil) : null,
      params.recurrenceTimezone || null,
    ];

    const result = await db.query(query, values);
    return this.mapEvent(result.rows[0]);
  }

  async findById(id: string, db: Queryable = pool): Promise<DbCalendarEvent | null> {
    const query = `
      SELECT *
      FROM calendar_events
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async updateEvent(id: string, params: UpdateEventDbParams, db: Queryable = pool): Promise<CalendarEvent | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [id];
    let idx = 2;

    if (params.title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(params.title);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(params.description);
    }
    if (params.location !== undefined) {
      updates.push(`location = $${idx++}`);
      values.push(params.location);
    }
    if (params.startAt !== undefined) {
      updates.push(`start_at = $${idx++}`);
      values.push(new Date(params.startAt));
    }
    if (params.endAt !== undefined) {
      updates.push(`end_at = $${idx++}`);
      values.push(new Date(params.endAt));
    }
    if (params.timezone !== undefined) {
      updates.push(`timezone = $${idx++}`);
      values.push(params.timezone);
    }
    if (params.allDay !== undefined) {
      updates.push(`all_day = $${idx++}`);
      values.push(params.allDay);
    }
    if (params.visibility !== undefined) {
      updates.push(`visibility = $${idx++}`);
      values.push(params.visibility);
    }
    if (params.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.meetingId !== undefined) {
      updates.push(`meeting_id = $${idx++}`);
      values.push(params.meetingId);
    }
    if (params.recurrenceRule !== undefined) {
      updates.push(`recurrence_rule = $${idx++}`);
      values.push(params.recurrenceRule);
    }
    if (params.recurrenceUntil !== undefined) {
      updates.push(`recurrence_until = $${idx++}`);
      values.push(params.recurrenceUntil ? new Date(params.recurrenceUntil) : null);
    }
    if (params.recurrenceTimezone !== undefined) {
      updates.push(`recurrence_timezone = $${idx++}`);
      values.push(params.recurrenceTimezone);
    }

    const query = `
      UPDATE calendar_events
      SET ${updates.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *;
    `;

    const result = await db.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapEvent(result.rows[0]);
  }

  async softDeleteEvent(id: string, db: Queryable = pool): Promise<boolean> {
    const query = `
      UPDATE calendar_events
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id;
    `;
    const result = await db.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async addAttendee(
    params: {
      eventId: string;
      userId: string;
      isOrganizer?: boolean;
      responseStatus?: CalendarAttendeeResponseStatus;
    },
    db: Queryable = pool
  ): Promise<CalendarEventAttendee> {
    const query = `
      INSERT INTO calendar_event_attendees (
        event_id,
        user_id,
        response_status,
        is_organizer,
        responded_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id, user_id) DO UPDATE
      SET response_status = EXCLUDED.response_status,
          is_organizer = EXCLUDED.is_organizer,
          updated_at = NOW()
      RETURNING *;
    `;

    const status = params.responseStatus || (params.isOrganizer ? 'ACCEPTED' : 'PENDING');
    const respondedAt = params.isOrganizer ? new Date() : null;

    const result = await db.query(query, [
      params.eventId,
      params.userId,
      status,
      Boolean(params.isOrganizer),
      respondedAt,
    ]);

    return this.mapAttendee(result.rows[0]);
  }

  async removeAttendee(eventId: string, userId: string, db: Queryable = pool): Promise<boolean> {
    const query = `
      DELETE FROM calendar_event_attendees
      WHERE event_id = $1 AND user_id = $2
      RETURNING id;
    `;
    const result = await db.query(query, [eventId, userId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getAttendeesByEventId(eventId: string, db: Queryable = pool): Promise<CalendarEventAttendeeWithUser[]> {
    const query = `
      SELECT 
        a.*,
        u.display_name,
        u.email,
        u.avatar_url
      FROM calendar_event_attendees a
      JOIN users u ON a.user_id = u.id
      WHERE a.event_id = $1
      ORDER BY a.is_organizer DESC, a.created_at ASC;
    `;

    const result = await db.query(query, [eventId]);
    return result.rows.map((r) => ({
      ...this.mapAttendee(r),
      user: {
        id: r.user_id,
        displayName: r.display_name,
        email: r.email,
        avatarUrl: r.avatar_url,
      },
    }));
  }

  async getAttendee(eventId: string, userId: string, db: Queryable = pool): Promise<CalendarEventAttendee | null> {
    const query = `
      SELECT *
      FROM calendar_event_attendees
      WHERE event_id = $1 AND user_id = $2
      LIMIT 1;
    `;
    const result = await db.query(query, [eventId, userId]);
    return result.rows[0] ? this.mapAttendee(result.rows[0]) : null;
  }

  async updateAttendeeResponse(
    eventId: string,
    userId: string,
    status: CalendarAttendeeResponseStatus,
    db: Queryable = pool
  ): Promise<CalendarEventAttendee | null> {
    const query = `
      UPDATE calendar_event_attendees
      SET response_status = $3, responded_at = NOW(), updated_at = NOW()
      WHERE event_id = $1 AND user_id = $2
      RETURNING *;
    `;
    const result = await db.query(query, [eventId, userId, status]);
    return result.rows[0] ? this.mapAttendee(result.rows[0]) : null;
  }

  async createReminder(
    params: { eventId: string; userId: string; minutesBefore: number },
    db: Queryable = pool
  ): Promise<CalendarReminder> {
    const query = `
      INSERT INTO calendar_event_reminders (
        event_id,
        user_id,
        minutes_before
      ) VALUES ($1, $2, $3)
      ON CONFLICT (event_id, user_id, minutes_before) DO UPDATE
      SET is_sent = false, updated_at = NOW()
      RETURNING *;
    `;
    const result = await db.query(query, [params.eventId, params.userId, params.minutesBefore]);
    return this.mapReminder(result.rows[0]);
  }

  async getRemindersByEventId(
    eventId: string,
    userId?: string,
    db: Queryable = pool
  ): Promise<CalendarReminder[]> {
    let query = `
      SELECT *
      FROM calendar_event_reminders
      WHERE event_id = $1
    `;
    const values: any[] = [eventId];
    if (userId) {
      query += ` AND user_id = $2`;
      values.push(userId);
    }
    query += ` ORDER BY minutes_before ASC;`;

    const result = await db.query(query, values);
    return result.rows.map((r) => this.mapReminder(r));
  }

  async deleteRemindersByEventId(eventId: string, db: Queryable = pool): Promise<void> {
    await db.query(`DELETE FROM calendar_event_reminders WHERE event_id = $1;`, [eventId]);
  }

  async getPendingReminders(
    dueBefore: Date,
    db: Queryable = pool
  ): Promise<
    Array<
      DbCalendarEventReminder & {
        event_title: string;
        event_start_at: Date;
        organizer_user_id: string;
        organization_id: string | null;
      }
    >
  > {
    const query = `
      SELECT 
        r.*,
        e.title AS event_title,
        e.start_at AS event_start_at,
        e.organizer_user_id,
        e.organization_id
      FROM calendar_event_reminders r
      JOIN calendar_events e ON r.event_id = e.id
      WHERE r.is_sent = false
        AND e.deleted_at IS NULL
        AND e.status != 'cancelled'
        AND (e.start_at - (r.minutes_before || ' minutes')::INTERVAL) <= $1
      ORDER BY e.start_at ASC
      LIMIT 100;
    `;
    const result = await db.query(query, [dueBefore]);
    return result.rows;
  }

  async markReminderSent(reminderId: string, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE calendar_event_reminders SET is_sent = true, sent_at = NOW(), updated_at = NOW() WHERE id = $1;`,
      [reminderId]
    );
  }

  /**
   * List authorized calendar events within the given window.
   * Authorization predicate pushdown guarantees caller never discovers unauthorized events.
   */
  async listEventsInWindow(
    callerId: string,
    windowStart: Date,
    windowEnd: Date,
    filter: { organizationId?: string; teamId?: string; userId?: string } = {},
    db: Queryable = pool
  ): Promise<CalendarEvent[]> {
    const conditions: string[] = [
      'e.deleted_at IS NULL',
      // Either single event in window OR recurring event eligible for window expansion
      `(
        (e.recurrence_rule IS NULL AND e.start_at < $2 AND e.end_at > $1)
        OR
        (e.recurrence_rule IS NOT NULL AND e.start_at < $2 AND (e.recurrence_until IS NULL OR e.recurrence_until > $1))
      )`,
      // Strict authorization predicate
      `(
        e.organizer_user_id = $3
        OR EXISTS (
          SELECT 1 FROM calendar_event_attendees cea
          WHERE cea.event_id = e.id AND cea.user_id = $3
        )
        OR (
          e.visibility = 'ORGANIZATION'
          AND e.organization_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = e.organization_id AND om.user_id = $3 AND om.status = 'active'
          )
        )
        OR (
          e.visibility = 'TEAM'
          AND e.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = e.team_id AND tm.user_id = $3
          )
        )
      )`,
    ];

    const values: any[] = [windowStart, windowEnd, callerId];
    let idx = 4;

    if (filter.organizationId) {
      conditions.push(`e.organization_id = $${idx++}`);
      values.push(filter.organizationId);
    }
    if (filter.teamId) {
      conditions.push(`e.team_id = $${idx++}`);
      values.push(filter.teamId);
    }
    if (filter.userId) {
      conditions.push(
        `(e.organizer_user_id = $${idx} OR EXISTS (SELECT 1 FROM calendar_event_attendees cea WHERE cea.event_id = e.id AND cea.user_id = $${idx}))`
      );
      values.push(filter.userId);
      idx++;
    }

    const query = `
      SELECT e.*
      FROM calendar_events e
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.start_at ASC;
    `;

    const result = await db.query(query, values);
    return result.rows.map((r) => this.mapEvent(r));
  }

  /**
   * Overlap query for availability / conflict detection.
   * Excludes cancelled events and declined attendee responses.
   * Returns busy blocks without leaking sensitive metadata.
   */
  async getUserBusyBlocks(
    userIds: string[],
    windowStart: Date,
    windowEnd: Date,
    db: Queryable = pool
  ): Promise<Array<{ user_id: string; start_at: Date; end_at: Date; status: string }>> {
    if (userIds.length === 0) return [];

    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        e.start_at,
        e.end_at,
        CASE WHEN e.status = 'tentative' OR a.response_status = 'TENTATIVE' THEN 'tentative' ELSE 'busy' END AS status
      FROM users u
      JOIN calendar_events e ON (
        e.organizer_user_id = u.id
        OR EXISTS (
          SELECT 1 FROM calendar_event_attendees cea
          WHERE cea.event_id = e.id AND cea.user_id = u.id AND cea.response_status != 'DECLINED'
        )
      )
      LEFT JOIN calendar_event_attendees a ON (a.event_id = e.id AND a.user_id = u.id)
      WHERE u.id = ANY($1::uuid[])
        AND e.deleted_at IS NULL
        AND e.status != 'cancelled'
        AND e.start_at < $3
        AND e.end_at > $2
      ORDER BY e.start_at ASC;
    `;

    const result = await db.query(query, [userIds, windowStart, windowEnd]);
    return result.rows;
  }

  /**
   * Finds a linked calendar event by meeting ID.
   */
  async findByMeetingId(meetingId: string, db: Queryable = pool): Promise<CalendarEvent | null> {
    const res = await db.query<DbCalendarEvent>(
      'SELECT * FROM calendar_events WHERE meeting_id = $1 AND deleted_at IS NULL LIMIT 1;',
      [meetingId]
    );
    return res.rows[0] ? this.mapEvent(res.rows[0]) : null;
  }

  /**
   * Idempotently updates actual_start_at for the linked calendar event on meeting.started.
   * Preserves existing actual_start_at if already recorded.
   */
  async syncMeetingStarted(
    meetingId: string,
    startedAt: Date,
    db: Queryable = pool
  ): Promise<CalendarEvent | null> {
    const res = await db.query<DbCalendarEvent>(
      `UPDATE calendar_events
       SET actual_start_at = COALESCE(actual_start_at, $2),
           updated_at = NOW()
       WHERE meeting_id = $1 AND deleted_at IS NULL
       RETURNING *;`,
      [meetingId, startedAt]
    );
    return res.rows[0] ? this.mapEvent(res.rows[0]) : null;
  }

  /**
   * Idempotently updates actual_end_at for the linked calendar event on meeting.ended.
   * Preserves existing actual_end_at if already recorded.
   */
  async syncMeetingEnded(
    meetingId: string,
    endedAt: Date,
    db: Queryable = pool
  ): Promise<CalendarEvent | null> {
    const res = await db.query<DbCalendarEvent>(
      `UPDATE calendar_events
       SET actual_end_at = COALESCE(actual_end_at, $2),
           updated_at = NOW()
       WHERE meeting_id = $1 AND deleted_at IS NULL
       RETURNING *;`,
      [meetingId, endedAt]
    );
    return res.rows[0] ? this.mapEvent(res.rows[0]) : null;
  }
}

export const calendarRepository = new CalendarRepository();
