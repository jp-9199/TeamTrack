import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { MeetingService, MeetingServiceError } from '../src/modules/meetings/meeting.service.js';
import { meetingParticipantRepository, type DbMeetingParticipant } from '../src/db/repositories/meetingParticipant.repository.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { PHASE7_ERROR_CODES } from '@teamtrack/shared-types';

describe('Phase 7: Participant Media State Controls & Event Publication', () => {
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

  it('updates self media state and emits granular post-commit realtime events', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;
    const origUpdateMedia = meetingParticipantRepository.updateMediaState;

    try {
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: false,
        canManage: false,
        isParticipant: true,
        isAdmittedOrJoined: true,
        isWaiting: false,
        isRemoved: false,
        meeting: {
          id: 'meeting-media-1',
          organization_id: 'org-1',
          title: 'Sync',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        participant: {
          id: 'part-1',
          meeting_id: 'meeting-media-1',
          user_id: 'user-self',
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

      meetingParticipantRepository.updateMediaState = async (_mid, uid, data) =>
        meetingParticipantRepository.mapParticipant({
          id: 'part-1',
          meeting_id: 'meeting-media-1',
          user_id: uid,
          role: 'attendee',
          status: 'joined',
          audio_enabled: data.audioEnabled ?? true,
          video_enabled: data.videoEnabled ?? true,
          screen_sharing: data.screenSharing ?? false,
          hand_raised: data.handRaised ?? false,
          joined_at: new Date(),
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

      // Mute audio and raise hand
      const updated = await meetingService.updateMediaState('user-self', 'meeting-media-1', {
        audioEnabled: false,
        handRaised: true,
      });

      assert.strictEqual(updated.audioEnabled, false);
      assert.strictEqual(updated.handRaised, true);

      // Verify specific events were emitted to meeting topic
      const audioEvent = publishedEvents.find((e) => e.event === 'meeting.participant.audio_changed');
      const handEvent = publishedEvents.find((e) => e.event === 'meeting.hand_raised');

      assert.ok(audioEvent, 'Audio changed event must be published');
      assert.strictEqual(audioEvent.payload.audioEnabled, false);
      assert.strictEqual(audioEvent.payload.userId, 'user-self');

      assert.ok(handEvent, 'Hand raised event must be published');
      assert.strictEqual(handEvent.payload.handRaised, true);
      assert.strictEqual(handEvent.payload.userId, 'user-self');
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
      meetingParticipantRepository.updateMediaState = origUpdateMedia;
    }
  });

  it('rejects media state updates from participants who are in WAITING room', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;

    try {
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: false,
        canManage: false,
        isParticipant: true,
        isAdmittedOrJoined: false,
        isWaiting: true,
        isRemoved: false,
        meeting: {
          id: 'meeting-media-2',
          organization_id: 'org-1',
          title: 'Sync',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        participant: {
          id: 'part-waiting',
          meeting_id: 'meeting-media-2',
          user_id: 'user-waiting',
          role: 'attendee',
          status: 'waiting',
          audio_enabled: false,
          video_enabled: false,
          screen_sharing: false,
          hand_raised: false,
          joined_at: null,
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      await assert.rejects(
        async () =>
          meetingService.updateMediaState('user-waiting', 'meeting-media-2', {
            audioEnabled: true,
          }),
        (err: any) => {
          assert.strictEqual(err.code, PHASE7_ERROR_CODES.MEDIA_STATE_FORBIDDEN);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
    }
  });
});
