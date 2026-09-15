import type { RecordingProvider } from './recording.provider.js';
import { MockRecordingProvider } from './mock.recording.provider.js';

/**
 * Recording Provider Factory.
 *
 * Returns the configured recording provider instance.
 *
 * Phase 11 default: MockRecordingProvider (no external calls, full lifecycle simulation).
 *
 * To integrate a real recording provider:
 * 1. Implement RecordingProvider interface for your chosen backend.
 * 2. Add provider config (e.g., config.recording.provider, API keys).
 * 3. Return the real implementation based on config.
 *
 * Example (NOT implemented):
 * ```
 * if (config.recording?.provider === 'agora') {
 *   return new AgoraRecordingProvider(config.recording.appId, config.recording.appCertificate);
 * }
 * if (config.recording?.provider === 'livekit') {
 *   return new LiveKitEgressProvider(config.livekit.host, config.livekit.apiKey, config.livekit.apiSecret);
 * }
 * ```
 *
 * IMPORTANT: Recording provider calls must NEVER occur inside a PostgreSQL transaction.
 * See recording.service.ts for correct transaction boundary handling.
 */
function createRecordingProvider(): RecordingProvider {
  return new MockRecordingProvider();
}

export const recordingProvider: RecordingProvider = createRecordingProvider();
