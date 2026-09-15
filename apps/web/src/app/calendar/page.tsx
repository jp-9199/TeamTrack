'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type {
  CalendarEventWithDetails,
  CalendarEventVisibility,
  CalendarAttendeeResponseStatus,
} from '@teamtrack/shared-types';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 8, 15)); // Default to Sept 15, 2026
  const [events, setEvents] = useState<CalendarEventWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithDetails | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [timeZone, setTimeZone] = useState('UTC');

  // New Event Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDateStr, setStartDateStr] = useState('2026-09-15');
  const [startTimeStr, setStartTimeStr] = useState('10:00');
  const [endDateStr, setEndDateStr] = useState('2026-09-15');
  const [endTimeStr, setEndTimeStr] = useState('11:00');
  const [allDay, setAllDay] = useState(false);
  const [visibility, setVisibility] = useState<CalendarEventVisibility>('ORGANIZATION');
  const [recurrenceRule, setRecurrenceRule] = useState('none');
  const [linkMeeting, setLinkMeeting] = useState(false);
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Compute window range based on viewMode and currentDate
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
    } else if (viewMode === 'week') {
      const day = currentDate.getDay();
      const diff = currentDate.getDate() - day; // start on Sunday
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return {
        windowStart: startOfWeek.toISOString(),
        windowEnd: endOfWeek.toISOString(),
        headerTitle: `Week of ${startOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    } else if (viewMode === 'day') {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      return {
        windowStart: startOfDay.toISOString(),
        windowEnd: endOfDay.toISOString(),
        headerTitle: currentDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      };
    } else {
      // Agenda: 30 days from current date
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);
      return {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        headerTitle: `Agenda (${start.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('default', { month: 'short', day: 'numeric' })})`,
      };
    }
  }, [viewMode, currentDate]);

  // Fetch events for active window
  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/calendar/events?start=${encodeURIComponent(windowStart)}&end=${encodeURIComponent(windowEnd)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setEvents(json.data.events || []);
          return;
        }
      }
    } catch {
      // Fallback for offline / dev preview
    } finally {
      setIsLoading(false);
    }

    // Default sample events for UI preview when backend is not connected
    if (events.length === 0) {
      setEvents([
        {
          id: 'demo-event-1',
          organizationId: 'org-1',
          teamId: 'team-1',
          organizerUserId: 'user-1',
          title: 'Sprint Planning & Architecture Review',
          description: 'Review upcoming deliverables, calendar & scheduling integration tasks.',
          location: 'Virtual Meeting Room 1',
          startAt: new Date(Date.UTC(2026, 8, 15, 10, 0)).toISOString(),
          endAt: new Date(Date.UTC(2026, 8, 15, 11, 30)).toISOString(),
          timezone: 'UTC',
          allDay: false,
          visibility: 'ORGANIZATION',
          status: 'confirmed',
          meetingId: 'meet-1',
          recurrenceRule: null,
          recurrenceUntil: null,
          recurrenceTimezone: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          organizer: {
            id: 'user-1',
            displayName: 'Alex Rivers',
            email: 'alex.rivers@example.com',
            avatarUrl: null,
          },
          attendees: [
            {
              id: 'att-1',
              eventId: 'demo-event-1',
              userId: 'user-1',
              responseStatus: 'ACCEPTED',
              isOrganizer: true,
              respondedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              user: {
                id: 'user-1',
                displayName: 'Alex Rivers',
                email: 'alex.rivers@example.com',
                avatarUrl: null,
              },
            },
            {
              id: 'att-2',
              eventId: 'demo-event-1',
              userId: 'user-2',
              responseStatus: 'PENDING',
              isOrganizer: false,
              respondedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              user: {
                id: 'user-2',
                displayName: 'Sarah Chen',
                email: 'sarah.chen@example.com',
                avatarUrl: null,
              },
            },
          ],
          meeting: {
            id: 'meet-1',
            title: 'Sprint Planning',
            status: 'scheduled',
          },
        },
        {
          id: 'demo-event-2',
          organizationId: 'org-1',
          teamId: null,
          organizerUserId: 'user-2',
          title: 'Design Sync: Mobile Calendar View',
          description: 'Touch gesture patterns, date strips and agenda interactions.',
          location: 'TeamTrack Audio/Video',
          startAt: new Date(Date.UTC(2026, 8, 17, 14, 0)).toISOString(),
          endAt: new Date(Date.UTC(2026, 8, 17, 15, 0)).toISOString(),
          timezone: 'UTC',
          allDay: false,
          visibility: 'PRIVATE',
          status: 'confirmed',
          meetingId: null,
          recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
          recurrenceUntil: null,
          recurrenceTimezone: 'UTC',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          organizer: {
            id: 'user-2',
            displayName: 'Sarah Chen',
            email: 'sarah.chen@example.com',
            avatarUrl: null,
          },
          attendees: [],
          meeting: null,
        },
      ]);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [windowStart, windowEnd]);

  // Navigate Date
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() - 1);
    else if (viewMode === 'week') next.setDate(next.getDate() - 7);
    else if (viewMode === 'day') next.setDate(next.getDate() - 1);
    else next.setDate(next.getDate() - 30);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + 1);
    else if (viewMode === 'week') next.setDate(next.getDate() + 7);
    else if (viewMode === 'day') next.setDate(next.getDate() + 1);
    else next.setDate(next.getDate() + 30);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date(2026, 8, 15));
  };

  // RSVP Response Handler
  const handleRsvp = async (eventId: string, status: CalendarAttendeeResponseStatus) => {
    try {
      await fetch(`/api/v1/calendar/events/${eventId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseStatus: status }),
      });
    } catch {
      // optimistic update
    }

    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== eventId) return ev;
        return {
          ...ev,
          attendees: ev.attendees.map((att) =>
            att.userId === 'user-1' ? { ...att, responseStatus: status, respondedAt: new Date().toISOString() } : att
          ),
        };
      })
    );

    if (selectedEvent && selectedEvent.id === eventId) {
      setSelectedEvent((prev) =>
        prev
          ? {
              ...prev,
              attendees: prev.attendees.map((att) =>
                att.userId === 'user-1'
                  ? { ...att, responseStatus: status, respondedAt: new Date().toISOString() }
                  : att
              ),
            }
          : null
      );
    }
  };

  // Create Event Form Submit
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const startAt = allDay
      ? new Date(`${startDateStr}T00:00:00Z`).toISOString()
      : new Date(`${startDateStr}T${startTimeStr}:00Z`).toISOString();
    const endAt = allDay
      ? new Date(`${endDateStr}T23:59:59Z`).toISOString()
      : new Date(`${endDateStr}T${endTimeStr}:00Z`).toISOString();

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      setSubmitError('End time must be after start time');
      return;
    }

    let rrule: string | null = null;
    if (recurrenceRule === 'daily') rrule = 'FREQ=DAILY;INTERVAL=1';
    else if (recurrenceRule === 'weekly') rrule = 'FREQ=WEEKLY;INTERVAL=1';
    else if (recurrenceRule === 'monthly') rrule = 'FREQ=MONTHLY;INTERVAL=1';

    const payload = {
      title,
      description: description || null,
      location: location || null,
      startAt,
      endAt,
      timezone: timeZone,
      allDay,
      visibility,
      recurrenceRule: rrule,
      reminders: [reminderMinutes],
    };

    try {
      const res = await fetch('/api/v1/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setEvents((prev) => [json.data, ...prev]);
          setIsCreateModalOpen(false);
          resetForm();
          return;
        }
      }
    } catch {
      // Local optimistic fallback
    }

    const optimisticEvent: CalendarEventWithDetails = {
      id: `local-${Date.now()}`,
      organizationId: 'org-1',
      teamId: null,
      organizerUserId: 'user-1',
      title,
      description: description || null,
      location: location || null,
      startAt,
      endAt,
      timezone: timeZone,
      allDay,
      visibility,
      status: 'confirmed',
      meetingId: linkMeeting ? `meet-${Date.now()}` : null,
      recurrenceRule: rrule,
      recurrenceUntil: null,
      recurrenceTimezone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      organizer: {
        id: 'user-1',
        displayName: 'Demo User',
        email: 'user@example.com',
        avatarUrl: null,
      },
      attendees: [
        {
          id: `att-${Date.now()}`,
          eventId: `local-${Date.now()}`,
          userId: 'user-1',
          responseStatus: 'ACCEPTED',
          isOrganizer: true,
          respondedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: {
            id: 'user-1',
            displayName: 'Demo User',
            email: 'user@example.com',
            avatarUrl: null,
          },
        },
      ],
      meeting: linkMeeting
        ? {
            id: `meet-${Date.now()}`,
            title,
            status: 'scheduled',
          }
        : null,
    };

    setEvents((prev) => [optimisticEvent, ...prev]);
    setIsCreateModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAllDay(false);
    setVisibility('ORGANIZATION');
    setRecurrenceRule('none');
    setLinkMeeting(false);
    setSubmitError(null);
  };

  // Render Month View Grid
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Leading blanks
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`blank-${i}`} style={{ minHeight: '110px', backgroundColor: '#090d16', border: '1px solid rgba(148, 163, 184, 0.08)' }} />);
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === 15 && month === 8 && year === 2026;
      const dayEvents = events.filter((ev) => {
        const evDate = new Date(ev.startAt);
        return evDate.getUTCDate() === d && evDate.getUTCMonth() === month && evDate.getUTCFullYear() === year;
      });

      days.push(
        <div
          key={`day-${d}`}
          style={{
            minHeight: '110px',
            backgroundColor: isToday ? 'rgba(59, 130, 246, 0.05)' : '#0f172a',
            border: isToday ? '1px solid #3b82f6' : '1px solid rgba(148, 163, 184, 0.12)',
            borderRadius: '4px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: isToday ? 700 : 500,
                color: isToday ? '#60a5fa' : '#94a3b8',
                borderRadius: '50%',
                width: isToday ? '22px' : 'auto',
                height: isToday ? '22px' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isToday ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              }}
            >
              {d}
            </span>
            {dayEvents.length > 0 && (
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Event Chips */}
          {dayEvents.map((ev) => (
            <div
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              style={{
                backgroundColor: ev.visibility === 'PRIVATE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                borderLeft: `3px solid ${ev.visibility === 'PRIVATE' ? '#ef4444' : '#3b82f6'}`,
                borderRadius: '3px',
                padding: '3px 6px',
                fontSize: '0.75rem',
                color: '#f8fafc',
                cursor: 'pointer',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                transition: 'background 0.15s',
              }}
              title={ev.title}
            >
              <span style={{ fontWeight: 600, marginRight: '4px' }}>
                {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {ev.title}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Day of week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '4px' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dw) => (
            <div key={dw} style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', padding: '4px 0' }}>
              {dw}
            </div>
          ))}
        </div>
        {/* Month grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {days}
        </div>
      </div>
    );
  };

  // Render Agenda / List View
  const renderAgendaView = () => {
    if (events.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
          <h3 style={{ fontSize: '1.1rem', color: '#94a3b8', margin: 0 }}>No scheduled events</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Use the "+ New Event" button to schedule an event or meeting.</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {events.map((ev) => {
          const startDate = new Date(ev.startAt);
          const endDate = new Date(ev.endAt);
          return (
            <div
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.15)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                {/* Date Badge */}
                <div
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: '8px',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'center',
                    minWidth: '55px',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 600 }}>
                    {startDate.toLocaleDateString([], { month: 'short' })}
                  </div>
                  <div style={{ fontSize: '1.25rem', color: '#ffffff', fontWeight: 700 }}>
                    {startDate.getUTCDate()}
                  </div>
                </div>

                {/* Event Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>{ev.title}</h3>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        backgroundColor:
                          ev.visibility === 'PRIVATE'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : ev.visibility === 'TEAM'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)',
                        color:
                          ev.visibility === 'PRIVATE'
                            ? '#f87171'
                            : ev.visibility === 'TEAM'
                            ? '#facc15'
                            : '#60a5fa',
                      }}
                    >
                      {ev.visibility}
                    </span>
                    {ev.recurrenceRule && (
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        🔁 Recurring
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    🕒 {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({ev.timezone})
                    {ev.location && ` • 📍 ${ev.location}`}
                  </div>
                </div>
              </div>

              {/* Right side actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {ev.meeting && (
                  <Link
                    href={`/meetings?id=${ev.meeting.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                    }}
                  >
                    Join Meeting
                  </Link>
                )}
                <span style={{ color: '#64748b', fontSize: '1rem' }}>&rarr;</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 2rem', color: '#f8fafc' }}>
      {/* Top Header & Navigation Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
            Calendar & Scheduling
          </h1>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#94a3b8',
            }}
          >
            🌐 {timeZone}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* View Mode Switcher */}
          <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '8px', padding: '3px', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewMode === mode ? '#3b82f6' : 'transparent',
                  color: viewMode === mode ? '#ffffff' : '#94a3b8',
                  transition: 'background 0.15s',
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* New Event Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* Date Navigation Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#1e293b',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '8px',
          padding: '0.6rem 1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handlePrev}
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            &lt;
          </button>
          <button
            onClick={handleNext}
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            &gt;
          </button>
          <button
            onClick={handleToday}
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#94a3b8',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            Today
          </button>

          <span style={{ fontSize: '1.1rem', fontWeight: 700, marginLeft: '0.5rem', color: '#f8fafc' }}>
            {headerTitle}
          </span>
        </div>

        {isLoading && (
          <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Synchronizing...</span>
        )}
      </div>

      {/* Calendar Body */}
      {viewMode === 'month' ? renderMonthView() : renderAgendaView()}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    backgroundColor:
                      selectedEvent.visibility === 'PRIVATE'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(59, 130, 246, 0.2)',
                    color: selectedEvent.visibility === 'PRIVATE' ? '#f87171' : '#60a5fa',
                  }}
                >
                  {selectedEvent.visibility}
                </span>
                <h2 style={{ margin: '0.5rem 0 0 0', fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc' }}>
                  {selectedEvent.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>🕒 {new Date(selectedEvent.startAt).toLocaleString()} - {new Date(selectedEvent.endAt).toLocaleTimeString()} ({selectedEvent.timezone})</div>
              {selectedEvent.location && <div>📍 {selectedEvent.location}</div>}
              <div>👤 Organizer: {selectedEvent.organizer.displayName} ({selectedEvent.organizer.email})</div>
              {selectedEvent.recurrenceRule && <div>🔁 Recurrence: {selectedEvent.recurrenceRule}</div>}
            </div>

            {selectedEvent.description && (
              <div
                style={{
                  backgroundColor: '#0f172a',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                }}
              >
                {selectedEvent.description}
              </div>
            )}

            {/* Attendees list */}
            {selectedEvent.attendees.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>Attendees ({selectedEvent.attendees.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {selectedEvent.attendees.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        padding: '4px 0',
                      }}
                    >
                      <span style={{ color: '#f8fafc' }}>{att.user.displayName}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            att.responseStatus === 'ACCEPTED'
                              ? 'rgba(34, 197, 94, 0.2)'
                              : att.responseStatus === 'DECLINED'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(234, 179, 8, 0.2)',
                          color:
                            att.responseStatus === 'ACCEPTED'
                              ? '#4ade80'
                              : att.responseStatus === 'DECLINED'
                              ? '#f87171'
                              : '#facc15',
                        }}
                      >
                        {att.responseStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RSVP Response Actions */}
            <div
              style={{
                borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                paddingTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center' }}>RSVP:</span>
                <button
                  onClick={() => handleRsvp(selectedEvent.id, 'ACCEPTED')}
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRsvp(selectedEvent.id, 'TENTATIVE')}
                  style={{
                    backgroundColor: 'rgba(234, 179, 8, 0.15)',
                    color: '#facc15',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tentative
                </button>
                <button
                  onClick={() => handleRsvp(selectedEvent.id, 'DECLINED')}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Decline
                </button>
              </div>

              {selectedEvent.meeting && (
                <Link
                  href={`/meetings?id=${selectedEvent.meeting.id}`}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  Join Meeting
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                Schedule New Event
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {submitError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Title *</label>
                <input
                  type="text"
                  required
                  placeholder="Sprint Review, Team Standup..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              {/* Start & End Date / Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Start</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', padding: '6px', color: '#ffffff', fontSize: '0.8rem' }}
                    />
                    {!allDay && (
                      <input
                        type="time"
                        value={startTimeStr}
                        onChange={(e) => setStartTimeStr(e.target.value)}
                        style={{ width: '80px', backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', padding: '6px', color: '#ffffff', fontSize: '0.8rem' }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>End</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="date"
                      value={endDateStr}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', padding: '6px', color: '#ffffff', fontSize: '0.8rem' }}
                    />
                    {!allDay && (
                      <input
                        type="time"
                        value={endTimeStr}
                        onChange={(e) => setEndTimeStr(e.target.value)}
                        style={{ width: '80px', backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', padding: '6px', color: '#ffffff', fontSize: '0.8rem' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* All Day Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="allDay"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                <label htmlFor="allDay" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>All-day event</label>
              </div>

              {/* Visibility & Recurrence */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Visibility</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as CalendarEventVisibility)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="ORGANIZATION">Organization</option>
                    <option value="TEAM">Team</option>
                    <option value="PRIVATE">Private (Invite only)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Recurrence</label>
                  <select
                    value={recurrenceRule}
                    onChange={(e) => setRecurrenceRule(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Linked Meeting Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.08)', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <input
                  type="checkbox"
                  id="linkMeeting"
                  checked={linkMeeting}
                  onChange={(e) => setLinkMeeting(e.target.checked)}
                />
                <label htmlFor="linkMeeting" style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 500 }}>
                  📹 Create and link a TeamTrack Video Meeting room
                </label>
              </div>

              {/* Location */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Location</label>
                <input
                  type="text"
                  placeholder="Conference Room B / Remote link"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={2}
                  placeholder="Meeting agenda, notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              {/* Reminders dropdown */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Notification Reminder</label>
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value={5}>5 minutes before</option>
                  <option value={10}>10 minutes before</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#94a3b8',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
