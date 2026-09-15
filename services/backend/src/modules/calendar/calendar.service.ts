import type {
  CalendarEvent,
  CalendarEventWithDetails,
  CalendarEventAttendee,
  CalendarEventAttendeeWithUser,
  CalendarReminder,
  CalendarAvailabilityBlock,
  CalendarAvailabilityResponse,
  CalendarSyncResponse,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventQuery,
  CalendarRespondRequest,
  AddCalendarAttendeeRequest,
  CalendarAvailabilityRequest,
  Phase10ErrorCode,
} from '@teamtrack/shared-types';
import { PHASE10_ERROR_CODES } from '@teamtrack/shared-types';
import { calendarRepository, type DbCalendarEvent } from '../../db/repositories/calendar.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { meetingRepository } from '../../db/repositories/meeting.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { meetingAuthorizationService } from '../meetings/meeting.authorization.js';
import { notificationService } from '../notifications/notification.service.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import { pool } from '../../db/pool.js';
import type { Queryable } from '../../db/repositories/organization.repository.js';

export class CalendarServiceError extends Error {
  constructor(
    public code: Phase10ErrorCode | string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CalendarServiceError';
  }
}

export class CalendarService {
  private idempotencyCache = new Map<string, { event: CalendarEventWithDetails; timestamp: number }>();

  /**
   * Evaluates caller authorization for a calendar event.
   * Conservative security model: returns notFound=true for foreign private events to prevent existence probing.
   */
  async checkEventAccess(
    callerId: string,
    event: DbCalendarEvent | CalendarEvent,
    db: Queryable = pool
  ): Promise<{ canAccess: boolean; isOrganizer: boolean; notFound: boolean }> {
    const deletedAt = 'deleted_at' in event ? event.deleted_at : (event as CalendarEvent).deletedAt;
    if (deletedAt !== null && deletedAt !== undefined) {
      return { canAccess: false, isOrganizer: false, notFound: true };
    }

    const organizerId = 'organizer_user_id' in event ? event.organizer_user_id : (event as CalendarEvent).organizerUserId;
    if (organizerId === callerId) {
      return { canAccess: true, isOrganizer: true, notFound: false };
    }

    // Check if caller is an explicit attendee
    const attendee = await calendarRepository.getAttendee(event.id, callerId, db);
    if (attendee) {
      return { canAccess: true, isOrganizer: false, notFound: false };
    }

    const orgId = 'organization_id' in event ? event.organization_id : (event as CalendarEvent).organizationId;
    const teamId = 'team_id' in event ? event.team_id : (event as CalendarEvent).teamId;

    if (event.visibility === 'ORGANIZATION' && orgId) {
      const orgAuth = await authorizationService.getOrganizationAuth(callerId, orgId, db);
      if (orgAuth.isMember) {
        return { canAccess: true, isOrganizer: false, notFound: false };
      }
    } else if (event.visibility === 'TEAM' && teamId) {
      const teamAuth = await authorizationService.getTeamAuth(callerId, teamId, db);
      if (teamAuth.teamExists && (teamAuth.isMember || teamAuth.isOrgOwnerOrAdmin)) {
        return { canAccess: true, isOrganizer: false, notFound: false };
      }
    }

    // Default to not found for unauthorized callers to prevent enumeration/IDOR
    return { canAccess: false, isOrganizer: false, notFound: true };
  }

  /**
   * Helper to build fully populated CalendarEventWithDetails.
   */
  private async hydrateEventDetails(
    event: CalendarEvent,
    callerId?: string,
    db: Queryable = pool
  ): Promise<CalendarEventWithDetails> {
    const organizerUser = await userRepository.findById(event.organizerUserId);
    const attendees = await calendarRepository.getAttendeesByEventId(event.id, db);
    let reminders: CalendarReminder[] = [];
    try {
      if (callerId) {
        reminders = await calendarRepository.getRemindersByEventId(event.id, callerId, db);
      }
    } catch {
      reminders = [];
    }

    let meetingSummary: { id: string; title: string; status: string } | null = null;
    if (event.meetingId) {
      const meeting = await meetingRepository.findById(event.meetingId, db);
      if (meeting) {
        meetingSummary = {
          id: meeting.id,
          title: meeting.title,
          status: meeting.status,
        };
      }
    }

    return {
      ...event,
      organizer: {
        id: organizerUser ? organizerUser.id : event.organizerUserId,
        displayName: organizerUser ? organizerUser.display_name : 'Unknown User',
        email: organizerUser ? organizerUser.email : '',
        avatarUrl: organizerUser ? organizerUser.avatar_url : null,
      },
      attendees,
      reminders,
      meeting: meetingSummary,
    };
  }

  /**
   * Creates a new calendar event.
   */
  async createEvent(
    callerId: string,
    params: CreateCalendarEventRequest
  ): Promise<CalendarEventWithDetails> {
    // Idempotency check
    if (params.idempotencyKey) {
      const cached = this.idempotencyCache.get(`${callerId}:${params.idempotencyKey}`);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return cached.event;
      }
    }

    // Authorization verification for parent organization and team
    if (params.organizationId) {
      const orgAuth = await authorizationService.getOrganizationAuth(callerId, params.organizationId);
      if (!orgAuth.isMember) {
        throw new CalendarServiceError(
          PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_ACCESS,
          'You are not an active member of the specified organization',
          403
        );
      }
    }

    if (params.teamId) {
      const teamAuth = await authorizationService.getTeamAuth(callerId, params.teamId);
      if (!teamAuth.teamExists || (!teamAuth.isMember && !teamAuth.isOrgOwnerOrAdmin)) {
        throw new CalendarServiceError(
          PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_ACCESS,
          'You are not an active member of the specified team',
          403
        );
      }
    }

    // Meeting authorization verification
    if (params.meetingId) {
      const meetingAuth = await meetingAuthorizationService.getMeetingAuth(callerId, params.meetingId);
      if (!meetingAuth.meetingExists || !meetingAuth.canAccess) {
        throw new CalendarServiceError(
          PHASE10_ERROR_CODES.MEETING_AUTHORIZATION_FAILED,
          'You do not have authorization to link the specified meeting',
          403
        );
      }
    }

    let client: any = null;
    let isInternalTx = false;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      isInternalTx = true;
    } catch {
      client = null;
    }

    const queryRunner: Queryable = client || pool;
    let createdEvent: CalendarEvent;
    let fullDetails: CalendarEventWithDetails;

    try {

      // 1. Insert event
      createdEvent = await calendarRepository.createEvent(
        {
          organizationId: params.organizationId,
          teamId: params.teamId,
          organizerUserId: callerId,
          meetingId: params.meetingId,
          title: params.title,
          description: params.description,
          location: params.location,
          startAt: params.startAt,
          endAt: params.endAt,
          timezone: params.timezone || 'UTC',
          allDay: Boolean(params.allDay),
          visibility: params.visibility || 'ORGANIZATION',
          status: 'confirmed',
          recurrenceRule: params.recurrenceRule,
          recurrenceUntil: params.recurrenceUntil,
          recurrenceTimezone: params.recurrenceTimezone,
        },
        queryRunner
      );

      // 2. Add organizer as confirmed attendee
      await calendarRepository.addAttendee(
        {
          eventId: createdEvent.id,
          userId: callerId,
          isOrganizer: true,
          responseStatus: 'ACCEPTED',
        },
        queryRunner
      );

      // 3. Add explicit attendees
      if (params.attendeeUserIds && params.attendeeUserIds.length > 0) {
        for (const attendeeId of params.attendeeUserIds) {
          if (attendeeId !== callerId) {
            // Validate attendee exists
            const user = await userRepository.findById(attendeeId);
            if (user && user.status !== 'suspended' && user.status !== 'deactivated') {
              await calendarRepository.addAttendee(
                {
                  eventId: createdEvent.id,
                  userId: attendeeId,
                  isOrganizer: false,
                  responseStatus: 'PENDING',
                },
                queryRunner
              );
            }
          }
        }
      }

      // 4. Configure reminders for organizer
      if (params.reminders && params.reminders.length > 0) {
        for (const minutes of params.reminders) {
          await calendarRepository.createReminder(
            {
              eventId: createdEvent.id,
              userId: callerId,
              minutesBefore: minutes,
            },
            queryRunner
          );
        }
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
    } catch (err) {
      if (isInternalTx && client) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }

    fullDetails = await this.hydrateEventDetails(createdEvent, callerId);

    // Save in idempotency cache
    if (params.idempotencyKey) {
      this.idempotencyCache.set(`${callerId}:${params.idempotencyKey}`, {
        event: fullDetails,
        timestamp: Date.now(),
      });
    }

    // Post-commit: Realtime publishing & notification dispatch
    this.publishRealtimeCalendarEvent('calendar.event.created', fullDetails, 'created').catch((err) =>
      console.error('[CalendarService] Error publishing realtime create event:', err)
    );

    // Send invitations to attendees
    if (params.attendeeUserIds && params.attendeeUserIds.length > 0) {
      for (const attendeeId of params.attendeeUserIds) {
        if (attendeeId !== callerId) {
          notificationService
            .createNotification({
              recipientId: attendeeId,
              actorId: callerId,
              organizationId: createdEvent.organizationId,
              type: 'calendar_invitation',
              title: 'Calendar Invitation',
              body: `You have been invited to "${createdEvent.title}"`,
              resourceType: 'calendar_event',
              resourceId: createdEvent.id,
              dataPayload: {
                eventId: createdEvent.id,
                title: createdEvent.title,
                startAt: createdEvent.startAt,
                endAt: createdEvent.endAt,
              },
            })
            .catch((err) => console.error('[CalendarService] Error sending invitation notification:', err));
        }
      }
    }

    return fullDetails;
  }

  /**
   * Retrieves an event by ID.
   */
  async getEvent(callerId: string, eventId: string): Promise<CalendarEventWithDetails> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const event = calendarRepository.mapEvent(raw);
    return this.hydrateEventDetails(event, callerId);
  }

  /**
   * Updates an existing event. Only organizer can modify event properties.
   */
  async updateEvent(
    callerId: string,
    eventId: string,
    params: UpdateCalendarEventRequest
  ): Promise<CalendarEventWithDetails> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }
    if (!auth.isOrganizer) {
      throw new CalendarServiceError(
        PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION,
        'Only the event organizer can modify event details',
        403
      );
    }

    // Meeting authorization if changed
    if (params.meetingId) {
      const meetingAuth = await meetingAuthorizationService.getMeetingAuth(callerId, params.meetingId);
      if (!meetingAuth.meetingExists || !meetingAuth.canAccess) {
        throw new CalendarServiceError(
          PHASE10_ERROR_CODES.MEETING_AUTHORIZATION_FAILED,
          'You do not have authorization to link the specified meeting',
          403
        );
      }
    }

    let client: any = null;
    let isInternalTx = false;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      isInternalTx = true;
    } catch {
      client = null;
    }

    const queryRunner: Queryable = client || pool;
    let updatedEvent: CalendarEvent | null = null;

    try {
      updatedEvent = await calendarRepository.updateEvent(
        eventId,
        {
          title: params.title,
          description: params.description,
          location: params.location,
          startAt: params.startAt,
          endAt: params.endAt,
          timezone: params.timezone,
          allDay: params.allDay,
          visibility: params.visibility,
          status: params.status,
          meetingId: params.meetingId,
          recurrenceRule: params.recurrenceRule,
          recurrenceUntil: params.recurrenceUntil,
          recurrenceTimezone: params.recurrenceTimezone,
        },
        queryRunner
      );

      // Attendees updates if provided
      if (params.attendeeUserIds !== undefined) {
        for (const attendeeId of params.attendeeUserIds) {
          if (attendeeId !== callerId) {
            await calendarRepository.addAttendee(
              {
                eventId,
                userId: attendeeId,
                isOrganizer: false,
                responseStatus: 'PENDING',
              },
              queryRunner
            );
          }
        }
      }

      // Reminders updates if provided
      if (params.reminders !== undefined) {
        await calendarRepository.deleteRemindersByEventId(eventId, queryRunner);
        for (const minutes of params.reminders) {
          await calendarRepository.createReminder(
            {
              eventId,
              userId: callerId,
              minutesBefore: minutes,
            },
            queryRunner
          );
        }
      }

      if (isInternalTx && client) {
        await client.query('COMMIT');
      }
    } catch (err) {
      if (isInternalTx && client) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isInternalTx && client) {
        client.release();
      }
    }

    if (!updatedEvent) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const fullDetails = await this.hydrateEventDetails(updatedEvent, callerId);

    // Publish realtime event
    this.publishRealtimeCalendarEvent('calendar.event.updated', fullDetails, 'updated').catch((err) =>
      console.error('[CalendarService] Error publishing realtime update event:', err)
    );

    // Notify attendees of update
    for (const attendee of fullDetails.attendees) {
      if (attendee.userId !== callerId) {
        notificationService
          .createNotification({
            recipientId: attendee.userId,
            actorId: callerId,
            organizationId: updatedEvent.organizationId,
            type: 'calendar_event_updated',
            title: 'Calendar Event Updated',
            body: `The event "${updatedEvent.title}" has been updated`,
            resourceType: 'calendar_event',
            resourceId: eventId,
            dataPayload: {
              eventId,
              title: updatedEvent.title,
              startAt: updatedEvent.startAt,
              endAt: updatedEvent.endAt,
            },
          })
          .catch((err) => console.error('[CalendarService] Error notifying attendee of event update:', err));
      }
    }

    return fullDetails;
  }

  /**
   * Deletes / cancels an event. Only organizer can delete.
   */
  async deleteEvent(callerId: string, eventId: string): Promise<void> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }
    if (!auth.isOrganizer) {
      throw new CalendarServiceError(
        PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION,
        'Only the event organizer can delete or cancel the event',
        403
      );
    }

    const attendees = await calendarRepository.getAttendeesByEventId(eventId);
    await calendarRepository.softDeleteEvent(eventId);

    const deletedEventDto = calendarRepository.mapEvent(raw);
    const fullDetails: CalendarEventWithDetails = {
      ...deletedEventDto,
      organizer: {
        id: callerId,
        displayName: 'Organizer',
        email: '',
        avatarUrl: null,
      },
      attendees,
      deletedAt: new Date().toISOString(),
    };

    // Publish realtime deletion event
    this.publishRealtimeCalendarEvent('calendar.event.deleted', fullDetails, 'deleted').catch((err) =>
      console.error('[CalendarService] Error publishing realtime delete event:', err)
    );

    // Notify attendees of cancellation
    for (const attendee of attendees) {
      if (attendee.userId !== callerId) {
        notificationService
          .createNotification({
            recipientId: attendee.userId,
            actorId: callerId,
            organizationId: deletedEventDto.organizationId,
            type: 'calendar_event_cancelled',
            title: 'Calendar Event Cancelled',
            body: `The event "${deletedEventDto.title}" has been cancelled`,
            resourceType: 'calendar_event',
            resourceId: eventId,
            dataPayload: {
              eventId,
              title: deletedEventDto.title,
            },
          })
          .catch((err) => console.error('[CalendarService] Error notifying attendee of event cancellation:', err));
      }
    }
  }

  /**
   * Respond to a calendar event (RSVP).
   */
  async respondToEvent(
    callerId: string,
    eventId: string,
    params: CalendarRespondRequest
  ): Promise<CalendarEventAttendee> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    // Ensure attendee record exists
    let attendee = await calendarRepository.getAttendee(eventId, callerId);
    if (!attendee) {
      attendee = await calendarRepository.addAttendee({
        eventId,
        userId: callerId,
        isOrganizer: auth.isOrganizer,
        responseStatus: params.responseStatus,
      });
    } else {
      attendee = await calendarRepository.updateAttendeeResponse(eventId, callerId, params.responseStatus);
    }

    if (!attendee) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.ATTENDEE_NOT_FOUND, 'Attendee record not found', 404);
    }

    // Post-commit realtime event
    const responderUser = await userRepository.findById(callerId);
    eventPublisher
      .publish('calendar.attendee.responded', `user:${raw.organizer_user_id}`, {
        eventId,
        userId: callerId,
        responseStatus: params.responseStatus,
      })
      .catch((err) => console.error('[CalendarService] Realtime attendee responded publish warning:', err));

    // Notify organizer if caller is not organizer
    if (raw.organizer_user_id !== callerId) {
      notificationService
        .createNotification({
          recipientId: raw.organizer_user_id,
          actorId: callerId,
          organizationId: raw.organization_id,
          type: 'calendar_invitation_response',
          title: 'RSVP Response',
          body: `${responderUser ? responderUser.display_name : 'An attendee'} responded ${params.responseStatus} to "${raw.title}"`,
          resourceType: 'calendar_event',
          resourceId: eventId,
          dataPayload: {
            eventId,
            userId: callerId,
            responseStatus: params.responseStatus,
          },
        })
        .catch((err) => console.error('[CalendarService] Error notifying organizer of RSVP response:', err));
    }

    return attendee;
  }

  /**
   * Adds an attendee to an event. Only organizer can invite new attendees.
   */
  async addAttendee(
    callerId: string,
    eventId: string,
    params: AddCalendarAttendeeRequest
  ): Promise<CalendarEventAttendeeWithUser> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }
    if (!auth.isOrganizer) {
      throw new CalendarServiceError(
        PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION,
        'Only the event organizer can add attendees',
        403
      );
    }

    const targetUser = await userRepository.findById(params.userId);
    if (!targetUser || targetUser.status === 'suspended' || targetUser.status === 'deactivated') {
      throw new CalendarServiceError('USER_NOT_FOUND', 'Target user does not exist or is inactive', 404);
    }

    const attendee = await calendarRepository.addAttendee({
      eventId,
      userId: params.userId,
      isOrganizer: params.userId === raw.organizer_user_id,
      responseStatus: 'PENDING',
    });

    const attendeeWithUser: CalendarEventAttendeeWithUser = {
      ...attendee,
      user: {
        id: targetUser.id,
        displayName: targetUser.display_name,
        email: targetUser.email,
        avatarUrl: targetUser.avatar_url,
      },
    };

    // Realtime notification
    eventPublisher
      .publish('calendar.attendee.added', `user:${params.userId}`, {
        eventId,
        attendee: attendeeWithUser,
      })
      .catch((err) => console.error('[CalendarService] Realtime attendee added warning:', err));

    // Send invitation notification
    notificationService
      .createNotification({
        recipientId: params.userId,
        actorId: callerId,
        organizationId: raw.organization_id,
        type: 'calendar_invitation',
        title: 'Calendar Invitation',
        body: `You have been invited to "${raw.title}"`,
        resourceType: 'calendar_event',
        resourceId: eventId,
        dataPayload: {
          eventId,
          title: raw.title,
          startAt: new Date(raw.start_at).toISOString(),
          endAt: new Date(raw.end_at).toISOString(),
        },
      })
      .catch((err) => console.error('[CalendarService] Invitation notification warning:', err));

    return attendeeWithUser;
  }

  /**
   * Removes an attendee from an event. Organizer can remove any attendee (except themselves).
   */
  async removeAttendee(callerId: string, eventId: string, userId: string): Promise<void> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }
    if (!auth.isOrganizer) {
      throw new CalendarServiceError(
        PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION,
        'Only the event organizer can remove attendees',
        403
      );
    }
    if (userId === raw.organizer_user_id) {
      throw new CalendarServiceError(
        PHASE10_ERROR_CODES.ORGANIZER_CANNOT_BE_REMOVED,
        'The organizer cannot be removed from their own event',
        400
      );
    }

    await calendarRepository.removeAttendee(eventId, userId);

    eventPublisher
      .publish('calendar.attendee.removed', `user:${userId}`, {
        eventId,
        userId,
      })
      .catch((err) => console.error('[CalendarService] Realtime attendee removed warning:', err));
  }

  /**
   * Lists attendees for an event.
   */
  async listAttendees(callerId: string, eventId: string): Promise<CalendarEventAttendeeWithUser[]> {
    const raw = await calendarRepository.findById(eventId);
    if (!raw) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    const auth = await this.checkEventAccess(callerId, raw);
    if (!auth.canAccess) {
      throw new CalendarServiceError(PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found', 404);
    }

    return calendarRepository.getAttendeesByEventId(eventId);
  }

  /**
   * Lists events within a bounded query window with virtual recurrence expansion.
   */
  async listEvents(callerId: string, query: CalendarEventQuery): Promise<CalendarSyncResponse> {
    const windowStart = new Date(query.start);
    const windowEnd = new Date(query.end);

    const baseEvents = await calendarRepository.listEventsInWindow(callerId, windowStart, windowEnd, {
      organizationId: query.organizationId,
      teamId: query.teamId,
      userId: query.userId,
    });

    const resultEvents: CalendarEventWithDetails[] = [];

    for (const event of baseEvents) {
      if (!event.recurrenceRule) {
        // Non-recurring event directly added
        const details = await this.hydrateEventDetails(event, callerId);
        resultEvents.push(details);
      } else {
        // Expand recurring event instances virtually within [windowStart, windowEnd]
        const expandedInstances = this.expandRecurrence(event, windowStart, windowEnd);
        for (const instance of expandedInstances) {
          const details = await this.hydrateEventDetails(instance, callerId);
          resultEvents.push({
            ...details,
            isVirtualInstance: true,
            instanceDate: instance.startAt,
          });
        }
      }
    }

    return {
      events: resultEvents,
      syncedAt: new Date().toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  /**
   * Availability / Conflict detection for user scheduling.
   * Returns busy intervals without revealing private metadata.
   */
  async getAvailability(
    callerId: string,
    request: CalendarAvailabilityRequest
  ): Promise<CalendarAvailabilityResponse> {
    if (request.organizationId) {
      const orgAuth = await authorizationService.getOrganizationAuth(callerId, request.organizationId);
      if (!orgAuth.isMember) {
        throw new CalendarServiceError(
          PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_ACCESS,
          'You are not an active member of the specified organization',
          403
        );
      }
    }

    const windowStart = new Date(request.start);
    const windowEnd = new Date(request.end);

    const busyRows = await calendarRepository.getUserBusyBlocks(
      request.userIds,
      windowStart,
      windowEnd
    );

    const busyBlocks: Record<string, CalendarAvailabilityBlock[]> = {};
    for (const uid of request.userIds) {
      busyBlocks[uid] = [];
    }

    for (const row of busyRows) {
      if (busyBlocks[row.user_id]) {
        busyBlocks[row.user_id].push({
          userId: row.user_id,
          start: new Date(row.start_at).toISOString(),
          end: new Date(row.end_at).toISOString(),
          status: row.status as 'busy' | 'tentative',
        });
      }
    }

    return {
      timeZone: 'UTC',
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      busyBlocks,
    };
  }

  /**
   * Background process to deliver due event reminders idempotently.
   */
  async processDueReminders(now: Date = new Date()): Promise<number> {
    const dueReminders = await calendarRepository.getPendingReminders(now);
    let sentCount = 0;

    for (const reminder of dueReminders) {
      try {
        await notificationService.createNotification({
          recipientId: reminder.user_id,
          actorId: null,
          organizationId: reminder.organization_id,
          type: 'calendar_reminder',
          title: 'Event Reminder',
          body: `Upcoming: "${reminder.event_title}" starts in ${reminder.minutes_before} minutes`,
          resourceType: 'calendar_event',
          resourceId: reminder.event_id,
          dataPayload: {
            eventId: reminder.event_id,
            title: reminder.event_title,
            startAt: new Date(reminder.event_start_at).toISOString(),
            minutesBefore: reminder.minutes_before,
          },
        });

        await calendarRepository.markReminderSent(reminder.id);
        sentCount++;
      } catch (err) {
        console.error(`[CalendarService] Failed to send reminder ${reminder.id}:`, err);
      }
    }

    return sentCount;
  }

  /**
   * Virtual recurrence expansion bounded by query window.
   */
  private expandRecurrence(
    event: CalendarEvent,
    windowStart: Date,
    windowEnd: Date
  ): CalendarEvent[] {
    const instances: CalendarEvent[] = [];
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);
    const durationMs = eventEnd.getTime() - eventStart.getTime();

    const rule = event.recurrenceRule || '';
    const freqMatch = rule.match(/FREQ=([A-Z]+)/i);
    if (!freqMatch) return instances;

    const freq = freqMatch[1].toUpperCase();
    const intervalMatch = rule.match(/INTERVAL=([0-9]+)/i);
    const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;

    const countMatch = rule.match(/COUNT=([0-9]+)/i);
    const maxCount = countMatch ? parseInt(countMatch[1], 10) : 100;

    let untilDate: Date | null = null;
    if (event.recurrenceUntil) {
      untilDate = new Date(event.recurrenceUntil);
    }

    let current = new Date(eventStart);
    let generated = 0;
    const safetyLimit = 100; // Hard bounded max instances per query window to prevent DoS

    while (generated < maxCount && generated < safetyLimit) {
      if (untilDate && current.getTime() > untilDate.getTime()) break;
      if (current.getTime() >= windowEnd.getTime()) break;

      const instanceEnd = new Date(current.getTime() + durationMs);

      // Check if instance overlaps with query window
      if (current.getTime() < windowEnd.getTime() && instanceEnd.getTime() > windowStart.getTime()) {
        instances.push({
          ...event,
          startAt: current.toISOString(),
          endAt: instanceEnd.toISOString(),
        });
      }

      generated++;

      // Advance by frequency & interval
      if (freq === 'DAILY') {
        current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
      } else if (freq === 'WEEKLY') {
        current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
      } else if (freq === 'MONTHLY') {
        const nextMonth = new Date(current);
        nextMonth.setMonth(nextMonth.getMonth() + interval);
        current = nextMonth;
      } else if (freq === 'YEARLY') {
        const nextYear = new Date(current);
        nextYear.setFullYear(nextYear.getFullYear() + interval);
        current = nextYear;
      } else {
        break;
      }
    }

    return instances;
  }

  /**
   * Helper to publish realtime calendar event over appropriate topics.
   */
  private async publishRealtimeCalendarEvent(
    eventName: any,
    event: CalendarEventWithDetails,
    action: 'created' | 'updated' | 'deleted'
  ): Promise<void> {
    const payload = { event, action };

    // 1. Deliver to organizer user topic
    await eventPublisher.publish(eventName, `user:${event.organizerUserId}`, payload);

    // 2. Deliver to each attendee user topic
    if (event.attendees) {
      for (const attendee of event.attendees) {
        if (attendee.userId !== event.organizerUserId) {
          await eventPublisher.publish(eventName, `user:${attendee.userId}`, payload);
        }
      }
    }

    // 3. For ORGANIZATION visibility, also publish to organization topic
    if (event.visibility === 'ORGANIZATION' && event.organizationId) {
      await eventPublisher.publish(eventName, `organization:${event.organizationId}`, payload);
    }

    // 4. For TEAM visibility, also publish to team topic
    if (event.visibility === 'TEAM' && event.teamId) {
      await eventPublisher.publish(eventName, `team:${event.teamId}`, payload);
    }
  }
}

export const calendarService = new CalendarService();
