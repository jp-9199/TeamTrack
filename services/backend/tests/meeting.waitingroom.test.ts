import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MeetingService, MeetingServiceError } from '../src/modules/meetings/meeting.service.js';
import { meetingRepository, type DbMeeting } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { subscriptionManager } from '../src/realtime/subscription.manager.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { PHASE7_ERROR_CODES } from '@teamtrack/shared-types';

describe('Phase 7: Waiting Room & Participant Admission/Removal', () => {
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
      id: 'meeting-wr-1',
      organization_id: 'org-1',
      title: 'Interview',
      description: null,
      scheduled_start_at: null,
      actual_start_at: new Date(),
      actual_end_at: null,
      status: 'active',
      host_id: 'user-host',
      waiting_room_enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  }

  describe('Join & Waiting Room Admission Policy', () => {
    it('places non-host in WAITING state when waiting room is enabled', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origUpsertParticipant = meetingParticipantRepository.upsertParticipant;

      let storedStatus: string | null = null;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: false,
          canManage: false,
          isParticipant: false,
          isAdmittedOrJoined: false,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockMeeting({ waiting_room_enabled: true }),
          participant: null,
        });

        meetingParticipantRepository.upsertParticipant = async (data) => {
          storedStatus = data.status;
          return {
            id: 'part-1',
            meeting_id: 'meeting-wr-1',
            user_id: 'user-candidate',
            role: 'attendee',
            status: data.status,
            audio_enabled: true,
            video_enabled: true,
            screen_sharing: false,
            hand_raised: false,
            joined_at: null,
            left_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
        };

        const result = await meetingService.joinMeeting('user-candidate', 'meeting-wr-1');
        assert.strictEqual(result.participant.status, 'waiting');
        assert.strictEqual(storedStatus, 'waiting');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingParticipantRepository.upsertParticipant = origUpsertParticipant;
      }
    });

    it('bypasses waiting room for host (status is JOINED)', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origUpsertParticipant = meetingParticipantRepository.upsertParticipant;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: true,
          canManage: true,
          isParticipant: true,
          isAdmittedOrJoined: true,
          isWaiting: false,
          isRemoved: false,
          meeting: createMockMeeting({ waiting_room_enabled: true }),
          participant: null,
        });

        meetingParticipantRepository.upsertParticipant = async (data) => ({
          id: 'part-1',
          meeting_id: 'meeting-wr-1',
          user_id: 'user-host',
          role: 'host',
          status: data.status,
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: new Date(),
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const result = await meetingService.joinMeeting('user-host', 'meeting-wr-1');
        assert.strictEqual(result.participant.status, 'joined');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingParticipantRepository.upsertParticipant = origUpsertParticipant;
      }
    });

    it('rejects removed participant from rejoining', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;

      try {
        meetingAuthorizationService.getMeetingAuth = async () => ({
          canAccess: true,
          isHost: false,
          canManage: false,
          isParticipant: true,
          isAdmittedOrJoined: false,
          isWaiting: false,
          isRemoved: true,
          meeting: createMockMeeting(),
          participant: null,
        });

        await assert.rejects(
          async () => meetingService.joinMeeting('user-banned', 'meeting-wr-1'),
          (err: any) => {
            assert.strictEqual(err.code, PHASE7_ERROR_CODES.PARTICIPANT_REMOVED);
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
      }
    });
  });

  describe('Host Admission Controls', () => {
    it('host admits a WAITING participant (WAITING -> ADMITTED)', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origGetPart = meetingParticipantRepository.getParticipant;
      const origUpdateStatus = meetingParticipantRepository.updateStatus;

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

        meetingParticipantRepository.getParticipant = async (_mid, uid) => ({
          id: 'part-target',
          meeting_id: 'meeting-wr-1',
          user_id: uid,
          role: 'attendee',
          status: 'waiting',
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: null,
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.updateStatus = async (_mid, uid, status) => ({
          id: 'part-target',
          meeting_id: 'meeting-wr-1',
          user_id: uid,
          role: 'attendee',
          status,
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: null,
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const admitted = await meetingService.admitParticipant('user-host', 'meeting-wr-1', 'user-candidate');
        assert.strictEqual(admitted.status, 'admitted');

        // Post-commit: Notifies meeting topic and target user topic
        assert.strictEqual(publishedEvents.length, 2);
        assert.strictEqual(publishedEvents[0].event, 'meeting.participant.admitted');
        assert.strictEqual(publishedEvents[0].topic, 'meeting:meeting-wr-1');
        assert.strictEqual(publishedEvents[1].topic, 'user:user-candidate');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingParticipantRepository.getParticipant = origGetPart;
        meetingParticipantRepository.updateStatus = origUpdateStatus;
      }
    });

    it('rejects non-host from admitting participants', async () => {
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
          meeting: createMockMeeting(),
          participant: null,
        });

        await assert.rejects(
          async () => meetingService.admitParticipant('user-unauthorized', 'meeting-wr-1', 'user-candidate'),
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

  describe('Participant Removal Controls', () => {
    it('host removes a participant and terminates their subscriptions', async () => {
      const origGetAuth = meetingAuthorizationService.getMeetingAuth;
      const origGetPart = meetingParticipantRepository.getParticipant;
      const origUpdateStatus = meetingParticipantRepository.updateStatus;
      const origRemoveTopic = subscriptionManager.removeUserFromTopic;

      let cleanedTopicUser: string | null = null;
      let cleanedTopic: string | null = null;

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

        meetingParticipantRepository.getParticipant = async (_mid, uid) => ({
          id: 'part-target',
          meeting_id: 'meeting-wr-1',
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
        });

        meetingParticipantRepository.updateStatus = async () => ({
          id: 'part-target',
          meeting_id: 'meeting-wr-1',
          user_id: 'user-troublemaker',
          role: 'attendee',
          status: 'removed',
          audio_enabled: false,
          video_enabled: false,
          screen_sharing: false,
          hand_raised: false,
          joined_at: new Date(),
          left_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        });

        subscriptionManager.removeUserFromTopic = (uid, topic) => {
          cleanedTopicUser = uid;
          cleanedTopic = topic;
        };

        await meetingService.removeParticipant('user-host', 'meeting-wr-1', 'user-troublemaker');

        // Verify topic subscription terminated
        assert.strictEqual(cleanedTopicUser, 'user-troublemaker');
        assert.strictEqual(cleanedTopic, 'meeting:meeting-wr-1');

        // Post-commit: Notifies meeting topic and user topic
        assert.strictEqual(publishedEvents.length, 2);
        assert.strictEqual(publishedEvents[0].event, 'meeting.participant.removed');
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
        meetingParticipantRepository.getParticipant = origGetPart;
        meetingParticipantRepository.updateStatus = origUpdateStatus;
        subscriptionManager.removeUserFromTopic = origRemoveTopic;
      }
    });

    it('rejects attempt to remove the meeting host', async () => {
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
          meeting: createMockMeeting({ host_id: 'user-host' }),
          participant: null,
        });

        await assert.rejects(
          async () => meetingService.removeParticipant('user-host', 'meeting-wr-1', 'user-host'),
          (err: any) => {
            assert.strictEqual(err.code, PHASE7_ERROR_CODES.CANNOT_REMOVE_HOST);
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        meetingAuthorizationService.getMeetingAuth = origGetAuth;
      }
    });
  });
});
