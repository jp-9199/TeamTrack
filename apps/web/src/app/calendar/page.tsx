'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import type { CalendarEventWithDetails } from '@teamtrack/shared-types';
import {
  CalendarDays,
  Video,
  Plus,
  Clock,
  MapPin,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Radio,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Check,
} from 'lucide-react';

type CalendarViewMode = 'day' | 'workWeek' | 'week' | 'month' | 'agenda';

export default function CalendarPage() {
  const router = useRouter();
  const { user } = useAuth();

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
      const computedTitle =
        startMonth === endMonth
          ? `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`
          : `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;

      return {
        windowStart: startOfWeek.toISOString(),
        windowEnd: endOfWeek.toISOString(),
        headerTitle: computedTitle,
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

  // Helper to get real auth token
  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '';
  };

  // Fetch real events from backend
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    const token = getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

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

    const token = getAuthToken();

    try {
      const res = await fetch('/api/v1/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          location: isOnlineMeeting ? 'TeamTrack HD Conference' : location.trim() || undefined,
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
    const token = getAuthToken();

    try {
      await fetch(`/api/v1/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
  // 1. SECONDARY SIDEBAR: TeamTrack Calendar Rail
  // ─────────────────────────────────────────────────────────────
  const calendarSidebar = (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] select-none border-r border-[var(--border-subtle)] p-4 font-sans text-[var(--text-primary)]">
      {/* Top Action Buttons */}
      <div className="space-y-2 mb-5">
        <button
          onClick={() => setIsMeetNowModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs"
        >
          <Video size={15} className="text-indigo-400" />
          <span>Meet Now</span>
        </button>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.99]"
        >
          <Plus size={15} />
          <span>New Meeting</span>
        </button>
      </div>

      {/* Free Unlocked Pill */}
      <div className="mb-4 p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-[11px]">
          <Sparkles size={12} />
          <span>Unlimited 4K HD Video</span>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase">
          Free
        </span>
      </div>

      {/* Mini Month Calendar Picker */}
      <div className="mb-5 p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
          <span className="text-xs font-bold text-[var(--text-primary)]">
            {miniPickerDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const next = new Date(miniPickerDate);
                next.setMonth(next.getMonth() - 1);
                setMiniPickerDate(next);
              }}
              className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => {
                const next = new Date(miniPickerDate);
                next.setMonth(next.getMonth() + 1);
                setMiniPickerDate(next);
              }}
              className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Mini 7x6 Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-[var(--text-secondary)] font-bold py-1">
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
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : isToday
                      ? 'border border-indigo-500 text-indigo-400 font-bold'
                      : 'hover:bg-[var(--border-subtle)] text-[var(--text-primary)]'
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

      {/* My Calendars List */}
      <div className="space-y-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Schedules</h4>
        <div className="space-y-1.5 text-xs text-[var(--text-primary)]">
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-[var(--border-subtle)]/50">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span className="font-medium text-xs">TeamTrack General</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-[var(--border-subtle)]/50">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-xs">Team Standups</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-[var(--border-subtle)]/50">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span className="font-medium text-xs">Product Reviews</span>
          </label>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // 2. MAIN STAGE: Calendar Canvas
  // ─────────────────────────────────────────────────────────────
  return (
    <TeamsShell sidebar={calendarSidebar} activeApp="calendar">
      <div className="flex flex-col h-full bg-[var(--bg-canvas)] select-none overflow-hidden font-sans text-[var(--text-primary)]">
        {/* Top Control Header Bar */}
        <header className="h-14 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-surface)] z-20">
          {/* Left: Today + Navigation Arrows + Month Heading */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Today
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="Next"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight ml-2">
              {headerTitle}
            </h2>
          </div>

          {/* Right: View Switcher & Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* View switcher pills */}
            <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs font-medium">
              {(['day', 'workWeek', 'week', 'month', 'agenda'] as CalendarViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1 rounded-lg transition-all capitalize cursor-pointer ${
                    viewMode === mode
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {mode === 'workWeek' ? 'Work Week' : mode}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsMeetNowModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Video size={14} className="text-indigo-400" />
              <span>Meet Now</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              <span>New Meeting</span>
            </button>
          </div>
        </header>

        {/* Calendar Body Stage */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-[var(--bg-canvas)]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[var(--text-secondary)] space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading schedule...</p>
            </div>
          ) : viewMode === 'month' ? (
            /* ──────────────── MONTH VIEW ──────────────── */
            <div className="h-full flex flex-col p-4">
              <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] pb-2 text-center text-xs font-bold text-[var(--text-secondary)]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-px bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden mt-2 shadow-xs">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells = [];

                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<div key={`lead-${i}`} className="bg-[var(--bg-surface)]/50 p-2" />);
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
                        className="bg-[var(--bg-surface)] p-2 min-h-[100px] flex flex-col justify-between hover:bg-[var(--border-subtle)]/40 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              isToday
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-[var(--text-primary)]'
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
                              className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 font-semibold truncate hover:bg-indigo-500/25 transition-colors border border-indigo-500/20"
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <span className="text-[9px] text-[var(--text-secondary)] font-semibold">
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
              <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-0 z-10">
                <div className="w-16 shrink-0 border-r border-[var(--border-subtle)] p-2 text-right text-[10px] font-semibold text-[var(--text-secondary)]">
                  UTC
                </div>
                <div className="flex-1 grid grid-cols-5 md:grid-cols-7 divide-x divide-[var(--border-subtle)]">
                  {(() => {
                    const daysCount = viewMode === 'workWeek' ? 5 : 7;
                    const startOffset = viewMode === 'workWeek' ? 1 - currentDate.getDay() : -currentDate.getDay();
                    const dayLabels = [];

                    for (let i = 0; i < daysCount; i++) {
                      const d = new Date(currentDate);
                      d.setDate(currentDate.getDate() + startOffset + i);
                      const isToday = d.toDateString() === new Date().toDateString();

                      dayLabels.push(
                        <div key={i} className="p-2.5 text-center">
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">
                            {d.toLocaleDateString('default', { weekday: 'short' })}
                          </span>
                          <span
                            className={`inline-block w-6 h-6 rounded-full text-xs font-bold leading-6 mt-0.5 ${
                              isToday ? 'bg-indigo-600 text-white shadow-xs' : 'text-[var(--text-primary)]'
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
              <div className="divide-y divide-[var(--border-subtle)]/70">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const hour = idx + 8;
                  const timeLabel = hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                  const daysCount = viewMode === 'workWeek' ? 5 : 7;
                  const startOffset = viewMode === 'workWeek' ? 1 - currentDate.getDay() : -currentDate.getDay();

                  return (
                    <div key={hour} className="flex min-h-[56px] group">
                      <div className="w-16 shrink-0 border-r border-[var(--border-subtle)] pr-2.5 pt-1 text-right text-[10px] font-medium text-[var(--text-secondary)]">
                        {timeLabel}
                      </div>

                      <div className="flex-1 grid grid-cols-5 md:grid-cols-7 divide-x divide-[var(--border-subtle)]/70">
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
                              className="p-1 hover:bg-[var(--border-subtle)]/30 transition-colors cursor-pointer relative"
                            >
                              {slotEvents.map((ev) => (
                                <div
                                  key={ev.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                  className="h-full p-2 bg-indigo-500/15 border-l-2 border-indigo-500 rounded-r-xl text-[var(--text-primary)] hover:bg-indigo-500/25 transition-all shadow-2xs"
                                >
                                  <div className="text-[11px] font-bold text-indigo-400 truncate">
                                    {ev.title}
                                  </div>
                                  <div className="text-[9px] text-[var(--text-secondary)]">
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
              <div className="divide-y divide-[var(--border-subtle)]">
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
                      className="flex items-start py-3 hover:bg-[var(--border-subtle)]/30 px-4 rounded-xl transition-colors cursor-pointer gap-6"
                    >
                      <div className="w-14 text-xs font-bold text-[var(--text-secondary)] pt-1">
                        {timeLabel}
                      </div>

                      <div className="flex-1 min-h-[44px]">
                        {dayEvents.length === 0 ? (
                          <span className="text-xs text-[var(--text-secondary)]/60 font-medium italic">
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
                              className="p-3 bg-indigo-500/10 border-l-4 border-indigo-500 rounded-r-xl flex items-center justify-between"
                            >
                              <div>
                                <h4 className="text-xs font-bold text-[var(--text-primary)]">{ev.title}</h4>
                                <span className="text-[10px] text-[var(--text-secondary)]">{ev.location || 'Online HD Meeting'}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/meetings/room/${ev.meetingId || ev.id}`);
                                }}
                                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                              >
                                Join
                              </button>
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
              <h3 className="text-sm font-bold text-[var(--text-primary)] pb-2 border-b border-[var(--border-subtle)]">
                Upcoming Meetings ({events.length})
              </h3>
              {events.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-secondary)]">
                  <CalendarDays size={32} className="mx-auto text-indigo-400 mb-2" strokeWidth={1.65} />
                  <p className="text-xs font-medium">No upcoming meetings scheduled.</p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    Schedule Meeting
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="p-4 rounded-2xl border border-[var(--border-subtle)] hover:shadow-md transition-all flex items-center justify-between cursor-pointer bg-[var(--bg-surface)]"
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-[var(--text-primary)]">{ev.title}</h4>
                        <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                          <Clock size={12} strokeWidth={1.65} />
                          <span>{new Date(ev.startAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/meetings/room/${ev.meetingId || ev.id}`);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── MODALS ── */}

        {/* 1. New Meeting Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-indigo-400" strokeWidth={1.65} />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Schedule Meeting</h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateEvent} className="mt-4 space-y-3.5">
                {createError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Meeting Title <span className="text-rose-400">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Design Review, Sprint Planning"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Start date</label>
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Start time</label>
                    <input
                      type="time"
                      value={startTimeStr}
                      onChange={(e) => setStartTimeStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">End date</label>
                    <input
                      type="date"
                      value={endDateStr}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">End time</label>
                    <input
                      type="time"
                      value={endTimeStr}
                      onChange={(e) => setEndTimeStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      required
                    />
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Video size={16} className="text-indigo-400" />
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">TeamTrack HD Meeting</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Includes 4K video, screen sharing &amp; chat</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isOnlineMeeting}
                    onChange={(e) => setIsOnlineMeeting(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add an agenda or notes..."
                    className="w-full px-3 py-2 border border-[var(--border-subtle)] bg-[var(--bg-canvas)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. Meet Now Modal */}
        {isMeetNowModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Video size={18} className="text-indigo-400" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Instant HD Meeting</h3>
                </div>
                <button
                  onClick={() => setIsMeetNowModalOpen(false)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="py-4 text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">
                <p>
                  Start an instant encrypted room with unlimited participants, HD audio/video, and screen sharing at no cost.
                </p>
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium text-[11px] flex items-center gap-2">
                  <Sparkles size={14} />
                  <span>Free Pro conference tier unlocked</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => setIsMeetNowModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInstantMeetNow}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  Start Meeting
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Event Details Modal */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedEvent.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 py-4 text-xs">
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Clock size={14} className="text-indigo-400" />
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
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <MapPin size={14} className="text-indigo-400" />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] leading-relaxed">
                    {selectedEvent.description}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Cancel Meeting</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => router.push(`/meetings/room/${selectedEvent.meetingId || selectedEvent.id}`)}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
