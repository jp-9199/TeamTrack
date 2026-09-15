'use client';

import React from 'react';
import type { Notification, NotificationType } from '@teamtrack/shared-types';
import { useNotifications } from './NotificationContext';

export interface NotificationItemProps {
  notification: Notification;
  onNavigate?: (url: string) => void;
  compact?: boolean;
}

/**
 * Returns human-readable relative timestamp (e.g. "Just now", "5m ago", "2h ago", "Yesterday").
 */
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

/**
 * Resolves icon, color, and label based on notification type.
 */
export function getNotificationTypeMeta(type: NotificationType): {
  icon: string;
  badgeBg: string;
  badgeColor: string;
  label: string;
} {
  switch (type) {
    case 'mention':
      return { icon: '@', badgeBg: 'rgba(168, 85, 247, 0.15)', badgeColor: '#c084fc', label: 'Mention' };
    case 'direct_message':
      return { icon: '💬', badgeBg: 'rgba(59, 130, 246, 0.15)', badgeColor: '#60a5fa', label: 'Direct Message' };
    case 'channel_message':
      return { icon: '#', badgeBg: 'rgba(34, 197, 94, 0.15)', badgeColor: '#4ade80', label: 'Channel Message' };
    case 'reply':
      return { icon: '↩', badgeBg: 'rgba(14, 165, 233, 0.15)', badgeColor: '#38bdf8', label: 'Reply' };
    case 'team_activity':
      return { icon: '👥', badgeBg: 'rgba(14, 165, 233, 0.15)', badgeColor: '#38bdf8', label: 'Team Activity' };
    case 'meeting_invite':
    case 'meeting_started':
    case 'meeting_update':
    case 'meeting_participant':
      return { icon: '📅', badgeBg: 'rgba(245, 158, 11, 0.15)', badgeColor: '#fbbf24', label: 'Meeting' };
    case 'system':
    default:
      return { icon: '📢', badgeBg: 'rgba(148, 163, 184, 0.15)', badgeColor: '#94a3b8', label: 'System' };
  }
}

/**
 * Resolves resource navigation target URL.
 */
export function resolveResourceUrl(notification: Notification): string {
  if (notification.resourceType === 'channel' && notification.resourceId) {
    return `/channels/${encodeURIComponent(notification.resourceId)}`;
  }
  if (notification.resourceType === 'conversation' && notification.resourceId) {
    return `/conversations/${encodeURIComponent(notification.resourceId)}`;
  }
  if (notification.resourceType === 'meeting' && notification.resourceId) {
    return `/meetings?meetingId=${encodeURIComponent(notification.resourceId)}`;
  }
  if (notification.resourceType === 'file' && notification.resourceId) {
    return `/files/${encodeURIComponent(notification.resourceId)}`;
  }
  return '/notifications';
}

export function NotificationItem({
  notification,
  onNavigate,
  compact = false,
}: NotificationItemProps) {
  const { markRead, markUnread, deleteNotification } = useNotifications();
  const isUnread = notification.readAt === null;
  const meta = getNotificationTypeMeta(notification.type);
  const targetUrl = resolveResourceUrl(notification);

  const handleClick = async () => {
    if (isUnread) {
      await markRead(notification.id);
    }
    if (onNavigate) {
      onNavigate(targetUrl);
    } else {
      window.location.href = targetUrl;
    }
  };

  const handleToggleRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnread) {
      await markRead(notification.id);
    } else {
      await markUnread(notification.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleClick();
        }
      }}
      aria-label={`${notification.title}, ${isUnread ? 'unread' : 'read'}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: compact ? '0.75rem' : '1rem',
        padding: compact ? '0.75rem 1rem' : '1rem 1.25rem',
        backgroundColor: isUnread ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        position: 'relative',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isUnread
          ? 'rgba(37, 99, 235, 0.14)'
          : 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isUnread
          ? 'rgba(37, 99, 235, 0.08)'
          : 'transparent';
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
          }}
        />
      )}

      {/* Type badge icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? '32px' : '38px',
          height: compact ? '32px' : '38px',
          borderRadius: '50%',
          backgroundColor: meta.badgeBg,
          color: meta.badgeColor,
          fontSize: compact ? '0.85rem' : '1rem',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: meta.badgeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {meta.label}
          </span>
          <span
            title={new Date(notification.createdAt).toLocaleString()}
            style={{
              fontSize: '0.75rem',
              color: '#64748b',
              flexShrink: 0,
            }}
          >
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>

        <h4
          style={{
            margin: 0,
            fontSize: compact ? '0.875rem' : '0.925rem',
            fontWeight: isUnread ? 600 : 500,
            color: isUnread ? '#f8fafc' : '#cbd5e1',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: compact ? 'nowrap' : 'normal',
          }}
        >
          {notification.title}
        </h4>

        <p
          style={{
            margin: '0.25rem 0 0 0',
            fontSize: '0.8125rem',
            color: isUnread ? '#94a3b8' : '#64748b',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: compact ? 2 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {notification.body}
        </p>

        {/* Resource context tag */}
        {notification.resourceType && (
          <div style={{ marginTop: '0.35rem' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: '0.7rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                color: '#94a3b8',
              }}
            >
              {notification.resourceType}
              {notification.resourceId ? `: ${notification.resourceId.slice(0, 8)}...` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          flexShrink: 0,
          marginLeft: '0.25rem',
        }}
      >
        <button
          type="button"
          onClick={handleToggleRead}
          aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
          title={isUnread ? 'Mark as read' : 'Mark as unread'}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            padding: '0.35rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#38bdf8';
            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {isUnread ? '✓' : '○'}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete notification"
          title="Delete notification"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            padding: '0.35rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#f87171';
            e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
