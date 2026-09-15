'use client';

import React, { useState, useEffect, useRef } from 'react';
import type {
  MeetingWithHost,
  MeetingParticipantWithUser,
  MeetingStatus,
  MeetingParticipantStatus,
} from '@teamtrack/shared-types';
import { P2PMediaProvider } from '@teamtrack/shared-utils';
import { createApiClient } from '@teamtrack/api-client';

export default function MeetingsPage() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:4000');
  const [token, setToken] = useState('');
  const [orgId, setOrgId] = useState('org_default');
  const [meetings, setMeetings] = useState<MeetingWithHost[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<MeetingWithHost | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantWithUser[]>([]);
  const [myStatus, setMyStatus] = useState<MeetingParticipantStatus | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newWaitingRoom, setNewWaitingRoom] = useState(true);

  // Media states
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Connection & Reconnection state
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [reactions, setReactions] = useState<{ id: string; userId: string; reaction: string }[]>([]);

  // Refs for media and websocket
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaProviderRef = useRef<P2PMediaProvider | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const apiClientRef = useRef(createApiClient({ baseUrl }));

  useEffect(() => {
    apiClientRef.current = createApiClient({ baseUrl });
    if (token) {
      apiClientRef.current.setAccessToken(token);
    }
  }, [baseUrl, token]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      leaveMeeting();
    };
  }, []);

  async function loadMeetings() {
    if (!token || !orgId) return;
    try {
      const res = await apiClientRef.current.listMeetings(orgId);
      if (res.success && res.data) {
        setMeetings(res.data.meetings);
      }
    } catch (err) {
      console.error('Failed to list meetings', err);
    }
  }

  async function createMeeting() {
    if (!token || !newTitle.trim()) return;
    try {
      const res = await apiClientRef.current.createMeeting({
        organizationId: orgId,
        title: newTitle.trim(),
        waitingRoomEnabled: newWaitingRoom,
      });
      if (res.success && res.data) {
        setNewTitle('');
        await loadMeetings();
      }
    } catch (err) {
      console.error('Failed to create meeting', err);
    }
  }

  async function startMeeting(meetingId: string) {
    try {
      const res = await apiClientRef.current.startMeeting(meetingId);
      if (res.success) {
        await loadMeetings();
      }
    } catch (err) {
      console.error('Failed to start meeting', err);
    }
  }

  async function joinMeeting(meeting: MeetingWithHost) {
    try {
      const res = await apiClientRef.current.joinMeeting(meeting.id);
      if (res.success && res.data) {
        const p = res.data.participant;
        setCurrentMeeting(meeting);
        setMyStatus(p.status);
        setIsHost(p.role === 'host');
        setAudioEnabled(p.audioEnabled);
        setVideoEnabled(p.videoEnabled);
        setHandRaised(p.handRaised);

        // Connect WebSocket and initialize media if admitted/joined
        await setupRealtime(meeting.id);
        if (p.status === 'joined' || p.status === 'admitted') {
          await initMedia();
        }
        await refreshParticipants(meeting.id);
      }
    } catch (err) {
      console.error('Failed to join meeting', err);
    }
  }

  async function setupRealtime(meetingId: string) {
    try {
      setConnectionStatus('reconnecting');
      const ticketRes = await apiClientRef.current.createWsTicket();
      if (!ticketRes.success || !ticketRes.data) {
        setConnectionStatus('disconnected');
        return;
      }

      const ticket = ticketRes.data.ticket;
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(wsUrl, ['teamtrack-ws', `tt-ticket.${ticket}`]);

      ws.onopen = () => {
        setConnectionStatus('connected');
        // Subscribe to meeting topic
        ws.send(JSON.stringify({ type: 'subscribe', topic: `meeting:${meetingId}` }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event') {
            handleRealtimeEvent(msg);
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
      };

      ws.onerror = () => {
        setConnectionStatus('disconnected');
      };

      wsRef.current = ws;
    } catch (err) {
      setConnectionStatus('disconnected');
    }
  }

  async function handleRealtimeEvent(event: any) {
    const { event: eventName, payload } = event;
    if (!currentMeeting) return;

    switch (eventName) {
      case 'meeting.participant.admitted': {
        await refreshParticipants(currentMeeting.id);
        if (myStatus === 'waiting') {
          setMyStatus('joined');
          await initMedia();
        }
        break;
      }
      case 'meeting.participant.joined':
      case 'meeting.participant.left':
      case 'meeting.participant.removed':
      case 'meeting.participant.audio_changed':
      case 'meeting.participant.video_changed':
      case 'meeting.participant.screen_share_changed':
      case 'meeting.hand_raised':
      case 'meeting.hand_lowered':
      case 'meeting.host_changed': {
        await refreshParticipants(currentMeeting.id);
        break;
      }
      case 'meeting.reaction': {
        const id = Math.random().toString(36).substring(7);
        setReactions((prev) => [...prev, { id, userId: payload.userId, reaction: payload.reactionCode }]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== id));
        }, 3000);
        break;
      }
      case 'meeting.ended': {
        alert('The host has ended this meeting.');
        leaveMeeting();
        break;
      }
      case 'webrtc.offer':
      case 'webrtc.answer':
      case 'webrtc.ice_candidate':
      case 'webrtc.renegotiate': {
        if (mediaProviderRef.current && payload.data) {
          await mediaProviderRef.current.handleRemoteSignal(
            payload.senderUserId,
            payload.signalType,
            payload.data
          );
        }
        break;
      }
    }
  }

  async function initMedia() {
    if (typeof window === 'undefined') return;
    try {
      const provider = new P2PMediaProvider();
      await provider.initialize({
        onLocalStream: (stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        },
        onSignalingNeeded: (targetUserId, signal) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentMeeting) {
            wsRef.current.send(
              JSON.stringify({
                type: `webrtc.${signal.type}`,
                meetingId: currentMeeting.id,
                targetUserId,
                data: signal.data,
              })
            );
          }
        },
      });

      await provider.startLocalMedia({ audio: true, video: true });
      mediaProviderRef.current = provider;
    } catch (err) {
      console.warn('Media hardware access deferred or mock environment', err);
    }
  }

  async function refreshParticipants(meetingId: string) {
    try {
      const res = await apiClientRef.current.listParticipants(meetingId);
      if (res.success && res.data) {
        setParticipants(res.data.participants);
      }
    } catch (err) {
      console.error('Failed to list participants', err);
    }
  }

  async function toggleMic() {
    const next = !audioEnabled;
    setAudioEnabled(next);
    mediaProviderRef.current?.setAudioEnabled(next);
    if (currentMeeting) {
      await apiClientRef.current.updateMediaState(currentMeeting.id, { audioEnabled: next });
    }
  }

  async function toggleVideo() {
    const next = !videoEnabled;
    setVideoEnabled(next);
    mediaProviderRef.current?.setVideoEnabled(next);
    if (currentMeeting) {
      await apiClientRef.current.updateMediaState(currentMeeting.id, { videoEnabled: next });
    }
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      mediaProviderRef.current?.stopScreenShare();
      setScreenSharing(false);
      if (currentMeeting) {
        await apiClientRef.current.updateMediaState(currentMeeting.id, { screenSharing: false });
      }
    } else {
      const track = await mediaProviderRef.current?.startScreenShare();
      if (track) {
        setScreenSharing(true);
        if (currentMeeting) {
          await apiClientRef.current.updateMediaState(currentMeeting.id, { screenSharing: true });
        }
      }
    }
  }

  async function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    if (currentMeeting) {
      await apiClientRef.current.updateMediaState(currentMeeting.id, { handRaised: next });
    }
  }

  function sendReaction(emoji: string) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentMeeting) {
      wsRef.current.send(
        JSON.stringify({
          type: 'meeting.reaction',
          meetingId: currentMeeting.id,
          reaction: emoji,
        })
      );
    }
  }

  async function admitParticipant(targetUserId: string) {
    if (!currentMeeting) return;
    await apiClientRef.current.admitParticipant(currentMeeting.id, targetUserId);
    await refreshParticipants(currentMeeting.id);
  }

  async function removeParticipant(targetUserId: string) {
    if (!currentMeeting) return;
    await apiClientRef.current.removeParticipant(currentMeeting.id, targetUserId);
    await refreshParticipants(currentMeeting.id);
  }

  async function endMeeting() {
    if (!currentMeeting) return;
    await apiClientRef.current.endMeeting(currentMeeting.id);
    leaveMeeting();
  }

  function leaveMeeting() {
    if (currentMeeting) {
      apiClientRef.current.leaveMeeting(currentMeeting.id).catch(() => {});
    }
    mediaProviderRef.current?.destroy();
    mediaProviderRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCurrentMeeting(null);
    setMyStatus(null);
    setParticipants([]);
    setConnectionStatus('disconnected');
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1200px', margin: '0 auto', color: '#1e293b' }}>
      <header style={{ marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0' }}>TeamTrack Meetings (Phase 7)</h1>
        <p style={{ color: '#64748b', margin: 0 }}>WebRTC Media • Waiting Room • Participant Controls • Realtime Signaling</p>
      </header>

      {/* Auth & Environment Controls */}
      <section style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block' }}>Backend URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block' }}>JWT Access Token</label>
            <input
              type="password"
              placeholder="Paste Bearer Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block' }}>Organization ID</label>
            <input
              type="text"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <button
            onClick={loadMeetings}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', alignSelf: 'flex-end' }}
          >
            Load Meetings
          </button>
        </div>
      </section>

      {!currentMeeting ? (
        /* Meeting Lobby / Creation */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            {/* Create Meeting Card */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px 0' }}>Schedule / Create Meeting</h2>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Title</label>
                <input
                  type="text"
                  placeholder="Design Sprint / Standup"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newWaitingRoom}
                    onChange={(e) => setNewWaitingRoom(e.target.checked)}
                  />
                  Enable Waiting Room
                </label>
              </div>
              <button
                onClick={createMeeting}
                disabled={!newTitle.trim()}
                style={{ width: '100%', padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Create Meeting
              </button>
            </div>

            {/* List Meetings Card */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px 0' }}>Available Meetings</h2>
              {meetings.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No meetings found for this organization. Create one to get started.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {meetings.map((m) => (
                    <div
                      key={m.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #f1f5f9', borderRadius: '6px', background: '#f8fafc' }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.title}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Status: <span style={{ fontWeight: 600, color: m.status === 'active' ? '#059669' : m.status === 'ended' ? '#dc2626' : '#d97706' }}>{m.status.toUpperCase()}</span> • Host: {m.host?.displayName || m.hostId}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {m.status === 'scheduled' && (
                          <button
                            onClick={() => startMeeting(m.id)}
                            style={{ padding: '6px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Start
                          </button>
                        )}
                        {m.status !== 'ended' && (
                          <button
                            onClick={() => joinMeeting(m)}
                            style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Join
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* In-Meeting Room Experience */
        <div>
          {/* Top Status Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', color: '#fff', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '18px' }}>{currentMeeting.title}</span>
              <span style={{ marginLeft: '12px', fontSize: '12px', background: '#334155', padding: '2px 8px', borderRadius: '12px' }}>
                Role: {isHost ? 'Host' : 'Participant'}
              </span>
              <span style={{ marginLeft: '8px', fontSize: '12px', background: connectionStatus === 'connected' ? '#059669' : '#d97706', padding: '2px 8px', borderRadius: '12px' }}>
                {connectionStatus.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {isHost && (
                <button
                  onClick={endMeeting}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                >
                  End Meeting
                </button>
              )}
              <button
                onClick={leaveMeeting}
                style={{ background: '#475569', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
              >
                Leave
              </button>
            </div>
          </div>

          {/* Main Meeting Body */}
          {myStatus === 'waiting' ? (
            /* Waiting Room Screen */
            <div style={{ background: '#1e293b', color: '#f8fafc', padding: '60px 20px', textAlign: 'center', borderRadius: '0 0 8px 8px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>You are in the Waiting Room</h2>
              <p style={{ color: '#94a3b8', maxWidth: '480px', margin: '0 auto 24px auto' }}>
                Please wait for the meeting host to admit you. You will not receive audio or video until admitted.
              </p>
              <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            /* Active Media Stage + Participant Drawer */
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', background: '#1e293b', borderRadius: '0 0 8px 8px', minHeight: '500px' }}>
              {/* Media Stage */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  {/* Local Video Tile */}
                  <div style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                      You {isHost && '(Host)'} {!audioEnabled && '🔇'} {!videoEnabled && '📷❌'} {handRaised && '✋'}
                    </div>
                  </div>

                  {/* Remote Participants Tiles */}
                  {participants
                    .filter((p) => p.status === 'joined' || p.status === 'admitted')
                    .map((p) => (
                      <div
                        key={p.userId}
                        style={{ position: 'relative', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <div style={{ color: '#94a3b8', textAlign: 'center' }}>
                          <div style={{ fontSize: '36px', marginBottom: '8px' }}>👤</div>
                          <div>{p.user?.displayName || p.userId}</div>
                        </div>
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                          {p.user?.displayName || p.userId} {!p.audioEnabled && '🔇'} {!p.videoEnabled && '📷❌'} {p.handRaised && '✋'}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Floating Transient Reactions */}
                <div style={{ position: 'relative', height: '40px', overflow: 'hidden' }}>
                  {reactions.map((r) => (
                    <span key={r.id} style={{ display: 'inline-block', fontSize: '24px', marginRight: '12px' }}>
                      {r.reaction}
                    </span>
                  ))}
                </div>

                {/* Media Control Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                  <button
                    onClick={toggleMic}
                    style={{ padding: '10px 16px', background: audioEnabled ? '#334155' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    {audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
                  </button>
                  <button
                    onClick={toggleVideo}
                    style={{ padding: '10px 16px', background: videoEnabled ? '#334155' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    {videoEnabled ? 'Stop Video' : 'Start Video'}
                  </button>
                  <button
                    onClick={toggleScreenShare}
                    style={{ padding: '10px 16px', background: screenSharing ? '#059669' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    {screenSharing ? 'Stop Sharing' : 'Share Screen'}
                  </button>
                  <button
                    onClick={toggleHand}
                    style={{ padding: '10px 16px', background: handRaised ? '#d97706' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    {handRaised ? 'Lower Hand' : 'Raise Hand'}
                  </button>
                  {/* Reactions */}
                  {['👍', '👏', '❤️', '🎉', '✋'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      style={{ padding: '10px 14px', background: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Participant Drawer & Host Controls */}
              <div style={{ borderLeft: '1px solid #334155', background: '#0f172a', padding: '16px', color: '#fff' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
                  Participants ({participants.length})
                </h3>

                {/* Waiting Room Section for Host */}
                {isHost && participants.some((p) => p.status === 'waiting') && (
                  <div style={{ marginBottom: '20px', background: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #d97706' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', marginBottom: '8px' }}>
                      Waiting for Admission ({participants.filter((p) => p.status === 'waiting').length})
                    </div>
                    {participants
                      .filter((p) => p.status === 'waiting')
                      .map((p) => (
                        <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '13px' }}>{p.user?.displayName || p.userId}</span>
                          <button
                            onClick={() => admitParticipant(p.userId)}
                            style={{ padding: '4px 8px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Admit
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* Active Participants List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {participants.map((p) => (
                    <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                      <div>
                        <div>{p.user?.displayName || p.userId}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {p.role} • {p.status} {p.handRaised && '• ✋'}
                        </div>
                      </div>
                      {isHost && p.userId !== currentMeeting.hostId && (
                        <button
                          onClick={() => removeParticipant(p.userId)}
                          style={{ padding: '2px 6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
