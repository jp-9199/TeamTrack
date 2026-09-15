import { describe, it } from 'node:test';
import assert from 'node:assert';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';

describe('Phase 7: Meeting Authorization & Anti-IDOR/BOLA Protection', () => {
  it('permits authorized organization member to view meeting and resolves role correctly', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;
    const origGetPart = meetingParticipantRepository.getParticipant;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-auth-1',
        organization_id: 'org-alpha',
        title: 'Quarterly Sync',
        description: null,
        scheduled_start_at: null,
        actual_start_at: null,
        actual_end_at: null,
        status: 'scheduled',
        host_id: 'user-host',
        waiting_room_enabled: true,
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
        meeting_id: 'meeting-auth-1',
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

      const auth = await meetingAuthorizationService.getMeetingAuth('user-host', 'meeting-auth-1');

      assert.strictEqual(auth.canAccess, true);
      assert.strictEqual(auth.isHost, true);
      assert.strictEqual(auth.canManage, true);
      assert.strictEqual(auth.isParticipant, true);
      assert.strictEqual(auth.isAdmittedOrJoined, true);
      assert.strictEqual(auth.isWaiting, false);
      assert.strictEqual(auth.isRemoved, false);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
      meetingParticipantRepository.getParticipant = origGetPart;
    }
  });

  it('denies access to user from another organization (anti-IDOR: canAccess false)', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-secret-cross-tenant',
        organization_id: 'org-tenant-a',
        title: 'Confidential Strategy',
        description: null,
        scheduled_start_at: null,
        actual_start_at: null,
        actual_end_at: null,
        status: 'active',
        host_id: 'user-tenant-a-host',
        waiting_room_enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // User from org-tenant-b is NOT a member of org-tenant-a
      authorizationService.getOrganizationAuth = async () => ({
        isMember: false,
        role: null,
        status: null,
        canAccess: false,
      });

      const auth = await meetingAuthorizationService.getMeetingAuth('user-tenant-b-spy', 'meeting-secret-cross-tenant');

      assert.strictEqual(auth.canAccess, false, 'Cross-tenant meeting access must be blocked');
      assert.strictEqual(auth.isHost, false);
      assert.strictEqual(auth.canManage, false);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
    }
  });

  it('grants canManage to organization admin even if not originally host', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;
    const origGetPart = meetingParticipantRepository.getParticipant;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-auth-2',
        organization_id: 'org-alpha',
        title: 'Team Meeting',
        description: null,
        scheduled_start_at: null,
        actual_start_at: null,
        actual_end_at: null,
        status: 'active',
        host_id: 'user-regular-host',
        waiting_room_enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // User is organization admin
      authorizationService.getOrganizationAuth = async () => ({
        isMember: true,
        role: 'admin',
        status: 'active',
        canAccess: true,
      });

      meetingParticipantRepository.getParticipant = async () => null; // Not joined yet

      const auth = await meetingAuthorizationService.getMeetingAuth('user-org-admin', 'meeting-auth-2');

      assert.strictEqual(auth.canAccess, true);
      assert.strictEqual(auth.isOrgAdmin, true);
      assert.strictEqual(auth.canManage, true, 'Org admin can manage meetings');
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
      meetingParticipantRepository.getParticipant = origGetPart;
    }
  });

  it('correctly marks removed participant as isRemoved: true and isAdmittedOrJoined: false', async () => {
    const origFindMeeting = meetingRepository.findById;
    const origGetOrgAuth = authorizationService.getOrganizationAuth;
    const origGetPart = meetingParticipantRepository.getParticipant;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-auth-3',
        organization_id: 'org-alpha',
        title: 'All Hands',
        description: null,
        scheduled_start_at: null,
        actual_start_at: null,
        actual_end_at: null,
        status: 'active',
        host_id: 'user-host',
        waiting_room_enabled: true,
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
        id: 'part-removed',
        meeting_id: 'meeting-auth-3',
        user_id: 'user-ejected',
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

      const auth = await meetingAuthorizationService.getMeetingAuth('user-ejected', 'meeting-auth-3');

      assert.strictEqual(auth.canAccess, true); // Member of org
      assert.strictEqual(auth.isRemoved, true);
      assert.strictEqual(auth.isAdmittedOrJoined, false);
      assert.strictEqual(auth.canManage, false);
    } finally {
      meetingRepository.findById = origFindMeeting;
      authorizationService.getOrganizationAuth = origGetOrgAuth;
      meetingParticipantRepository.getParticipant = origGetPart;
    }
  });
});
