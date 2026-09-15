import type { TranscriptStatus } from '@teamtrack/shared-types';

/**
 * Transcription Provider Interface.
 *
 * Defines the contract between TeamTrack's transcript service and a
 * transcription/ASR backend. Implementations may use:
 * - Assembly AI, Deepgram, Google Speech-to-Text
 * - Rev AI, AWS Transcribe
 * - Custom self-hosted ASR pipelines
 *
 * Architecture invariants:
 * - Transcription provider calls occur OUTSIDE PostgreSQL transactions.
 * - Provider failures do NOT roll back transcript state in PostgreSQL.
 * - Transcript content is NEVER included in API responses directly.
 *   Clients access content via the authorized /download-url endpoint.
 * - Phase 11 explicitly excludes AI summarization (that is Phase 12).
 */

export interface RequestTranscriptionResult {
  providerTranscriptId: string;
}

export interface TranscriptionStatusResult {
  providerTranscriptId: string;
  status: TranscriptStatus;
  storageKey?: string | null;     // Only when COMPLETED — never exposed to clients
  wordCount?: number | null;
  speakerCount?: number | null;
  language?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface TranscriptionProvider {
  /**
   * The provider name for logging.
   */
  readonly name: string;

  /**
   * Submits a recording/meeting for transcription.
   * Returns a provider transcript ID for future status polling.
   * recordingStorageKey is an internal key used by the provider to access the recording.
   * It must NEVER be logged or returned to clients.
   */
  requestTranscription(
    meetingId: string,
    transcriptId: string,
    recordingStorageKey: string | null,
    options?: {
      language?: string;
    }
  ): Promise<RequestTranscriptionResult>;

  /**
   * Polls provider for current transcript status.
   * Returns null if the provider has no record.
   */
  getTranscriptionStatus(
    meetingId: string,
    providerTranscriptId: string
  ): Promise<TranscriptionStatusResult | null>;

  /**
   * Cancels an in-progress transcription request.
   * Idempotent.
   */
  cancelTranscription(
    meetingId: string,
    providerTranscriptId: string
  ): Promise<void>;
}
