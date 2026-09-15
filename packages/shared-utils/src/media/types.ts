/**
 * WebRTC Media Provider Types & Contracts
 * SFU-ready architecture decoupling UI & meeting business logic from transport.
 */

export interface RemoteParticipantMedia {
  userId: string;
  stream: MediaStream;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
}

export type MediaConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface MediaSignalingMessage {
  type: 'offer' | 'answer' | 'ice_candidate' | 'renegotiate';
  data: any;
}

export interface MediaProviderEvents {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteTrackRemoved?: (userId: string, kind: 'audio' | 'video') => void;
  onParticipantLeft?: (userId: string) => void;
  onConnectionStateChange?: (userId: string, state: MediaConnectionState) => void;
  onError?: (error: Error) => void;
  onSignalingNeeded?: (targetUserId: string, signal: MediaSignalingMessage) => void;
}

export interface MediaConstraints {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

export interface MediaProvider {
  readonly providerType: 'p2p' | 'sfu';

  initialize(events: MediaProviderEvents): Promise<void>;
  startLocalMedia(constraints?: MediaConstraints): Promise<MediaStream>;
  stopLocalMedia(): void;

  setAudioEnabled(enabled: boolean): boolean;
  setVideoEnabled(enabled: boolean): boolean;

  startScreenShare(): Promise<MediaStreamTrack | null>;
  stopScreenShare(): void;
  isScreenSharing(): boolean;

  handleRemoteSignal(
    senderUserId: string,
    signalType: 'offer' | 'answer' | 'ice_candidate' | 'renegotiate',
    data: any
  ): Promise<void>;

  connectToPeer(targetUserId: string, isInitiator: boolean): Promise<void>;
  disconnectFromPeer(userId: string): void;

  destroy(): void;
}
