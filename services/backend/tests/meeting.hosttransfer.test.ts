import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MeetingService, MeetingServiceError } from '../src/modules/meetings/meeting.service.js';
import { meetingRepository, type DbMeeting } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { PHASE7_ERROR_CODES } from '@teamtrack/shared-types';

describe('Phase 7: Host Transfer & Concurrency Protection', () => {
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

  function createMockMeeting(overrides?: Partial<DbMeeting>): DbMeeting {
    return {
      id: 'meeting-ht-1',
      organization_id: 'org-1',
      title: 'Host Transfer Test',
      description: null,
      scheduled_start_at: null,
      actual_start_at: new Date(),
      actual_end_at: null,
      status: 'active',
      host_id: 'user-host-1',
      waiting_room_enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  }

  it('transfers host ownership transactionally with row lock', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;
    const origFindForUpdate = meetingRepository.findForUpdate;
    const origGetPart = meetingParticipantRepository.getParticipant;
    const origUpdateHost = meetingRepository.updateHost;
    const origUpdateRole = meetingParticipantRepository.updateRole;

    let rowLockedMeetingId: string | null = null;
    let newHostAssigned: string | null = null;
    const roleUpdates: { userId: string; role: string }[] = [];

    try {
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: true,
        canManage: true,
        isParticipant: true,
        isAdmittedOrJoined: true,
        isWaiting: false,
        isRemoved: false,
        meeting: createMockMeeting(),
        participant: null,
      });

      meetingRepository.findForUpdate = async (mid) => {
        rowLockedMeetingId = mid;
        return createMockMeeting();
      };

      meetingParticipantRepository.getParticipant = async (_mid, uid) => {
        if (uid === 'user-eligible-2') {
          return {
            id: 'part-2',
            meeting_id: 'meeting-ht-1',
            user_id: uid,
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
          };
        }
        return null;
      };

      meetingRepository.updateHost = async (_mid, newHost) => {
        newHostAssigned = newHost;
        return meetingRepository.mapMeeting(createMockMeeting({ host_id: newHost }));
      };

      meetingParticipantRepository.updateRole = async (_mid, uid, role) => {
        roleUpdates.push({ userId: uid, role });
        return {} as any;
      };

      const updated = await meetingService.transferHost('user-host-1', 'meeting-ht-1', {
        newHostUserId: 'user-eligible-2',
      });

      assert.strictEqual(rowLockedMeetingId, 'meeting-ht-1', 'Must acquire FOR UPDATE row lock');
      assert.strictEqual(newHostAssigned, 'user-eligible-2');
      assert.strictEqual(updated.hostId, 'user-eligible-2');

      // Verify participant roles updated: old host -> attendee, new host -> host
      assert.strictEqual(roleUpdates.length, 2);
      assert.deepStrictEqual(roleUpdates[0], { userId: 'user-host-1', role: 'attendee' });
      assert.deepStrictEqual(roleUpdates[1], { userId: 'user-eligible-2', role: 'host' });

      // Post-commit: publishes meeting.host_changed
      assert.strictEqual(publishedEvents.length, 1);
      assert.strictEqual(publishedEvents[0].event, 'meeting.host_changed');
      assert.strictEqual(publishedEvents[0].payload.newHostUserId, 'user-eligible-2');
      assert.strictEqual(publishedEvents[0].payload.previousHostUserId, 'user-host-1');
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
      meetingRepository.findForUpdate = origFindForUpdate;
      meetingParticipantRepository.getParticipant = origGetPart;
      meetingRepository.updateHost = origUpdateHost;
      meetingParticipantRepository.updateRole = origUpdateRole;
    }
  });

  it('rejects transfer when transferring to oneself', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;

    try {
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: true,
        canManage: true,
        isParticipant: true,
        isAdmittedOrJoined: true,
        isWaiting: false,
        isRemoved: false,
        meeting: createMockMeeting({ host_id: 'user-host-1' }),
        participant: null,
      });

      await assert.rejects(
        async () =>
          meetingService.transferHost('user-host-1', 'meeting-ht-1', {
            newHostUserId: 'user-host-1',
          }),
        (err: any) => {
          assert.strictEqual(err.code, PHASE7_ERROR_CODES.CANNOT_TRANSFER_TO_SELF);
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
    }
  });

  it('rejects transfer when requested by a non-host participant', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;

    try {
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: false,
        canManage: false,
        isParticipant: true,
        isAdmittedOrJoined: true,
        isWaiting: false,
        isRemoved: false,
        meeting: createMockMeeting({ host_id: 'user-host-1' }),
        participant: null,
      });

      await assert.rejects(
        async () =>
          meetingService.transferHost('user-attendee', 'meeting-ht-1', {
            newHostUserId: 'user-other',
          }),
        (err: any) => {
          assert.strictEqual(err.code, PHASE7_ERROR_CODES.NOT_MEETING_HOST);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
    }
  });
});
