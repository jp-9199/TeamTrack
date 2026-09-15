import type { MeetingRecording, RecordingDownloadUrlResponse } from '@teamtrack/shared-types';
import { PHASE11_ERROR_CODES } from '@teamtrack/shared-types';
import { pool } from '../../db/pool.js';
import { recordingRepository } from '../../db/repositories/recording.repository.js';
import { meetingArtifactRepository } from '../../db/repositories/meetingArtifact.repository.js';
import { meetingAuthorizationService } from './meeting.authorization.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import { recordingProvider } from './recording/recording.provider.factory.js';
import { getStorageProvider } from '../../storage/storage.factory.js';
import { notificationService } from '../notifications/notification.service.js';
import type { PoolClient } from 'pg';

export class RecordingServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'RecordingServiceError';
  }
}

export class RecordingService {
  /**
   * Starts a recording for a meeting.
   * Only the host or an org admin may initiate recording.
   * Idempotent: returns existing active recording if one exists.
   *
   * NOTE: Provider calls occur OUTSIDE any DB transaction.
   */
  async startRecording(hostUserId: string, meetingId: string): Promise<MeetingRecording> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);

    if (!auth.meetingExists) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.canManage) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_ACCESS_DENIED, 'Only the host or org admin can start recording', 403);
    }
    if (auth.meeting!.status !== 'active') {
      throw new RecordingServiceError('MEETING_NOT_ACTIVE', 'Meeting must be active to start recording', 409);
    }

    // Idempotent create — returns existing if already active
    const { recording, created } = await recordingRepository.createOrGetActive(
      meetingId,
      hostUserId,
      recordingProvider.name
    );

    if (!created) {
      // Already recording — idempotent success
      return recording;
    }

    // Provider call is OUTSIDE transaction
    let providerResult;
    try {
      providerResult = await recordingProvider.startRecording(meetingId, recording.id);
    } catch (err: any) {
      // Mark as FAILED if provider call fails
      await recordingRepository.updateStatus(recording.id, 'FAILED', {
        providerErrorCode: 'PROVIDER_START_FAILED',
        providerErrorMessage: err.message,
      });
      throw new RecordingServiceError(
        PHASE11_ERROR_CODES.RECORDING_PROVIDER_ERROR,
        `Recording provider failed to start: ${err.message}`,
        502
      );
    }

    // Update status to STARTING with provider ID
    const updatedRecording = await recordingRepository.updateStatus(recording.id, 'STARTING', {
      providerRecordingId: providerResult.providerRecordingId,
      consentNotifiedAt: new Date(),
      startedAt: new Date(),
    });

    // Create artifact entry
    await meetingArtifactRepository.create(
      meetingId,
      hostUserId,
      'recording',
      { recordingId: recording.id, title: 'Meeting Recording' }
    );

    // Emit realtime event (post-commit, provider call already done)
    await eventPublisher.publish(
      'meeting.recording.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        recordingId: recording.id,
        status: 'STARTING',
        startedBy: hostUserId,
        timestamp: new Date().toISOString(),
      }
    );

    return updatedRecording!;
  }

  /**
   * Stops an active recording.
   * Only the host or an org admin may stop recording.
   */
  async stopRecording(hostUserId: string, meetingId: string): Promise<MeetingRecording> {
    const auth = await meetingAuthorizationService.getMeetingAuth(hostUserId, meetingId);

    if (!auth.meetingExists) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.canManage) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_ACCESS_DENIED, 'Only the host or org admin can stop recording', 403);
    }

    // Find active recording
    const activeRecording = await recordingRepository.getActiveRecording(meetingId);
    if (!activeRecording) {
      throw new RecordingServiceError(
        PHASE11_ERROR_CODES.RECORDING_NOT_ACTIVE,
        'No active recording found for this meeting',
        409
      );
    }

    // Provider call OUTSIDE transaction
    let providerResult;
    try {
      providerResult = await recordingProvider.stopRecording(
        meetingId,
        activeRecording.provider_recording_id || ''
      );
    } catch (err: any) {
      // Graceful degradation: mark as FAILED even if provider fails
      await recordingRepository.updateStatus(activeRecording.id, 'FAILED', {
        stoppedBy: hostUserId,
        providerErrorCode: 'PROVIDER_STOP_FAILED',
        providerErrorMessage: err.message,
        endedAt: new Date(),
      });
      throw new RecordingServiceError(
        PHASE11_ERROR_CODES.RECORDING_PROVIDER_ERROR,
        `Recording provider failed to stop: ${err.message}`,
        502
      );
    }

    const updatedRecording = await recordingRepository.updateStatus(activeRecording.id, 'STOPPING', {
      stoppedBy: hostUserId,
      endedAt: new Date(),
    });

    await eventPublisher.publish(
      'meeting.recording.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        recordingId: activeRecording.id,
        status: 'STOPPING',
        startedBy: activeRecording.started_by,
        timestamp: new Date().toISOString(),
      }
    );

    return updatedRecording!;
  }

  /**
   * Gets the latest recording for a meeting.
   * Any admitted/joined participant may view recording metadata (not the file).
   */
  async getLatestRecording(userId: string, meetingId: string): Promise<MeetingRecording | null> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Meeting not found', 404);
    }

    const recordings = await recordingRepository.findByMeeting(meetingId);
    return recordings[0] || null;
  }

  /**
   * Lists all recordings for a meeting (newest first).
   */
  async listRecordings(userId: string, meetingId: string): Promise<MeetingRecording[]> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Meeting not found', 404);
    }

    return recordingRepository.findByMeeting(meetingId);
  }

  /**
   * Gets a single recording by ID.
   */
  async getRecording(userId: string, recordingId: string): Promise<MeetingRecording> {
    const dbRecording = await recordingRepository.findById(recordingId);
    if (!dbRecording) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Recording not found', 404);
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(userId, dbRecording.meeting_id);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Recording not found', 404);
    }

    return recordingRepository.mapRecording(dbRecording);
  }

  /**
   * Generates a short-lived presigned download URL for a completed recording.
   * SECURITY: Never exposes the raw storage key to the client.
   * Only COMPLETED recordings can be downloaded.
   */
  async getRecordingDownloadUrl(
    userId: string,
    recordingId: string
  ): Promise<RecordingDownloadUrlResponse> {
    const dbRecording = await recordingRepository.findById(recordingId);
    if (!dbRecording) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Recording not found', 404);
    }

    // Verify user can access the meeting that this recording belongs to
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, dbRecording.meeting_id);
    if (!auth.meetingExists || !auth.canAccess) {
      // Return 404 to avoid leaking existence of recordings in other tenants/meetings
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Recording not found', 404);
    }

    if (dbRecording.status !== 'COMPLETED') {
      throw new RecordingServiceError(
        PHASE11_ERROR_CODES.RECORDING_NOT_ACTIVE,
        'Recording is not yet completed',
        409
      );
    }

    const storageKey = await recordingRepository.getStorageKey(recordingId);
    if (!storageKey) {
      throw new RecordingServiceError(PHASE11_ERROR_CODES.RECORDING_NOT_FOUND, 'Recording file not available', 404);
    }

    // Generate presigned URL — NEVER return storageKey to client
    const storage = getStorageProvider();
    const TTL_SECONDS = 300; // 5-minute download window
    const downloadUrl = await storage.getSignedDownloadUrl(
      storageKey,
      TTL_SECONDS,
      `meeting-recording-${recordingId}.mp4`
    );

    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    return { downloadUrl, expiresAt };
  }

  /**
   * Called after a meeting ends to finalize any in-progress recording.
   * This is an internal method called by meeting.service.ts after endMeeting.
   */
  async finalizeOnMeetingEnd(meetingId: string, hostUserId: string): Promise<void> {
    const activeRecording = await recordingRepository.getActiveRecording(meetingId);
    if (!activeRecording) return;

    // Gracefully stop the recording provider
    try {
      if (activeRecording.provider_recording_id) {
        await recordingProvider.stopRecording(meetingId, activeRecording.provider_recording_id);
      }
    } catch {
      // Swallow — meeting is ending regardless
    }

    await recordingRepository.updateStatus(activeRecording.id, 'STOPPING', {
      stoppedBy: hostUserId,
      endedAt: new Date(),
    });

    await eventPublisher.publish(
      'meeting.recording.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        recordingId: activeRecording.id,
        status: 'STOPPING',
        startedBy: activeRecording.started_by,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Polls provider status and promotes recording to COMPLETED when ready.
   * Called by a background job or webhook in production.
   * In Phase 11, this is callable via a test/admin endpoint for simulation.
   */
  async pollAndFinalizeRecording(recordingId: string): Promise<MeetingRecording | null> {
    const dbRecording = await recordingRepository.findById(recordingId);
    if (!dbRecording || !dbRecording.provider_recording_id) return null;
    if (!['STARTING', 'RECORDING', 'STOPPING'].includes(dbRecording.status)) return null;

    const statusResult = await recordingProvider.getRecordingStatus(
      dbRecording.meeting_id,
      dbRecording.provider_recording_id
    );
    if (!statusResult) return null;

    if (statusResult.status === 'COMPLETED') {
      const updated = await recordingRepository.updateStatus(recordingId, 'COMPLETED', {
        storageKey: statusResult.storageKey || null,
        mimeType: statusResult.mimeType || null,
        fileSizeBytes: statusResult.fileSizeBytes || null,
        durationSeconds: statusResult.durationSeconds || null,
        endedAt: dbRecording.ended_at || new Date(),
      });

      // Send notification to host
      try {
        await notificationService.createNotification({
          recipientId: dbRecording.started_by,
          type: 'meeting_recording_ready',
          title: 'Recording Ready',
          body: 'Your meeting recording is ready to download.',
          resourceType: 'recording',
          resourceId: recordingId,
          dataPayload: { meetingId: dbRecording.meeting_id, recordingId },
        });
      } catch {
        // Non-blocking notification failure
      }

      await eventPublisher.publish(
        'meeting.recording.state_changed',
        `meeting:${dbRecording.meeting_id}`,
        {
          meetingId: dbRecording.meeting_id,
          recordingId,
          status: 'COMPLETED',
          startedBy: dbRecording.started_by,
          timestamp: new Date().toISOString(),
        }
      );

      return updated;
    }

    if (statusResult.status === 'FAILED') {
      const updated = await recordingRepository.updateStatus(recordingId, 'FAILED', {
        providerErrorCode: statusResult.errorCode || null,
        providerErrorMessage: statusResult.errorMessage || null,
      });
      return updated;
    }

    return recordingRepository.findById(recordingId).then(
      (r) => r ? recordingRepository['mapRecording'](r) : null
    );
  }
}

export const recordingService = new RecordingService();
