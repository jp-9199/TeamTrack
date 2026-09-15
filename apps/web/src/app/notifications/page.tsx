'use client';

import React from 'react';
import { useNotifications } from '../../components/notifications/NotificationContext';
import { NotificationList } from '../../components/notifications/NotificationList';
import type { NotificationType } from '@teamtrack/shared-types';

const NOTIFICATION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'mention', label: 'Mentions (@)' },
  { value: 'direct_message', label: 'Direct Messages' },
  { value: 'channel_message', label: 'Channel Messages' },
  { value: 'reply', label: 'Replies' },
  { value: 'meeting_invite', label: 'Meetings' },
  { value: 'team_activity', label: 'Team Activity' },
  { value: 'system', label: 'System' },
];

export default function NotificationCenterPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    filter,
    setFilter,
    typeFilter,
    setTypeFilter,
    markAllRead,
    loadMore,
    refresh,
  } = useNotifications();

  // Filter items based on active tabs
  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'unread' && item.readAt !== null) {
      return false;
    }
    if (typeFilter !== 'all' && item.type !== typeFilter) {
      return false;
    }
    return true;
  });

  return (
    <main
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: '2rem 1.5rem',
      }}
    >
      {/* Header & Metric Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 0.35rem 0',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: '-0.02em',
            }}
          >
            Notification Center
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
            Stay updated with your mentions, messages, meetings, and team activities.
          </p>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#cbd5e1',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
          >
            <span>🔄</span> Refresh
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                backgroundColor: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              <span>✓</span> Mark all read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {/* Control Bar: Filter Tabs + Category Dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        {/* All vs Unread Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: filter === 'all' ? 600 : 500,
              color: filter === 'all' ? '#ffffff' : '#94a3b8',
              backgroundColor: filter === 'all' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
              border: filter === 'all' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            All Notifications ({notifications.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter('unread')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: filter === 'unread' ? 600 : 500,
              color: filter === 'unread' ? '#ffffff' : '#94a3b8',
              backgroundColor: filter === 'unread' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
              border: filter === 'unread' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Category Filter Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label
            htmlFor="category-select"
            style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}
          >
            Category:
          </label>
          <select
            id="category-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '0.35rem 0.75rem',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '0.8125rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main List Container */}
      <div
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          overflow: 'hidden',
          minHeight: '280px',
        }}
      >
        <NotificationList
          notifications={filteredNotifications}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
          emptyMessage={
            filter === 'unread'
              ? 'No unread notifications right now.'
              : typeFilter !== 'all'
              ? 'No notifications found for this category.'
              : "You're all caught up! No notifications to display."
          }
        />
      </div>

      {/* Pagination Footer */}
      {hasMore && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.5rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#f8fafc',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoadingMore ? 'not-allowed' : 'pointer',
              opacity: isLoadingMore ? 0.7 : 1,
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isLoadingMore) e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.9)';
            }}
            onMouseLeave={(e) => {
              if (!isLoadingMore) e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
            }}
          >
            {isLoadingMore ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span> Loading more...
              </>
            ) : (
              'Load More Notifications ↓'
            )}
          </button>
        </div>
      )}
    </main>
  );
}
