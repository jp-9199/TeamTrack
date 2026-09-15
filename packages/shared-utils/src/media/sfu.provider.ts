import type {
  MediaProvider,
  MediaProviderEvents,
  MediaConstraints,
  MediaSignalingMessage,
} from './types.js';

/**
 * SFUMediaProvider (Architecture Stub)
 *
 * This class defines the SFU-ready interface architecture for future Selective Forwarding Unit
 * deployments (e.g., LiveKit, mediasoup, Pion SFU).
 *
 * In accordance with Phase 7 architectural rules:
 * - We do NOT build a fake SFU or pretend P2P is an SFU.
 * - The MediaProvider abstraction guarantees that switching from P2P to an SFU provider
 *   requires zero changes to meeting business logic, waiting room rules, or UI components.
 */
export class SFUMediaProvider implements MediaProvider {
  readonly providerType = 'sfu' as const;

  constructor(private sfuEndpoint?: string) {}

  async initialize(events: MediaProviderEvents): Promise<void> {
    throw new Error('SFUMediaProvider is an architectural specification for future SFU phases.');
  }

  async startLocalMedia(constraints?: MediaConstraints): Promise<MediaStream> {
    throw new Error('SFUMediaProvider is an architectural specification for future SFU phases.');
  }

  stopLocalMedia(): void {}

  setAudioEnabled(enabled: boolean): boolean {
    return false;
  }

  setVideoEnabled(enabled: boolean): boolean {
    return false;
  }

  async startScreenShare(): Promise<MediaStreamTrack | null> {
    throw new Error('SFUMediaProvider is an architectural specification for future SFU phases.');
  }

  stopScreenShare(): void {}

  isScreenSharing(): boolean {
    return false;
  }

  async handleRemoteSignal(
    senderUserId: string,
    signalType: 'offer' | 'answer' | 'ice_candidate' | 'renegotiate',
    data: any
  ): Promise<void> {
    throw new Error('SFUMediaProvider is an architectural specification for future SFU phases.');
  }

  async connectToPeer(targetUserId: string, isInitiator: boolean): Promise<void> {
    throw new Error('SFUMediaProvider is an architectural specification for future SFU phases.');
  }

  disconnectFromPeer(userId: string): void {}

  destroy(): void {}
}
