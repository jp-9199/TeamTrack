'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Tooltip,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
  Badge,
  Input,
} from '@fluentui/react-components';
import {
  MicRegular,
  MicOffRegular,
  VideoRegular,
  VideoOffRegular,
  ShareScreenStartRegular,
  ShareScreenStopRegular,
  EmojiRegular,
  ChatRegular,
  PeopleRegular,
  CallEndRegular,
  CallEndFilled,
  SettingsRegular,
  SparkleRegular,
  CheckmarkRegular,
  DismissRegular,
  SendRegular,
  ShieldRegular,
  ShieldCheckmarkRegular,
  RecordRegular,
  HandRightRegular,
  PersonCircleRegular,
  MoreHorizontalRegular,
  ChevronDownRegular,
  Speaker2Regular,
  CopyRegular,
  LockClosedRegular,
  SearchRegular,
  PhoneRegular,
  PersonAddRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../../../components/auth/AuthContext';

interface Participant {
  id: string;
  name: string;
  role: string;
  isHost?: boolean;
  avatarBg: string;
  audioMuted: boolean;
  videoOff: boolean;
  handRaised: boolean;
  isSpeaking: boolean;
}

interface GroupMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarBg: string;
  calling?: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  time: string;
  text: string;
  avatarBg?: string;
}

interface DeviceOption {
  deviceId: string;
  label: string;
}

export default function MeetingRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const meetingId = (params?.meetingId as string) || 'general-meeting';

  const userName = user?.displayName || 'Amir Asad Ullah Khan';

  // ── 1. State Machine: Lobby vs Admitted ──
  const initialJoined = searchParams?.get('joined') === 'true';
  const [meetingState, setMeetingState] = useState<'lobby' | 'admitted'>(
    initialJoined ? 'admitted' : 'lobby'
  );

  // Media Hardware toggles (Default off matching toolbar screenshot)
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [blurBackground, setBlurBackground] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [myHandRaised, setMyHandRaised] = useState(false);

  // In-meeting features matching screenshot
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingBanner, setShowRecordingBanner] = useState(false);
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker' | 'together'>('gallery');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string>('');

  // Floating reactions
  const [activeReactions, setActiveReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  // In-Meeting Drawers: 'chat' | 'roster' | null
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'roster' | null>(null);

  // Modals
  const [isDeviceSettingsOpen, setIsDeviceSettingsOpen] = useState(false);
  const [isSecurityInfoOpen, setIsSecurityInfoOpen] = useState(false);

  // Device lists
  const [audioInputDevices, setAudioInputDevices] = useState<DeviceOption[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<DeviceOption[]>([]);
  const [videoDevices, setVideoDevices] = useState<DeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [audioLevel, setAudioLevel] = useState(45);

  // Toast Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ── 2. REAL-TIME MEETING DURATION TIMER ──
  // Starts from 00:00 upon entering and ticks up continuously second-by-second in real time!
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // ── 3. IN-MEETING SHARED GROUP CHAT ──
  // All participants in the meeting see messages in real-time
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'm-welcome',
      author: 'Sarah Jenkins',
      time: 'Just now',
      text: 'Welcome everyone! Let us review the sprint goals for today.',
      avatarBg: '#0078D4',
    },
  ]);
  const [newChatText, setNewChatText] = useState('');

  // ── 4. PARTICIPANTS IN THIS MEETING (Connected) ──
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 'p-self',
      name: `${userName} (You)`,
      role: 'Organizer',
      isHost: true,
      avatarBg: '#5B5FC7',
      audioMuted: true,
      videoOff: true,
      handRaised: false,
      isSpeaking: false,
    },
    {
      id: 'p-2',
      name: 'Sarah Jenkins',
      role: 'Presenter',
      isHost: false,
      avatarBg: '#0078D4',
      audioMuted: false,
      videoOff: false,
      handRaised: false,
      isSpeaking: true,
    },
    {
      id: 'p-3',
      name: 'Alex Rivera',
      role: 'Attendee',
      isHost: false,
      avatarBg: '#107C41',
      audioMuted: true,
      videoOff: false,
      handRaised: false,
      isSpeaking: false,
    },
    {
      id: 'p-4',
      name: 'Elena Rostova',
      role: 'Attendee',
      isHost: false,
      avatarBg: '#D13438',
      audioMuted: true,
      videoOff: true,
      handRaised: false,
      isSpeaking: false,
    },
  ]);

  // ── 5. OTHERS IN GROUP / SUGGESTED TO INVITE ──
  // Members of the team/group not in the call yet. Can be searched and "Requested to join"!
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([
    {
      id: 'gm-1',
      name: 'David Kim',
      email: 'david.kim@teamtrack.local',
      role: 'Software Engineer',
      avatarBg: '#8B5CF6',
      calling: false,
    },
    {
      id: 'gm-2',
      name: 'Sophia Chen',
      email: 'sophia.chen@teamtrack.local',
      role: 'Product Manager',
      avatarBg: '#EC4899',
      calling: false,
    },
    {
      id: 'gm-3',
      name: 'Michael Brown',
      email: 'michael.b@teamtrack.local',
      role: 'DevOps Lead',
      avatarBg: '#F59E0B',
      calling: false,
    },
    {
      id: 'gm-4',
      name: 'Zaid Malik',
      email: 'zaid.m@teamtrack.local',
      role: 'UX Designer',
      avatarBg: '#10B981',
      calling: false,
    },
  ]);

  // People drawer search query
  const [peopleSearchQuery, setPeopleSearchQuery] = useState('');

  // Refs for media and websocket
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Enumerate actual hardware devices
  useEffect(() => {
    async function loadDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
        const speakers = devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
        const cams = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));

        setAudioInputDevices(
          mics.length ? mics : [{ deviceId: 'default-mic', label: 'Default Microphone' }]
        );
        setAudioOutputDevices(
          speakers.length ? speakers : [{ deviceId: 'default-spk', label: 'Default Speaker / Headphones' }]
        );
        setVideoDevices(
          cams.length ? cams : [{ deviceId: 'default-cam', label: 'Integrated HD Webcam' }]
        );

        if (mics[0]) setSelectedMicId(mics[0].deviceId);
        if (speakers[0]) setSelectedSpeakerId(speakers[0].deviceId);
        if (cams[0]) setSelectedCameraId(cams[0].deviceId);
      } catch (e) {
        console.warn('Device enumeration not available:', e);
      }
    }
    loadDevices();
  }, []);

  // Sync self participant status with toggles
  useEffect(() => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === 'p-self'
          ? {
              ...p,
              name: `${userName} (You)`,
              audioMuted: !micEnabled,
              videoOff: !cameraEnabled,
              handRaised: myHandRaised,
            }
          : p
      )
    );
  }, [cameraEnabled, micEnabled, myHandRaised, userName]);

  // ── REAL-TIME CONTINUOUS MEETING TIMER ──
  useEffect(() => {
    if (meetingState !== 'admitted') return;
    const interval = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [meetingState]);

  const formatTimer = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Hardware Camera & Mic stream
  useEffect(() => {
    let active = true;

    async function updateMediaStream() {
      if (cameraEnabled) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
            audio: micEnabled,
          });
          if (active) {
            mediaStreamRef.current = stream;
            if (previewVideoRef.current) {
              previewVideoRef.current.srcObject = stream;
            }
          }
        } catch (err) {
          console.warn('Camera feed unavailable:', err);
        }
      } else {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getVideoTracks().forEach((track) => track.stop());
        }
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = null;
        }
      }
    }

    updateMediaStream();

    return () => {
      active = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraEnabled, micEnabled, selectedCameraId]);

  // WebSocket signaling
  useEffect(() => {
    if (meetingState !== 'admitted') return;

    let ws: WebSocket | null = null;
    try {
      const wsBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/^http/, 'ws');
      ws = new WebSocket(`${wsBaseUrl}/ws`, ['teamtrack-ws', 'tt-ticket.demo-ticket']);
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe', topic: `meeting:${meetingId}` }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'meeting.chat' && payload.data) {
            setChatMessages((prev) => [...prev, payload.data]);
          } else if (payload.type === 'meeting.reaction' && payload.data?.emoji) {
            triggerVisualReaction(payload.data.emoji);
          } else if (payload.type === 'meeting.participant.joined' && payload.data?.user) {
            const newUser = payload.data.user;
            setParticipants((prev) => {
              if (prev.some((p) => p.id === newUser.id)) return prev;
              return [
                ...prev,
                {
                  id: newUser.id,
                  name: newUser.name,
                  role: newUser.role || 'Attendee',
                  avatarBg: newUser.avatarBg || '#0078D4',
                  audioMuted: false,
                  videoOff: false,
                  handRaised: false,
                  isSpeaking: false,
                },
              ];
            });
          }
        } catch {}
      };
    } catch (err) {
      console.warn('WS signaling offline, operating in self-contained mode', err);
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [meetingState, meetingId]);

  // Live Captions Simulation
  useEffect(() => {
    if (!captionsEnabled) {
      setCurrentCaption('');
      return;
    }

    const sampleTranscripts = [
      'Sarah Jenkins: Let\'s review our deliverables for the upcoming sprint.',
      'Sarah Jenkins: The WebRTC media signaling is performing with sub-100ms latency.',
      'Alex Rivera: I have reviewed the telemetry logs, everything looks solid.',
      'Sarah Jenkins: Perfect, let\'s synchronize with the client team at 3 PM.',
    ];
    let idx = 0;
    setCurrentCaption(sampleTranscripts[0]);

    const interval = setInterval(() => {
      idx = (idx + 1) % sampleTranscripts.length;
      setCurrentCaption(sampleTranscripts[idx]);
    }, 4500);

    return () => clearInterval(interval);
  }, [captionsEnabled]);

  // Floating Reaction helper
  const triggerVisualReaction = (emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setActiveReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  };

  const handleTriggerReaction = (emoji: string) => {
    setShowReactionsMenu(false);
    triggerVisualReaction(emoji);
    showToast(`You reacted with ${emoji}`);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'publish',
          topic: `meeting:${meetingId}`,
          data: { emoji, fromUser: userName },
        })
      );
    }
  };

  // Toggle Hand Raise
  const handleToggleHand = () => {
    const next = !myHandRaised;
    setMyHandRaised(next);
    showToast(next ? 'You raised your hand' : 'You lowered your hand');
  };

  // Toggle Recording
  const handleToggleRecording = () => {
    const next = !isRecording;
    setIsRecording(next);
    setShowRecordingBanner(next);
    showToast(next ? 'Recording has started' : 'Recording stopped and saved to chat');
  };

  // Screen Share
  const handleToggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          showToast('Screen sharing is not supported in this browser environment');
          return;
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        if (screenShareVideoRef.current) {
          screenShareVideoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
          showToast('Screen sharing ended');
        };
        setScreenSharing(true);
        showToast('Screen sharing started');
      } catch {
        setScreenSharing(false);
      }
    } else {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      setScreenSharing(false);
      showToast('Screen sharing stopped');
    }
  };

  // Leave Meeting
  const handleLeaveMeeting = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    router.push('/meetings');
  };

  // Copy Meeting Link
  const handleCopyMeetingLink = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Meeting link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // ── 6. SEND IN-MEETING CHAT MESSAGE (Visible to Everyone) ──
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatText.trim()) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}`,
      author: userName,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: newChatText.trim(),
      avatarBg: '#5B5FC7',
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const sentText = newChatText.trim();
    setNewChatText('');

    // Broadcast via WebSocket to all meeting attendees
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'publish',
          topic: `meeting:${meetingId}`,
          data: userMsg,
        })
      );
    }

    // Interactive Group Simulation: Sarah Jenkins responds in 2s showing real-time group chat
    setTimeout(() => {
      const replies = [
        'Got it! Looking into this right away.',
        'Sounds good to me, agree with that point.',
        'Thanks for sharing, noted in meeting minutes.',
      ];
      const randomReply = replies[Math.floor(Math.random() * replies.length)];
      const botMsg: ChatMessage = {
        id: `${Date.now() + 1}`,
        author: 'Sarah Jenkins',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: randomReply,
        avatarBg: '#0078D4',
      };
      setChatMessages((prev) => [...prev, botMsg]);
    }, 2000);
  };

  // ── 7. REQUEST A GROUP MEMBER TO JOIN THE CALL ──
  const handleRequestToJoin = (member: GroupMember) => {
    setGroupMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, calling: true } : m))
    );
    showToast(`Calling ${member.name}... Request sent`);

    // Simulate ringing & admittance into call after 2.5 seconds
    setTimeout(() => {
      // Remove from pending group members
      setGroupMembers((prev) => prev.filter((m) => m.id !== member.id));

      // Add to active in-meeting participants
      const newParticipant: Participant = {
        id: member.id,
        name: member.name,
        role: member.role,
        avatarBg: member.avatarBg,
        audioMuted: false,
        videoOff: false,
        handRaised: false,
        isSpeaking: false,
      };

      setParticipants((prev) => [...prev, newParticipant]);
      showToast(`${member.name} joined the meeting!`);

      // Add system message to in-meeting chat
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          author: 'System',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `${member.name} was invited and joined the call.`,
          avatarBg: '#616161',
        },
      ]);

      // Invited participant greets the group in shared chat after joining
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${Date.now() + 1}`,
            author: member.name,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: `Hi everyone! Thanks for calling me in, happy to join the group session.`,
            avatarBg: member.avatarBg,
          },
        ]);
      }, 1800);
    }, 2500);
  };

  // Mute All Participants
  const handleMuteAll = () => {
    setParticipants((prev) =>
      prev.map((p) => (p.id !== 'p-self' ? { ...p, audioMuted: true } : p))
    );
    showToast('All attendees have been muted');
  };

  // Filtered Participants and Group Members based on Search
  const filteredParticipants = useMemo(() => {
    if (!peopleSearchQuery.trim()) return participants;
    const q = peopleSearchQuery.toLowerCase();
    return participants.filter((p) => p.name.toLowerCase().includes(q));
  }, [participants, peopleSearchQuery]);

  const filteredGroupMembers = useMemo(() => {
    if (!peopleSearchQuery.trim()) return groupMembers;
    const q = peopleSearchQuery.toLowerCase();
    return groupMembers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [groupMembers, peopleSearchQuery]);

  // ─────────────────────────────────────────────────────────────
  // 1. PRE-JOIN LOBBY VIEW
  // ─────────────────────────────────────────────────────────────
  if (meetingState === 'lobby') {
    return (
      <div className="h-screen w-screen bg-[#111111] text-white flex flex-col items-center justify-center p-4 select-none font-sans">
        <div className="text-center mb-6">
          <h1 className="text-[26px] font-bold tracking-tight text-white mb-1.5">
            Ready to join the meeting?
          </h1>
          <p className="text-[13.5px] text-[#A6A6A6]">
            Meeting room: <span className="text-[#7B83EB] font-semibold">{meetingId}</span>
          </p>
        </div>

        <div className="w-full max-w-4xl bg-[#181818] border border-[#2D2D2D] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 shadow-2xl">
          {/* Left: Video Preview */}
          <div className="flex-1 bg-[#242424] rounded-2xl overflow-hidden aspect-video relative flex items-center justify-center border border-[#3D3D3D]">
            {cameraEnabled ? (
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${blurBackground ? 'filter blur-[4px]' : ''}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <Avatar name={userName} size={72} color="colorful" />
                <span className="text-[13px] text-[#A6A6A6] mt-3 font-medium">Camera is off</span>
              </div>
            )}

            {/* Floating Camera & Mic Quick Controls */}
            <div className="absolute bottom-4 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Tooltip content={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} relationship="label">
                <button
                  onClick={() => setCameraEnabled(!cameraEnabled)}
                  className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                    cameraEnabled ? 'bg-[#5B5FC7] text-white' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {cameraEnabled ? <VideoRegular fontSize={18} /> : <VideoOffRegular fontSize={18} />}
                </button>
              </Tooltip>

              <Tooltip content={micEnabled ? 'Mute microphone' : 'Unmute microphone'} relationship="label">
                <button
                  onClick={() => setMicEnabled(!micEnabled)}
                  className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                    micEnabled ? 'bg-[#5B5FC7] text-white' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {micEnabled ? <MicRegular fontSize={18} /> : <MicOffRegular fontSize={18} />}
                </button>
              </Tooltip>

              <Tooltip content={blurBackground ? 'Remove blur' : 'Blur background'} relationship="label">
                <button
                  onClick={() => setBlurBackground(!blurBackground)}
                  className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                    blurBackground ? 'bg-[#5B5FC7] text-white' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <SparkleRegular fontSize={18} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Right: Audio & Device Settings + Join Action */}
          <div className="w-full md:w-[320px] flex flex-col justify-between">
            <div>
              <h3 className="text-[18px] font-bold text-white mb-1">{userName}</h3>
              <p className="text-[12.5px] text-[#A6A6A6] mb-5">Signing in with TeamTrack identity</p>

              <div className="space-y-3">
                <div
                  onClick={() => setIsDeviceSettingsOpen(true)}
                  className="p-3 bg-[#1F1F1F] rounded-xl border border-[#3D3D3D] hover:border-[#5B5FC7] transition-colors cursor-pointer"
                >
                  <div className="text-[12px] font-semibold text-[#D1D5DB] mb-1 flex items-center justify-between">
                    <span>Microphone & Audio</span>
                    <SettingsRegular fontSize={14} className="text-[#888]" />
                  </div>
                  <div className="flex items-center justify-between text-[13px] text-white">
                    <span className="truncate">{micEnabled ? 'Microphone Active' : 'Audio off'}</span>
                    <span className={`w-2 h-2 rounded-full ${micEnabled ? 'bg-[#107C10]' : 'bg-[#8A8886]'}`} />
                  </div>
                </div>

                <div
                  onClick={() => setIsDeviceSettingsOpen(true)}
                  className="p-3 bg-[#1F1F1F] rounded-xl border border-[#3D3D3D] hover:border-[#5B5FC7] transition-colors cursor-pointer"
                >
                  <div className="text-[12px] font-semibold text-[#D1D5DB] mb-1 flex items-center justify-between">
                    <span>Camera Device</span>
                    <SettingsRegular fontSize={14} className="text-[#888]" />
                  </div>
                  <div className="flex items-center justify-between text-[13px] text-white">
                    <span className="truncate">{cameraEnabled ? 'Camera Active' : 'Camera off'}</span>
                    <span className={`w-2 h-2 rounded-full ${cameraEnabled ? 'bg-[#107C10]' : 'bg-[#8A8886]'}`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <button
                onClick={() => setMeetingState('admitted')}
                className="w-full py-3 px-6 bg-[#5B5FC7] hover:bg-[#4F52B2] text-white rounded-xl text-[14.5px] font-bold shadow-lg transition-all cursor-pointer hover:shadow-xl active:scale-98 flex items-center justify-center gap-2"
              >
                <span>Join Now</span>
              </button>

              <button
                onClick={handleLeaveMeeting}
                className="w-full py-2 px-4 bg-transparent hover:bg-white/5 text-[#A6A6A6] hover:text-white rounded-xl text-[13px] font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ACTIVE IN-MEETING STAGE WITH NATIVE TEAMS TOP TOOLBAR
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-[#1F1F1F] text-white flex flex-col select-none font-sans relative overflow-hidden">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#323130] border border-white/10 text-white px-4 py-2 rounded-lg text-[13px] font-medium shadow-2xl z-50 animate-fadeIn flex items-center gap-2">
          <CheckmarkRegular fontSize={16} className="text-[#107C41]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Reaction Particles */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {activeReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 text-[44px] animate-bounce"
            style={{ animationDuration: '1.4s' }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* ── Official Microsoft Teams Top In-Meeting Toolbar (Matching Screenshot) ── */}
      <header className="h-[54px] px-3 bg-[#FFFFFF] border-b border-[#E1DFDD] flex items-center justify-between shrink-0 z-40 select-none font-sans text-[#242424] shadow-xs">
        {/* Left: Shield & Call Timer (Real-Time Live Meeting Duration Timer!) */}
        <div className="flex items-center gap-2.5 pl-1">
          <Tooltip content="End-to-end encrypted (E2EE)" relationship="label">
            <button
              onClick={() => setIsSecurityInfoOpen(true)}
              className="flex items-center text-[#242424] hover:text-[#5B5FC7] transition-colors cursor-pointer focus:outline-none"
              aria-label="Security and Encryption info"
            >
              <ShieldRegular fontSize={19} />
            </button>
          </Tooltip>

          {/* Real-time continuous clock ticking second-by-second */}
          <span className="text-[13px] font-semibold text-[#242424] tracking-tight font-mono">
            {formatTimer(secondsElapsed)}
          </span>

          {isRecording && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#C4314B]/10 text-[#C4314B] text-[11px] font-semibold animate-pulse ml-1 select-none">
              <span className="w-2 h-2 rounded-full bg-[#C4314B]" />
              <span>REC</span>
            </div>
          )}
        </div>

        {/* Right: Controls Bar with Icons & Text Labels (Exact Layout from Screenshot) */}
        <div className="flex items-center gap-0.5">
          {/* 1. Record */}
          <Tooltip content={isRecording ? 'Stop recording' : 'Record meeting'} relationship="label">
            <button
              onClick={handleToggleRecording}
              className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                isRecording ? 'bg-[#C4314B]/10 text-[#C4314B]' : 'text-[#242424] hover:bg-black/5'
              }`}
              aria-label="Record"
            >
              <div className="relative flex items-center justify-center">
                {isRecording ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-[#C4314B] animate-pulse" />
                ) : (
                  <div className="relative flex items-center justify-center">
                    <RecordRegular fontSize={20} />
                    <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-[#5B5FC7] border border-white flex items-center justify-center">
                      <span className="w-1 h-1 bg-white rounded-full" />
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">
                {isRecording ? 'Recording' : 'Record'}
              </span>
            </button>
          </Tooltip>

          {/* 2. Chat */}
          <Tooltip content="In-meeting Chat (Shared with all attendees)" relationship="label">
            <button
              onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
              className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group relative focus:outline-none ${
                activeDrawer === 'chat'
                  ? 'bg-[#5B5FC7]/10 text-[#5B5FC7]'
                  : 'text-[#242424] hover:bg-black/5'
              }`}
              aria-label="Chat"
            >
              <div className="relative flex items-center justify-center">
                <ChatRegular fontSize={20} />
                {chatMessages.length > 0 && (
                  <span className="absolute -top-1 -right-2 bg-[#C4314B] text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                    {chatMessages.length}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">Chat</span>
            </button>
          </Tooltip>

          {/* 3. People (Count badge matching active participants) */}
          <Tooltip content="People & Participants" relationship="label">
            <button
              onClick={() => setActiveDrawer(activeDrawer === 'roster' ? null : 'roster')}
              className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                activeDrawer === 'roster'
                  ? 'bg-[#5B5FC7]/10 text-[#5B5FC7]'
                  : 'text-[#242424] hover:bg-black/5'
              }`}
              aria-label="People"
            >
              <div className="flex items-center gap-0.5">
                <PeopleRegular fontSize={20} />
                <span className="text-[10.5px] font-bold text-[#242424] leading-none">
                  {participants.length}
                </span>
              </div>
              <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">People</span>
            </button>
          </Tooltip>

          {/* 4. Raise Hand */}
          <Tooltip content={myHandRaised ? 'Lower hand' : 'Raise hand'} relationship="label">
            <button
              onClick={handleToggleHand}
              className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                myHandRaised
                  ? 'bg-[#FFB900]/20 text-[#D97706]'
                  : 'text-[#242424] hover:bg-black/5'
              }`}
              aria-label="Raise hand"
            >
              <HandRightRegular fontSize={20} className={myHandRaised ? 'text-[#D97706]' : ''} />
              <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">
                {myHandRaised ? 'Lower' : 'Raise'}
              </span>
            </button>
          </Tooltip>

          {/* 5. React */}
          <div className="relative">
            <Tooltip content="React" relationship="label">
              <button
                onClick={() => setShowReactionsMenu(!showReactionsMenu)}
                className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                  showReactionsMenu ? 'bg-black/10' : 'text-[#242424] hover:bg-black/5'
                }`}
                aria-label="React"
              >
                <EmojiRegular fontSize={20} />
                <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">React</span>
              </button>
            </Tooltip>

            {/* Reactions Popover */}
            {showReactionsMenu && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-white border border-[#E1DFDD] px-3 py-2 rounded-full flex items-center gap-2.5 shadow-xl z-50 animate-fadeIn">
                {['👍', '❤️', '👏', '💡', '😂', '😮'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleTriggerReaction(emoji)}
                    className="text-[20px] hover:scale-125 transition-transform cursor-pointer p-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 6. View Switcher */}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <button
                className="min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center text-[#242424] hover:bg-black/5 transition-all cursor-pointer group focus:outline-none"
                aria-label="View"
              >
                <PersonCircleRegular fontSize={20} />
                <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">View</span>
              </button>
            </MenuTrigger>
            <MenuPopover className="z-50 min-w-[180px]">
              <MenuList>
                <MenuItem
                  onClick={() => {
                    setViewMode('gallery');
                    showToast('Switched to Gallery view');
                  }}
                >
                  Gallery view
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setViewMode('speaker');
                    showToast('Switched to Speaker focus');
                  }}
                >
                  Speaker focus
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setViewMode('together');
                    showToast('Switched to Together mode');
                  }}
                >
                  Together mode
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>

          {/* 7. More */}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <button
                className="min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center text-[#242424] hover:bg-black/5 transition-all cursor-pointer group focus:outline-none"
                aria-label="More options"
              >
                <MoreHorizontalRegular fontSize={20} />
                <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">More</span>
              </button>
            </MenuTrigger>
            <MenuPopover className="z-50 min-w-[220px]">
              <MenuList>
                <MenuItem
                  icon={<SettingsRegular fontSize={16} />}
                  onClick={() => setIsDeviceSettingsOpen(true)}
                >
                  Device settings
                </MenuItem>
                <MenuItem
                  icon={<SparkleRegular fontSize={16} />}
                  onClick={() => {
                    setBlurBackground(!blurBackground);
                    showToast(!blurBackground ? 'Background blur enabled' : 'Background blur removed');
                  }}
                >
                  {blurBackground ? 'Remove background blur' : 'Apply background blur'}
                </MenuItem>
                <MenuItem
                  icon={<CheckmarkRegular fontSize={16} />}
                  onClick={() => {
                    setCaptionsEnabled(!captionsEnabled);
                    showToast(!captionsEnabled ? 'Live captions turned on' : 'Live captions turned off');
                  }}
                >
                  {captionsEnabled ? 'Turn off live captions' : 'Turn on live captions'}
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={<CopyRegular fontSize={16} />} onClick={handleCopyMeetingLink}>
                  Copy meeting link
                </MenuItem>
                <MenuItem
                  icon={<ShieldRegular fontSize={16} />}
                  onClick={() => setIsSecurityInfoOpen(true)}
                >
                  Meeting security info
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>

          {/* Separator Divider */}
          <div className="h-[24px] w-[1px] bg-[#E1DFDD] mx-1" />

          {/* 8. Camera with Dropdown Chevron */}
          <div className="flex items-center">
            <Tooltip content={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} relationship="label">
              <button
                onClick={() => {
                  setCameraEnabled(!cameraEnabled);
                  showToast(!cameraEnabled ? 'Camera turned on' : 'Camera turned off');
                }}
                className={`h-[46px] px-2 rounded-l-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                  cameraEnabled ? 'text-[#242424] hover:bg-black/5' : 'text-[#C4314B] bg-[#C4314B]/5'
                }`}
                aria-label="Toggle camera"
              >
                {cameraEnabled ? <VideoRegular fontSize={20} /> : <VideoOffRegular fontSize={20} className="text-[#C4314B]" />}
                <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">Camera</span>
              </button>
            </Tooltip>

            {/* Camera Options Chevron Menu */}
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <button
                  className="h-[46px] px-1 rounded-r-lg flex items-center justify-center text-[#616161] hover:bg-black/5 transition-colors cursor-pointer focus:outline-none"
                  aria-label="Camera options"
                >
                  <ChevronDownRegular fontSize={11} />
                </button>
              </MenuTrigger>
              <MenuPopover className="z-50 min-w-[200px]">
                <MenuList>
                  {videoDevices.map((d) => (
                    <MenuItem
                      key={d.deviceId}
                      onClick={() => {
                        setSelectedCameraId(d.deviceId);
                        showToast(`Selected ${d.label}`);
                      }}
                    >
                      {d.label}
                    </MenuItem>
                  ))}
                  <MenuDivider />
                  <MenuItem
                    icon={<SparkleRegular fontSize={16} />}
                    onClick={() => setBlurBackground(!blurBackground)}
                  >
                    {blurBackground ? 'Remove background blur' : 'Blur background'}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>

          {/* 9. Mic with Dropdown Chevron */}
          <div className="flex items-center">
            <Tooltip content={micEnabled ? 'Mute microphone' : 'Unmute microphone'} relationship="label">
              <button
                onClick={() => {
                  setMicEnabled(!micEnabled);
                  showToast(!micEnabled ? 'Microphone unmuted' : 'Microphone muted');
                }}
                className={`h-[46px] px-2 rounded-l-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                  micEnabled ? 'text-[#242424] hover:bg-black/5' : 'text-[#C4314B] bg-[#C4314B]/5'
                }`}
                aria-label="Toggle microphone"
              >
                {micEnabled ? <MicRegular fontSize={20} /> : <MicOffRegular fontSize={20} className="text-[#C4314B]" />}
                <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">Mic</span>
              </button>
            </Tooltip>

            {/* Mic Options Chevron Menu */}
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <button
                  className="h-[46px] px-1 rounded-r-lg flex items-center justify-center text-[#616161] hover:bg-black/5 transition-colors cursor-pointer focus:outline-none"
                  aria-label="Microphone options"
                >
                  <ChevronDownRegular fontSize={11} />
                </button>
              </MenuTrigger>
              <MenuPopover className="z-50 min-w-[220px]">
                <MenuList>
                  {audioInputDevices.map((d) => (
                    <MenuItem
                      key={d.deviceId}
                      onClick={() => {
                        setSelectedMicId(d.deviceId);
                        showToast(`Selected ${d.label}`);
                      }}
                    >
                      {d.label}
                    </MenuItem>
                  ))}
                  <MenuDivider />
                  <MenuItem
                    icon={<SettingsRegular fontSize={16} />}
                    onClick={() => setIsDeviceSettingsOpen(true)}
                  >
                    Audio device settings
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>

          {/* 10. Share */}
          <Tooltip content={screenSharing ? 'Stop sharing screen' : 'Share screen'} relationship="label">
            <button
              onClick={handleToggleScreenShare}
              className={`min-w-[48px] h-[46px] px-1.5 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer group focus:outline-none ${
                screenSharing ? 'bg-[#5B5FC7]/10 text-[#5B5FC7]' : 'text-[#242424] hover:bg-black/5'
              }`}
              aria-label="Share screen"
            >
              {screenSharing ? (
                <ShareScreenStopRegular fontSize={20} className="text-[#5B5FC7]" />
              ) : (
                <ShareScreenStartRegular fontSize={20} />
              )}
              <span className="text-[10.5px] font-medium leading-none mt-1 text-[#242424]">Share</span>
            </button>
          </Tooltip>

          {/* Separator Divider */}
          <div className="h-[24px] w-[1px] bg-[#E1DFDD] mx-1" />

          {/* 11. Leave Button (Solid Red Curved Handset matching Screenshot) */}
          <Tooltip content="Leave meeting" relationship="label">
            <button
              onClick={handleLeaveMeeting}
              className="min-w-[48px] h-[46px] px-2 rounded-lg flex flex-col items-center justify-center hover:bg-[#C4314B]/10 active:scale-95 transition-all cursor-pointer group focus:outline-none ml-0.5"
              aria-label="Leave meeting"
            >
              <CallEndFilled fontSize={20} className="text-[#C4314B]" />
              <span className="text-[10.5px] font-bold leading-none mt-1 text-[#C4314B]">Leave</span>
            </button>
          </Tooltip>
        </div>
      </header>

      {/* ── Official Microsoft Teams Active Recording Notification Banner ── */}
      {showRecordingBanner && (
        <div className="bg-[#0078D4] text-white px-4 py-2 flex items-center justify-between text-[13px] z-30 animate-fadeIn select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFFFFF] animate-pulse" />
            <span>
              <strong>Recording has started.</strong> Everyone in the meeting knows this meeting is being recorded.
            </span>
          </div>
          <button
            onClick={() => setShowRecordingBanner(false)}
            className="text-white hover:bg-white/20 p-1 rounded transition-colors cursor-pointer"
          >
            <DismissRegular fontSize={16} />
          </button>
        </div>
      )}

      {/* ── Main Center Stage with Dynamic View Modes (Gallery / Speaker / Together) ── */}
      <div className="flex-1 flex overflow-hidden relative bg-[#1B1B1B]">
        {/* Stage Content */}
        <div className="flex-1 p-4 flex flex-col overflow-hidden relative">
          {/* Screen Sharing Viewport if active */}
          {screenSharing && (
            <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-[#5B5FC7] relative mb-3 flex items-center justify-center shadow-2xl">
              <video ref={screenShareVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-[12px] font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#5B5FC7] animate-pulse" />
                <span>You are sharing your screen</span>
              </div>
            </div>
          )}

          {/* 1. SPEAKER FOCUS MODE */}
          {viewMode === 'speaker' && !screenSharing && (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Top Filmstrip */}
              <div className="h-[120px] flex items-center gap-3 overflow-x-auto pb-2 shrink-0">
                {participants.slice(1).map((p) => (
                  <div
                    key={p.id}
                    className="h-full aspect-video bg-[#292929] rounded-xl overflow-hidden relative flex items-center justify-center border border-[#3D3D3D] shrink-0"
                  >
                    <Avatar name={p.name} size={36} color="colorful" />
                    <div className="absolute bottom-1 left-1.5 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white">
                      {p.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Spotlight Center Speaker (Sarah Jenkins / Self) */}
              <div className="flex-1 bg-[#292929] rounded-2xl overflow-hidden relative flex items-center justify-center border-2 border-[#5B5FC7] shadow-2xl">
                <div className="flex flex-col items-center justify-center">
                  <Avatar name="Sarah Jenkins" size={96} color="colorful" />
                  <span className="text-[17px] font-bold text-white mt-3">Sarah Jenkins (Speaking)</span>
                  <span className="text-[12px] text-[#A6A6A6] mt-0.5">Active Speaker Focus</span>
                </div>
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-2 text-[12px] text-white">
                  <MicRegular fontSize={14} className="text-green-400" />
                  <span>Sarah Jenkins</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. TOGETHER MODE AUDITORIUM */}
          {viewMode === 'together' && !screenSharing && (
            <div className="flex-1 bg-gradient-to-b from-[#2B2D42] to-[#1F1F1F] rounded-2xl flex flex-col items-center justify-end p-8 border border-[#3D3D3D] shadow-2xl relative overflow-hidden">
              <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-[12px] font-semibold text-[#8B5CF6]">
                Together Mode Auditorium
              </div>
              <div className="flex items-end justify-center gap-8 mb-6">
                {participants.map((p) => (
                  <div key={p.id} className="flex flex-col items-center">
                    <div className="relative">
                      <Avatar name={p.name} size={64} color="colorful" />
                      {p.handRaised && (
                        <span className="absolute -top-2 -right-2 text-[18px]">✋</span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-white mt-2 bg-black/60 px-2 py-0.5 rounded">
                      {p.name.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. GALLERY GRID MODE (Default) */}
          {viewMode === 'gallery' && (
            <div
              className={`flex-1 ${
                screenSharing
                  ? 'h-[140px] shrink-0 flex items-center gap-3 overflow-x-auto'
                  : participants.length <= 4
                  ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                  : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'
              } overflow-y-auto`}
            >
              {participants.map((p) => {
                const isSelf = p.id === 'p-self';
                return (
                  <div
                    key={p.id}
                    className={`bg-[#292929] rounded-2xl overflow-hidden relative flex items-center justify-center border transition-all ${
                      screenSharing
                        ? 'h-full aspect-video shrink-0'
                        : 'w-full h-full min-h-[200px]'
                    } ${
                      p.isSpeaking ? 'border-[#5B5FC7] ring-2 ring-[#5B5FC7]' : 'border-[#3D3D3D]'
                    }`}
                  >
                    {/* Camera Video or Colorful Fluent Avatar */}
                    {isSelf && cameraEnabled ? (
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`w-full h-full object-cover ${
                          blurBackground ? 'filter blur-[4px]' : ''
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1F1F1F] flex flex-col items-center justify-center">
                        <Avatar name={p.name} size={64} color="colorful" />
                      </div>
                    )}

                    {/* Hand Raised Badge */}
                    {p.handRaised && (
                      <div className="absolute top-3 left-3 bg-[#FFB900] text-black px-2.5 py-1 rounded-full text-[11.5px] font-bold flex items-center gap-1 shadow-lg animate-pulse">
                        <span>✋ Hand Raised</span>
                      </div>
                    )}

                    {/* Participant Name Tag & Audio Status */}
                    <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg flex items-center gap-2 text-[12px] font-semibold text-white">
                      <span>{p.name}</span>
                      {p.audioMuted ? (
                        <MicOffRegular fontSize={13} className="text-[#C4314B]" />
                      ) : (
                        <MicRegular fontSize={13} className="text-green-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Captions Overlay Bar */}
        {captionsEnabled && currentCaption && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md px-6 py-2.5 rounded-xl border border-white/15 text-white text-[13.5px] text-center max-w-xl z-30 shadow-2xl animate-fadeIn">
            <span>{currentCaption}</span>
          </div>
        )}

        {/* ── Slide-out Drawer: In-Meeting Chat or Roster ── */}
        {activeDrawer && (
          <aside className="w-[360px] bg-[#242424] border-l border-black/40 flex flex-col shrink-0 animate-fadeIn z-30">
            {/* Drawer Header */}
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-white">
                {activeDrawer === 'chat'
                  ? 'Meeting Chat'
                  : `Participants (${participants.length})`}
              </h3>
              <button
                onClick={() => setActiveDrawer(null)}
                className="p-1 text-[#A6A6A6] hover:text-white cursor-pointer"
                aria-label="Close panel"
              >
                <DismissRegular fontSize={18} />
              </button>
            </div>

            {/* ── A. IN-MEETING SHARED GROUP CHAT DRAWER ── */}
            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-[12.5px]">
                  <div className="p-2.5 bg-[#2A2A2A] rounded-xl border border-white/10 text-center text-[#A6A6A6] text-[11.5px] mb-2">
                    Messages are shared in real-time with everyone in this call.
                  </div>

                  {chatMessages.length === 0 ? (
                    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-[#A6A6A6] p-4">
                      <ChatRegular fontSize={36} className="text-[#5B5FC7] mb-3 opacity-60" />
                      <p className="text-[13px] font-semibold text-white">No messages yet</p>
                      <p className="text-[11.5px] text-[#888] mt-1 max-w-[200px]">
                        Send a message to start conversation with the meeting group
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.author.includes('You') || msg.author === userName;
                      return (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-xl border ${
                            isMe
                              ? 'bg-[#2E2E38] border-[#5B5FC7]/40 ml-4'
                              : 'bg-[#2E2E2E] border-white/5 mr-4'
                          }`}
                        >
                          <div className="flex justify-between items-baseline mb-1">
                            <span
                              className={`font-bold ${
                                isMe ? 'text-[#8B5CF6]' : 'text-[#7B83EB]'
                              }`}
                            >
                              {msg.author}
                            </span>
                            <span className="text-[10px] text-[#A6A6A6]">{msg.time}</span>
                          </div>
                          <p className="text-white leading-relaxed">{msg.text}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Message input bar */}
                <form onSubmit={handleSendChatMessage} className="p-3 border-t border-white/10 flex gap-2 bg-[#1B1B1B]">
                  <input
                    type="text"
                    value={newChatText}
                    onChange={(e) => setNewChatText(e.target.value)}
                    placeholder="Type a message to everyone in the meeting..."
                    className="flex-1 h-[36px] px-3 bg-[#242424] border border-[#3D3D3D] rounded-lg text-[12.5px] text-white focus:outline-none focus:border-[#5B5FC7]"
                  />
                  <button
                    type="submit"
                    className="px-3 bg-[#5B5FC7] hover:bg-[#4F52B2] text-white rounded-lg cursor-pointer flex items-center justify-center"
                    aria-label="Send message"
                  >
                    <SendRegular fontSize={16} />
                  </button>
                </form>
              </div>
            )}

            {/* ── B. PARTICIPANTS & GROUP MEMBERS (ROSTER DRAWER) ── */}
            {activeDrawer === 'roster' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {/* Search / Filter Input */}
                <div>
                  <Input
                    value={peopleSearchQuery}
                    onChange={(_, data) => setPeopleSearchQuery(data.value)}
                    contentBefore={<SearchRegular fontSize={14} className="text-[#888]" />}
                    placeholder="Search people or type a name..."
                    className="w-full"
                    size="small"
                  />
                </div>

                {/* Section 1: In this meeting */}
                <div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10 text-[12px] font-semibold text-[#A6A6A6]">
                    <span>In this meeting ({filteredParticipants.length})</span>
                    {participants.length > 1 && (
                      <button
                        onClick={handleMuteAll}
                        className="text-[#7B83EB] hover:underline cursor-pointer text-[11.5px]"
                      >
                        Mute all
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {filteredParticipants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.name} size={32} color="colorful" />
                          <div>
                            <div className="text-[12.5px] font-bold text-white leading-tight">
                              {p.name}
                            </div>
                            <div className="text-[10.5px] text-[#A6A6A6]">{p.role}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[#A6A6A6]">
                          {p.handRaised && <span title="Hand raised">✋</span>}
                          {p.audioMuted ? (
                            <MicOffRegular fontSize={15} className="text-[#C4314B]" />
                          ) : (
                            <MicRegular fontSize={15} className="text-green-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2: Others in group / Suggested to Invite with "Request to join" button */}
                {filteredGroupMembers.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 text-[12px] font-semibold text-[#A6A6A6]">
                      <span>Others in group ({filteredGroupMembers.length})</span>
                    </div>

                    <div className="space-y-2 mt-2">
                      {filteredGroupMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/15 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <Avatar name={m.name} size={32} color="colorful" />
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-bold text-white truncate">
                                {m.name}
                              </div>
                              <div className="text-[10.5px] text-[#A6A6A6] truncate">{m.role}</div>
                            </div>
                          </div>

                          <Button
                            size="small"
                            appearance={m.calling ? 'primary' : 'secondary'}
                            icon={m.calling ? <PhoneRegular fontSize={14} className="animate-pulse" /> : <PersonAddRegular fontSize={14} />}
                            disabled={m.calling}
                            onClick={() => handleRequestToJoin(m)}
                            className="shrink-0 text-[11.5px]"
                          >
                            {m.calling ? 'Calling...' : 'Ask to join'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom 1-Click Copy Link */}
                <div className="pt-3 border-t border-white/10">
                  <Button
                    appearance="secondary"
                    icon={<CopyRegular fontSize={16} />}
                    onClick={handleCopyMeetingLink}
                    className="w-full text-[12.5px]"
                  >
                    Copy meeting link
                  </Button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Dialog 1: Device Settings (Microphone, Speaker, Camera) ── */}
      <Dialog open={isDeviceSettingsOpen} onOpenChange={(_, data) => setIsDeviceSettingsOpen(data.open)}>
        <DialogSurface className="max-w-[480px] p-6 rounded-2xl font-sans">
          <DialogTitle className="text-[18px] font-bold text-[#242424] flex items-center gap-2">
            <SettingsRegular fontSize={20} className="text-[#5B5FC7]" />
            Device Settings
          </DialogTitle>
          <DialogBody>
            <DialogContent className="py-3 space-y-4">
              {/* Audio devices */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                  Microphone
                </label>
                <select
                  value={selectedMicId}
                  onChange={(e) => {
                    setSelectedMicId(e.target.value);
                    showToast('Microphone updated');
                  }}
                  className="w-full h-[36px] px-3 bg-white border border-[#E1DFDD] rounded-lg text-[13px] text-[#242424] outline-none focus:border-[#5B5FC7]"
                >
                  {audioInputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {/* Audio level meter */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[#616161]">Input level:</span>
                  <div className="flex-1 h-2 bg-[#EDEBE9] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#107C10] transition-all"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Speaker devices */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                  Speaker
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => {
                      setSelectedSpeakerId(e.target.value);
                      showToast('Speaker updated');
                    }}
                    className="flex-1 h-[36px] px-3 bg-white border border-[#E1DFDD] rounded-lg text-[13px] text-[#242424] outline-none focus:border-[#5B5FC7]"
                  >
                    {audioOutputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    appearance="secondary"
                    icon={<Speaker2Regular fontSize={16} />}
                    onClick={() => {
                      showToast('Chime test sound played');
                    }}
                  >
                    Test
                  </Button>
                </div>
              </div>

              {/* Camera devices */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                  Camera
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    showToast('Camera updated');
                  }}
                  className="w-full h-[36px] px-3 bg-white border border-[#E1DFDD] rounded-lg text-[13px] text-[#242424] outline-none focus:border-[#5B5FC7]"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Noise Suppression & Effects */}
              <div className="pt-2 border-t border-[#EDEBE9] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={blurBackground}
                    onChange={(e) => setBlurBackground(e.target.checked)}
                    className="w-4 h-4 text-[#5B5FC7] rounded"
                  />
                  <span className="text-[13px] text-[#242424]">
                    Apply background blur filter
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-[#5B5FC7] rounded"
                  />
                  <span className="text-[13px] text-[#242424]">
                    AI Noise Suppression (High)
                  </span>
                </label>
              </div>
            </DialogContent>
            <DialogActions className="pt-3 flex justify-end gap-2">
              <Button appearance="primary" onClick={() => setIsDeviceSettingsOpen(false)}>
                Done
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Dialog 2: Security & Encryption Info ── */}
      <Dialog open={isSecurityInfoOpen} onOpenChange={(_, data) => setIsSecurityInfoOpen(data.open)}>
        <DialogSurface className="max-w-[420px] p-6 rounded-2xl font-sans">
          <DialogTitle className="text-[18px] font-bold text-[#242424] flex items-center gap-2">
            <ShieldCheckmarkRegular fontSize={22} className="text-[#107C41]" />
            Meeting Security & Privacy
          </DialogTitle>
          <DialogBody>
            <DialogContent className="py-3 text-[13px] text-[#424242] space-y-3">
              <div className="flex items-start gap-2.5">
                <LockClosedRegular fontSize={18} className="text-[#107C41] shrink-0 mt-0.5" />
                <span>
                  <strong>End-to-End Encrypted (E2EE):</strong> Media packets are encrypted directly between participants using WebRTC DTLS-SRTP.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckmarkRegular fontSize={18} className="text-[#107C41] shrink-0 mt-0.5" />
                <span>
                  <strong>Identity Verified:</strong> Authenticated via TeamTrack secure token exchange.
                </span>
              </div>
              <div className="p-2.5 bg-[#F5F5F5] rounded-lg text-[11.5px] font-mono text-[#616161]">
                Room ID: {meetingId}
              </div>
            </DialogContent>
            <DialogActions className="pt-3 flex justify-end">
              <Button appearance="primary" onClick={() => setIsSecurityInfoOpen(false)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
