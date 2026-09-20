'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import { api } from '../../lib/api';
import type { MeetingWithHost } from '@teamtrack/shared-types';
import {
  Video,
  Plus,
  Clock,
  Users,
  Search,
  Share2,
  KeyRound,
  Check,
  CalendarDays,
  Sparkles,
  X,
  ShieldCheck,
  Radio,
} from 'lucide-react';

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.displayName || 'Workspace Member';
  const orgId = (user as any)?.organizationId || (user as any)?.activeOrganizationId || 'org_default';

  // ── State Management ──
  const [meetings, setMeetings] = useState<MeetingWithHost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  // Dialog States
  const [isMeetNowOpen, setIsMeetNowOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isJoinWithIdOpen, setIsJoinWithIdOpen] = useState(false);

  // Form States
  const [meetNowTitle, setMeetNowTitle] = useState(`Meeting with ${userName}`);
  const [generatedMeetingId, setGeneratedMeetingId] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [joinMeetingId, setJoinMeetingId] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');

  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduleTime, setScheduleTime] = useState('14:00');
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Fetch Real Meetings from Backend ──
  const fetchMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.listMeetings(orgId);
      if (res.success && res.data) {
        setMeetings(res.data.meetings || []);
      }
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Open Meet Now Dialog with generated room ID
  const handleOpenMeetNow = () => {
    const roomId = `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    setGeneratedMeetingId(roomId);
    setMeetNowTitle(`Meeting with ${userName}`);
    setCopiedLink(false);
    setIsMeetNowOpen(true);
  };

  // Copy Meeting Link
  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/meetings/room/${generatedMeetingId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Handle Join with ID
  const handleJoinWithId = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinMeetingId.trim()) return;
    const cleanId = joinMeetingId.trim().replace(/^.*\/meetings\/room\//, '');
    router.push(`/meetings/room/${encodeURIComponent(cleanId)}`);
  };

  // Handle Schedule Meeting Submission
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const startDateTime = new Date(`${scheduleDate}T${scheduleTime}:00`);

      const res = await api.createMeeting({
        organizationId: orgId,
        title: scheduleTitle.trim(),
        scheduledStartAt: startDateTime.toISOString(),
        waitingRoomEnabled,
      });

      if (res.success) {
        setIsScheduleOpen(false);
        setScheduleTitle('');
        await fetchMeetings();
      }
    } catch (err) {
      console.error('Failed to schedule meeting:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Meetings
  const filteredMeetings = meetings.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Render Secondary Sidebar ──
  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] select-none font-sans text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight">Meetings &amp; Rooms</h2>
        </div>

        {/* Free Pro Pill */}
        <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-[11px]">
            <Sparkles size={12} />
            <span>4K Video Rooms</span>
          </div>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase">
            Free
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenMeetNow}
            className="py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Video size={14} />
            <span>Meet Now</span>
          </button>
          <button
            onClick={() => setIsScheduleOpen(true)}
            className="py-2 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>Schedule</span>
          </button>
        </div>

        {/* Search Box */}
        <div className="relative flex items-center">
          <span className="absolute left-3 text-[var(--text-secondary)] pointer-events-none">
            <Search size={13} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings..."
            className="w-full h-8 pl-8 pr-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tabs: Upcoming / Past */}
      <div className="px-3 pt-2 border-b border-[var(--border-subtle)] flex items-center gap-2 text-xs">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`pb-2 border-b-2 font-semibold transition-colors cursor-pointer ${
            activeTab === 'upcoming'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`pb-2 border-b-2 font-semibold transition-colors cursor-pointer ${
            activeTab === 'past'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          History
        </button>
      </div>

      {/* Meeting List or Empty State */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {filteredMeetings.length === 0 ? (
          <div className="text-center py-10 px-4 text-[var(--text-secondary)]">
            <Clock size={24} className="mx-auto text-[var(--text-secondary)] mb-2" />
            <p className="text-xs font-semibold text-[var(--text-primary)]">No meetings found</p>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Start an instant meeting or schedule one to connect.
            </p>
          </div>
        ) : (
          filteredMeetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => router.push(`/meetings/room/${meeting.id}`)}
              className="p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-indigo-500/40 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:text-indigo-400">
                  {meeting.title}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  meeting.status === 'active' ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400'
                }`}>
                  {meeting.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <Clock size={12} />
                <span>
                  {meeting.scheduledStartAt
                    ? new Date(meeting.scheduledStartAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Instant'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Join with ID Button at Bottom */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
        <button
          onClick={() => setIsJoinWithIdOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <KeyRound size={14} strokeWidth={1.65} />
          <span>Join with Meeting ID</span>
        </button>
      </div>
    </div>
  );

  return (
    <TeamsShell activeApp="meet" sidebar={renderSidebar()}>
      <div className="flex-1 flex flex-col h-full bg-[var(--bg-canvas)] overflow-y-auto font-sans text-[var(--text-primary)]">
        {/* ── Top Hero Canvas ── */}
        <div className="p-8 max-w-[1000px] w-full mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Studio Meetings</h1>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  Unlimited Free Tier
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Zero time limits, crystal-clear 4K screen sharing, and encrypted drop-in video rooms.
              </p>
            </div>
          </div>

          {/* ── 3 Core Action Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Card 1: Meet now */}
            <div className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                  <Video size={20} strokeWidth={1.65} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Meet Now</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Start an instant video room with a shareable secure link. No logins required for guests.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <button
                  onClick={handleOpenMeetNow}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  Start Instant Room
                </button>
              </div>
            </div>

            {/* Card 2: Join with an ID */}
            <div className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-105 transition-transform">
                  <KeyRound size={20} strokeWidth={1.65} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Join with an ID</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Enter a room code or paste an invite link to jump directly into an ongoing session.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <button
                  onClick={() => setIsJoinWithIdOpen(true)}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Enter Room Code
                </button>
              </div>
            </div>

            {/* Card 3: Schedule a meeting */}
            <div className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                  <CalendarDays size={20} strokeWidth={1.65} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Schedule Meeting</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Plan ahead with calendar sync, recurring sessions, and customizable waiting room options.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <button
                  onClick={() => setIsScheduleOpen(true)}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Schedule for Later
                </button>
              </div>
            </div>
          </div>

          {/* ── Upcoming Meetings Section ── */}
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-xs p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Scheduled Sessions</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Upcoming calls and reviews synced with your team calendar
                </p>
              </div>
              <button
                onClick={() => setIsScheduleOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Schedule New</span>
              </button>
            </div>

            {filteredMeetings.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl">
                <Video size={36} className="mx-auto text-[var(--text-secondary)] mb-3" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">No upcoming sessions</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-[380px] mx-auto mt-1 mb-4 leading-relaxed">
                  Your schedule is clear. Drop into an instant meeting or schedule one for your teammates.
                </p>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    onClick={handleOpenMeetNow}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    Meet Now
                  </button>
                  <button
                    onClick={() => setIsScheduleOpen(true)}
                    className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    Schedule Meeting
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {filteredMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="py-3.5 flex items-center justify-between hover:bg-[var(--border-subtle)]/30 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(meeting.host?.displayName || 'H').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {meeting.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Hosted by {meeting.host?.displayName || userName} &bull;{' '}
                          {meeting.scheduledStartAt
                            ? new Date(meeting.scheduledStartAt).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'Instant Call'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/meetings/room/${meeting.id}`)}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-sm"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 1. Meet Now Modal Dialog ── */}
      {isMeetNowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Video size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Start Instant Meeting</h3>
              </div>
              <button
                onClick={() => setIsMeetNowOpen(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Meeting Title
                </label>
                <input
                  value={meetNowTitle}
                  onChange={(e) => setMeetNowTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Shareable Link Box */}
              <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)]">
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Share this invitation link with others:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/meetings/room/${generatedMeetingId}`
                        : `http://localhost:3000/meetings/room/${generatedMeetingId}`
                    }
                    className="flex-1 text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] select-all outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)] mt-4">
              <button
                onClick={() => setIsMeetNowOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => router.push(`/meetings/room/${generatedMeetingId}`)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-sm"
              >
                Join Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Join with ID Modal Dialog ── */}
      {isJoinWithIdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-indigo-400" strokeWidth={1.65} />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Join with Meeting ID</h3>
              </div>
              <button
                onClick={() => setIsJoinWithIdOpen(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <X size={16} strokeWidth={1.65} />
              </button>
            </div>

            <form onSubmit={handleJoinWithId} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Meeting ID or Room URL
                </label>
                <input
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                  placeholder="e.g. meet-abc-123 or paste full room link"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Passcode (Optional)
                </label>
                <input
                  type="password"
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value)}
                  placeholder="Enter passcode if protected"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsJoinWithIdOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinMeetingId.trim()}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  Join Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 3. Schedule Meeting Modal Dialog ── */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-indigo-400" strokeWidth={1.65} />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Schedule Meeting</h3>
              </div>
              <button
                onClick={() => setIsScheduleOpen(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Title
                </label>
                <input
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="e.g. Design Sprint / Product Review"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    required
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={waitingRoomEnabled}
                    onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span className="text-xs text-[var(--text-primary)]">
                    Enable secure guest lobby / waiting room
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!scheduleTitle.trim() || isSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isSubmitting ? 'Scheduling...' : 'Save & Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TeamsShell>
  );
}
