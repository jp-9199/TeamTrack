'use client';

import React, { useState } from 'react';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useNotifications } from '../../components/notifications/NotificationContext';
import {
  Bell,
  CheckCheck,
  RotateCw,
  MessagesSquare,
  Video,
  AtSign,
  Activity,
  ExternalLink,
  Sparkles,
  Check,
  Folder,
} from 'lucide-react';

export default function NotificationCenterPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    typeFilter,
    setTypeFilter,
    markAllRead,
    markRead,
    refresh,
  } = useNotifications();

  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(
    notifications[0]?.id || null
  );

  // Filter items
  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'unread' && item.readAt !== null) {
      return false;
    }
    if (typeFilter !== 'all' && item.type !== typeFilter) {
      return false;
    }
    return true;
  });

  const selectedNotification =
    filteredNotifications.find((n) => n.id === selectedNotifId) || filteredNotifications[0];

  const renderIcon = (type: string) => {
    switch (type) {
      case 'mention':
        return (
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold text-xs">
            <AtSign size={14} strokeWidth={1.65} />
          </div>
        );
      case 'direct_message':
      case 'channel_message':
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <MessagesSquare size={14} strokeWidth={1.65} />
          </div>
        );
      case 'meeting_invite':
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Video size={14} strokeWidth={1.65} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Bell size={14} strokeWidth={1.65} />
          </div>
        );
    }
  };

  // ── SECONDARY SIDEBAR: ACTIVITY FEED ──
  const sidebar = (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] select-none text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight">Activity Feed</h2>
          {unreadCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500 text-white font-bold">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void refresh()}
            className="p-1.5 hover:bg-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Refresh activity"
          >
            <RotateCw size={14} />
          </button>

          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="p-1.5 hover:bg-[var(--border-subtle)] rounded-lg text-indigo-400 transition-colors cursor-pointer"
              title="Mark all as read"
            >
              <CheckCheck size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs (All / Unread) */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === 'all'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === 'unread'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--text-secondary)] mt-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-2.5 text-indigo-400">
              <CheckCheck size={22} />
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)]">All caught up!</span>
            <span className="text-[11px] text-[var(--text-secondary)] mt-1">No new notifications in this filter.</span>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isSelected = selectedNotifId === notif.id;
            const isUnread = !notif.readAt;

            return (
              <div
                key={notif.id}
                onClick={() => {
                  setSelectedNotifId(notif.id);
                  if (isUnread) void markRead(notif.id);
                }}
                className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 select-none ${
                  isSelected
                    ? 'bg-indigo-600/15 border border-indigo-500/30'
                    : 'hover:bg-[var(--border-subtle)]/40 border border-transparent'
                }`}
              >
                <div className="relative shrink-0 mt-0.5">
                  {renderIcon(notif.type)}
                  {isUnread && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-[var(--bg-surface)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className={`text-xs truncate ${isUnread ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                      {notif.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-snug">
                    {notif.body}
                  </p>
                  <span className="text-[10px] text-[var(--text-secondary)]/80 mt-1 block font-mono">
                    {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="activity">
      {/* ── ACTIVE CANVAS: NOTIFICATION DETAIL ── */}
      <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans">
        {selectedNotification ? (
          <div className="flex flex-col h-full">
            {/* Notification Header */}
            <header className="px-8 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {renderIcon(selectedNotification.type)}
                <div>
                  <h1 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                    {selectedNotification.title}
                  </h1>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {new Date(selectedNotification.createdAt).toLocaleString()} &bull; Category: {selectedNotification.type.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void markAllRead()}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Mark All Read
                </button>
              </div>
            </header>

            {/* Notification Detail Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-canvas)]">
              <div className="max-w-2xl bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-4">
                <div className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {selectedNotification.body}
                </div>

                {selectedNotification.resourceType && (
                  <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">
                      Destination: <strong className="text-[var(--text-primary)] capitalize">{selectedNotification.resourceType}</strong>
                    </span>

                    {selectedNotification.resourceType === 'channel' && (
                      <a
                        href="/teams"
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                      >
                        Go to Channel &rarr;
                      </a>
                    )}
                    {selectedNotification.resourceType === 'conversation' && (
                      <a
                        href="/chat"
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                      >
                        Open Direct Chat &rarr;
                      </a>
                    )}
                    {selectedNotification.resourceType === 'meeting' && (
                      <a
                        href={`/meetings/room/${selectedNotification.resourceId}`}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                      >
                        Join Session &rarr;
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--text-secondary)]">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3 text-indigo-400">
              <Bell size={28} />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Select an activity item</h3>
            <p className="text-xs max-w-sm mt-1 text-[var(--text-secondary)] leading-relaxed">
              Mentions, replies, invitations, and alerts will appear in this feed.
            </p>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
