import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MeetingService, MeetingServiceError } from '../src/modules/meetings/meeting.service.js';
import { meetingRepository, type DbMeeting } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository, type DbMeetingParticipant } from '../src/db/repositories/meetingParticipant.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { PHASE7_ERROR_CODES } from '@teamtrack/shared-types';

describe('Phase 7: Meeting Lifecycle & State Transitions', () => {
  const meetingService = new MeetingService();
  let origPoolConnect: any;
  let publishedEvents: { event: string; topic: string; payload: any }[] = [];

  beforeEach(() => {
    publishedEvents = [];
    origPoolConnect = pool.connect;
    pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    } as any);

    eventPublisher.publish = async (event: any, topic: string, payload: any) => {
      publishedEvents.push({ event, topic, payload });
      return {} as any;
    };
  });

  afterEach(() => {
    pool.connect = origPoolConnect;
  });

  function createMockDbMeeting(overrides?: Partial<DbMeeting>): DbMeeting {
    return {
      id: 'meeting-1',
      organization_id: 'org-1',
      title: 'Quarterly Planning',
      description: 'Discuss Q3 roadmap',
      scheduled_start_at: new Date(),
      actual_start_at: null,
      actual_end_at: null,
      status: 'scheduled',
      host_id: 'user-host',
      waiting_room_enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  }

  describe('Meeting Creation', () => {
    it('creates meeting with server-authoritative host identity', async () => {
      const origOrgAuth = authorizationService.getOrganizationAuth;
      const origCreate = meetingRepository.create;
      const origUpsertParticipant = meetingParticipantRepository.upsertParticipant;
      const origFindByIdWithHost = meetingRepository.findByIdWithHost;

      try {
        authorizationService.getOrganizationAuth = async () => ({
          isMember: true,
          role: 'member',
          status: 'active',
          canAccess: true,
        });

        meetingRepository.create = async (data) => {
          assert.strictEqual(data.hostId, 'user-host', 'Host ID must be derived from authenticated user');
          assert.strictEqual(data.title, 'Sprint Planning');
          return meetingRepository.mapMeeting(createMockDbMeeting({ title: data.title }));
        };

        meetingParticipantRepository.upsertParticipant = async (data) => ({
          id: 'part-1',
          meeting_id: 'meeting-1',
          user_id: 'user-host',
          role: 'host',
          status: 'joined',
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: new Date(),
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingRepository.findByIdWithHost = async () => ({
          id: 'meeting-1',
          organizationId: 'org-1',
          title: 'Sprint Planning',
          description: null,
          status: 'scheduled',
          hostId: 'user-host',
          waitingRoomEnabled: true,
          scheduledStartAt: new Date().toISOString(),
          startedAt: null,
          endedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          host: {
            id: 'user-host',
            displayName: 'Alice Host',
            email: 'alice@example.com',
            avatarUrl: null,
          },
        });

        const created = await meetingService.createMeeting('user-host', {
          organizationId: 'org-1',
          title: 'Sprint Planning',
          waitingRoomEnabled: true,
        });

        assert.strictEqual(created.title, 'Sprint Planning');
        assert.strictEqual(created.hostId, 'user-host');
        assert.strictEqual(created.status, 'scheduled');

        // Verify post-commit event publication
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.created');
        assert.strictEqual(publishedEvents[0].topic, 'meeting:meeting-1');
      } finally {
        authorizationService.getOrganizationAuth = origOrgAuth;
        meetingRepository.create = origCreate;
        meetingParticipantRepository.upsertParticipant = origUpsertParticipant;
        meetingRepository.findByIdWithHost = origFindByIdWithHost;
      }
    });
  });

  describe('Start Meeting State Machine', () => {
    it('transitions SCHEDULED -> ACTIVE and sets startedAt', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origFindForUpdate = meetingRepository.findForUpdate;
      const origStart = meetingRepository.startMeeting;
      const origFindByIdWithHost = meetingRepository.findByIdWithHost;
      const origUpsertPart = meetingParticipantRepository.upsertParticipant;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'scheduled' }),
          participant: null,
        });

        meetingRepository.findForUpdate = async () => createMockDbMeeting({ status: 'scheduled' });
        meetingRepository.startMeeting = async () => meetingRepository.mapMeeting(createMockDbMeeting({ status: 'active', actual_start_at: new Date() }));
        meetingParticipantRepository.upsertParticipant = async () => ({} as any);
        meetingRepository.findByIdWithHost = async () => ({
          id: 'meeting-1',
          organizationId: 'org-1',
          title: 'Quarterly Planning',
          description: null,
          status: 'active',
          hostId: 'user-host',
          waitingRoomEnabled: true,
          scheduledStartAt: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          host: { id: 'user-host', displayName: 'Host', email: 'host@test.com', avatarUrl: null },
        });

        const started = await meetingService.startMeeting('user-host', 'meeting-1');
        assert.strictEqual(started.status, 'active');
        assert.ok(started.startedAt);

        // Verify post-commit publication
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.started');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingRepository.findForUpdate = origFindForUpdate;
        meetingRepository.startMeeting = origStart;
        meetingRepository.findByIdWithHost = origFindByIdWithHost;
        meetingParticipantRepository.upsertParticipant = origUpsertPart;
      }
    });

    it('rejects start transition when meeting is already ACTIVE', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origFindForUpdate = meetingRepository.findForUpdate;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'active' }),
          participant: null,
        });

        meetingRepository.findForUpdate = async () => createMockDbMeeting({ status: 'active' });

        await assert.rejects(
          async () => meetingService.startMeeting('user-host', 'meeting-1'),
          (err: any) => {
            assert.strictEqual(err.code, PHASE7_ERROR_CODES.MEETING_ALREADY_ACTIVE);
            assert.strictEqual(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingRepository.findForUpdate = origFindForUpdate;
      }
    });

    it('rejects start transition when meeting is ENDED (ended cannot restart)', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origFindForUpdate = meetingRepository.findForUpdate;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'ended' }),
          participant: null,
        });

        meetingRepository.findForUpdate = async () => createMockDbMeeting({ status: 'ended' });

        await assert.rejects(
          async () => meetingService.startMeeting('user-host', 'meeting-1'),
          (err: any) => {
            assert.strictEqual(err.code, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED);
            assert.strictEqual(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingRepository.findForUpdate = origFindForUpdate;
      }
    });
  });

  describe('End Meeting State Machine', () => {
    it('transitions ACTIVE -> ENDED and sets endedAt without deleting records', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origFindForUpdate = meetingRepository.findForUpdate;
      const origEnd = meetingRepository.endMeeting;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'active' }),
          participant: null,
        });

        meetingRepository.findForUpdate = async () => createMockDbMeeting({ status: 'active' });
        meetingRepository.endMeeting = async () => meetingRepository.mapMeeting(createMockDbMeeting({ status: 'ended', actual_end_at: new Date() }));

        const ended = await meetingService.endMeeting('user-host', 'meeting-1');
        assert.strictEqual(ended.status, 'ended');
        assert.ok(ended.endedAt);

        // Verify post-commit publication
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.ended');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingRepository.findForUpdate = origFindForUpdate;
        meetingRepository.endMeeting = origEnd;
      }
    });

    it('rejects ending a meeting that is already ENDED', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origFindForUpdate = meetingRepository.findForUpdate;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'ended' }),
          participant: null,
        });

        meetingRepository.findForUpdate = async () => createMockDbMeeting({ status: 'ended' });

        await assert.rejects(
          async () => meetingService.endMeeting('user-host', 'meeting-1'),
          (err: any) => {
            assert.strictEqual(err.code, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED);
            return true;
          }
        );
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingRepository.findForUpdate = origFindForUpdate;
      }
    });
  });

  describe('Leave and Rejoin Behavior', () => {
    it('leaving updates participant status to LEFT but does NOT end meeting', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origUpdateStatus = meetingParticipantRepository.updateStatus;

      let updatedStatus: string | null = null;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: false,
          canManage: false,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockDbMeeting({ status: 'active' }),
          participant: {
            id: 'part-2',
            meeting_id: 'meeting-1',
            user_id: 'user-attendee',
            role: 'attendee',
            status: 'joined',
            audio_enabled: true,
            video_enabled: true,
            screen_sharing: false,
            hand_raised: false,
            joined_at: new Date(),
            left_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

        meetingParticipantRepository.updateStatus = async (_mid, _uid, status) => {
          updatedStatus = status;
          return {} as any;
        };

        await meetingService.leaveMeeting('user-attendee', 'meeting-1');
        assert.strictEqual(updatedStatus, 'left');

        // Meeting topic notified of participant leave
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.participant.left');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingParticipantRepository.updateStatus = origUpdateStatus;
      }
    });
  });
});
