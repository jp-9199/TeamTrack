import { eventPublisher } from './event.publisher.js';
import type { AuthenticatedSocket } from './subscription.manager.js';
import type { RealtimeEventName } from '@teamtrack/shared-types';

export interface CallInvitePayload {
  callId: string;
  targetUserId: string;
  callType?: 'audio' | 'video';
  callerName?: string;
  callerAvatarUrl?: string | null;
}

export interface CallAcceptPayload {
  callId: string;
  callerUserId: string;
}

export interface CallRejectPayload {
  callId: string;
  callerUserId: string;
  reason?: 'declined' | 'busy' | 'unavailable';
}

export interface CallEndPayload {
  callId: string;
  targetUserId: string;
  durationSeconds?: number;
}

export interface ActiveCallState {
  callId: string;
  callerUserId: string;
  targetUserId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'rejected';
  startedAt: Date;
  connectedAt?: Date;
}

export class CallSignalingService {
  private activeCalls = new Map<string, ActiveCallState>();

  /**
   * Dispatches a call invitation from the authenticated caller to the target recipient.
   */
  async handleCallInvite(
    socket: AuthenticatedSocket,
    payload: CallInvitePayload
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || !payload.targetUserId || !payload.callId) {
      return { success: false, error: 'MISSING_INVITE_PARAMETERS' };
    }

    if (payload.targetUserId === socket.userId) {
      return { success: false, error: 'CANNOT_CALL_SELF' };
    }

    const activeCall: ActiveCallState = {
      callId: payload.callId,
      callerUserId: socket.userId,
      targetUserId: payload.targetUserId,
      callType: payload.callType || 'audio',
      status: 'ringing',
      startedAt: new Date(),
    };
    this.activeCalls.set(payload.callId, activeCall);

    const inviteEvent = {
      callId: payload.callId,
      callerUserId: socket.userId,
      callerName: payload.callerName || 'Unknown Caller',
      callerAvatarUrl: payload.callerAvatarUrl || null,
      callType: payload.callType || 'audio',
      timestamp: new Date().toISOString(),
    };

    await eventPublisher.publish('call.invite' as RealtimeEventName, `user:${payload.targetUserId}`, inviteEvent);
    return { success: true };
  }

  /**
   * Accepts an incoming call and notifies the original caller.
   */
  async handleCallAccept(
    socket: AuthenticatedSocket,
    payload: CallAcceptPayload
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || !payload.callId || !payload.callerUserId) {
      return { success: false, error: 'MISSING_ACCEPT_PARAMETERS' };
    }

    const call = this.activeCalls.get(payload.callId);
    if (call) {
      call.status = 'connected';
      call.connectedAt = new Date();
    }

    const acceptEvent = {
      callId: payload.callId,
      calleeUserId: socket.userId,
      timestamp: new Date().toISOString(),
    };

    await eventPublisher.publish('call.accept' as RealtimeEventName, `user:${payload.callerUserId}`, acceptEvent);
    return { success: true };
  }

  /**
   * Rejects an incoming call invitation.
   */
  async handleCallReject(
    socket: AuthenticatedSocket,
    payload: CallRejectPayload
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || !payload.callId || !payload.callerUserId) {
      return { success: false, error: 'MISSING_REJECT_PARAMETERS' };
    }

    const call = this.activeCalls.get(payload.callId);
    if (call) {
      call.status = 'rejected';
    }

    const rejectEvent = {
      callId: payload.callId,
      calleeUserId: socket.userId,
      reason: payload.reason || 'declined',
      timestamp: new Date().toISOString(),
    };

    await eventPublisher.publish('call.reject' as RealtimeEventName, `user:${payload.callerUserId}`, rejectEvent);
    return { success: true };
  }

  /**
   * Terminates an active call and calculates duration.
   */
  async handleCallEnd(
    socket: AuthenticatedSocket,
    payload: CallEndPayload
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || !payload.callId || !payload.targetUserId) {
      return { success: false, error: 'MISSING_END_PARAMETERS' };
    }

    const call = this.activeCalls.get(payload.callId);
    let durationSeconds = payload.durationSeconds || 0;
    if (call && call.connectedAt) {
      durationSeconds = Math.round((Date.now() - call.connectedAt.getTime()) / 1000);
      call.status = 'ended';
    }

    const endEvent = {
      callId: payload.callId,
      endedByUserId: socket.userId,
      durationSeconds,
      timestamp: new Date().toISOString(),
    };

    await eventPublisher.publish('call.end' as RealtimeEventName, `user:${payload.targetUserId}`, endEvent);
    this.activeCalls.delete(payload.callId);
    return { success: true };
  }

  /**
   * Relays peer-to-peer WebRTC signaling data (offer, answer, ICE candidate).
   */
  async handleSignal(
    socket: AuthenticatedSocket,
    signalType: string,
    payload: any
  ): Promise<{ success: boolean; error?: string }> {
    if (!payload || !payload.targetUserId) {
      return { success: false, error: 'MISSING_TARGET_USER_ID' };
    }

    const signalEvent = {
      callId: payload.callId,
      senderUserId: socket.userId,
      signalType,
      data: payload.data || payload.signal || payload,
      timestamp: new Date().toISOString(),
    };

    const eventName = (signalType.startsWith('call.') ? signalType : `call.${signalType}`) as RealtimeEventName;
    await eventPublisher.publish(eventName, `user:${payload.targetUserId}`, signalEvent);
    return { success: true };
  }
}

export const callSignalingService = new CallSignalingService();
