import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '../src/index.js';
import type {
  CalendarEventWithDetails,
  CalendarEventAttendee,
  CalendarEventAttendeeWithUser,
  CalendarAvailabilityResponse,
  CalendarSyncResponse,
} from '@teamtrack/shared-types';

describe('Phase 10: ApiClient Calendar & Scheduling Methods', () => {
  let originalFetch: typeof globalThis.fetch;
  let lastRequest: { url: string; method: string; body?: any; headers?: any } | null = null;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupMockFetch(responseData: any, status = 200) {
    globalThis.fetch = (async (url: any, init: any) => {
      lastRequest = {
        url: url.toString(),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
        headers: init?.headers,
      };

      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: status >= 200 && status < 300,
          data: responseData,
          timestamp: new Date().toISOString(),
        }),
      } as any;
    }) as any;
  }

  it('1. createCalendarEvent sends POST to /api/v1/calendar/events with body', async () => {
    const mockEvent: CalendarEventWithDetails = {
      id: 'ev-100',
      organizationId: 'org-1',
      teamId: null,
      organizerUserId: 'user-1',
      title: 'Quarterly Planning',
      description: 'Review Q4 roadmaps',
      location: 'Conference Room 1',
      startAt: '2026-09-15T10:00:00Z',
      endAt: '2026-09-15T11:00:00Z',
      timezone: 'UTC',
      allDay: false,
      visibility: 'ORGANIZATION',
      status: 'confirmed',
      meetingId: null,
      recurrenceRule: null,
      recurrenceUntil: null,
      recurrenceTimezone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      organizer: {
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@test.com',
        avatarUrl: null,
      },
      attendees: [],
    };

    setupMockFetch(mockEvent, 201);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.createCalendarEvent({
      title: 'Quarterly Planning',
      description: 'Review Q4 roadmaps',
      location: 'Conference Room 1',
      startAt: '2026-09-15T10:00:00Z',
      endAt: '2026-09-15T11:00:00Z',
      visibility: 'ORGANIZATION',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events');
    assert.strictEqual(lastRequest?.body.title, 'Quarterly Planning');
    assert.strictEqual(res.data.id, 'ev-100');
  });

  it('2. listCalendarEvents sends GET to /api/v1/calendar/events with bounded query parameters', async () => {
    const mockSync: CalendarSyncResponse = {
      events: [],
      syncedAt: new Date().toISOString(),
      windowStart: '2026-09-01T00:00:00Z',
      windowEnd: '2026-09-30T23:59:59Z',
    };

    setupMockFetch(mockSync);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.listCalendarEvents({
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-30T23:59:59Z',
      organizationId: 'org-1',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/calendar/events?start=2026-09-01T00%3A00%3A00Z&end=2026-09-30T23%3A59%3A59Z&organizationId=org-1'
    );
  });

  it('3. getCalendarEvent sends GET to /api/v1/calendar/events/:eventId', async () => {
    setupMockFetch({ id: 'ev-100', title: 'Test Event' });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getCalendarEvent('ev-100');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100');
  });

  it('4. updateCalendarEvent sends PATCH to /api/v1/calendar/events/:eventId', async () => {
    setupMockFetch({ id: 'ev-100', title: 'Updated Title' });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.updateCalendarEvent('ev-100', { title: 'Updated Title' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'PATCH');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100');
    assert.strictEqual(lastRequest?.body.title, 'Updated Title');
  });

  it('5. deleteCalendarEvent sends DELETE to /api/v1/calendar/events/:eventId', async () => {
    setupMockFetch(null);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.deleteCalendarEvent('ev-100');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100');
  });

  it('6. respondToCalendarEvent sends POST to /api/v1/calendar/events/:eventId/respond', async () => {
    const mockAttendee: CalendarEventAttendee = {
      id: 'att-1',
      eventId: 'ev-100',
      userId: 'user-charlie',
      responseStatus: 'ACCEPTED',
      isOrganizer: false,
      respondedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setupMockFetch(mockAttendee);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.respondToCalendarEvent('ev-100', { responseStatus: 'ACCEPTED' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100/respond');
    assert.strictEqual(lastRequest?.body.responseStatus, 'ACCEPTED');
  });

  it('7. addCalendarAttendee sends POST to /api/v1/calendar/events/:eventId/attendees', async () => {
    setupMockFetch({ id: 'att-2', userId: 'user-2' });
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.addCalendarAttendee('ev-100', { userId: 'user-2' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'POST');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100/attendees');
    assert.strictEqual(lastRequest?.body.userId, 'user-2');
  });

  it('8. removeCalendarAttendee sends DELETE to /api/v1/calendar/events/:eventId/attendees/:userId', async () => {
    setupMockFetch(null);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.removeCalendarAttendee('ev-100', 'user-2');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'DELETE');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100/attendees/user-2');
  });

  it('9. listCalendarAttendees sends GET to /api/v1/calendar/events/:eventId/attendees', async () => {
    setupMockFetch([]);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.listCalendarAttendees('ev-100');
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(lastRequest?.url, 'http://localhost:4000/api/v1/calendar/events/ev-100/attendees');
  });

  it('10. getCalendarAvailability sends GET to /api/v1/calendar/availability with params', async () => {
    const mockAvail: CalendarAvailabilityResponse = {
      timeZone: 'UTC',
      windowStart: '2026-09-15T00:00:00Z',
      windowEnd: '2026-09-15T23:59:59Z',
      busyBlocks: { 'user-1': [] },
    };

    setupMockFetch(mockAvail);
    const client = createApiClient({ baseUrl: 'http://localhost:4000', platform: 'web' });
    client.setAccessToken('auth-token');

    const res = await client.getCalendarAvailability({
      userIds: ['user-1', 'user-2'],
      start: '2026-09-15T00:00:00Z',
      end: '2026-09-15T23:59:59Z',
      organizationId: 'org-1',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(lastRequest?.method, 'GET');
    assert.strictEqual(
      lastRequest?.url,
      'http://localhost:4000/api/v1/calendar/availability?userIds=user-1%2Cuser-2&start=2026-09-15T00%3A00%3A00Z&end=2026-09-15T23%3A59%3A59Z&organizationId=org-1'
    );
  });
});
