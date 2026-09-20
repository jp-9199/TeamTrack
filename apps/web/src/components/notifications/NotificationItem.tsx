'use client';

import React from 'react';
import type { Notification, NotificationType } from '@teamtrack/shared-types';
import { useNotifications } from './NotificationContext';
import {
  MessageSquare,
  AtSign,
  Video,
  Users,
  Check,
  Trash2,
  Bell,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

export interface NotificationItemProps {
  notification: Notification;
  onNavigate?: (url: string) => void;
  compact?: boolean;
}

export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function NotificationItem({
  notification,
  onNavigate,
  compact = false,
}: NotificationItemProps) {
  const { markRead, markUnread, deleteNotification } = useNotifications();
  const isUnread = notification.readAt === null;

  const handleClick = () => {
    if (isUnread) void markRead(notification.id);
    const targetUrl = notification.resourceId ? `/chat` : `/notifications`;
    if (onNavigate) {
      onNavigate(targetUrl);
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'mention':
        return <AtSign className="w-4 h-4 text-indigo-500" />;
      case 'direct_message':
      case 'channel_message':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'meeting_started':
      case 'meeting_invite':
        return <Video className="w-4 h-4 text-emerald-500" />;
      case 'team_activity':
        return <Users className="w-4 h-4 text-cyan-500" />;
      default:
        return <Bell className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`flex items-start gap-3 p-3 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-800/80 group ${
        isUnread
          ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
    >
      {/* Icon Badge */}
      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            {notification.title}
          </p>
          <span className="text-[10px] text-slate-400 shrink-0">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {notification.body}
        </p>
      </div>

      {/* Unread indicator */}
      {isUnread && (
        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-2" />
      )}
    </div>
  );
}
