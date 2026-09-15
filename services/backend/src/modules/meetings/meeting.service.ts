import { pool } from '../../db/pool.js';
import {
  meetingRepository,
  type DbMeeting,
} from '../../db/repositories/meeting.repository.js';
import {
  meetingParticipantRepository,
  type DbMeetingParticipant,
} from '../../db/repositories/meetingParticipant.repository.js';
import { participantEventRepository } from '../../db/repositories/participantEvent.repository.js';
import { mediaSessionRepository } from '../../db/repositories/mediaSession.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { meetingAuthorizationService } from './meeting.authorization.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import { subscriptionManager } from '../../realtime/subscription.manager.js';
import { notificationService } from '../notifications/notification.service.js';
import type {
  Meeting,
  MeetingWithHost,
  MeetingParticipant,
  MeetingParticipantWithUser,
  CreateMeetingRequest,
  TransferHostRequest,
  UpdateMediaStateRequest,
  MeetingSyncResponse,
  RealtimeEnvelope,
} from '@teamtrack/shared-types';
import { PHASE7_ERROR_CODES, PHASE11_ERROR_CODES } from '@teamtrack/shared-types';

export class MeetingServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'MeetingServiceError';
  }
}

export class MeetingService {
  /**
   * Creates a new meeting with the authenticated caller as initial host.
   */
  async createMeeting(userId: string, req: CreateMeetingRequest): Promise<MeetingWithHost> {
    const orgAuth = await authorizationService.getOrganizationAuth(userId, req.organizationId);
    if (!orgAuth.isMember) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Organization not found');
    }

    const client = await pool.connect();
    let meeting: Meeting;

    try {
      await client.query('BEGIN');

      meeting = await meetingRepository.create(
        {
          organizationId: req.organizationId,
          hostId: userId,
          title: req.title,
          description: req.description,
          scheduledStartAt: req.scheduledStartAt,
          waitingRoomEnabled: req.waitingRoomEnabled,
        },
        client
      );

      // Create host participant record as joined
      await meetingParticipantRepository.upsertParticipant(
        {
          meetingId: meeting.id,
          userId,
          role: 'host',
          status: 'joined',
        },
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish meeting.created event
    try {
      await eventPublisher.publish('meeting.created', `meeting:${meeting.id}`, {
        meetingId: meeting.id,
        hostId: userId,
        organizationId: meeting.organizationId,
        title: meeting.title,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.created):', err.message);
    }

    const meetingWithHost = await meetingRepository.findByIdWithHost(meeting.id);
    return meetingWithHost!;
  }

  /**
   * Lists meetings in an organization for authorized members.
   */
  async listMeetings(userId: string, organizationId: string): Promise<MeetingWithHost[]> {
    const orgAuth = await authorizationService.getOrganizationAuth(userId, organizationId);
    if (!orgAuth.isMember) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Organization not found');
    }

    return meetingRepository.listByOrg(organizationId);
  }

  /**
   * Gets details of a meeting.
   */
  async getMeeting(userId: string, meetingId: string): Promise<MeetingWithHost> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    const meeting = await meetingRepository.findByIdWithHost(meetingId);
    if (!meeting) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    return meeting;
  }

  /**
   * Starts a meeting (SCHEDULED -> ACTIVE).
   */
  async startMeeting(userId: string, meetingId: string): Promise<Meeting> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or organization admin can start the meeting');
    }

    const client = await pool.connect();
    let updatedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const meeting = await meetingRepository.findForUpdate(meetingId, client);
      if (!meeting) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
      }

      if (meeting.status === 'active') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ACTIVE, 'Meeting is already active');
      }
      if (meeting.status === 'ended') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED, 'Cannot start a meeting that has ended');
      }
      if (meeting.status === 'cancelled') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.INVALID_MEETING_TRANSITION, 'Cannot start a cancelled meeting');
      }

      updatedMeeting = await meetingRepository.startMeeting(meetingId, client);

      // Ensure caller participant is marked joined
      await meetingParticipantRepository.upsertParticipant(
        {
          meetingId,
          userId,
          role: meeting.host_id === userId ? 'host' : 'presenter',
          status: 'joined',
        },
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish meeting.started
    try {
      await eventPublisher.publish('meeting.started', `meeting:${meetingId}`, {
        meetingId,
        startedAt: updatedMeeting.actualStartAt,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.started):', err.message);
    }

    return updatedMeeting;
  }

  /**
   * Joins a meeting. Enforces waiting room policy for non-hosts when enabled.
   */
  async joinMeeting(
    userId: string,
    meetingId: string
  ): Promise<{ meeting: Meeting; participant: MeetingParticipant }> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    if (auth.isRemoved) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.PARTICIPANT_REMOVED, 'You have been removed from this meeting and cannot rejoin');
    }

    const meeting = auth.meeting!;
    if (meeting.status === 'ended') {
      throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED, 'Meeting has ended');
    }

    // Enforce meeting lock: if locked, host/admin can join, existing admitted/joined can reconnect,
    // but new unauthorized participants are rejected.
    if (meeting.is_locked && !auth.canManage && !auth.isAdmittedOrJoined) {
      throw new MeetingServiceError(403, PHASE11_ERROR_CODES.MEETING_LOCKED, 'This meeting is locked by the host');
    }

    // Determine initial status based on host/admin bypass and waiting room settings
    let initialStatus: 'waiting' | 'joined' = 'waiting';
    if (auth.canManage) {
      initialStatus = 'joined';
    } else if (!meeting.waiting_room_enabled) {
      initialStatus = 'joined';
    } else if (auth.isAdmittedOrJoined) {
      initialStatus = 'joined';
    } else {
      initialStatus = 'waiting';
    }

    const client = await pool.connect();
    let participant: MeetingParticipant;

    try {
      await client.query('BEGIN');

      const existing = await meetingParticipantRepository.getParticipant(meetingId, userId, client);
      let eventTypeToRecord: 'waiting' | 'joined' | 'rejoined' | null = null;
      if (initialStatus === 'waiting') {
        if (!existing || existing.status !== 'waiting') {
          eventTypeToRecord = 'waiting';
        }
      } else if (initialStatus === 'joined') {
        if (existing?.status === 'left') {
          eventTypeToRecord = 'rejoined';
        } else if (!existing || existing.status === 'waiting') {
          eventTypeToRecord = 'joined';
        }
      }

      participant = await meetingParticipantRepository.upsertParticipant(
        {
          meetingId,
          userId,
          role: auth.isHost ? 'host' : 'attendee',
          status: initialStatus,
        },
        client
      );

      if (eventTypeToRecord) {
        await participantEventRepository.recordEvent(
          meetingId,
          userId,
          eventTypeToRecord,
          userId,
          {},
          client
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish participant joined / entered waiting room
    try {
      if (initialStatus === 'joined') {
        await eventPublisher.publish('meeting.participant.joined', `meeting:${meetingId}`, {
          meetingId,
          participantId: participant.id,
          userId,
          role: participant.role,
          status: participant.status,
          joinedAt: participant.joinedAt,
        });
      }
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.participant.joined):', err.message);
    }

    return {
      meeting: meetingRepository.mapMeeting(meeting),
      participant,
    };
  }

  /**
   * Admits a participant from WAITING to ADMITTED (Host/Admin only).
   */
  async admitParticipant(
    hostUserId: string,
    meetingId: string,
    targetUserId: string
  ): Promise<MeetingParticipant> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or admin can admit participants');
    }

    const client = await pool.connect();
    let participant: MeetingParticipant;

    try {
      await client.query('BEGIN');

      const target = await meetingParticipantRepository.getParticipant(meetingId, targetUserId, client);
      if (!target) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found in this meeting');
      }

      if (target.status !== 'waiting') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.PARTICIPANT_NOT_WAITING, `Participant is in state '${target.status}' and cannot be admitted`);
      }

      const updated = await meetingParticipantRepository.updateStatus(
        meetingId,
        targetUserId,
        'admitted',
        null,
        client
      );
      participant = updated!;

      await participantEventRepository.recordEvent(
        meetingId,
        targetUserId,
        'admitted',
        hostUserId,
        {},
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish meeting.participant.admitted to meeting topic and target user topic
    try {
      await eventPublisher.publish('meeting.participant.admitted', `meeting:${meetingId}`, {
        meetingId,
        userId: targetUserId,
        admittedBy: hostUserId,
      });

      await eventPublisher.publish('meeting.participant.admitted', `user:${targetUserId}`, {
        meetingId,
        userId: targetUserId,
        admittedBy: hostUserId,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.participant.admitted):', err.message);
    }

    return participant;
  }

  /**
   * Leaves a meeting (JOINED -> LEFT). Disconnection does NOT end the meeting.
   */
  async leaveMeeting(userId: string, meetingId: string): Promise<void> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess || !auth.participant) {
      return; // Idempotent success
    }

    if (auth.participant.status === 'left' || auth.participant.status === 'removed') {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await meetingParticipantRepository.updateStatus(meetingId, userId, 'left', new Date(), client);
      await participantEventRepository.recordEvent(
        meetingId,
        userId,
        'left',
        userId,
        {},
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    try {
      await eventPublisher.publish('meeting.participant.left', `meeting:${meetingId}`, {
        meetingId,
        userId,
        leftAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.participant.left):', err.message);
    }
  }

  /**
   * Removes a participant from the meeting (Host/Admin only).
   */
  async removeParticipant(
    hostUserId: string,
    meetingId: string,
    targetUserId: string
  ): Promise<void> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or admin can remove participants');
    }

    if (targetUserId === auth.meeting!.host_id) {
      throw new MeetingServiceError(400, PHASE7_ERROR_CODES.CANNOT_REMOVE_HOST, 'Cannot remove the meeting host. Transfer host ownership first.');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const target = await meetingParticipantRepository.getParticipant(meetingId, targetUserId, client);
      if (!target) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
      }

      await meetingParticipantRepository.updateStatus(meetingId, targetUserId, 'removed', new Date(), client);
      await participantEventRepository.recordEvent(
        meetingId,
        targetUserId,
        'removed',
        hostUserId,
        {},
        client
      );
      await mediaSessionRepository.markLeft(meetingId, targetUserId, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Terminate active subscriptions for the removed participant on this meeting topic
    try {
      subscriptionManager.removeUserFromTopic(targetUserId, `meeting:${meetingId}`);
    } catch (err: any) {
      console.error('[MeetingService] Subscription cleanup error:', err.message);
    }

    // Post-commit: Publish meeting.participant.removed
    try {
      await eventPublisher.publish('meeting.participant.removed', `meeting:${meetingId}`, {
        meetingId,
        userId: targetUserId,
        removedBy: hostUserId,
      });

      await eventPublisher.publish('meeting.participant.removed', `user:${targetUserId}`, {
        meetingId,
        userId: targetUserId,
        removedBy: hostUserId,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.participant.removed):', err.message);
    }
  }


  /**
   * Ends an active meeting (ACTIVE -> ENDED).
   */
  async endMeeting(hostUserId: string, meetingId: string): Promise<Meeting> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or admin can end the meeting');
    }

    const client = await pool.connect();
    let endedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const meeting = await meetingRepository.findForUpdate(meetingId, client);
      if (!meeting) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
      }

      if (meeting.status === 'ended') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED, 'Meeting is already ended');
      }

      endedMeeting = await meetingRepository.endMeeting(meetingId, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish meeting.ended
    try {
      await eventPublisher.publish('meeting.ended', `meeting:${meetingId}`, {
        meetingId,
        endedAt: endedMeeting.actualEndAt,
        endedBy: hostUserId,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.ended):', err.message);
    }

    return endedMeeting;
  }

  /**
   * Transfers meeting host ownership to another admitted/joined participant.
   */
  async transferHost(
    hostUserId: string,
    meetingId: string,
    req: TransferHostRequest
  ): Promise<Meeting> {
    if (hostUserId === req.newHostUserId) {
      throw new MeetingServiceError(400, PHASE7_ERROR_CODES.CANNOT_TRANSFER_TO_SELF, 'Cannot transfer host to yourself');
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or admin can transfer host role');
    }

    const client = await pool.connect();
    let updatedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const meeting = await meetingRepository.findForUpdate(meetingId, client);
      if (!meeting) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
      }

      if (meeting.status === 'ended') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED, 'Cannot transfer host of an ended meeting');
      }

      const target = await meetingParticipantRepository.getParticipant(meetingId, req.newHostUserId, client);
      if (!target || target.status === 'removed' || target.status === 'waiting') {
        throw new MeetingServiceError(400, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Target participant is not an active participant in this meeting');
      }

      updatedMeeting = await meetingRepository.updateHost(meetingId, req.newHostUserId, client);
      await meetingParticipantRepository.updateRole(meetingId, hostUserId, 'attendee', client);
      await meetingParticipantRepository.updateRole(meetingId, req.newHostUserId, 'host', client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Post-commit: Publish meeting.host_changed
    try {
      await eventPublisher.publish('meeting.host_changed', `meeting:${meetingId}`, {
        meetingId,
        previousHostUserId: hostUserId,
        newHostUserId: req.newHostUserId,
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.host_changed):', err.message);
    }

    return updatedMeeting;
  }

  /**
   * Updates participant's own media state (audio, video, screen share, hand raised).
   */
  async updateMediaState(
    userId: string,
    meetingId: string,
    mediaReq: UpdateMediaStateRequest
  ): Promise<MeetingParticipant> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    if (!auth.isAdmittedOrJoined) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.MEDIA_STATE_FORBIDDEN, 'Only admitted or joined participants can update media state');
    }

    const updated = await meetingParticipantRepository.updateMediaState(meetingId, userId, mediaReq);
    if (!updated) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    // Post-commit: publish appropriate events
    try {
      if (mediaReq.audioEnabled !== undefined) {
        await eventPublisher.publish('meeting.participant.audio_changed', `meeting:${meetingId}`, {
          meetingId,
          userId,
          audioEnabled: mediaReq.audioEnabled,
        });
      }
      if (mediaReq.videoEnabled !== undefined) {
        await eventPublisher.publish('meeting.participant.video_changed', `meeting:${meetingId}`, {
          meetingId,
          userId,
          videoEnabled: mediaReq.videoEnabled,
        });
      }
      if (mediaReq.screenSharing !== undefined) {
        await eventPublisher.publish('meeting.participant.screen_share_changed', `meeting:${meetingId}`, {
          meetingId,
          userId,
          screenSharing: mediaReq.screenSharing,
        });
      }
      if (mediaReq.handRaised !== undefined) {
        await eventPublisher.publish(
          mediaReq.handRaised ? 'meeting.hand_raised' : 'meeting.hand_lowered',
          `meeting:${meetingId}`,
          {
            meetingId,
            userId,
            handRaised: mediaReq.handRaised,
          }
        );
      }
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (media update):', err.message);
    }

    return updated;
  }

  /**
   * Lists participants in a meeting.
   */
  async listParticipants(userId: string, meetingId: string): Promise<MeetingParticipantWithUser[]> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    return meetingParticipantRepository.listParticipants(meetingId);
  }

  /**
   * Syncs meeting and participant state for reconnection recovery.
   */
  async syncMeeting(userId: string, meetingId: string, sinceStr: string): Promise<MeetingSyncResponse> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    const sinceDate = isNaN(Date.parse(sinceStr)) ? new Date(0) : new Date(sinceStr);
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    const { participants, removedUserIds } = await meetingParticipantRepository.syncParticipants(
      meetingId,
      sinceDate
    );

    return {
      meetingId,
      syncedAt: new Date().toISOString(),
      meeting: meetingRepository.mapMeeting(meeting),
      participants,
      removedParticipantUserIds: removedUserIds,
    };
  }

  // ==========================================================================
  // Phase 11: Advanced Meeting Controls
  // ==========================================================================

  /**
   * Locks a meeting, preventing new participants from joining (except host/admin).
   * Host/admin only.
   */
  async lockMeeting(hostUserId: string, meetingId: string): Promise<Meeting> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only host or admin can lock the meeting');
    }

    const client = await pool.connect();
    let updatedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const meeting = await meetingRepository.findForUpdate(meetingId, client);
      if (!meeting) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
      }

      // Check if already locked
      const lockCheck = await client.query<{ is_locked: boolean }>(
        'SELECT is_locked FROM meetings WHERE id = $1',
        [meetingId]
      );
      if (lockCheck.rows[0]?.is_locked) {
        throw new MeetingServiceError(409, 'MEETING_ALREADY_LOCKED', 'Meeting is already locked');
      }

      const lockResult = await client.query<{ id: string; status: string; actual_start_at: Date | null; actual_end_at: Date | null }>(
        `UPDATE meetings
         SET is_locked = true,
             locked_at = NOW(),
             locked_by = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *;`,
        [meetingId, hostUserId]
      );
      updatedMeeting = meetingRepository.mapMeeting(lockResult.rows[0] as any);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    try {
      await eventPublisher.publish('meeting.locked', `meeting:${meetingId}`, {
        meetingId,
        lockedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.locked):', err.message);
    }

    return updatedMeeting;
  }

  /**
   * Unlocks a meeting, allowing new participants to join again.
   * Host/admin only.
   */
  async unlockMeeting(hostUserId: string, meetingId: string): Promise<Meeting> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only host or admin can unlock the meeting');
    }

    const client = await pool.connect();
    let updatedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const lockCheck = await client.query<{ is_locked: boolean }>(
        'SELECT is_locked FROM meetings WHERE id = $1 FOR UPDATE',
        [meetingId]
      );
      if (!lockCheck.rows[0]?.is_locked) {
        throw new MeetingServiceError(409, 'MEETING_NOT_LOCKED', 'Meeting is not locked');
      }

      const result = await client.query(
        `UPDATE meetings
         SET is_locked = false,
             locked_at = NULL,
             locked_by = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *;`,
        [meetingId]
      );
      updatedMeeting = meetingRepository.mapMeeting(result.rows[0]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    try {
      await eventPublisher.publish('meeting.unlocked', `meeting:${meetingId}`, {
        meetingId,
        unlockedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.unlocked):', err.message);
    }

    return updatedMeeting;
  }

  /**
   * Denies a participant who is waiting in the waiting room.
   * Host/admin only. Sets participant status to 'removed'.
   */
  async denyParticipant(
    hostUserId: string,
    meetingId: string,
    targetUserId: string
  ): Promise<void> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only host or admin can deny participants');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const target = await meetingParticipantRepository.getParticipant(meetingId, targetUserId, client);
      if (!target) {
        throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
      }
      if (target.status !== 'waiting') {
        throw new MeetingServiceError(409, PHASE7_ERROR_CODES.PARTICIPANT_NOT_WAITING, 'Participant is not in the waiting room');
      }
      if (targetUserId === auth.meeting!.host_id) {
        throw new MeetingServiceError(400, PHASE7_ERROR_CODES.CANNOT_REMOVE_HOST, 'Cannot deny the meeting host');
      }

      await meetingParticipantRepository.updateStatus(meetingId, targetUserId, 'removed', new Date(), client);
      await participantEventRepository.recordEvent(
        meetingId,
        targetUserId,
        'denied',
        hostUserId,
        {},
        client
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Terminate active subscriptions for the denied participant on this meeting topic
    try {
      subscriptionManager.removeUserFromTopic(targetUserId, `meeting:${meetingId}`);
    } catch (err: any) {
      console.error('[MeetingService] Subscription cleanup error:', err.message);
    }

    // Terminate media session
    try {
      await mediaSessionRepository.markLeft(meetingId, targetUserId);
    } catch (err: any) {
      console.error('[MeetingService] Media session cleanup error:', err.message);
    }

    try {
      await eventPublisher.publish('meeting.participant.denied', `meeting:${meetingId}`, {
        meetingId,
        userId: targetUserId,
        deniedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
      // Also notify the denied user directly
      await eventPublisher.publish('meeting.participant.denied', `user:${targetUserId}`, {
        meetingId,
        userId: targetUserId,
        deniedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.participant.denied):', err.message);
    }
  }

  /**
   * Host forces a participant's audio off (mute).
   * The participant's audioEnabled flag is set to false.
   * The participant client is responsible for actually muting the mic.
   * Host/admin only. Cannot mute the host.
   */
  async muteParticipant(
    hostUserId: string,
    meetingId: string,
    targetUserId: string
  ): Promise<MeetingParticipant> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only host or admin can mute participants');
    }
    if (targetUserId === auth.meeting!.host_id) {
      throw new MeetingServiceError(400, 'CANNOT_MUTE_HOST', 'Cannot mute the meeting host');
    }

    const target = await meetingParticipantRepository.getParticipant(meetingId, targetUserId);
    if (!target || !['joined', 'admitted'].includes(target.status)) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found or not in meeting');
    }

    const updated = await meetingParticipantRepository.updateMediaState(
      meetingId,
      targetUserId,
      { audioEnabled: false }
    );

    try {
      await eventPublisher.publish('meeting.participant.muted', `meeting:${meetingId}`, {
        meetingId,
        userId: targetUserId,
        mutedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
      // Notify the muted participant directly
      await eventPublisher.publish('meeting.participant.muted', `user:${targetUserId}`, {
        meetingId,
        userId: targetUserId,
        mutedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (muted):', err.message);
    }

    return updated!;
  }

  /**
   * Host stops a participant's screen share.
   * Cannot stop the host's screen share.
   * Host/admin only.
   */
  async stopParticipantScreenShare(
    hostUserId: string,
    meetingId: string,
    targetUserId: string
  ): Promise<MeetingParticipant> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only host or admin can stop screen share');
    }
    if (targetUserId === auth.meeting!.host_id) {
      throw new MeetingServiceError(400, 'CANNOT_STOP_HOST_SCREEN_SHARE', 'Cannot stop the meeting host\'s screen share');
    }

    const target = await meetingParticipantRepository.getParticipant(meetingId, targetUserId);
    if (!target || !['joined', 'admitted'].includes(target.status)) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found or not in meeting');
    }

    const updated = await meetingParticipantRepository.updateMediaState(
      meetingId,
      targetUserId,
      { screenSharing: false }
    );

    try {
      await eventPublisher.publish('meeting.participant.screen_share_stopped', `meeting:${meetingId}`, {
        meetingId,
        userId: targetUserId,
        stoppedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
      await eventPublisher.publish('meeting.participant.screen_share_stopped', `user:${targetUserId}`, {
        meetingId,
        userId: targetUserId,
        stoppedBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] screen_share_stopped event error:', err.message);
    }

    return updated!;
  }

  /**
   * Returns meeting history summary (start/end times, participants, artifacts).
   */
  async getMeetingHistory(
    userId: string,
    meetingId: string
  ): Promise<{
    meetingId: string;
    title: string;
    status: string;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    actualStartAt: string | null;
    actualEndAt: string | null;
    durationSeconds: number | null;
    hostId: string;
    participantCount: number;
    hasRecording: boolean;
    hasTranscript: boolean;
    isLocked: boolean;
  }> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    const meeting = auth.meeting!;
    const participants = await meetingParticipantRepository.listParticipants(meetingId);

    // Check for recording and transcript
    const [hasRecRow, hasTxRow, lockRow] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM meeting_recordings WHERE meeting_id = $1 AND status = 'COMPLETED'`,
        [meetingId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM meeting_transcripts WHERE meeting_id = $1 AND status = 'COMPLETED'`,
        [meetingId]
      ),
      pool.query<{ is_locked: boolean }>(
        'SELECT is_locked FROM meetings WHERE id = $1',
        [meetingId]
      ),
    ]);

    const actualStart = meeting.actual_start_at ? new Date(meeting.actual_start_at).getTime() : null;
    const actualEnd = meeting.actual_end_at ? new Date(meeting.actual_end_at).getTime() : null;
    const durationSeconds = actualStart && actualEnd
      ? Math.round((actualEnd - actualStart) / 1000)
      : null;

    return {
      meetingId,
      title: meeting.title,
      status: meeting.status,
      scheduledStartAt: meeting.scheduled_start_at ? new Date(meeting.scheduled_start_at).toISOString() : null,
      scheduledEndAt: meeting.scheduled_end_at ? new Date(meeting.scheduled_end_at).toISOString() : null,
      actualStartAt: meeting.actual_start_at ? new Date(meeting.actual_start_at).toISOString() : null,
      actualEndAt: meeting.actual_end_at ? new Date(meeting.actual_end_at).toISOString() : null,
      durationSeconds,
      hostId: meeting.host_id,
      participantCount: participants.length,
      hasRecording: Number(hasRecRow.rows[0]?.count || 0) > 0,
      hasTranscript: Number(hasTxRow.rows[0]?.count || 0) > 0,
      isLocked: Boolean(lockRow.rows[0]?.is_locked),
    };
  }

  /**
   * Cancels a scheduled/active meeting (SCHEDULED -> CANCELLED).
   * Host/admin only.
   * Dispatches meeting_cancelled notification and meeting.cancelled realtime event.
   */
  async cancelMeeting(hostUserId: string, meetingId: string): Promise<Meeting> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }
    if (!auth.canManage) {
      throw new MeetingServiceError(403, PHASE7_ERROR_CODES.NOT_MEETING_HOST, 'Only meeting host or admin can cancel the meeting');
    }

    const meeting = auth.meeting!;
    if (meeting.status === 'ended') {
      throw new MeetingServiceError(409, PHASE7_ERROR_CODES.MEETING_ALREADY_ENDED, 'Cannot cancel an ended meeting');
    }
    if (meeting.status === 'cancelled') {
      throw new MeetingServiceError(409, 'MEETING_ALREADY_CANCELLED', 'Meeting is already cancelled');
    }

    const client = await pool.connect();
    let updatedMeeting: Meeting;

    try {
      await client.query('BEGIN');

      const res = await client.query(
        `UPDATE meetings
         SET status = 'cancelled',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *;`,
        [meetingId]
      );
      updatedMeeting = meetingRepository.mapMeeting(res.rows[0]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Publish meeting.cancelled
    try {
      await eventPublisher.publish('meeting.cancelled', `meeting:${meetingId}`, {
        meetingId,
        cancelledBy: hostUserId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[MeetingService] Post-commit publication error (meeting.cancelled):', err.message);
    }

    // Send notifications to all participants (non-blocking)
    try {
      const participants = await meetingParticipantRepository.listParticipants(meetingId);
      for (const p of participants) {
        if (p.userId === hostUserId) continue; // Don't notify the canceler
        await notificationService.createNotification({
          recipientId: p.userId,
          organizationId: meeting.organization_id,
          actorId: hostUserId,
          type: 'meeting_cancelled',
          title: 'Meeting Cancelled',
          body: `The meeting "${meeting.title}" has been cancelled.`,
          resourceType: 'meeting',
          resourceId: meetingId,
          dataPayload: { meetingId, title: meeting.title },
        });
      }
    } catch (err: any) {
      console.error('[MeetingService] Notification dispatch error (meeting_cancelled):', err.message);
    }

    return updatedMeeting;
  }

  /**
   * Returns durable participant history for a meeting (all participants and their chronological lifecycle transitions).
   * Reads from the durable meeting_participant_events audit log.
   */
  async getParticipantHistory(
    userId: string,
    meetingId: string
  ): Promise<Array<{
    userId: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    finalStatus: string;
    joinedAt: string;
    leftAt: string | null;
    networkQuality: string;
    events: Array<{
      id: string;
      eventType: string;
      actorId: string | null;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>;
  }>> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.canAccess) {
      throw new MeetingServiceError(404, PHASE7_ERROR_CODES.MEETING_NOT_FOUND, 'Meeting not found');
    }

    // 1. Read durable participant events
    const rawEvents = await participantEventRepository.listEventsByMeeting(meetingId);

    // 2. Fetch current participant rows for profile & media telemetry
    const participantsResult = await pool.query<{
      user_id: string;
      display_name: string;
      email: string;
      avatar_url: string | null;
      role: string;
      status: string;
      joined_at: Date;
      left_at: Date | null;
      network_quality: string;
    }>(
      `SELECT
         mp.user_id,
         u.display_name,
         u.email,
         u.avatar_url,
         mp.role,
         mp.status,
         mp.joined_at,
         mp.left_at,
         COALESCE(mp.network_quality, 'UNKNOWN') AS network_quality
       FROM meeting_participants mp
       JOIN users u ON mp.user_id = u.id
       WHERE mp.meeting_id = $1
       ORDER BY mp.joined_at ASC;`,
      [meetingId]
    );

    const userMap = new Map(participantsResult.rows.map((u) => [u.user_id, u]));

    // Group events chronologically by user
    const eventsByUser = new Map<string, Array<{
      id: string;
      eventType: string;
      actorId: string | null;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>>();

    for (const ev of rawEvents) {
      if (!eventsByUser.has(ev.userId)) {
        eventsByUser.set(ev.userId, []);
      }
      eventsByUser.get(ev.userId)!.push({
        id: ev.id,
        eventType: ev.eventType,
        actorId: ev.actorId,
        metadata: ev.metadata,
        createdAt: ev.createdAt,
      });
    }

    const participantUserIds = new Set([
      ...participantsResult.rows.map((u) => u.user_id),
      ...rawEvents.map((e) => e.userId),
    ]);

    const results = [];
    for (const pUserId of participantUserIds) {
      const u = userMap.get(pUserId);
      const userEvents = eventsByUser.get(pUserId) || [];
      const lastEvent = userEvents[userEvents.length - 1];
      const finalStatus = lastEvent ? lastEvent.eventType : (u?.status || 'unknown');

      results.push({
        userId: pUserId,
        displayName: u?.display_name || 'Participant',
        email: u?.email || '',
        avatarUrl: u?.avatar_url || null,
        role: u?.role || 'attendee',
        finalStatus,
        joinedAt: u?.joined_at ? new Date(u.joined_at).toISOString() : (userEvents[0]?.createdAt || new Date().toISOString()),
        leftAt: u?.left_at ? new Date(u.left_at).toISOString() : null,
        networkQuality: u?.network_quality || 'UNKNOWN',
        events: userEvents,
      });
    }

    return results;
  }
}

export const meetingService = new MeetingService();

