import { meetingRepository } from '../db/repositories/meeting.repository.js';
import { meetingParticipantRepository } from '../db/repositories/meetingParticipant.repository.js';
import { authorizationService } from '../modules/authorization/authorization.service.js';
import { eventPublisher } from './event.publisher.js';
import type { AuthenticatedSocket } from './subscription.manager.js';
import type {
  RealtimeEventName,
  WebRtcSignalType,
  WebRtcSignalPayload,
  MeetingReactionPayload,
  MeetingHandPayload,
} from '@teamtrack/shared-types';

export class WebRtcSignalingService {
  /**
   * Validates and routes WebRTC signaling messages between participants in an active meeting.
   * Enforces:
   * 1. Authenticated sender (derived from socket)
   * 2. Meeting exists and is ACTIVE
   * 3. Sender belongs to meeting and is ADMITTED or JOINED
   * 4. Target belongs to same meeting and is ADMITTED or JOINED
   * 5. Target is not waiting or removed
   * 6. Sender cannot spoof identity or signal cross-meeting
   */
  async handleSignaling(
    socket: AuthenticatedSocket,
    signalType: 'webrtc.offer' | 'webrtc.answer' | 'webrtc.ice_candidate' | 'webrtc.renegotiate',
    payload: any
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'INVALID_SIGNAL_PAYLOAD' };
    }

    const { meetingId, targetUserId } = payload;
    if (!meetingId || typeof meetingId !== 'string') {
      return { success: false, error: 'MISSING_MEETING_ID' };
    }

    if (!targetUserId || typeof targetUserId !== 'string') {
      return { success: false, error: 'MISSING_TARGET_USER_ID' };
    }

    if (targetUserId === socket.userId) {
      return { success: false, error: 'CANNOT_SIGNAL_SELF' };
    }

    // 1. Verify meeting exists and is ACTIVE
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      return { success: false, error: 'MEETING_NOT_FOUND' };
    }

    if (meeting.status !== 'active') {
      return { success: false, error: 'MEETING_NOT_ACTIVE' };
    }

    // Re-verify current active organization membership (defends against suspended/removed users)
    const orgAuth = await authorizationService.getOrganizationAuth(socket.userId, meeting.organization_id);
    if (!orgAuth.isMember) {
      return { success: false, error: 'ORGANIZATION_ACCESS_DENIED' };
    }

    // 2. Verify sender belongs to meeting and is admitted or joined
    const senderParticipant = await meetingParticipantRepository.getParticipant(meetingId, socket.userId);
    if (!senderParticipant) {
      return { success: false, error: 'SENDER_NOT_PARTICIPANT' };
    }

    if (senderParticipant.status === 'removed') {
      return { success: false, error: 'SENDER_REMOVED' };
    }

    if (senderParticipant.status === 'waiting') {
      return { success: false, error: 'SENDER_WAITING_CANNOT_SIGNAL' };
    }

    if (senderParticipant.status !== 'joined' && senderParticipant.status !== 'admitted') {
      return { success: false, error: 'SENDER_NOT_ELIGIBLE' };
    }

    // 3. Verify target participant belongs to the same meeting and is eligible
    const targetParticipant = await meetingParticipantRepository.getParticipant(meetingId, targetUserId);
    if (!targetParticipant) {
      return { success: false, error: 'TARGET_NOT_FOUND' };
    }

    if (targetParticipant.status === 'removed' || targetParticipant.status === 'left') {
      return { success: false, error: 'TARGET_NOT_AVAILABLE' };
    }

    if (targetParticipant.status === 'waiting') {
      return { success: false, error: 'TARGET_IN_WAITING_ROOM' };
    }

    // Determine clean signal type enum
    const rawType = signalType.replace('webrtc.', '') as WebRtcSignalType;
    const signalData = payload.data !== undefined ? payload.data : payload.payload;

    const signalPayload: WebRtcSignalPayload = {
      meetingId,
      senderUserId: socket.userId, // AUTHORITATIVE: derived from authenticated socket
      targetUserId,
      signalType: rawType,
      data: signalData,
    };

    // Route directly to target user topic (all target sockets across instances receive it)
    await eventPublisher.publish(signalType as RealtimeEventName, `user:${targetUserId}`, signalPayload);

    return { success: true };
  }

  /**
   * Handles transient meeting reaction events.
   * Derived sender identity ensures no spoofing.
   */
  async handleReaction(
    socket: AuthenticatedSocket,
    payload: any
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'INVALID_PAYLOAD' };
    }

    const { meetingId, emoji } = payload;
    const reaction = emoji || payload.reaction || payload.reactionCode;

    if (!meetingId || typeof meetingId !== 'string') {
      return { success: false, error: 'MISSING_MEETING_ID' };
    }

    if (!reaction || typeof reaction !== 'string' || reaction.length > 32) {
      return { success: false, error: 'INVALID_REACTION' };
    }

    // Verify meeting is active
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting || meeting.status !== 'active') {
      return { success: false, error: 'MEETING_NOT_ACTIVE' };
    }

    const orgAuth = await authorizationService.getOrganizationAuth(socket.userId, meeting.organization_id);
    if (!orgAuth.isMember) {
      return { success: false, error: 'ORGANIZATION_ACCESS_DENIED' };
    }

    // Verify sender is an active participant
    const participant = await meetingParticipantRepository.getParticipant(meetingId, socket.userId);
    if (!participant || (participant.status !== 'joined' && participant.status !== 'admitted')) {
      return { success: false, error: 'NOT_ACTIVE_PARTICIPANT' };
    }

    const reactionPayload: MeetingReactionPayload = {
      meetingId,
      userId: socket.userId,
      reactionCode: reaction,
    };

    await eventPublisher.publish('meeting.reaction', `meeting:${meetingId}`, reactionPayload);
    return { success: true };
  }

  /**
   * Handles hand raising/lowering via realtime message.
   * Updates durable state in DB and publishes event.
   */
  async handleHandState(
    socket: AuthenticatedSocket,
    meetingId: string,
    raise: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!meetingId || typeof meetingId !== 'string') {
      return { success: false, error: 'MISSING_MEETING_ID' };
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting || meeting.status !== 'active') {
      return { success: false, error: 'MEETING_NOT_ACTIVE' };
    }

    const orgAuth = await authorizationService.getOrganizationAuth(socket.userId, meeting.organization_id);
    if (!orgAuth.isMember) {
      return { success: false, error: 'ORGANIZATION_ACCESS_DENIED' };
    }

    const participant = await meetingParticipantRepository.getParticipant(meetingId, socket.userId);
    if (!participant || (participant.status !== 'joined' && participant.status !== 'admitted')) {
      return { success: false, error: 'NOT_ACTIVE_PARTICIPANT' };
    }

    // Update durable state in PostgreSQL
    await meetingParticipantRepository.updateMediaState(meetingId, socket.userId, {
      handRaised: raise,
    });

    const eventName: RealtimeEventName = raise ? 'meeting.hand_raised' : 'meeting.hand_lowered';
    const handPayload: MeetingHandPayload = {
      meetingId,
      userId: socket.userId,
      handRaised: raise,
    };

    await eventPublisher.publish(eventName, `meeting:${meetingId}`, handPayload);
    return { success: true };
  }
}

export const webRtcSignalingService = new WebRtcSignalingService();
