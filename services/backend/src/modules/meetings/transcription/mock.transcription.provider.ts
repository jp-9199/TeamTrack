import crypto from 'crypto';
import type {
  TranscriptionProvider,
  RequestTranscriptionResult,
  TranscriptionStatusResult,
} from './transcription.provider.js';
import type { TranscriptStatus } from '@teamtrack/shared-types';

/**
 * Mock Transcription Provider.
 *
 * Simulates the transcription lifecycle for development, testing, and
 * environments without real ASR infrastructure.
 *
 * Lifecycle simulation:
 * - requestTranscription → returns a fake provider ID
 * - getTranscriptionStatus → returns REQUESTED → PROCESSING → COMPLETED over time
 * - Storage key is synthetic (prefixed with 'mock/transcripts/')
 *
 * Phase 12 Note: This provider does NOT implement AI summarization.
 * It only simulates raw transcript delivery.
 *
 * IMPORTANT:
 * - No external API calls are made.
 * - No audio is processed.
 * - Storage key is internal-only (never returned to clients).
 */

interface MockTranscriptSession {
  providerTranscriptId: string;
  meetingId: string;
  startedAt: Date;
  status: TranscriptStatus;
  storageKey: string | null;
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'mock';

  private readonly sessions = new Map<string, MockTranscriptSession>();

  async requestTranscription(
    meetingId: string,
    transcriptId: string
  ): Promise<RequestTranscriptionResult> {
    const providerTranscriptId = `mock-tx-${crypto.randomUUID().slice(0, 8)}`;
    this.sessions.set(providerTranscriptId, {
      providerTranscriptId,
      meetingId,
      startedAt: new Date(),
      status: 'REQUESTED',
      storageKey: null,
    });
    return { providerTranscriptId };
  }

  async getTranscriptionStatus(
    _meetingId: string,
    providerTranscriptId: string
  ): Promise<TranscriptionStatusResult | null> {
    const session = this.sessions.get(providerTranscriptId);
    if (!session) return null;

    const ageMs = Date.now() - session.startedAt.getTime();

    if (session.status === 'REQUESTED' && ageMs > 1500) {
      session.status = 'PROCESSING';
    }

    if (session.status === 'PROCESSING' && ageMs > 4000) {
      session.status = 'COMPLETED';
      session.storageKey = `mock/transcripts/${session.meetingId}/${providerTranscriptId}.json`;
    }

    return {
      providerTranscriptId: session.providerTranscriptId,
      status: session.status,
      storageKey: session.status === 'COMPLETED' ? session.storageKey : null,
      wordCount: session.status === 'COMPLETED' ? 350 : null,
      speakerCount: session.status === 'COMPLETED' ? 2 : null,
      language: 'en-US',
    };
  }

  async cancelTranscription(
    _meetingId: string,
    providerTranscriptId: string
  ): Promise<void> {
    const session = this.sessions.get(providerTranscriptId);
    if (session) {
      session.status = 'CANCELLED';
    }
  }
}
