import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { webRtcSignalingService } from '../src/realtime/webrtc.signaling.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import type { AuthenticatedSocket } from '../src/realtime/subscription.manager.js';

describe('Phase 7: WebRTC Signaling, Participant Isolation & Reactions', () => {
  let publishedEvents: { event: string; topic: string; payload: any }[] = [];

  beforeEach(() => {
    publishedEvents = [];
    eventPublisher.publish = async (event: any, topic: string, payload: any) => {
      publishedEvents.push({ event, topic, payload });
      return {} as any;
    };
    authorizationService.getOrganizationAuth = async () => ({
      isMember: true,
      isOwner: false,
      isAdmin: false,
      isGuest: false,
    });
  });

  function createMockSocket(userId: string): AuthenticatedSocket {
    return {
      id: `mock-sock-${Math.random()}`,
      userId,
      sessionId: `mock-session-${userId}`,
      isAlive: true,
      send: () => {},
      close: () => {},
    };
  }

  describe('WebRTC Signaling Boundaries', () => {
    it('routes valid SDP offer between two joined participants in active meeting', async () => {
      const origFindMeeting = meetingRepository.findById;
      const origGetPart = meetingParticipantRepository.getParticipant;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-1',
          organization_id: 'org-1',
          title: 'Design Review',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.getParticipant = async (_mid, uid) => ({
          id: `part-${uid}`,
          meeting_id: 'meeting-rtc-1',
          user_id: uid,
          role: uid === 'user-host' ? 'host' : 'attendee',
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

        const senderSocket = createMockSocket('user-sender');
        const res = await webRtcSignalingService.handleSignaling(senderSocket, 'webrtc.offer', {
          meetingId: 'meeting-rtc-1',
          targetUserId: 'user-target',
          data: { sdp: 'v=0...' },
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'webrtc.offer');
        assert.strictEqual(publishedEvents[0].topic, 'user:user-target');
        assert.strictEqual(publishedEvents[0].payload.senderUserId, 'user-sender');
        assert.strictEqual(publishedEvents[0].payload.signalType, 'offer');
      } finally {
        meetingRepository.findById = origFindMeeting;
        meetingParticipantRepository.getParticipant = origGetPart;
      }
    });

    it('blocks waiting participant from sending WebRTC signaling', async () => {
      const origFindMeeting = meetingRepository.findById;
      const origGetPart = meetingParticipantRepository.getParticipant;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-1',
          organization_id: 'org-1',
          title: 'Design Review',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.getParticipant = async (_mid, uid) => ({
          id: `part-${uid}`,
          meeting_id: 'meeting-rtc-1',
          user_id: uid,
          role: 'attendee',
          status: uid === 'user-waiting' ? 'waiting' : 'joined',
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: null,
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const senderSocket = createMockSocket('user-waiting');
        const res = await webRtcSignalingService.handleSignaling(senderSocket, 'webrtc.offer', {
          meetingId: 'meeting-rtc-1',
          targetUserId: 'user-target',
          data: { sdp: 'v=0...' },
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'SENDER_WAITING_CANNOT_SIGNAL');
        assert.strictEqual(publishedEvents.length, 0, 'No signal may be published');
      } finally {
        meetingRepository.findById = origFindMeeting;
        meetingParticipantRepository.getParticipant = origGetPart;
      }
    });

    it('blocks signaling targeted at participant in waiting room', async () => {
      const origFindMeeting = meetingRepository.findById;
      const origGetPart = meetingParticipantRepository.getParticipant;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-1',
          organization_id: 'org-1',
          title: 'Design Review',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.getParticipant = async (_mid, uid) => ({
          id: `part-${uid}`,
          meeting_id: 'meeting-rtc-1',
          user_id: uid,
          role: 'attendee',
          status: uid === 'user-waiting-target' ? 'waiting' : 'joined',
          audio_enabled: true,
          video_enabled: true,
          screen_sharing: false,
          hand_raised: false,
          joined_at: null,
          left_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const senderSocket = createMockSocket('user-sender');
        const res = await webRtcSignalingService.handleSignaling(senderSocket, 'webrtc.offer', {
          meetingId: 'meeting-rtc-1',
          targetUserId: 'user-waiting-target',
          data: { sdp: 'v=0...' },
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'TARGET_IN_WAITING_ROOM');
        assert.strictEqual(publishedEvents.length, 0);
      } finally {
        meetingRepository.findById = origFindMeeting;
        meetingParticipantRepository.getParticipant = origGetPart;
      }
    });

    it('rejects signaling when meeting is not ACTIVE (e.g. ENDED or SCHEDULED)', async () => {
      const origFindMeeting = meetingRepository.findById;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-ended',
          organization_id: 'org-1',
          title: 'Old Meeting',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: new Date(),
          status: 'ended',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const senderSocket = createMockSocket('user-sender');
        const res = await webRtcSignalingService.handleSignaling(senderSocket, 'webrtc.offer', {
          meetingId: 'meeting-rtc-ended',
          targetUserId: 'user-target',
          data: { sdp: 'v=0...' },
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'MEETING_NOT_ACTIVE');
      } finally {
        meetingRepository.findById = origFindMeeting;
      }
    });

    it('rejects signaling to oneself', async () => {
      const senderSocket = createMockSocket('user-same');
      const res = await webRtcSignalingService.handleSignaling(senderSocket, 'webrtc.offer', {
        meetingId: 'meeting-rtc-1',
        targetUserId: 'user-same',
        data: { sdp: 'v=0...' },
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'CANNOT_SIGNAL_SELF');
    });
  });

  describe('Transient Reactions & Hand Raising', () => {
    it('publishes transient meeting reaction with server-derived sender identity', async () => {
      const origFindMeeting = meetingRepository.findById;
      const origGetPart = meetingParticipantRepository.getParticipant;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-1',
          organization_id: 'org-1',
          title: 'Design Review',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.getParticipant = async () => ({
          id: 'part-1',
          meeting_id: 'meeting-rtc-1',
          user_id: 'user-sender',
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

        const senderSocket = createMockSocket('user-sender');
        const res = await webRtcSignalingService.handleReaction(senderSocket, {
          meetingId: 'meeting-rtc-1',
          reaction: '🎉',
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.reaction');
        assert.strictEqual(publishedEvents[0].topic, 'meeting:meeting-rtc-1');
        assert.strictEqual(publishedEvents[0].payload.userId, 'user-sender');
        assert.strictEqual(publishedEvents[0].payload.reactionCode, '🎉');
      } finally {
        meetingRepository.findById = origFindMeeting;
        meetingParticipantRepository.getParticipant = origGetPart;
      }
    });

    it('updates hand state in DB and publishes realtime event', async () => {
      const origFindMeeting = meetingRepository.findById;
      const origGetPart = meetingParticipantRepository.getParticipant;
      const origUpdateMedia = meetingParticipantRepository.updateMediaState;

      let storedHandRaised: boolean | undefined;

      try {
        meetingRepository.findById = async () => ({
          id: 'meeting-rtc-1',
          organization_id: 'org-1',
          title: 'Design Review',
          description: null,
          scheduled_start_at: null,
          actual_start_at: new Date(),
          actual_end_at: null,
          status: 'active',
          host_id: 'user-host',
          waiting_room_enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        meetingParticipantRepository.getParticipant = async () => ({
          id: 'part-1',
          meeting_id: 'meeting-rtc-1',
          user_id: 'user-sender',
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

        meetingParticipantRepository.updateMediaState = async (_mid, _uid, data) => {
          storedHandRaised = data.handRaised;
          return {} as any;
        };

        const senderSocket = createMockSocket('user-sender');
        const res = await webRtcSignalingService.handleHandState(senderSocket, 'meeting-rtc-1', true);

        assert.strictEqual(res.success, true);
        assert.strictEqual(storedHandRaised, true);
        assert.strictEqual(publishedEvents.length, 1);
        assert.strictEqual(publishedEvents[0].event, 'meeting.hand_raised');
        assert.strictEqual(publishedEvents[0].payload.handRaised, true);
      } finally {
        meetingRepository.findById = origFindMeeting;
        meetingParticipantRepository.getParticipant = origGetPart;
        meetingParticipantRepository.updateMediaState = origUpdateMedia;
      }
    });
  });
});
