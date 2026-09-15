import { describe, it } from 'node:test';
import assert from 'node:assert';
import { subscriptionManager, type AuthenticatedSocket } from '../src/realtime/subscription.manager.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';

describe('Phase 7: Meeting WebSocket Topic Authorization & Multi-Device Subscriptions', () => {
  function createMockSocket(userId: string, idSuffix: string = '1'): AuthenticatedSocket & { messages: string[] } {
    const messages: string[] = [];
    return {
      id: `mock-sock-${userId}-${idSuffix}`,
      userId,
      sessionId: `session-${userId}`,
      isAlive: true,
      messages,
      send: (data: string) => messages.push(data),
      close: () => {},
    };
  }

  it('permits authorized organization member to subscribe to meeting:<meetingId>', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;
    const origGetPart = meetingParticipantRepository.getParticipant;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-ws-1',
        organization_id: 'org-alpha',
        title: 'Weekly Standup',
        description: null,
        scheduled_start_at: null,
        actual_start_at: new Date(),
        actual_end_at: null,
        status: 'active',
        host_id: 'user-host',
        waiting_room_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      authorizationService.getOrganizationAuth = async () => ({
        isMember: true,
        role: 'member',
        status: 'active',
        canAccess: true,
      });

      meetingParticipantRepository.getParticipant = async () => ({
        id: 'part-1',
        meeting_id: 'meeting-ws-1',
        user_id: 'user-member',
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

      const socket = createMockSocket('user-member');
      subscriptionManager.registerSocket(socket);

      const res = await subscriptionManager.subscribe(socket, 'meeting:meeting-ws-1');
      assert.strictEqual(res.success, true);
      assert.strictEqual(subscriptionManager.getSubscriberCount('meeting:meeting-ws-1'), 1);

      // Clean up
      subscriptionManager.removeSocket(socket);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
      meetingParticipantRepository.getParticipant = origGetPart;
    }
  });

  it('rejects cross-organization subscription attempt to meeting:<meetingId>', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-ws-2',
        organization_id: 'org-alpha',
        title: 'Secret Board Meeting',
        description: null,
        scheduled_start_at: null,
        actual_start_at: new Date(),
        actual_end_at: null,
        status: 'active',
        host_id: 'user-host',
        waiting_room_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // User is from org-beta, not member of org-alpha
      authorizationService.getOrganizationAuth = async () => ({
        isMember: false,
        role: null,
        status: null,
        canAccess: false,
      });

      const socket = createMockSocket('user-outsider');
      subscriptionManager.registerSocket(socket);

      const res = await subscriptionManager.subscribe(socket, 'meeting:meeting-ws-2');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'MEETING_ACCESS_DENIED');
      assert.strictEqual(subscriptionManager.getSubscriberCount('meeting:meeting-ws-2'), 0);

      subscriptionManager.removeSocket(socket);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
    }
  });

  it('rejects subscription for removed participant', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;
    const origGetPart = meetingParticipantRepository.getParticipant;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-ws-3',
        organization_id: 'org-alpha',
        title: 'Team Sync',
        description: null,
        scheduled_start_at: null,
        actual_start_at: new Date(),
        actual_end_at: null,
        status: 'active',
        host_id: 'user-host',
        waiting_room_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      authorizationService.getOrganizationAuth = async () => ({
        isMember: true,
        role: 'member',
        status: 'active',
        canAccess: true,
      });

      meetingParticipantRepository.getParticipant = async () => ({
        id: 'part-banned',
        meeting_id: 'meeting-ws-3',
        user_id: 'user-banned',
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

      const socket = createMockSocket('user-banned');
      subscriptionManager.registerSocket(socket);

      const res = await subscriptionManager.subscribe(socket, 'meeting:meeting-ws-3');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'PARTICIPANT_REMOVED');

      subscriptionManager.removeSocket(socket);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
      meetingParticipantRepository.getParticipant = origGetPart;
    }
  });

  it('supports multi-device connections for the same logical participant', async () => {
    const socketLaptop = createMockSocket('user-multi', 'laptop');
    const socketMobile = createMockSocket('user-multi', 'mobile');

    subscriptionManager.registerSocket(socketLaptop);
    subscriptionManager.registerSocket(socketMobile);

    const userSockets = subscriptionManager.getSocketsForUser('user-multi');
    assert.strictEqual(userSockets.length, 2, 'One user has two active connection sockets');

    // Clean up
    subscriptionManager.removeSocket(socketLaptop);
    assert.strictEqual(subscriptionManager.getSocketsForUser('user-multi').length, 1);

    subscriptionManager.removeSocket(socketMobile);
    assert.strictEqual(subscriptionManager.getSocketsForUser('user-multi').length, 0);
  });
});
