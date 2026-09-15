import type { SfuProvider } from './sfu.provider.js';
import { P2PFallbackSfuProvider } from './p2p.sfu.provider.js';
import { config } from '../../../config/index.js';

/**
 * SFU Provider Factory.
 *
 * Returns the appropriate SFU provider based on configuration.
 *
 * Phase 11 default: P2PFallbackSfuProvider (preserves Phase 7 WebRTC P2P behavior).
 *
 * To integrate a production SFU:
 * 1. Implement SfuProvider interface for your chosen SFU (LiveKit, Agora, Twilio, etc.)
 * 2. Add provider config to config/index.ts (e.g., config.sfu.provider, config.sfu.apiKey)
 * 3. Return the real provider here based on config.sfu.provider
 *
 * Example (NOT implemented — no real SFU configured):
 * ```
 * if (config.sfu?.provider === 'livekit') {
 *   return new LiveKitSfuProvider(config.sfu.apiUrl, config.sfu.apiKey, config.sfu.apiSecret);
 * }
 * ```
 */
function createSfuProvider(): SfuProvider {
  // Phase 11: Default to P2P fallback
  return new P2PFallbackSfuProvider();
}

export const sfuProvider: SfuProvider = createSfuProvider();
