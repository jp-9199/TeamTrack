import crypto from 'crypto';
import type {
  RecordingProvider,
  StartRecordingResult,
  StopRecordingResult,
  RecordingStatusResult,
} from './recording.provider.js';
import type { RecordingStatus } from '@teamtrack/shared-types';

/**
 * Mock Recording Provider.
 *
 * Simulates the full recording lifecycle for development, testing, and
 * environments where no real recording infrastructure is configured.
 *
 * Lifecycle simulation:
 * - startRecording → returns a fake provider ID immediately
 * - getRecordingStatus → returns STARTING → RECORDING → COMPLETED over time
 * - stopRecording → transitions to STOPPING immediately
 * - Completion uses a synthetic storage_key (prefixed with 'mock/')
 *
 * This provider is NOT production-safe. It does not:
 * - Record any actual audio/video
 * - Store any real data in object storage
 * - Invoke any external API
 *
 * Storage keys returned are prefixed with 'mock/' so they are clearly
 * identifiable as synthetic if they ever appear in logs.
 *
 * IMPORTANT: The mock storage key is internal-only. Clients never see it
 * directly — they get presigned URLs from the authorized /download-url endpoint.
 */

interface MockRecordingState {
  providerRecordingId: string;
  meetingId: string;
  startedAt: Date;
  stoppedAt: Date | null;
  status: RecordingStatus;
  storageKey: string | null;
  durationSeconds: number | null;
}

export class MockRecordingProvider implements RecordingProvider {
  readonly name = 'mock';

  // In-memory state for recording lifecycle simulation
  private readonly sessions = new Map<string, MockRecordingState>();

  async startRecording(
    meetingId: string,
    recordingId: string
  ): Promise<StartRecordingResult> {
    const providerRecordingId = `mock-rec-${crypto.randomUUID().slice(0, 8)}`;
    this.sessions.set(providerRecordingId, {
      providerRecordingId,
      meetingId,
      startedAt: new Date(),
      stoppedAt: null,
      status: 'STARTING',
      storageKey: null,
      durationSeconds: null,
    });
    return {
      providerRecordingId,
      consentMessage: 'This meeting is being recorded.',
    };
  }

  async stopRecording(
    _meetingId: string,
    providerRecordingId: string
  ): Promise<StopRecordingResult> {
    const session = this.sessions.get(providerRecordingId);
    if (session) {
      session.stoppedAt = new Date();
      session.status = 'STOPPING';
      const durationMs = session.stoppedAt.getTime() - session.startedAt.getTime();
      session.durationSeconds = Math.max(1, Math.floor(durationMs / 1000));
    }
    return {
      providerRecordingId,
      estimatedDurationSeconds: session?.durationSeconds ?? 0,
    };
  }

  async getRecordingStatus(
    _meetingId: string,
    providerRecordingId: string
  ): Promise<RecordingStatusResult | null> {
    const session = this.sessions.get(providerRecordingId);
    if (!session) return null;

    // Simulate lifecycle progression
    const ageMs = Date.now() - session.startedAt.getTime();

    if (session.status === 'STARTING' && ageMs > 2000) {
      session.status = 'RECORDING';
    }

    if (session.status === 'STOPPING' && session.stoppedAt) {
      const stoppingMs = Date.now() - session.stoppedAt.getTime();
      if (stoppingMs > 2000) {
        // Finalize with a synthetic storage key
        session.status = 'COMPLETED';
        session.storageKey = `mock/recordings/${session.meetingId}/${providerRecordingId}.mp4`;
      }
    }

    return {
      providerRecordingId: session.providerRecordingId,
      status: session.status,
      storageKey: session.status === 'COMPLETED' ? session.storageKey : null,
      mimeType: session.status === 'COMPLETED' ? 'video/mp4' : null,
      fileSizeBytes: session.status === 'COMPLETED' ? 1024 * 1024 * Math.floor(1 + (session.durationSeconds ?? 0) * 0.5) : null,
      durationSeconds: session.durationSeconds,
    };
  }

  async cancelRecording(
    _meetingId: string,
    providerRecordingId: string
  ): Promise<void> {
    const session = this.sessions.get(providerRecordingId);
    if (session) {
      session.status = 'CANCELLED';
    }
  }
}
