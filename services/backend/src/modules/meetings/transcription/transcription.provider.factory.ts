import type { TranscriptionProvider } from './transcription.provider.js';
import { MockTranscriptionProvider } from './mock.transcription.provider.js';

/**
 * Transcription Provider Factory.
 *
 * Returns the configured transcription provider.
 *
 * Phase 11 default: MockTranscriptionProvider (no external calls).
 *
 * To integrate a real transcription provider:
 * 1. Implement TranscriptionProvider interface.
 * 2. Add config for provider (API key, model, endpoint).
 * 3. Return the real implementation here.
 *
 * Phase 12 boundary: AI summarization is explicitly OUT OF SCOPE for Phase 11.
 * The raw transcript file is stored; summarization is a Phase 12 concern.
 *
 * IMPORTANT: Provider calls must NEVER occur inside PostgreSQL transactions.
 */
function createTranscriptionProvider(): TranscriptionProvider {
  return new MockTranscriptionProvider();
}

export const transcriptionProvider: TranscriptionProvider = createTranscriptionProvider();
