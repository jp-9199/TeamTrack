'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import {
  Tooltip,
  Button,
  Input,
  TabList,
  Tab,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  AddRegular,
  VideoRegular,
  ClockRegular,
  PeopleRegular,
  DismissRegular,
  LocationRegular,
  DeleteRegular,
  ShareRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../components/auth/AuthContext';
import type { CalendarEventWithDetails } from '@teamtrack/shared-types';

type CalendarViewMode = 'day' | 'workWeek' | 'week' | 'month' | 'agenda';

export default function CalendarPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.displayName || 'Amir Asad Ullah Khan';

  // Active view state
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [miniPickerDate, setMiniPickerDate] = useState<Date>(new Date());

  // Real events state
  const [events, setEvents] = useState<CalendarEventWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithDetails | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMeetNowModalOpen, setIsMeetNowModalOpen] = useState(false);

  // New Event Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Format today helper
  const getTodayISO = () => new Date().toISOString().split('T')[0];

  useEffect(() => {
    setStartDateStr(getTodayISO());
    setEndDateStr(getTodayISO());
  }, []);

  // Compute active window range based on viewMode and currentDate
  const { windowStart, windowEnd, headerTitle } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'month') {
      const firstDay = new Date(Date.UTC(year, month, 1));
      const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
      return {
        windowStart: firstDay.toISOString(),
        windowEnd: lastDay.toISOString(),
        headerTitle: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    } else if (viewMode === 'workWeek' || viewMode === 'week') {
      const day = currentDate.getDay();
      const startOffset = viewMode === 'workWeek' ? (day === 0 ? -6 : 1 - day) : -day;
      const daysCount = viewMode === 'workWeek' ? 5 : 7;

      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() + startOffset);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + daysCount - 1);
      endOfWeek.setHours(23, 59, 59, 999);

      const startMonth = startOfWeek.toLocaleString('default', { month: 'short' });
      const endMonth = endOfWeek.toLocaleString('default', { month: 'short' });
      const title =
        startMonth === endMonth
          ? `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`
          : `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;

      return {
        windowStart: startOfWeek.toISOString(),
        windowEnd: endOfWeek.toISOString(),
        headerTitle: title,
      };
    } else if (viewMode === 'day') {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      return {
        windowStart: startOfDay.toISOString(),
        windowEnd: endOfDay.toISOString(),
        headerTitle: currentDate.toLocaleDateString('default', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    } else {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);
      return {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        headerTitle: `Agenda (${start.toLocaleDateString('default', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('default', { month: 'short', day: 'numeric' })})`,
      };
    }
  }, [viewMode, currentDate]);

  // Fetch real events from backend
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const res = await fetch(
        `/api/v1/calendar/events?start=${encodeURIComponent(windowStart)}&end=${encodeURIComponent(windowEnd)}`,
        { headers }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setEvents(json.data.events || []);
        } else {
          setEvents([]);
        }
      } else {
        setEvents([]);
      }
    } catch {
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [windowStart, windowEnd]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Navigate dates
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() - 1);
    else if (viewMode === 'week' || viewMode === 'workWeek') next.setDate(next.getDate() - 7);
    else if (viewMode === 'day') next.setDate(next.getDate() - 1);
    else next.setDate(next.getDate() - 30);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + 1);
    else if (viewMode === 'week' || viewMode === 'workWeek') next.setDate(next.getDate() + 7);
    else if (viewMode === 'day') next.setDate(next.getDate() + 1);
    else next.setDate(next.getDate() + 30);
    setCurrentDate(next);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setMiniPickerDate(today);
  };

  // Create meeting submit
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setCreateError('Please enter a meeting title');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    const startAt = new Date(`${startDateStr}T${startTimeStr}:00`).toISOString();
    const endAt = new Date(`${endDateStr}T${endTimeStr}:00`).toISOString();

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';

    try {
      const res = await fetch('/api/v1/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          location: isOnlineMeeting ? 'Microsoft Teams Meeting' : location.trim() || undefined,
          startAt,
          endAt,
          allDay: false,
          visibility: 'ORGANIZATION',
          linkMeeting: isOnlineMeeting,
        }),
      }).then((r) => r.json());

      if (res.success && res.data) {
        setIsCreateModalOpen(false);
        setTitle('');
        setDescription('');
        setLocation('');
        loadEvents();
      } else {
        setCreateError(res.error?.message || 'Failed to schedule meeting');
      }
    } catch {
      setCreateError('Network error while scheduling meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';

    try {
      await fetch(`/api/v1/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedEvent(null);
      loadEvents();
    } catch (err) {
      console.error('Failed to delete event', err);
    }
  };

  // Instant Meet Now
  const handleInstantMeetNow = () => {
    const meetId = `meet-${Date.now()}`;
    router.push(`/meetings/room/${meetId}`);
  };

  // Quick slot click to create event
  const handleSlotClick = (date: Date, hour: number) => {
    const dStr = date.toISOString().split('T')[0];
    const hStr = hour.toString().padStart(2, '0');
    const nextHStr = (hour + 1).toString().padStart(2, '0');
    setStartDateStr(dStr);
    setEndDateStr(dStr);
    setStartTimeStr(`${hStr}:00`);
    setEndTimeStr(`${nextHStr}:00`);
    setIsCreateModalOpen(true);
  };

  // ─────────────────────────────────────────────────────────────
  // 1. SECONDARY SIDEBAR: Microsoft Teams Native Calendar Rail
  // ─────────────────────────────────────────────────────────────
  const calendarSidebar = (
    <div className="flex flex-col h-full bg-white select-none border-r border-[#EDEBE9] p-4 font-sans">
      {/* Top Action Buttons: Fluent UI Buttons */}
      <div className="space-y-2 mb-6">
        <Button
          appearance="secondary"
          icon={<VideoRegular fontSize={18} />}
          onClick={() => setIsMeetNowModalOpen(true)}
          style={{ width: '100%', height: '36px' }}
        >
          Meet now
        </Button>

        <Button
          appearance="primary"
          icon={<AddRegular fontSize={18} />}
          onClick={() => setIsCreateModalOpen(true)}
          style={{ width: '100%', height: '36px' }}
        >
          New meeting
        </Button>
      </div>

      {/* Mini Month Calendar Picker */}
      <div className="mb-6 p-2 rounded-xl bg-[#FAF9F8] border border-[#EDEBE9]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EDEBE9]">
          <span className="text-[13px] font-bold text-[#242424]">
            {miniPickerDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronLeftRegular fontSize={14} />}
              onClick={() => {
                const next = new Date(miniPickerDate);
                next.setMonth(next.getMonth() - 1);
                setMiniPickerDate(next);
              }}
              aria-label="Previous month"
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronRightRegular fontSize={14} />}
              onClick={() => {
                const next = new Date(miniPickerDate);
                next.setMonth(next.getMonth() + 1);
                setMiniPickerDate(next);
              }}
              aria-label="Next month"
            />
          </div>
        </div>

        {/* Mini 7x6 Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-[#888] font-bold py-1">
              {d}
            </span>
          ))}

          {(() => {
            const year = miniPickerDate.getFullYear();
            const month = miniPickerDate.getMonth();
            const firstDayIndex = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells = [];

            for (let i = 0; i < firstDayIndex; i++) {
              cells.push(<span key={`empty-${i}`} className="py-1" />);
            }

            for (let day = 1; day <= daysInMonth; day++) {
              const dateObj = new Date(year, month, day);
              const isToday = dateObj.toDateString() === new Date().toDateString();
              const isSelected = dateObj.toDateString() === currentDate.toDateString();

              cells.push(
                <button
                  key={day}
                  onClick={() => setCurrentDate(dateObj)}
                  className={`py-1 rounded-full font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#5B5FC7] text-white font-bold'
                      : isToday
                      ? 'border border-[#5B5FC7] text-[#5B5FC7] font-bold'
                      : 'hover:bg-[#EDEBE9] text-[#242424]'
                  }`}
                >
                  {day}
                </button>
              );
            }
            return cells;
          })()}
        </div>
      </div>

      {/* My Calendars Checkbox List */}
      <div className="space-y-3">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-[#616161]">My Calendars</h4>
        <div className="space-y-2 text-[13px] text-[#242424]">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-[#5B5FC7] focus:ring-0" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#5B5FC7]" />
            <span className="font-medium">Calendar (TeamTrack)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-[#107C10] focus:ring-0" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#107C10]" />
            <span className="font-medium">Team Meetings</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" className="rounded text-[#D83B01] focus:ring-0" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#D83B01]" />
            <span className="font-medium">Personal Reminders</span>
          </label>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // 2. MAIN STAGE: Microsoft Teams Calendar Canvas
  // ─────────────────────────────────────────────────────────────
  return (
    <TeamsShell sidebar={calendarSidebar} activeApp="calendar">
      <div className="flex flex-col h-full bg-white select-none overflow-hidden font-sans">
        {/* Top Control Header Bar */}
        <header className="h-[60px] px-6 border-b border-[#EDEBE9] flex items-center justify-between shrink-0 bg-white z-20">
          {/* Left: Today + Navigation Arrows + Month Heading */}
          <div className="flex items-center gap-3">
            <Button appearance="secondary" size="small" onClick={handleToday}>
              Today
            </Button>

            <div className="flex items-center gap-0.5">
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronLeftRegular fontSize={18} />}
                onClick={handlePrev}
                aria-label="Previous"
              />
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronRightRegular fontSize={18} />}
                onClick={handleNext}
                aria-label="Next"
              />
            </div>

            <h2 className="text-[17px] font-bold text-[#242424] tracking-tight ml-2">
              {headerTitle}
            </h2>
          </div>

          {/* Right: View Switcher TabList & Actions */}
          <div className="flex items-center gap-3">
            <TabList
              selectedValue={viewMode}
              onTabSelect={(_, data) => setViewMode(data.value as CalendarViewMode)}
              size="small"
            >
              <Tab value="day">Day</Tab>
              <Tab value="workWeek">Work week</Tab>
              <Tab value="week">Week</Tab>
              <Tab value="month">Month</Tab>
              <Tab value="agenda">Agenda</Tab>
            </TabList>

            <Button
              appearance="secondary"
              size="medium"
              icon={<VideoRegular fontSize={16} />}
              onClick={() => setIsMeetNowModalOpen(true)}
            >
              Meet now
            </Button>

            <Button
              appearance="primary"
              size="medium"
              icon={<AddRegular fontSize={16} />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              New meeting
            </Button>
          </div>
        </header>

        {/* Calendar Body Stage */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-white">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#616161] space-y-3">
              <div className="w-8 h-8 border-2 border-[#5B5FC7] border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] font-medium">Loading schedule...</p>
            </div>
          ) : viewMode === 'month' ? (
            /* ──────────────── MONTH VIEW ──────────────── */
            <div className="h-full flex flex-col p-4">
              <div className="grid grid-cols-7 border-b border-[#EDEBE9] pb-2 text-center text-[12.5px] font-bold text-[#616161]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-px bg-[#EDEBE9] border border-[#EDEBE9] rounded-xl overflow-hidden mt-2 shadow-xs">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells = [];

                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<div key={`lead-${i}`} className="bg-[#FAF9F8] p-2" />);
                  }

                  for (let day = 1; day <= daysInMonth; day++) {
                    const cellDate = new Date(year, month, day);
                    const isToday = cellDate.toDateString() === new Date().toDateString();
                    const dayEvents = events.filter((ev) => {
                      const evDate = new Date(ev.startAt);
                      return evDate.toDateString() === cellDate.toDateString();
                    });

                    cells.push(
                      <div
                        key={day}
                        onClick={() => handleSlotClick(cellDate, 9)}
                        className="bg-white p-2 min-h-[100px] flex flex-col justify-between hover:bg-[#F8F8F8] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${
                              isToday
                                ? 'bg-[#5B5FC7] text-white shadow-xs'
                                : 'text-[#242424]'
                            }`}
                          >
                            {day}
                          </span>
                        </div>

                        <div className="space-y-1 mt-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className="text-[11px] p-1 rounded bg-[#5B5FC7]/10 text-[#5B5FC7] font-semibold truncate hover:bg-[#5B5FC7]/20 transition-colors"
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <span className="text-[10px] text-[#616161] font-semibold">
                              +{dayEvents.length - 2} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>
          ) : viewMode === 'week' || viewMode === 'workWeek' ? (
            /* ──────────────── WEEK & WORK WEEK VIEW ──────────────── */
            <div className="flex flex-col min-w-[700px]">
              {/* Day headers */}
              <div className="flex border-b border-[#EDEBE9] bg-[#FAF9F8] sticky top-0 z-10">
                <div className="w-[64px] shrink-0 border-r border-[#EDEBE9] p-2 text-right text-[11px] font-semibold text-[#888]">
                  UTC
                </div>
                <div className="flex-1 grid grid-cols-5 md:grid-cols-7 divide-x divide-[#EDEBE9]">
                  {(() => {
                    const daysCount = viewMode === 'workWeek' ? 5 : 7;
                    const startOffset = viewMode === 'workWeek' ? 1 - currentDate.getDay() : -currentDate.getDay();
                    const dayLabels = [];

                    for (let i = 0; i < daysCount; i++) {
                      const d = new Date(currentDate);
                      d.setDate(currentDate.getDate() + startOffset + i);
                      const isToday = d.toDateString() === new Date().toDateString();

                      dayLabels.push(
                        <div key={i} className="p-3 text-center">
                          <span className="text-[11px] font-bold text-[#616161] uppercase block">
                            {d.toLocaleDateString('default', { weekday: 'short' })}
                          </span>
                          <span
                            className={`inline-block w-7 h-7 rounded-full text-[14px] font-bold leading-7 mt-0.5 ${
                              isToday ? 'bg-[#5B5FC7] text-white shadow-xs' : 'text-[#242424]'
                            }`}
                          >
                            {d.getDate()}
                          </span>
                        </div>
                      );
                    }
                    return dayLabels;
                  })()}
                </div>
              </div>

              {/* Hourly rows (8 AM to 8 PM) */}
              <div className="divide-y divide-[#EDEBE9]/70">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const hour = idx + 8;
                  const timeLabel = hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                  const daysCount = viewMode === 'workWeek' ? 5 : 7;
                  const startOffset = viewMode === 'workWeek' ? 1 - currentDate.getDay() : -currentDate.getDay();

                  return (
                    <div key={hour} className="flex min-h-[56px] group">
                      <div className="w-[64px] shrink-0 border-r border-[#EDEBE9] pr-2.5 pt-1 text-right text-[11px] font-medium text-[#888]">
                        {timeLabel}
                      </div>

                      <div className="flex-1 grid grid-cols-5 md:grid-cols-7 divide-x divide-[#EDEBE9]/70">
                        {Array.from({ length: daysCount }).map((_, dIdx) => {
                          const slotDate = new Date(currentDate);
                          slotDate.setDate(currentDate.getDate() + startOffset + dIdx);

                          const slotEvents = events.filter((ev) => {
                            const evDate = new Date(ev.startAt);
                            return (
                              evDate.toDateString() === slotDate.toDateString() &&
                              evDate.getHours() === hour
                            );
                          });

                          return (
                            <div
                              key={dIdx}
                              onClick={() => handleSlotClick(slotDate, hour)}
                              className="p-1 hover:bg-[#FAF9F8] transition-colors cursor-pointer relative"
                            >
                              {slotEvents.map((ev) => (
                                <div
                                  key={ev.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                  className="h-full p-2 bg-[#5B5FC7]/15 border-l-3 border-[#5B5FC7] rounded-r-lg text-[#242424] hover:bg-[#5B5FC7]/25 transition-all shadow-2xs"
                                >
                                  <div className="text-[12px] font-bold text-[#5B5FC7] truncate">
                                    {ev.title}
                                  </div>
                                  <div className="text-[10.5px] text-[#616161]">
                                    {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : viewMode === 'day' ? (
            /* ──────────────── DAY VIEW ──────────────── */
            <div className="flex flex-col p-6 max-w-4xl mx-auto">
              <div className="divide-y divide-[#EDEBE9]">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const hour = idx + 8;
                  const timeLabel = hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                  const dayEvents = events.filter((ev) => {
                    const evDate = new Date(ev.startAt);
                    return (
                      evDate.toDateString() === currentDate.toDateString() &&
                      evDate.getHours() === hour
                    );
                  });

                  return (
                    <div
                      key={hour}
                      onClick={() => handleSlotClick(currentDate, hour)}
                      className="flex items-start py-3 hover:bg-[#FAF9F8] px-4 rounded-xl transition-colors cursor-pointer gap-6"
                    >
                      <div className="w-[60px] text-[12px] font-bold text-[#616161] pt-1">
                        {timeLabel}
                      </div>

                      <div className="flex-1 min-h-[44px]">
                        {dayEvents.length === 0 ? (
                          <span className="text-[12px] text-[#C8C6C4] font-medium italic">
                            Click to schedule a meeting
                          </span>
                        ) : (
                          dayEvents.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className="p-3 bg-[#5B5FC7]/10 border-l-4 border-[#5B5FC7] rounded-r-xl flex items-center justify-between"
                            >
                              <div>
                                <h4 className="text-[13px] font-bold text-[#242424]">{ev.title}</h4>
                                <span className="text-[11px] text-[#616161]">{ev.location || 'Online'}</span>
                              </div>
                              <Button
                                appearance="primary"
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/meetings/room/${ev.meetingId || ev.id}`);
                                }}
                              >
                                Join
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ──────────────── AGENDA VIEW ──────────────── */
            <div className="p-8 max-w-3xl mx-auto space-y-4">
              <h3 className="text-[17px] font-bold text-[#242424] pb-2 border-b border-[#EDEBE9]">
                Upcoming Meetings ({events.length})
              </h3>
              {events.length === 0 ? (
                <div className="py-16 text-center text-[#616161]">
                  <PeopleRegular fontSize={32} className="mx-auto text-[#5B5FC7] mb-2" />
                  <p className="text-[14px] font-medium">No upcoming meetings scheduled.</p>
                  <Button
                    appearance="primary"
                    style={{ marginTop: '12px' }}
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Schedule meeting
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="p-4 rounded-xl border border-[#EDEBE9] hover:shadow-md transition-all flex items-center justify-between cursor-pointer bg-white"
                    >
                      <div className="space-y-1">
                        <h4 className="text-[14px] font-bold text-[#242424]">{ev.title}</h4>
                        <div className="text-[12px] text-[#616161] flex items-center gap-2">
                          <ClockRegular fontSize={14} />
                          <span>{new Date(ev.startAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <Button
                        appearance="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/meetings/room/${ev.meetingId || ev.id}`);
                        }}
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── OFFICIAL FLUENT UI DIALOGS ── */}

        {/* 1. New Meeting Dialog */}
        <Dialog open={isCreateModalOpen} onOpenChange={(_, d) => setIsCreateModalOpen(d.open)}>
          <DialogSurface>
            <form onSubmit={handleCreateEvent}>
              <DialogBody>
                <DialogTitle
                  action={
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular />}
                      onClick={() => setIsCreateModalOpen(false)}
                      aria-label="Close"
                    />
                  }
                >
                  <div className="flex items-center gap-2">
                    <AddRegular fontSize={20} className="text-[#5B5FC7]" />
                    <span>New meeting</span>
                  </div>
                </DialogTitle>

                <DialogContent className="space-y-4 py-2">
                  {createError && (
                    <div className="p-3 bg-[#FDE7E9] text-[#C4314B] rounded-lg text-[12.5px] font-semibold">
                      {createError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[12px] font-semibold text-[#242424] mb-1">
                      Title <span className="text-[#C4314B]">*</span>
                    </label>
                    <Input
                      value={title}
                      onChange={(_, d) => setTitle(d.value)}
                      placeholder="Add meeting title"
                      style={{ width: '100%' }}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#616161] mb-1">Start date</label>
                      <Input
                        type="date"
                        value={startDateStr}
                        onChange={(_, d) => setStartDateStr(d.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#616161] mb-1">Start time</label>
                      <Input
                        type="time"
                        value={startTimeStr}
                        onChange={(_, d) => setStartTimeStr(d.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#616161] mb-1">End date</label>
                      <Input
                        type="date"
                        value={endDateStr}
                        onChange={(_, d) => setEndDateStr(d.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#616161] mb-1">End time</label>
                      <Input
                        type="time"
                        value={endTimeStr}
                        onChange={(_, d) => setEndTimeStr(d.value)}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-[#FAF9F8] rounded-xl border border-[#EDEBE9] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <VideoRegular fontSize={18} className="text-[#5B5FC7]" />
                      <div>
                        <div className="text-[13px] font-bold text-[#242424]">Teams meeting</div>
                        <div className="text-[11px] text-[#616161]">Online audio/video conference link</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isOnlineMeeting}
                      onChange={(e) => setIsOnlineMeeting(e.target.checked)}
                      className="w-4 h-4 rounded text-[#5B5FC7]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#616161] mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Type details for this new meeting..."
                      className="w-full px-3 py-2 border border-[#D1D1D1] rounded-lg text-[12.5px] outline-none focus:border-[#5B5FC7] resize-none"
                    />
                  </div>
                </DialogContent>

                <DialogActions>
                  <Button appearance="secondary" onClick={() => setIsCreateModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button appearance="primary" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </Button>
                </DialogActions>
              </DialogBody>
            </form>
          </DialogSurface>
        </Dialog>

        {/* 2. Meet Now Dialog */}
        <Dialog open={isMeetNowModalOpen} onOpenChange={(_, d) => setIsMeetNowModalOpen(d.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => setIsMeetNowModalOpen(false)}
                    aria-label="Close"
                  />
                }
              >
                <div className="flex items-center gap-2">
                  <VideoRegular fontSize={20} className="text-[#5B5FC7]" />
                  <span>Start instant meeting</span>
                </div>
              </DialogTitle>

              <DialogContent className="py-3 text-[13px] text-[#616161] leading-relaxed">
                You will be connected to a private meeting room where you can invite others by sharing your link.
              </DialogContent>

              <DialogActions>
                <Button appearance="secondary" onClick={() => setIsMeetNowModalOpen(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" onClick={handleInstantMeetNow}>
                  Start meeting
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/* 3. Event Details Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={(_, d) => { if (!d.open) setSelectedEvent(null); }}>
          <DialogSurface>
            {selectedEvent && (
              <DialogBody>
                <DialogTitle
                  action={
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular />}
                      onClick={() => setSelectedEvent(null)}
                      aria-label="Close"
                    />
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#5B5FC7]" />
                    <span>{selectedEvent.title}</span>
                  </div>
                </DialogTitle>

                <DialogContent className="space-y-4 py-2 text-[13px]">
                  <div className="flex items-center gap-2.5 text-[#616161]">
                    <ClockRegular fontSize={16} />
                    <span>
                      {new Date(selectedEvent.startAt).toLocaleString('default', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      –{' '}
                      {new Date(selectedEvent.endAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {selectedEvent.location && (
                    <div className="flex items-center gap-2.5 text-[#616161]">
                      <LocationRegular fontSize={16} />
                      <span>{selectedEvent.location}</span>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="p-3 bg-[#FAF9F8] rounded-xl border border-[#EDEBE9] text-[#242424] leading-relaxed">
                      {selectedEvent.description}
                    </div>
                  )}
                </DialogContent>

                <DialogActions>
                  <Button
                    appearance="subtle"
                    icon={<DeleteRegular fontSize={16} />}
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    style={{ color: '#C4314B', marginRight: 'auto' }}
                  >
                    Cancel meeting
                  </Button>
                  <Button appearance="secondary" onClick={() => setSelectedEvent(null)}>
                    Close
                  </Button>
                  <Button
                    appearance="primary"
                    onClick={() => router.push(`/meetings/room/${selectedEvent.meetingId || selectedEvent.id}`)}
                  >
                    Join
                  </Button>
                </DialogActions>
              </DialogBody>
            )}
          </DialogSurface>
        </Dialog>
      </div>
    </TeamsShell>
  );
}
