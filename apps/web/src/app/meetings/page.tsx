'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import {
  Tooltip,
  Button,
  Input,
  Avatar,
  Badge,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  TabList,
  Tab,
} from '@fluentui/react-components';
import {
  VideoRegular,
  VideoFilled,
  AddRegular,
  ClockRegular,
  PeopleRegular,
  SearchRegular,
  DismissRegular,
  ShareRegular,
  LinkRegular,
  CheckmarkRegular,
  CalendarRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../components/auth/AuthContext';
import { api } from '../../lib/api';
import type { MeetingWithHost } from '@teamtrack/shared-types';

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.displayName || 'Amir Asad Ullah Khan';
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

  // Handle Instant Meeting Launch
  const handleStartInstantMeeting = () => {
    const roomId = `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    router.push(`/meetings/room/${roomId}`);
  };

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
      const endDateTime = new Date(startDateTime.getTime() + 45 * 60 * 1000);

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

  // ── Render Secondary Sidebar (Pane 2) ──
  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-[#ECEEF0] select-none font-sans">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-[#E1DFDD]/70">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-[#242424] tracking-tight">Meet</h2>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            appearance="primary"
            icon={<VideoRegular fontSize={18} />}
            onClick={handleOpenMeetNow}
            className="flex-1 text-[13px] font-medium"
          >
            Meet now
          </Button>
          <Button
            appearance="secondary"
            icon={<AddRegular fontSize={18} />}
            onClick={() => setIsScheduleOpen(true)}
            className="flex-1 text-[13px] font-medium"
          >
            New meeting
          </Button>
        </div>

        {/* Search Box */}
        <Input
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
          contentBefore={<SearchRegular fontSize={15} className="text-[#616161]" />}
          placeholder="Search meetings..."
          className="w-full"
          size="small"
        />
      </div>

      {/* Tabs: Upcoming / Past */}
      <div className="px-3 pt-2 border-b border-[#E1DFDD]/60">
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as 'upcoming' | 'past')}
          size="small"
        >
          <Tab value="upcoming">Upcoming</Tab>
          <Tab value="past">History</Tab>
        </TabList>
      </div>

      {/* Meeting List or Empty State */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredMeetings.length === 0 ? (
          <div className="text-center py-10 px-4 text-[#616161]">
            <ClockRegular fontSize={28} className="mx-auto text-[#8A8886] mb-2" />
            <p className="text-[13px] font-semibold text-[#242424]">No meetings yet</p>
            <p className="text-[11.5px] text-[#616161] mt-0.5">
              Start an instant meeting or schedule one to connect.
            </p>
          </div>
        ) : (
          filteredMeetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => router.push(`/meetings/room/${meeting.id}`)}
              className="p-2.5 rounded-lg bg-white border border-[#E1DFDD]/60 hover:border-[#5B5FC7] hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-semibold text-[#242424] truncate group-hover:text-[#5B5FC7]">
                  {meeting.title}
                </span>
                <Badge
                  appearance="tint"
                  color={meeting.status === 'active' ? 'danger' : 'informative'}
                  size="small"
                >
                  {meeting.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#616161]">
                <ClockRegular fontSize={13} />
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
      <div className="p-3 border-t border-[#E1DFDD]/70 bg-[#F5F5F5]">
        <Button
          appearance="subtle"
          icon={<LinkRegular fontSize={16} />}
          onClick={() => setIsJoinWithIdOpen(true)}
          className="w-full text-[12.5px] justify-start"
        >
          Join with a meeting ID
        </Button>
      </div>
    </div>
  );

  return (
    <TeamsShell activeApp="meet" sidebar={renderSidebar()}>
      <div className="flex-1 flex flex-col h-full bg-[#FAF9F8] overflow-y-auto font-sans">
        {/* ── Top Hero Canvas ── */}
        <div className="p-8 max-w-[1000px] w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-[24px] font-bold text-[#242424] tracking-tight">Meet</h1>
            <p className="text-[14px] text-[#616161] mt-1">
              Start an instant meeting, schedule for later, or join an existing call.
            </p>
          </div>

          {/* ── 3 Core Teams Action Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Card 1: Meet now */}
            <div className="bg-white p-5 rounded-xl border border-[#E1DFDD] shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-[42px] h-[42px] rounded-lg bg-[#5B5FC7]/10 flex items-center justify-center text-[#5B5FC7] mb-3">
                  <VideoFilled fontSize={24} />
                </div>
                <h3 className="text-[15px] font-bold text-[#242424]">Meet now</h3>
                <p className="text-[12.5px] text-[#616161] mt-1 leading-relaxed">
                  Start an instant video meeting and invite anyone with a secure link.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <Button
                  appearance="primary"
                  icon={<VideoRegular fontSize={17} />}
                  onClick={handleOpenMeetNow}
                  className="w-full"
                >
                  Start meeting
                </Button>
              </div>
            </div>

            {/* Card 2: Join with an ID */}
            <div className="bg-white p-5 rounded-xl border border-[#E1DFDD] shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-[42px] h-[42px] rounded-lg bg-[#0078D4]/10 flex items-center justify-center text-[#0078D4] mb-3">
                  <LinkRegular fontSize={24} />
                </div>
                <h3 className="text-[15px] font-bold text-[#242424]">Join with an ID</h3>
                <p className="text-[12.5px] text-[#616161] mt-1 leading-relaxed">
                  Have a meeting code or invitation link? Enter it to join immediately.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <Button
                  appearance="secondary"
                  icon={<LinkRegular fontSize={17} />}
                  onClick={() => setIsJoinWithIdOpen(true)}
                  className="w-full"
                >
                  Join meeting
                </Button>
              </div>
            </div>

            {/* Card 3: Schedule a meeting */}
            <div className="bg-white p-5 rounded-xl border border-[#E1DFDD] shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-[42px] h-[42px] rounded-lg bg-[#107C41]/10 flex items-center justify-center text-[#107C41] mb-3">
                  <CalendarRegular fontSize={24} />
                </div>
                <h3 className="text-[15px] font-bold text-[#242424]">Schedule a meeting</h3>
                <p className="text-[12.5px] text-[#616161] mt-1 leading-relaxed">
                  Plan ahead with calendar invites, recurring schedules, and waiting room protection.
                </p>
              </div>
              <div className="pt-4 mt-auto">
                <Button
                  appearance="secondary"
                  icon={<AddRegular fontSize={17} />}
                  onClick={() => setIsScheduleOpen(true)}
                  className="w-full"
                >
                  Schedule
                </Button>
              </div>
            </div>
          </div>

          {/* ── Upcoming Meetings Section ── */}
          <div className="bg-white rounded-xl border border-[#E1DFDD] shadow-xs p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[16px] font-bold text-[#242424]">Scheduled Meetings</h2>
                <p className="text-[12px] text-[#616161]">
                  Upcoming calls and team syncs connected to your calendar
                </p>
              </div>
              <Button
                appearance="subtle"
                icon={<AddRegular fontSize={16} />}
                onClick={() => setIsScheduleOpen(true)}
              >
                Schedule new
              </Button>
            </div>

            {filteredMeetings.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-[#E1DFDD] rounded-lg">
                <VideoRegular fontSize={40} className="mx-auto text-[#A19F9D] mb-3" />
                <h3 className="text-[15px] font-semibold text-[#242424]">No upcoming meetings</h3>
                <p className="text-[13px] text-[#616161] max-w-[380px] mx-auto mt-1 mb-4 leading-relaxed">
                  You have a clean schedule. Start a quick call with your team or plan a future discussion.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    appearance="primary"
                    icon={<VideoRegular fontSize={17} />}
                    onClick={handleOpenMeetNow}
                  >
                    Meet now
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<CalendarRegular fontSize={17} />}
                    onClick={() => setIsScheduleOpen(true)}
                  >
                    Schedule a meeting
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#EDEBE9]">
                {filteredMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="py-3.5 flex items-center justify-between hover:bg-[#F9F8F7] px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={meeting.host?.displayName || 'Host'}
                        size={36}
                        color="colorful"
                      />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-[#242424] truncate">
                          {meeting.title}
                        </p>
                        <p className="text-[12px] text-[#616161]">
                          Hosted by {meeting.host?.displayName || userName} ·{' '}
                          {meeting.scheduledStartAt
                            ? new Date(meeting.scheduledStartAt).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'Instant Call'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        appearance="primary"
                        onClick={() => router.push(`/meetings/room/${meeting.id}`)}
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 1. Meet Now Modal Dialog ── */}
      <Dialog open={isMeetNowOpen} onOpenChange={(_, data) => setIsMeetNowOpen(data.open)}>
        <DialogSurface className="max-w-[460px] p-6 rounded-2xl font-sans">
          <DialogTitle className="text-[18px] font-bold text-[#242424]">
            Start instant meeting
          </DialogTitle>
          <DialogBody>
            <DialogContent className="py-3 space-y-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                  Meeting title
                </label>
                <Input
                  value={meetNowTitle}
                  onChange={(_, data) => setMeetNowTitle(data.value)}
                  className="w-full"
                  placeholder="Meeting title"
                />
              </div>

              {/* Shareable Link Box */}
              <div className="p-3 bg-[#F5F5F5] rounded-lg border border-[#EDEBE9]">
                <label className="block text-[11.5px] font-semibold text-[#616161] mb-1">
                  Share this link with others:
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
                    className="flex-1 text-[12px] bg-white border border-[#E1DFDD] rounded px-2.5 py-1.5 text-[#242424] select-all outline-none"
                  />
                  <Button
                    appearance={copiedLink ? 'primary' : 'secondary'}
                    icon={copiedLink ? <CheckmarkRegular fontSize={16} /> : <ShareRegular fontSize={16} />}
                    onClick={handleCopyLink}
                  >
                    {copiedLink ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </DialogContent>
            <DialogActions className="pt-3 flex justify-end gap-2">
              <Button appearance="secondary" onClick={() => setIsMeetNowOpen(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={<VideoRegular fontSize={16} />}
                onClick={() => router.push(`/meetings/room/${generatedMeetingId}`)}
              >
                Start meeting
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── 2. Join with ID Modal Dialog ── */}
      <Dialog open={isJoinWithIdOpen} onOpenChange={(_, data) => setIsJoinWithIdOpen(data.open)}>
        <DialogSurface className="max-w-[420px] p-6 rounded-2xl font-sans">
          <DialogTitle className="text-[18px] font-bold text-[#242424]">
            Join with a meeting ID
          </DialogTitle>
          <form onSubmit={handleJoinWithId}>
            <DialogBody>
              <DialogContent className="py-3 space-y-3">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Meeting ID or Link
                  </label>
                  <Input
                    value={joinMeetingId}
                    onChange={(_, data) => setJoinMeetingId(data.value)}
                    placeholder="e.g. meet-abc-123 or paste room URL"
                    className="w-full"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Passcode (Optional)
                  </label>
                  <Input
                    type="password"
                    value={joinPasscode}
                    onChange={(_, data) => setJoinPasscode(data.value)}
                    placeholder="Enter passcode if required"
                    className="w-full"
                  />
                </div>
              </DialogContent>
              <DialogActions className="pt-3 flex justify-end gap-2">
                <Button appearance="secondary" onClick={() => setIsJoinWithIdOpen(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit" disabled={!joinMeetingId.trim()}>
                  Join
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>

      {/* ── 3. Schedule Meeting Modal Dialog ── */}
      <Dialog open={isScheduleOpen} onOpenChange={(_, data) => setIsScheduleOpen(data.open)}>
        <DialogSurface className="max-w-[460px] p-6 rounded-2xl font-sans">
          <DialogTitle className="text-[18px] font-bold text-[#242424]">
            Schedule a meeting
          </DialogTitle>
          <form onSubmit={handleScheduleSubmit}>
            <DialogBody>
              <DialogContent className="py-3 space-y-3.5">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Title
                  </label>
                  <Input
                    value={scheduleTitle}
                    onChange={(_, data) => setScheduleTitle(data.value)}
                    placeholder="e.g. Design Sprint / Project Sync"
                    className="w-full"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Date
                    </label>
                    <Input
                      type="date"
                      value={scheduleDate}
                      onChange={(_, data) => setScheduleDate(data.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Start Time
                    </label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(_, data) => setScheduleTime(data.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={waitingRoomEnabled}
                      onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
                      className="w-4 h-4 text-[#5B5FC7] rounded"
                    />
                    <span className="text-[13px] text-[#242424]">
                      Enable waiting room for guests
                    </span>
                  </label>
                </div>
              </DialogContent>
              <DialogActions className="pt-3 flex justify-end gap-2">
                <Button appearance="secondary" onClick={() => setIsScheduleOpen(false)}>
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  type="submit"
                  disabled={!scheduleTitle.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Scheduling...' : 'Save & Schedule'}
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>
    </TeamsShell>
  );
}
