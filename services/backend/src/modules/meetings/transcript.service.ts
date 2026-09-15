import type {
  MeetingTranscript,
  TranscriptDownloadUrlResponse,
} from '@teamtrack/shared-types';
import { PHASE11_ERROR_CODES } from '@teamtrack/shared-types';
import { transcriptRepository } from '../../db/repositories/transcript.repository.js';
import { recordingRepository } from '../../db/repositories/recording.repository.js';
import { meetingArtifactRepository } from '../../db/repositories/meetingArtifact.repository.js';
import { meetingAuthorizationService } from './meeting.authorization.js';
import { eventPublisher } from '../../realtime/event.publisher.js';
import { transcriptionProvider } from './transcription/transcription.provider.factory.js';
import { getStorageProvider } from '../../storage/storage.factory.js';
import { notificationService } from '../notifications/notification.service.js';

export class TranscriptServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'TranscriptServiceError';
  }
}

export class TranscriptService {
  /**
   * Requests transcription for a meeting recording.
   * Only the host or an org admin can request transcription.
   * Idempotent: returns existing transcript if one is already processing/completed.
   *
   * NOTE: Provider calls occur OUTSIDE any DB transaction.
   */
  async requestTranscription(
    userId: string,
    meetingId: string,
    recordingId?: string,
    language: string = 'en-US'
  ): Promise<MeetingTranscript> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);

    if (!auth.meetingExists) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Meeting not found', 404);
    }
    if (!auth.canManage) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_ACCESS_DENIED, 'Only the host or org admin can request transcripts', 403);
    }

    // Resolve recordingId if not provided (use latest recording for meeting)
    let targetRecordingId = recordingId;
    if (!targetRecordingId) {
      const activeOrLatest = await recordingRepository.getActiveRecording(meetingId);
      const latest = activeOrLatest || (await recordingRepository.findByMeeting(meetingId))[0];
      if (!latest) {
        throw new TranscriptServiceError(
          PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND,
          'No recording found for this meeting to transcribe',
          404
        );
      }
      targetRecordingId = latest.id;
    } else {
      const recRow = await recordingRepository.findById(targetRecordingId);
      if (!recRow || recRow.meeting_id !== meetingId) {
        throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Recording not found for this meeting', 404);
      }
      if (recRow.status !== 'COMPLETED') {
        throw new TranscriptServiceError(
          PHASE11_ERROR_CODES.INVALID_TRANSCRIPT_STATE_TRANSITION,
          'Recording must be COMPLETED before requesting transcription',
          409
        );
      }
    }

    // Idempotent create
    const { transcript, created } = await transcriptRepository.createOrGetActive(
      meetingId,
      userId,
      targetRecordingId,
      transcriptionProvider.name,
      language
    );

    if (!created) {
      // Return existing transcript — idempotent
      return transcript;
    }

    // Provider call OUTSIDE transaction
    let providerResult;
    try {
      providerResult = await transcriptionProvider.requestTranscription(
        meetingId,
        targetRecordingId,
        language
      );
    } catch (err: any) {
      await transcriptRepository.updateStatus(transcript.id, 'FAILED', {
        providerErrorCode: 'PROVIDER_REQUEST_FAILED',
        providerErrorMessage: err.message,
      });
      throw new TranscriptServiceError(
        PHASE11_ERROR_CODES.TRANSCRIPT_PROVIDER_ERROR,
        `Transcription provider failed: ${err.message}`,
        502
      );
    }

    // Promote to PROCESSING
    const updated = await transcriptRepository.updateStatus(transcript.id, 'PROCESSING', {
      providerTranscriptId: providerResult.providerTranscriptId,
      startedAt: new Date(),
    });

    // Create artifact entry
    await meetingArtifactRepository.create(
      meetingId,
      userId,
      'transcript',
      { transcriptId: transcript.id, title: 'Meeting Transcript' }
    );

    // Emit realtime event
    await eventPublisher.publish(
      'meeting.transcript.state_changed',
      `meeting:${meetingId}`,
      {
        meetingId,
        transcriptId: transcript.id,
        status: 'PROCESSING',
        requestedBy: userId,
        timestamp: new Date().toISOString(),
      }
    );

    return updated!;
  }

  /**
   * Cancels an in-progress transcription request.
   */
  async cancelTranscription(userId: string, transcriptId: string): Promise<MeetingTranscript> {
    const dbTranscript = await transcriptRepository.findById(transcriptId);
    if (!dbTranscript) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(userId, dbTranscript.meeting_id);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }
    if (!auth.canManage) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_ACCESS_DENIED, 'Only host or admin can cancel transcription', 403);
    }

    if (!['REQUESTED', 'PROCESSING'].includes(dbTranscript.status)) {
      throw new TranscriptServiceError(
        PHASE11_ERROR_CODES.INVALID_TRANSCRIPT_STATE_TRANSITION,
        `Cannot cancel transcript in status ${dbTranscript.status}`,
        409
      );
    }

    if (dbTranscript.provider_transcript_id) {
      try {
        await transcriptionProvider.cancelTranscription(
          dbTranscript.meeting_id,
          dbTranscript.provider_transcript_id
        );
      } catch (err: any) {
        console.error('[TranscriptService] Provider cancel error:', err.message);
      }
    }

    const updated = await transcriptRepository.updateStatus(transcriptId, 'CANCELLED');

    await eventPublisher.publish(
      'meeting.transcript.state_changed',
      `meeting:${dbTranscript.meeting_id}`,
      {
        meetingId: dbTranscript.meeting_id,
        transcriptId,
        status: 'CANCELLED',
        requestedBy: userId,
        timestamp: new Date().toISOString(),
      }
    );

    return updated!;
  }

  /**
   * Gets the latest transcript for a meeting.
   * Any admitted participant may view metadata (not content).
   */
  async getLatestTranscript(userId: string, meetingId: string): Promise<MeetingTranscript | null> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Meeting not found', 404);
    }

    const transcripts = await transcriptRepository.findByMeeting(meetingId);
    return transcripts[0] || null;
  }

  /**
   * Lists all transcripts for a meeting.
   */
  async listTranscripts(userId: string, meetingId: string): Promise<MeetingTranscript[]> {
    const auth = await meetingAuthorizationService.getMeetingAuth(userId, meetingId);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Meeting not found', 404);
    }

    return transcriptRepository.findByMeeting(meetingId);
  }

  /**
   * Gets a specific transcript by ID.
   */
  async getTranscript(userId: string, transcriptId: string): Promise<MeetingTranscript> {
    const dbTranscript = await transcriptRepository.findById(transcriptId);
    if (!dbTranscript) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(userId, dbTranscript.meeting_id);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }

    return transcriptRepository.mapTranscript(dbTranscript);
  }

  /**
   * Generates a short-lived presigned download URL for a completed transcript.
   * SECURITY: Never returns raw storage key to clients.
   */
  async getTranscriptDownloadUrl(
    userId: string,
    transcriptId: string
  ): Promise<TranscriptDownloadUrlResponse> {
    const dbTranscript = await transcriptRepository.findById(transcriptId);
    if (!dbTranscript) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }

    const auth = await meetingAuthorizationService.getMeetingAuth(userId, dbTranscript.meeting_id);
    if (!auth.meetingExists || !auth.canAccess) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript not found', 404);
    }

    if (dbTranscript.status !== 'COMPLETED') {
      throw new TranscriptServiceError(
        PHASE11_ERROR_CODES.INVALID_TRANSCRIPT_STATE_TRANSITION,
        'Transcript is not yet completed',
        409
      );
    }

    const storageKey = await transcriptRepository.getStorageKey(transcriptId);
    if (!storageKey) {
      throw new TranscriptServiceError(PHASE11_ERROR_CODES.TRANSCRIPT_NOT_FOUND, 'Transcript file not available', 404);
    }

    const storage = getStorageProvider();
    const TTL_SECONDS = 300;
    const downloadUrl = await storage.getSignedDownloadUrl(
      storageKey,
      TTL_SECONDS,
      `meeting-transcript-${transcriptId}.json`
    );

    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    return { downloadUrl, expiresAt };
  }

  /**
   * Polls provider and finalizes transcript when COMPLETED.
   * In Phase 11, callable via test/admin endpoint to simulate completion.
   */
  async pollAndFinalizeTranscript(transcriptId: string): Promise<MeetingTranscript | null> {
    const dbTranscript = await transcriptRepository.findById(transcriptId);
    if (!dbTranscript || !dbTranscript.provider_transcript_id) return null;
    if (!['REQUESTED', 'PROCESSING'].includes(dbTranscript.status)) return null;

    const statusResult = await transcriptionProvider.getTranscriptionStatus(
      dbTranscript.meeting_id,
      dbTranscript.provider_transcript_id
    );
    if (!statusResult) return null;

    if (statusResult.status === 'COMPLETED') {
      const updated = await transcriptRepository.updateStatus(transcriptId, 'COMPLETED', {
        storageKey: statusResult.storageKey || null,
        wordCount: statusResult.wordCount || null,
        speakerCount: statusResult.speakerCount || null,
        completedAt: new Date(),
      });

      // Send notification to requester
      try {
        await notificationService.createNotification({
          recipientId: dbTranscript.requested_by,
          type: 'meeting_transcript_ready',
          title: 'Transcript Ready',
          body: 'Your meeting transcript is ready to download.',
          resourceType: 'transcript',
          resourceId: transcriptId,
          dataPayload: { meetingId: dbTranscript.meeting_id, transcriptId },
        });
      } catch {
        // Non-blocking
      }

      await eventPublisher.publish(
        'meeting.transcript.state_changed',
        `meeting:${dbTranscript.meeting_id}`,
        {
          meetingId: dbTranscript.meeting_id,
          transcriptId,
          status: 'COMPLETED',
          requestedBy: dbTranscript.requested_by,
          timestamp: new Date().toISOString(),
        }
      );

      return updated;
    }

    if (statusResult.status === 'FAILED') {
      return transcriptRepository.updateStatus(transcriptId, 'FAILED', {
        providerErrorCode: statusResult.errorCode || null,
        providerErrorMessage: statusResult.errorMessage || null,
      });
    }

    return null;
  }
}

export const transcriptService = new TranscriptService();
