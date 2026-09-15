import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MeetingService } from '../src/modules/meetings/meeting.service.js';
import { meetingRepository } from '../src/db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../src/db/repositories/meetingParticipant.repository.js';
import { meetingAuthorizationService } from '../src/modules/meetings/meeting.authorization.js';

describe('Phase 7: Meeting Sync & Reconnection Recovery', () => {
  const meetingService = new MeetingService();

  it('recovers complete meeting state and delta participant updates across reconnects', async () => {
    const origGetAuth = meetingAuthorizationService.getMeetingAuth;
    const origSyncParts = meetingParticipantRepository.syncParticipants;
    const origFindById = meetingRepository.findById;

    try {
      meetingRepository.findById = async () => ({
        id: 'meeting-sync-1',
        organization_id: 'org-1',
        title: 'Sprint Planning',
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
      meetingAuthorizationService.getMeetingAuth = async () => ({
        canAccess: true,
        isHost: false,
        canManage: false,
        isParticipant: true,
        isAdmittedOrJoined: true,
        isWaiting: false,
        isRemoved: false,
        meeting: {
          id: 'meeting-sync-1',
          organization_id: 'org-1',
          title: 'Sprint Planning',
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
        participant: null,
      });

      const updatedParticipantTime = new Date();
      meetingParticipantRepository.syncParticipants = async (_mid, since) => {
        assert.ok(since instanceof Date);
        return {
          participants: [
            {
              id: 'part-1',
              meetingId: 'meeting-sync-1',
              userId: 'user-host',
              role: 'host',
              status: 'joined',
              audioEnabled: false, // Muted while reconnecting
              videoEnabled: true,
              screenSharing: true, // Screen sharing started while disconnected!
              handRaised: false,
              joinedAt: new Date().toISOString(),
              leftAt: null,
              updatedAt: updatedParticipantTime.toISOString(),
              user: {
                id: 'user-host',
                displayName: 'Alice Host',
                email: 'host@teamtrack.dev',
                avatarUrl: null,
              },
            },
          ],
          removedUserIds: ['user-kicked'],
        };
      };

      const sinceTimestamp = new Date(Date.now() - 60000).toISOString();
      const syncResult = await meetingService.syncMeeting('user-reconnecting', 'meeting-sync-1', sinceTimestamp);

      assert.strictEqual(syncResult.meetingId, 'meeting-sync-1');
      assert.strictEqual(syncResult.meeting.status, 'active');
      assert.strictEqual(syncResult.meeting.hostId, 'user-host');

      // 1 active participant with user profile recovered
      assert.strictEqual(syncResult.participants.length, 1);
      assert.strictEqual(syncResult.participants[0].userId, 'user-host');
      assert.strictEqual(syncResult.participants[0].audioEnabled, false);
      assert.strictEqual(syncResult.participants[0].screenSharing, true);
      assert.strictEqual(syncResult.participants[0].user.displayName, 'Alice Host');

      // 1 removed participant ID recovered (client immediately knows to prune connection)
      assert.strictEqual(syncResult.removedParticipantUserIds.length, 1);
      assert.strictEqual(syncResult.removedParticipantUserIds[0], 'user-kicked');
    } finally {
      meetingAuthorizationService.getMeetingAuth = origGetAuth;
      meetingParticipantRepository.syncParticipants = origSyncParts;
      meetingRepository.findById = origFindById;
    }
  });
});
