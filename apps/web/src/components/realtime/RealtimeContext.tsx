'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../../lib/api';
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff, Maximize2, Minimize2 } from 'lucide-react';

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface ActiveCall {
  callId: string;
  callerUserId: string;
  callerName: string;
  callerAvatarUrl?: string | null;
  targetUserId: string;
  targetUserName: string;
  callType: CallType;
  isCaller: boolean;
  status: CallStatus;
}

export interface RealtimeContextType {
  isConnected: boolean;
  subscribe: (topic: string) => void;
  unsubscribe: (topic: string) => void;
  send: (data: any) => void;
  on: (event: string, handler: (payload: any) => void) => () => void;
  // Calling API
  activeCall: ActiveCall | null;
  callDuration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (targetUserId: string, targetUserName: string, callType?: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};

// Simple web audio synthesizer for ringing tones
function playTone(freq: number, durationMs: number): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  // Call states
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const subscribedTopicsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callDurationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const isCleaningUpRef = useRef(false);

  // Send raw frame
  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  // Event listener registry
  const on = useCallback((event: string, handler: (payload: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => {
      listenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const dispatchEvent = useCallback((event: string, payload: any) => {
    const handlers = listenersRef.current.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[Realtime] Listener error on ${event}:`, err);
        }
      });
    }
  }, []);

  // Topic subscription
  const subscribe = useCallback((topic: string) => {
    subscribedTopicsRef.current.add(topic);
    send({ type: 'subscribe', topic });
  }, [send]);

  const unsubscribe = useCallback((topic: string) => {
    subscribedTopicsRef.current.delete(topic);
    send({ type: 'unsubscribe', topic });
  }, [send]);

  // WebSocket Connection Management
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isMounted = true;

    async function connectWs() {
      try {
        const ticketRes = await api.fetchWithAuth<{ ticket: string }>('/api/v1/auth/ws-ticket', {
          method: 'POST',
        });

        if (!isMounted) return;

        if (!ticketRes.success || !ticketRes.data?.ticket) {
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
          return;
        }

        const ticket = ticketRes.data.ticket;
        const rawBackendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const wsBaseUrl = rawBackendUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
        const wsUrl = `${wsBaseUrl}/ws`;

        const ws = new WebSocket(wsUrl, ['teamtrack-ws', `tt-ticket.${ticket}`]);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          // Re-subscribe to all active topics
          subscribedTopicsRef.current.forEach((topic) => {
            ws.send(JSON.stringify({ type: 'subscribe', topic }));
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const eventName = data.event || data.type;
            const innerPayload =
              data.payload !== undefined
                ? data.payload
                : data.data !== undefined
                ? data.data
                : data;
            const payload =
              typeof innerPayload === 'object' && innerPayload !== null
                ? { ...data, ...innerPayload }
                : innerPayload;
            if (eventName) {
              dispatchEvent(eventName, payload);
            }
          } catch (err) {
            console.warn('[Realtime] Message parse error:', err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          wsRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connectWs, 2500);
        };

        ws.onerror = (err) => {
          console.warn('[Realtime] Socket connection error:', err);
          ws.close();
        };
      } catch {
        if (isMounted) {
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, dispatchEvent]);

  // Clean up peer connection helper
  const cleanUpCallMedia = useCallback(() => {
    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
  }, [localStream, remoteStream]);

  // WebRTC Setup helper
  const setupPeerConnection = useCallback(async (isInitiator: boolean, callType: CallType, targetUserId: string, callId: string) => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { width: 1280, height: 720 } : false,
      });
      setLocalStream(stream);
      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }
    } catch (mediaErr) {
      console.warn('[Call] getUserMedia error, continuing with fallback:', mediaErr);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream!);
      });
    }

    const inboundStream = new MediaStream();
    setRemoteStream(inboundStream);

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        inboundStream.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = inboundStream;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({
          type: 'call.ice_candidate',
          targetUserId,
          callId,
          data: event.candidate,
        });
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({
        type: 'call.offer',
        targetUserId,
        callId,
        data: offer,
      });
    }

    return pc;
  }, [send]);

  // Ringtone handling
  const startRinging = useCallback((isOutgoing: boolean) => {
    if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
    ringtoneIntervalRef.current = setInterval(() => {
      if (isOutgoing) {
        playTone(440, 800);
      } else {
        playTone(520, 400);
        setTimeout(() => playTone(650, 400), 450);
      }
    }, 2000);
  }, []);

  const stopRinging = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
  }, []);

  // 1. Caller starts a call
  const startCall = useCallback(async (targetUserId: string, targetUserName: string, callType: CallType = 'audio') => {
    if (!user || activeCall) return;
    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const call: ActiveCall = {
      callId,
      callerUserId: user.id,
      callerName: user.displayName || 'You',
      callerAvatarUrl: user.avatarUrl,
      targetUserId,
      targetUserName,
      callType,
      isCaller: true,
      status: 'calling',
    };

    setActiveCall(call);
    startRinging(true);

    send({
      type: 'call.invite',
      callId,
      targetUserId,
      callType,
      callerName: user.displayName || 'You',
      callerAvatarUrl: user.avatarUrl,
    });
  }, [user, activeCall, send, startRinging]);

  // 2. Callee accepts incoming call
  const acceptCall = useCallback(async () => {
    if (!activeCall || activeCall.isCaller) return;
    stopRinging();

    setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));

    send({
      type: 'call.accept',
      callId: activeCall.callId,
      callerUserId: activeCall.callerUserId,
    });

    await setupPeerConnection(false, activeCall.callType, activeCall.callerUserId, activeCall.callId);

    // Start duration timer
    callDurationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, [activeCall, send, setupPeerConnection, stopRinging]);

  // 3. Callee rejects incoming call
  const rejectCall = useCallback((reason: string = 'declined') => {
    if (!activeCall) return;
    stopRinging();

    send({
      type: 'call.reject',
      callId: activeCall.callId,
      callerUserId: activeCall.callerUserId,
      reason,
    });

    cleanUpCallMedia();
    setActiveCall(null);
  }, [activeCall, send, cleanUpCallMedia, stopRinging]);

  // 4. Terminate active call
  const endCall = useCallback(async () => {
    if (!activeCall) return;
    stopRinging();

    const targetId = activeCall.isCaller ? activeCall.targetUserId : activeCall.callerUserId;
    send({
      type: 'call.end',
      callId: activeCall.callId,
      targetUserId: targetId,
      durationSeconds: callDuration,
    });

    // Record call log to backend PostgreSQL database
    try {
      await api.fetchWithAuth('/api/v1/calls', {
        method: 'POST',
        body: JSON.stringify({
          callerName: activeCall.callerName,
          calleeId: activeCall.targetUserId,
          calleeName: activeCall.targetUserName,
          callType: activeCall.callType,
          direction: activeCall.isCaller ? 'outgoing' : 'incoming',
          status: 'completed',
          durationSeconds: callDuration,
        }),
      });
    } catch (err) {
      console.warn('[Call] Failed to log completed call:', err);
    }

    cleanUpCallMedia();
    setActiveCall(null);
  }, [activeCall, send, callDuration, cleanUpCallMedia, stopRinging]);

  // Controls
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, [localStream]);

  // Listen to incoming call events from WebSocket
  useEffect(() => {
    const unsubInvite = on('call.invite', (payload: any) => {
      if (activeCall) {
        // Automatically send busy signal
        send({
          type: 'call.reject',
          callId: payload.callId,
          callerUserId: payload.callerUserId,
          reason: 'busy',
        });
        return;
      }

      setActiveCall({
        callId: payload.callId,
        callerUserId: payload.callerUserId,
        callerName: payload.callerName || 'Colleague',
        callerAvatarUrl: payload.callerAvatarUrl,
        targetUserId: user?.id || '',
        targetUserName: user?.displayName || 'You',
        callType: payload.callType || 'audio',
        isCaller: false,
        status: 'incoming',
      });

      startRinging(false);
    });

    const unsubAccept = on('call.accept', async (payload: any) => {
      if (!activeCall || !activeCall.isCaller) return;
      stopRinging();
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));

      await setupPeerConnection(true, activeCall.callType, activeCall.targetUserId, activeCall.callId);

      callDurationIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    });

    const unsubReject = on('call.reject', (payload: any) => {
      stopRinging();
      cleanUpCallMedia();
      setActiveCall(null);
      alert(payload.reason === 'busy' ? 'Contact is on another call.' : 'Call was declined.');
    });

    const unsubEnd = on('call.end', (payload: any) => {
      stopRinging();
      cleanUpCallMedia();
      setActiveCall(null);
    });

    const unsubOffer = on('call.offer', async (payload: any) => {
      if (!peerConnectionRef.current) return;
      const pc = peerConnectionRef.current;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({
        type: 'call.answer',
        targetUserId: payload.senderUserId || payload.callerUserId,
        callId: payload.callId,
        data: answer,
      });
    });

    const unsubAnswer = on('call.answer', async (payload: any) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.data));
    });

    const unsubIce = on('call.ice_candidate', async (payload: any) => {
      if (!peerConnectionRef.current || !payload.data) return;
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.data));
      } catch (err) {
        console.warn('[Call] Error adding ICE candidate:', err);
      }
    });

    return () => {
      unsubInvite();
      unsubAccept();
      unsubReject();
      unsubEnd();
      unsubOffer();
      unsubAnswer();
      unsubIce();
    };
  }, [on, activeCall, user, send, setupPeerConnection, startRinging, stopRinging, cleanUpCallMedia]);

  // Format MM:SS duration
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        subscribe,
        unsubscribe,
        send,
        on,
        activeCall,
        callDuration,
        isMuted,
        isVideoOff,
        localStream,
        remoteStream,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
      }}
    >
      {children}

      {/* ── CALL MODAL / OVERLAY ── */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fadeIn select-none">
          <div className="w-full max-w-lg bg-[#0F172A] border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-white shadow-2xl flex flex-col items-center justify-between relative overflow-hidden">
            {/* Background Ambient Glow */}
            <div className="absolute inset-0 bg-radial from-indigo-500/10 via-transparent to-transparent pointer-events-none" />

            {/* Video Streams Container (when video call is active) */}
            {activeCall.status === 'connected' && activeCall.callType === 'video' ? (
              <div className="w-full h-72 sm:h-80 bg-slate-950 rounded-2xl relative overflow-hidden mb-6 border border-slate-800 flex items-center justify-center">
                {/* Remote Video */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {/* Local Video PIP */}
                <div className="absolute bottom-3 right-3 w-28 h-20 bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-xl">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                </div>
              </div>
            ) : (
              /* Audio Avatar & Calling Status */
              <div className="flex flex-col items-center my-6 space-y-4">
                <div className="relative">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-3xl sm:text-4xl font-extrabold shadow-xl shadow-indigo-500/20">
                    {(activeCall.isCaller ? activeCall.targetUserName : activeCall.callerName)[0]?.toUpperCase() || 'U'}
                  </div>
                  {activeCall.status === 'calling' && (
                    <span className="absolute inset-0 rounded-full border-2 border-indigo-400 animate-ping opacity-75 pointer-events-none" />
                  )}
                  {activeCall.status === 'connected' && (
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0F172A]" />
                  )}
                </div>

                <div className="text-center">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    {activeCall.isCaller ? activeCall.targetUserName : activeCall.callerName}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center justify-center gap-1.5 font-medium">
                    {activeCall.status === 'calling' && <span>Calling...</span>}
                    {activeCall.status === 'incoming' && (
                      <span className="text-indigo-400 animate-pulse">Incoming {activeCall.callType} call</span>
                    )}
                    {activeCall.status === 'connected' && (
                      <span className="text-emerald-400 font-mono text-sm">{formatTime(callDuration)}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Hidden audio element for remote stream */}
            {remoteStream && <audio ref={(node) => { if (node && node.srcObject !== remoteStream) node.srcObject = remoteStream; }} autoPlay />}

            {/* Action Bar */}
            <div className="flex items-center gap-4 mt-4">
              {activeCall.status === 'incoming' ? (
                <>
                  <button
                    onClick={() => rejectCall('declined')}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
                  >
                    <PhoneOff size={18} />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={acceptCall}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-600/30 cursor-pointer animate-bounce"
                  >
                    <Phone size={18} />
                    <span>Accept</span>
                  </button>
                </>
              ) : activeCall.status === 'calling' ? (
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
                >
                  <PhoneOff size={18} />
                  <span>Cancel</span>
                </button>
              ) : (
                /* Connected Call Controls */
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleMute}
                    className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                      isMuted
                        ? 'bg-rose-600/20 border-rose-500 text-rose-400'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  {activeCall.callType === 'video' && (
                    <button
                      onClick={toggleVideo}
                      className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                        isVideoOff
                          ? 'bg-rose-600/20 border-rose-500 text-rose-400'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                      title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                    >
                      {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                    </button>
                  )}

                  <button
                    onClick={endCall}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
                  >
                    <PhoneOff size={18} />
                    <span>End Call</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </RealtimeContext.Provider>
  );
};
