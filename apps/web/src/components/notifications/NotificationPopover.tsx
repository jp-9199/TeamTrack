'use client';

import React, { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationContext';
import { NotificationList } from './NotificationList';

export interface NotificationPopoverProps {
  onNavigate?: (url: string) => void;
}

export function NotificationPopover({ onNavigate }: NotificationPopoverProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    filter,
    setFilter,
    isPopoverOpen,
    closePopover,
    markAllRead,
    refresh,
  } = useNotifications();

  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Only close if target was not the notification bell itself
        const target = e.target as HTMLElement;
        if (!target.closest('#notification-bell-btn')) {
          closePopover();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopoverOpen, closePopover]);

  if (!isPopoverOpen) return null;

  // Filter items based on active tab
  const displayedNotifications =
    filter === 'unread'
      ? notifications.filter((n) => n.readAt === null)
      : notifications;

  const handleOpenFullCenter = () => {
    closePopover();
    if (onNavigate) {
      onNavigate('/notifications');
    } else {
      window.location.href = '/notifications';
    }
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Notification Center"
      aria-modal="true"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: '0',
        width: '390px',
        maxWidth: '90vw',
        maxHeight: '520px',
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '12px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Popover Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.875rem 1rem',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          backgroundColor: 'rgba(30, 41, 59, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.1rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '0.2rem 0.4rem',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Mark all read
            </button>
          )}

          <button
            type="button"
            onClick={closePopover}
            aria-label="Close notifications"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1rem',
              cursor: 'pointer',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter Tabs (All / Unread) */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
        }}
      >
        <button
          type="button"
          onClick={() => setFilter('all')}
          style={{
            padding: '0.3rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: filter === 'all' ? 600 : 400,
            color: filter === 'all' ? '#ffffff' : '#94a3b8',
            backgroundColor: filter === 'all' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
            border: filter === 'all' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
            cursor: 'pointer',
          }}
        >
          All ({notifications.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter('unread')}
          style={{
            padding: '0.3rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: filter === 'unread' ? 600 : 400,
            color: filter === 'unread' ? '#ffffff' : '#94a3b8',
            backgroundColor: filter === 'unread' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
            border: filter === 'unread' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
            cursor: 'pointer',
          }}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Scrollable Notification List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '380px',
        }}
      >
        <NotificationList
          notifications={displayedNotifications}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
          onNavigate={(url) => {
            closePopover();
            if (onNavigate) onNavigate(url);
            else window.location.href = url;
          }}
          compact
          emptyMessage={filter === 'unread' ? 'No unread notifications' : "You're all caught up!"}
        />
      </div>

      {/* Popover Footer */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          textAlign: 'center',
        }}
      >
        <button
          type="button"
          onClick={handleOpenFullCenter}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          View all in Notification Center &rarr;
        </button>
      </div>
    </div>
  );
}
