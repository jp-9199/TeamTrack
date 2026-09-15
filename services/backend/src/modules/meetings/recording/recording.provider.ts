import type { RecordingStatus } from '@teamtrack/shared-types';

/**
 * Recording Provider Interface.
 *
 * Defines the contract between TeamTrack's recording service and a
 * production recording backend. Implementations may use:
 * - Cloud recording via Agora/Daily.co/Twilio Compositions
 * - SFU-side recording (LiveKit Egress)
 * - Custom media server recording pipelines
 *
 * Architecture invariants:
 * - Recording provider calls occur OUTSIDE PostgreSQL transactions.
 * - Failures in the provider do NOT roll back meeting_recordings DB state.
 * - The recording state machine is always authoritative in PostgreSQL.
 * - Storage keys obtained from providers are NEVER returned to API clients.
 *   Clients must use the authorized /download-url endpoint.
 */

export interface StartRecordingResult {
  providerRecordingId: string;  // Provider's internal recording reference
  consentMessage?: string;      // Human-readable consent message to broadcast to participants
}

export interface StopRecordingResult {
  providerRecordingId: string;
  estimatedDurationSeconds?: number;
}

export interface RecordingStatusResult {
  providerRecordingId: string;
  status: RecordingStatus;           // Canonical recording status
  storageKey?: string | null;        // Only set when COMPLETED
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  durationSeconds?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface RecordingProvider {
  /**
   * The provider name for logging and audit.
   */
  readonly name: string;

  /**
   * Initiates a recording for the given meeting.
   * Returns a provider recording ID for future status polling.
   * Throws on unrecoverable error (do not retry).
   */
  startRecording(
    meetingId: string,
    recordingId: string,
    options?: { layout?: string; resolution?: string }
  ): Promise<StartRecordingResult>;

  /**
   * Requests the provider to stop an ongoing recording.
   * Idempotent if recording is already stopped.
   */
  stopRecording(
    meetingId: string,
    providerRecordingId: string
  ): Promise<StopRecordingResult>;

  /**
   * Polls the provider for the current state of a recording.
   * Used to update the recording status in PostgreSQL.
   * Returns null if the provider has no record of this recording.
   */
  getRecordingStatus(
    meetingId: string,
    providerRecordingId: string
  ): Promise<RecordingStatusResult | null>;

  /**
   * Cancels a recording that has not yet started or is in STARTING state.
   * Idempotent.
   */
  cancelRecording(
    meetingId: string,
    providerRecordingId: string
  ): Promise<void>;
}
