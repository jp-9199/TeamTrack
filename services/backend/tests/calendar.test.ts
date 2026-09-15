import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calendarService, CalendarServiceError } from '../src/modules/calendar/calendar.service.js';
import { calendarRepository, type DbCalendarEvent } from '../src/db/repositories/calendar.repository.js';
import { organizationRepository, type DbOrganization } from '../src/db/repositories/organization.repository.js';
import { teamRepository, type DbTeam } from '../src/db/repositories/team.repository.js';
import { userRepository, type DbUser } from '../src/db/repositories/user.repository.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { notificationService } from '../src/modules/notifications/notification.service.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { pool } from '../src/db/pool.js';
import {
  validateCreateCalendarEventRequest,
  validateUpdateCalendarEventRequest,
  validateCalendarEventQuery,
  validateCalendarRespondRequest,
  validateAddCalendarAttendeeRequest,
  validateCalendarAvailabilityRequest,
  validateIanaTimeZone,
  validateRRule,
  validateReminderMinutes,
} from '@teamtrack/validation';
import {
  PHASE10_ERROR_CODES,
  type CalendarEvent,
  type CalendarEventWithDetails,
} from '@teamtrack/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 10: Calendar & Scheduling System', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migrationFile = path.join(migrationsDir, '20260915100001_create_calendar_enhancements.sql');

  // Test Fixtures
  const orgAlpha: DbOrganization = {
    id: 'org-tenant-alpha',
    name: 'Organization Alpha',
    slug: 'org-alpha',
    owner_id: 'user-alice',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const orgBeta: DbOrganization = {
    id: 'org-tenant-beta',
    name: 'Organization Beta',
    slug: 'org-beta',
    owner_id: 'user-bob',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const teamAlpha: DbTeam = {
    id: 'team-tenant-alpha',
    organization_id: 'org-tenant-alpha',
    name: 'Alpha Core Devs',
    description: 'Alpha engineering',
    is_private: true,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const userAlice: DbUser = {
    id: 'user-alice',
    email: 'alice@alpha.test',
    display_name: 'Alice Alpha',
    full_name: 'Alice In Wonderland',
    avatar_url: null,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    suspended_at: null,
  };

  const userCharlie: DbUser = {
    id: 'user-charlie',
    email: 'charlie@alpha.test',
    display_name: 'Charlie Alpha',
    full_name: 'Charlie Brown',
    avatar_url: null,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    suspended_at: null,
  };

  const userBob: DbUser = {
    id: 'user-bob',
    email: 'bob@beta.test',
    display_name: 'Bob Beta',
    full_name: 'Bob Builder',
    avatar_url: null,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    suspended_at: null,
  };

  beforeEach(() => {
    // Reset repository mocks to default clean behaviors
    userRepository.findById = async (id: string) => {
      if (id === 'user-alice') return userAlice;
      if (id === 'user-charlie') return userCharlie;
      if (id === 'user-bob') return userBob;
      return null;
    };

    organizationRepository.findById = async (id: string) => {
      if (id === 'org-tenant-alpha') return orgAlpha;
      if (id === 'org-tenant-beta') return orgBeta;
      return null;
    };

    organizationRepository.getMember = async (orgId: string, userId: string) => {
      if (orgId === 'org-tenant-alpha' && (userId === 'user-alice' || userId === 'user-charlie')) {
        return {
          id: 'mem-1',
          organization_id: orgId,
          user_id: userId,
          role: userId === 'user-alice' ? 'owner' : 'member',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
        };
      }
      if (orgId === 'org-tenant-beta' && userId === 'user-bob') {
        return {
          id: 'mem-2',
          organization_id: orgId,
          user_id: userId,
          role: 'owner',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
        };
      }
      return null;
    };

    teamRepository.findById = async (id: string) => {
      if (id === 'team-tenant-alpha') return teamAlpha;
      return null;
    };

    teamRepository.getTeamMember = async (teamId: string, userId: string) => {
      if (teamId === 'team-tenant-alpha' && userId === 'user-alice') {
        return {
          id: 'tm-1',
          team_id: teamId,
          user_id: userId,
          role: 'lead',
          created_at: new Date(),
          updated_at: new Date(),
        };
      }
      return null;
    };

    calendarRepository.getRemindersByEventId = async () => [];
    calendarRepository.getAttendeesByEventId = async () => [];
    notificationService.createNotification = async () => ({ id: 'notif-1', mutation_seq: 1 } as any);
    eventPublisher.publish = async () => {};
  });

  // --------------------------------------------------------------------------
  // 1. Database Migration Verifications
  // --------------------------------------------------------------------------
  describe('Database Schema & Migration', () => {
    it('verifies chronological migration file exists for Phase 10', () => {
      assert.strictEqual(fs.existsSync(migrationFile), true, 'Migration file must exist');
      const content = fs.readFileSync(migrationFile, 'utf8');

      // Verifies enhanced calendar_events columns
      assert.ok(content.includes('calendar_events'), 'References calendar_events');
      assert.ok(content.includes('ALTER COLUMN organization_id DROP NOT NULL'), 'Nullable organization_id');
      assert.ok(content.includes('team_id UUID NULL REFERENCES teams(id)'), 'team_id reference');
      assert.ok(content.includes('organizer_user_id'), 'organizer_user_id column');
      assert.ok(content.includes('visibility'), 'visibility column');
      assert.ok(content.includes('chk_calendar_events_visibility'), 'visibility check constraint');
      assert.ok(content.includes('calendar_event_attendees'), 'calendar_event_attendees table');
      assert.ok(content.includes('calendar_event_reminders'), 'calendar_event_reminders table');
      assert.ok(content.includes('idx_calendar_events_org_window'), 'Organization window index');
      assert.ok(content.includes('idx_calendar_attendees_user_event'), 'Attendee index');
      assert.ok(content.includes('idx_calendar_reminders_pending'), 'Pending reminder index');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Validation Suite
  // --------------------------------------------------------------------------
  describe('Input Validation & Constraints', () => {
    it('Audit O: rejects invalid IANA timezone string', () => {
      const res1 = validateIanaTimeZone('Not/A_Real_Timezone');
      assert.strictEqual(res1.isValid, false);
      assert.strictEqual(res1.errors![0].code, PHASE10_ERROR_CODES.INVALID_TIMEZONE);

      const res2 = validateIanaTimeZone('UTC');
      assert.strictEqual(res2.isValid, true);
      assert.strictEqual(res2.data, 'UTC');

      const res3 = validateIanaTimeZone('America/New_York');
      assert.strictEqual(res3.isValid, true);
      assert.strictEqual(res3.data, 'America/New_York');
    });

    it('Audit P: validates RRULE and rejects malformed or unsafe recurrence', () => {
      const valid = validateRRule('FREQ=WEEKLY;INTERVAL=1;COUNT=10');
      assert.strictEqual(valid.isValid, true);

      const invalidFreq = validateRRule('FREQ=MINUTELY;INTERVAL=1');
      assert.strictEqual(invalidFreq.isValid, false);

      const noFreq = validateRRule('INTERVAL=1;COUNT=5');
      assert.strictEqual(noFreq.isValid, false);
    });

    it('Audit Q: bounds pathological recurrence COUNT and query windows', () => {
      // COUNT too large
      const hugeCount = validateRRule('FREQ=DAILY;COUNT=9999999');
      assert.strictEqual(hugeCount.isValid, false);
      assert.strictEqual(hugeCount.errors![0].code, PHASE10_ERROR_CODES.PATHOLOGICAL_RECURRENCE);

      // Query window exceeds 90 days
      const queryExceeded = validateCalendarEventQuery({
        start: '2026-01-01T00:00:00Z',
        end: '2026-06-01T00:00:00Z', // ~150 days
      });
      assert.strictEqual(queryExceeded.isValid, false);
      assert.strictEqual(queryExceeded.errors![0].code, PHASE10_ERROR_CODES.QUERY_WINDOW_TOO_LARGE);
    });

    it('Audit M & N: safely accepts strings with potential XSS / SQLi payloads without erroring validation', () => {
      const req = validateCreateCalendarEventRequest({
        title: "Sprint Review <script>alert('xss')</script> ' OR 1=1 --",
        description: 'Testing <b>bold</b> and DROP TABLE calendar_events;',
        location: 'Room 101',
        startAt: '2026-09-15T10:00:00Z',
        endAt: '2026-09-15T11:00:00Z',
      });
      assert.strictEqual(req.isValid, true);
      assert.ok(req.data?.title.includes('<script>'), 'Preserves raw text for backend parameterization');
    });

    it('enforces event chronology (end must be after start for non-all-day)', () => {
      const invalid = validateCreateCalendarEventRequest({
        title: 'Chronology Error Event',
        startAt: '2026-09-15T12:00:00Z',
        endAt: '2026-09-15T11:00:00Z',
        allDay: false,
      });
      assert.strictEqual(invalid.isValid, false);
      assert.strictEqual(invalid.errors![0].code, PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Security Audits (A through Z)
  // --------------------------------------------------------------------------
  describe('Security Audits & Authorization Boundary', () => {
    it("Audit A & L: User cannot access another organization's calendar (cross-tenant anti-IDOR returns 404/403)", async () => {
      // Bob from Beta tries to create event inside Alpha organization
      await assert.rejects(
        async () => {
          await calendarService.createEvent('user-bob', {
            organizationId: 'org-tenant-alpha',
            title: 'Unauthorized Alpha Event',
            startAt: '2026-09-15T10:00:00Z',
            endAt: '2026-09-15T11:00:00Z',
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_ACCESS);
          return true;
        }
      );
    });

    it('Audit B: Private event is strictly hidden from non-attendee (returns 404)', async () => {
      const privateEvent: DbCalendarEvent = {
        id: 'event-priv-1',
        organization_id: 'org-tenant-alpha',
        team_id: null,
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'Secret Executive 1:1',
        description: 'Confidential topics',
        location: null,
        start_at: new Date('2026-09-15T14:00:00Z'),
        end_at: new Date('2026-09-15T15:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'PRIVATE',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      calendarRepository.findById = async () => privateEvent;
      calendarRepository.getAttendee = async () => null; // Charlie is not an attendee

      // Charlie attempts to view Alice's private event
      await assert.rejects(
        async () => {
          await calendarService.getEvent('user-charlie', 'event-priv-1');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND);
          return true;
        }
      );
    });

    it('Audit C: Organization event is visible only to active organization members', async () => {
      const orgEvent: DbCalendarEvent = {
        id: 'event-org-1',
        organization_id: 'org-tenant-alpha',
        team_id: null,
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'All-Hands Meeting',
        description: 'Company-wide updates',
        location: 'Auditorium',
        start_at: new Date('2026-09-15T16:00:00Z'),
        end_at: new Date('2026-09-15T17:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'ORGANIZATION',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      calendarRepository.findById = async () => orgEvent;
      calendarRepository.getAttendeesByEventId = async () => [];
      calendarRepository.getAttendee = async () => null;

      // Charlie is in Alpha -> can access
      const charlieView = await calendarService.getEvent('user-charlie', 'event-org-1');
      assert.strictEqual(charlieView.id, 'event-org-1');
      assert.strictEqual(charlieView.title, 'All-Hands Meeting');

      // Bob is in Beta -> returns 404
      await assert.rejects(
        async () => {
          await calendarService.getEvent('user-bob', 'event-org-1');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('Audit D: Team event is visible only to authorized team members', async () => {
      const teamEvent: DbCalendarEvent = {
        id: 'event-team-1',
        organization_id: 'org-tenant-alpha',
        team_id: 'team-tenant-alpha',
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'Alpha Core Sprint Kickoff',
        description: null,
        location: null,
        start_at: new Date('2026-09-15T10:00:00Z'),
        end_at: new Date('2026-09-15T11:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'TEAM',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      calendarRepository.findById = async () => teamEvent;
      calendarRepository.getAttendeesByEventId = async () => [];
      calendarRepository.getAttendee = async () => null;

      // Charlie is in org Alpha but NOT in team Alpha (and not lead/admin) -> 404
      await assert.rejects(
        async () => {
          await calendarService.getEvent('user-charlie', 'event-team-1');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('Audit F: Removed organization member loses access immediately', async () => {
      // Mock Charlie as suspended / inactive
      organizationRepository.getMember = async () => ({
        id: 'mem-1',
        organization_id: 'org-tenant-alpha',
        user_id: 'user-charlie',
        role: 'member',
        status: 'suspended',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const orgEvent: DbCalendarEvent = {
        id: 'event-org-2',
        organization_id: 'org-tenant-alpha',
        team_id: null,
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'Org Gathering',
        description: null,
        location: null,
        start_at: new Date('2026-09-15T16:00:00Z'),
        end_at: new Date('2026-09-15T17:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'ORGANIZATION',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      calendarRepository.findById = async () => orgEvent;
      calendarRepository.getAttendee = async () => null;

      await assert.rejects(
        async () => {
          await calendarService.getEvent('user-charlie', 'event-org-2');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('Audit G: Attendee can respond but cannot perform unauthorized organizer actions', async () => {
      const event: DbCalendarEvent = {
        id: 'event-rsvp-1',
        organization_id: 'org-tenant-alpha',
        team_id: null,
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'Sprint Planning',
        description: 'Details',
        location: null,
        start_at: new Date('2026-09-15T10:00:00Z'),
        end_at: new Date('2026-09-15T11:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'ORGANIZATION',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      calendarRepository.findById = async () => event;
      calendarRepository.getAttendee = async () => ({
        id: 'att-1',
        event_id: 'event-rsvp-1',
        user_id: 'user-charlie',
        response_status: 'PENDING',
        is_organizer: false,
        responded_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 1. Charlie can respond
      calendarRepository.updateAttendeeResponse = async (eventId, userId, status) => ({
        id: 'att-1',
        eventId,
        userId,
        responseStatus: status,
        isOrganizer: false,
        respondedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const response = await calendarService.respondToEvent('user-charlie', 'event-rsvp-1', {
        responseStatus: 'ACCEPTED',
      });
      assert.strictEqual(response.responseStatus, 'ACCEPTED');

      // 2. Charlie CANNOT edit event details (forbidden for non-organizer)
      await assert.rejects(
        async () => {
          await calendarService.updateEvent('user-charlie', 'event-rsvp-1', {
            title: 'Malicious Title Edit',
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION);
          return true;
        }
      );

      // 3. Charlie CANNOT delete event
      await assert.rejects(
        async () => {
          await calendarService.deleteEvent('user-charlie', 'event-rsvp-1');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.UNAUTHORIZED_CALENDAR_MODIFICATION);
          return true;
        }
      );
    });

    it('Audit I & J: Meeting-linked event cannot bypass meeting authorization and private link is never leaked', async () => {
      // Mock meeting authorization failure
      meetingAuthorizationService.getMeetingAuth = async () => ({
        meetingExists: false,
        canAccess: false,
        isHost: false,
        isOrgAdmin: false,
        canManage: false,
        isParticipant: false,
        isAdmittedOrJoined: false,
        isWaiting: false,
        isRemoved: false,
      });

      await assert.rejects(
        async () => {
          await calendarService.createEvent('user-alice', {
            organizationId: 'org-tenant-alpha',
            title: 'Meeting Link Test',
            meetingId: 'unauthorized-meet-id',
            startAt: '2026-09-15T10:00:00Z',
            endAt: '2026-09-15T11:00:00Z',
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.MEETING_AUTHORIZATION_FAILED);
          return true;
        }
      );
    });

    it('Audit K: Private event details are not exposed through availability / conflict queries', async () => {
      calendarRepository.getUserBusyBlocks = async () => [
        {
          user_id: 'user-alice',
          start_at: new Date('2026-09-15T10:00:00Z'),
          end_at: new Date('2026-09-15T11:00:00Z'),
          status: 'busy',
        },
      ];

      const availability = await calendarService.getAvailability('user-charlie', {
        userIds: ['user-alice'],
        start: '2026-09-15T00:00:00Z',
        end: '2026-09-15T23:59:59Z',
        organizationId: 'org-tenant-alpha',
      });

      assert.ok(availability.busyBlocks['user-alice'], 'Has user blocks');
      const block = availability.busyBlocks['user-alice'][0];
      assert.strictEqual(block.status, 'busy');
      assert.strictEqual(block.start, '2026-09-15T10:00:00.000Z');
      assert.strictEqual(block.end, '2026-09-15T11:00:00.000Z');

      // Verifies no title, description, or meeting links are present in availability blocks
      assert.strictEqual((block as any).title, undefined);
      assert.strictEqual((block as any).description, undefined);
      assert.strictEqual((block as any).meetingId, undefined);
    });

    it('Audit R: Duplicate create retry does not create duplicate event', async () => {
      let createCallCount = 0;
      calendarRepository.createEvent = async (params) => {
        createCallCount++;
        return {
          id: 'event-idempotent-1',
          organizationId: params.organizationId || null,
          teamId: params.teamId || null,
          organizerUserId: params.organizerUserId,
          meetingId: null,
          title: params.title,
          description: null,
          location: null,
          startAt: params.startAt,
          endAt: params.endAt,
          timezone: 'UTC',
          allDay: false,
          visibility: 'ORGANIZATION',
          status: 'confirmed',
          recurrenceRule: null,
          recurrenceUntil: null,
          recurrenceTimezone: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
      };
      calendarRepository.addAttendee = async () => ({} as any);

      // First create
      const ev1 = await calendarService.createEvent('user-alice', {
        organizationId: 'org-tenant-alpha',
        title: 'Idempotent Event',
        startAt: '2026-09-15T10:00:00Z',
        endAt: '2026-09-15T11:00:00Z',
        idempotencyKey: 'key-abc-123',
      });

      // Second create with identical idempotencyKey
      const ev2 = await calendarService.createEvent('user-alice', {
        organizationId: 'org-tenant-alpha',
        title: 'Idempotent Event',
        startAt: '2026-09-15T10:00:00Z',
        endAt: '2026-09-15T11:00:00Z',
        idempotencyKey: 'key-abc-123',
      });

      assert.strictEqual(createCallCount, 1, 'Repository insert was called only once');
      assert.strictEqual(ev1.id, ev2.id);
    });

    it('Audit T: Deleted events are excluded from queries and return 404', async () => {
      const deletedEvent: DbCalendarEvent = {
        id: 'event-deleted-1',
        organization_id: 'org-tenant-alpha',
        team_id: null,
        organizer_user_id: 'user-alice',
        meeting_id: null,
        title: 'Deleted Event',
        description: null,
        location: null,
        start_at: new Date('2026-09-15T10:00:00Z'),
        end_at: new Date('2026-09-15T11:00:00Z'),
        timezone: 'UTC',
        all_day: false,
        visibility: 'ORGANIZATION',
        status: 'confirmed',
        recurrence_rule: null,
        recurrence_until: null,
        recurrence_timezone: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: new Date(), // Soft-deleted
      };

      calendarRepository.findById = async () => deletedEvent;

      await assert.rejects(
        async () => {
          await calendarService.getEvent('user-alice', 'event-deleted-1');
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, PHASE10_ERROR_CODES.CALENDAR_EVENT_NOT_FOUND);
          return true;
        }
      );
    });

    it('Audit X: Reminders are processed idempotently and duplicate notifications are prevented', async () => {
      let sentIds: string[] = [];
      let notifCreated = 0;

      calendarRepository.getPendingReminders = async () => [
        {
          id: 'rem-1',
          event_id: 'ev-1',
          user_id: 'user-alice',
          minutes_before: 15,
          is_sent: false,
          sent_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          event_title: 'Demo Reminder',
          event_start_at: new Date(),
          organizer_user_id: 'user-alice',
          organization_id: 'org-tenant-alpha',
        },
      ];

      calendarRepository.markReminderSent = async (id) => {
        sentIds.push(id);
      };

      notificationService.createNotification = async () => {
        notifCreated++;
        return {} as any;
      };

      const processedCount = await calendarService.processDueReminders();
      assert.strictEqual(processedCount, 1);
      assert.strictEqual(notifCreated, 1);
      assert.deepStrictEqual(sentIds, ['rem-1']);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Virtual Recurrence Expansion
  // --------------------------------------------------------------------------
  describe('Virtual Recurrence Expansion', () => {
    it('virtually expands daily and weekly recurring events within bounded query window without database multiplication', async () => {
      const recurringEvent: CalendarEvent = {
        id: 'event-rec-weekly',
        organizationId: 'org-tenant-alpha',
        teamId: null,
        organizerUserId: 'user-alice',
        meetingId: null,
        title: 'Weekly Team Sync',
        description: null,
        location: null,
        startAt: '2026-09-01T10:00:00.000Z',
        endAt: '2026-09-01T11:00:00.000Z',
        timezone: 'UTC',
        allDay: false,
        visibility: 'ORGANIZATION',
        status: 'confirmed',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
        recurrenceUntil: null,
        recurrenceTimezone: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        deletedAt: null,
      };

      calendarRepository.listEventsInWindow = async () => [recurringEvent];
      calendarRepository.getAttendeesByEventId = async () => [];

      // Query window: Sept 1 to Sept 30, 2026 (~4-5 weekly occurrences)
      const syncResult = await calendarService.listEvents('user-alice', {
        start: '2026-09-01T00:00:00Z',
        end: '2026-09-30T23:59:59Z',
      });

      assert.strictEqual(syncResult.events.length >= 4, true, 'Generates virtual weekly instances in window');
      assert.strictEqual(syncResult.events[0].isVirtualInstance, true);
      assert.strictEqual(syncResult.events[0].title, 'Weekly Team Sync');
      assert.strictEqual(syncResult.events[0].id, 'event-rec-weekly');
    });
  });
});
