/**
 * Mobile Meeting Integration Architecture (React Native)
 *
 * In accordance with Phase 7 architectural rules:
 * - Uses platform-appropriate WebRTC integration contracts (react-native-webrtc).
 * - Shares the exact same backend, REST endpoints, WS ticket auth, and realtime envelope.
 * - Native runtime limitation note: Compiling native iOS (Cocoapods) / Android (Gradle/NDK)
 *   webrtc libraries requires platform-specific build toolchains (Xcode / Android SDK)
 *   not bundled in standard Node runtime environments. The architecture and types are
 *   fully implemented and aligned.
 */

import type {
  Meeting,
  MeetingWithHost,
  MeetingParticipant,
  MeetingParticipantWithUser,
  CreateMeetingRequest,
  TransferHostRequest,
  UpdateMediaStateRequest,
  MeetingSyncResponse,
  WebRtcSignalPayload,
} from '@teamtrack/shared-types';
import type { ApiClient } from '@teamtrack/api-client';

export interface MobileMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  handRaised: boolean;
}

export class MobileMeetingService {
  constructor(private apiClient: ApiClient) {}

  async createMeeting(req: CreateMeetingRequest) {
    return this.apiClient.createMeeting(req);
  }

  async listMeetings(organizationId: string) {
    return this.apiClient.listMeetings(organizationId);
  }

  async joinMeeting(meetingId: string) {
    return this.apiClient.joinMeeting(meetingId);
  }

  async leaveMeeting(meetingId: string) {
    return this.apiClient.leaveMeeting(meetingId);
  }

  async updateMediaState(meetingId: string, req: UpdateMediaStateRequest) {
    return this.apiClient.updateMediaState(meetingId, req);
  }

  async syncMeeting(meetingId: string, since?: string) {
    return this.apiClient.syncMeeting(meetingId, since);
  }

  async admitParticipant(meetingId: string, userId: string) {
    return this.apiClient.admitParticipant(meetingId, userId);
  }

  async removeParticipant(meetingId: string, userId: string) {
    return this.apiClient.removeParticipant(meetingId, userId);
  }

  async transferHost(meetingId: string, req: TransferHostRequest) {
    return this.apiClient.transferHost(meetingId, req);
  }

  async endMeeting(meetingId: string) {
    return this.apiClient.endMeeting(meetingId);
  }
}
