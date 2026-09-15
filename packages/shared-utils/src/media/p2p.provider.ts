import type {
  MediaProvider,
  MediaProviderEvents,
  MediaConstraints,
  MediaSignalingMessage,
  MediaConnectionState,
} from './types.js';

export interface P2PProviderConfig {
  iceServers?: RTCIceServer[];
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class P2PMediaProvider implements MediaProvider {
  readonly providerType = 'p2p' as const;

  private events: MediaProviderEvents = {};
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private iceServers: RTCIceServer[];
  private isDestroyed = false;

  constructor(config?: P2PProviderConfig) {
    this.iceServers = config?.iceServers ?? DEFAULT_ICE_SERVERS;
  }

  async initialize(events: MediaProviderEvents): Promise<void> {
    this.events = events;
  }

  async startLocalMedia(constraints: MediaConstraints = { audio: true, video: true }): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Non-browser or unsupported environment (e.g., unit test mock or headless environment)
      throw new Error('getUserMedia is not supported in this runtime environment');
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio ?? true,
        video: constraints.video ?? true,
      });

      this.events.onLocalStream?.(this.localStream);

      // Add local tracks to any existing peer connections
      for (const [peerId, pc] of this.peerConnections.entries()) {
        for (const track of this.localStream.getTracks()) {
          pc.addTrack(track, this.localStream);
        }
      }

      return this.localStream;
    } catch (err: any) {
      this.events.onError?.(new Error(`Failed to access media devices: ${err.message}`));
      throw err;
    }
  }

  stopLocalMedia(): void {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.stopScreenShare();
  }

  setAudioEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled;
      return true;
    }
    return false;
  }

  setVideoEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled;
      return true;
    }
    return false;
  }

  async startScreenShare(): Promise<MediaStreamTrack | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('getDisplayMedia is not supported in this environment');
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) return null;

      // When user clicks the browser-native "Stop Sharing" floating button
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      // Replace or add video track on peer connections
      for (const [peerId, pc] of this.peerConnections.entries()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, this.screenStream);
        }
      }

      return screenTrack;
    } catch (err: any) {
      this.events.onError?.(new Error(`Failed to start screen share: ${err.message}`));
      return null;
    }
  }

  stopScreenShare(): void {
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;

      // Restore camera video track to peer connections
      const cameraTrack = this.localStream?.getVideoTracks()[0] ?? null;
      for (const [peerId, pc] of this.peerConnections.entries()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender && cameraTrack) {
          videoSender.replaceTrack(cameraTrack);
        }
      }
    }
  }

  isScreenSharing(): boolean {
    return this.screenStream !== null && this.screenStream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  async connectToPeer(targetUserId: string, isInitiator: boolean): Promise<void> {
    if (this.isDestroyed) return;
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('RTCPeerConnection is not supported in this environment');
    }

    let pc = this.peerConnections.get(targetUserId);
    if (!pc) {
      pc = this.createPeerConnection(targetUserId);
      this.peerConnections.set(targetUserId, pc);
    }

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        this.events.onSignalingNeeded?.(targetUserId, {
          type: 'offer',
          data: pc.localDescription,
        });
      } catch (err: any) {
        this.events.onError?.(new Error(`Failed to create offer for peer ${targetUserId}: ${err.message}`));
      }
    }
  }

  async handleRemoteSignal(
    senderUserId: string,
    signalType: 'offer' | 'answer' | 'ice_candidate' | 'renegotiate',
    data: any
  ): Promise<void> {
    if (this.isDestroyed) return;
    if (typeof RTCPeerConnection === 'undefined') return;

    let pc = this.peerConnections.get(senderUserId);
    if (!pc) {
      pc = this.createPeerConnection(senderUserId);
      this.peerConnections.set(senderUserId, pc);
    }

    try {
      switch (signalType) {
        case 'offer': {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          this.events.onSignalingNeeded?.(senderUserId, {
            type: 'answer',
            data: pc.localDescription,
          });
          break;
        }

        case 'answer': {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          break;
        }

        case 'ice_candidate': {
          if (data) {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
          break;
        }

        case 'renegotiate': {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.events.onSignalingNeeded?.(senderUserId, {
            type: 'offer',
            data: pc.localDescription,
          });
          break;
        }
      }
    } catch (err: any) {
      this.events.onError?.(new Error(`Error handling remote signal (${signalType}) from ${senderUserId}: ${err.message}`));
    }
  }

  disconnectFromPeer(userId: string): void {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
      this.events.onParticipantLeft?.(userId);
    }
  }

  private createPeerConnection(targetUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onSignalingNeeded?.(targetUserId, {
          type: 'ice_candidate',
          data: event.candidate,
        });
      }
    };

    // Remote Track Handler
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.events.onRemoteStream?.(targetUserId, stream);

      event.track.onended = () => {
        this.events.onRemoteTrackRemoved?.(targetUserId, event.track.kind as 'audio' | 'video');
      };
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as MediaConnectionState;
      this.events.onConnectionStateChange?.(targetUserId, state);

      if (state === 'failed' || state === 'closed') {
        this.disconnectFromPeer(targetUserId);
      }
    };

    return pc;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stopLocalMedia();

    for (const [userId, pc] of this.peerConnections.entries()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.events = {};
  }
}
