import { authorizationService } from '../authorization/authorization.service.js';
import { meetingRepository, type DbMeeting } from '../../db/repositories/meeting.repository.js';
import { meetingParticipantRepository, type DbMeetingParticipant } from '../../db/repositories/meetingParticipant.repository.js';
import { pool } from '../../db/pool.js';
import type { Queryable } from '../../db/repositories/organization.repository.js';

export interface MeetingAuthResult {
  meetingExists: boolean;
  canAccess: boolean;
  isHost: boolean;
  isOrgAdmin: boolean;
  canManage: boolean;
  meeting?: DbMeeting;
  participant?: DbMeetingParticipant;
  isParticipant: boolean;
  isAdmittedOrJoined: boolean;
  isWaiting: boolean;
  isRemoved: boolean;
}

export class MeetingAuthorizationService {
  /**
   * Resolves caller authorization for a meeting.
   * Verifies meeting existence, organization existence, non-deletion, and active org membership.
   * Anti-IDOR: If caller does not belong to parent organization, meeting appears as not found.
   */
  async getMeetingAuth(
    userId: string,
    meetingId: string,
    db: Queryable = pool
  ): Promise<MeetingAuthResult> {
    const meeting = await meetingRepository.findById(meetingId, db);
    if (!meeting) {
      return {
        meetingExists: false,
        canAccess: false,
        isHost: false,
        isOrgAdmin: false,
        canManage: false,
        isParticipant: false,
        isAdmittedOrJoined: false,
        isWaiting: false,
        isRemoved: false,
      };
    }

    // Authorize caller in parent organization
    const orgAuth = await authorizationService.getOrganizationAuth(userId, meeting.organization_id, db);
    if (!orgAuth.isMember) {
      // Cross-tenant protection: caller cannot see or probe meetings outside their organization
      return {
        meetingExists: false,
        canAccess: false,
        isHost: false,
        isOrgAdmin: false,
        canManage: false,
        isParticipant: false,
        isAdmittedOrJoined: false,
        isWaiting: false,
        isRemoved: false,
      };
    }

    const isHost = meeting.host_id === userId;
    const isOrgAdmin = Boolean(orgAuth.isAdmin || orgAuth.isOwner || orgAuth.role === 'admin' || orgAuth.role === 'owner');
    const canManage = Boolean(isHost || isOrgAdmin);

    // Fetch caller's participant record if one exists
    const participant = await meetingParticipantRepository.getParticipant(meetingId, userId, db);

    const isParticipant = participant !== null;
    const isAdmittedOrJoined = participant !== null && (participant.status === 'admitted' || participant.status === 'joined');
    const isWaiting = participant !== null && participant.status === 'waiting';
    const isRemoved = participant !== null && participant.status === 'removed';

    return {
      meetingExists: true,
      canAccess: true,
      isHost,
      isOrgAdmin,
      canManage,
      meeting,
      participant: participant || undefined,
      isParticipant,
      isAdmittedOrJoined,
      isWaiting,
      isRemoved,
    };
  }
}

export const meetingAuthorizationService = new MeetingAuthorizationService();
