'use client';

import React from 'react';
import { useNotifications } from './NotificationContext';
import { NotificationPopover } from './NotificationPopover';

export interface NotificationBellProps {
  onNavigate?: (url: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { unreadCount, isPopoverOpen, togglePopover } = useNotifications();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        id="notification-bell-btn"
        type="button"
        onClick={togglePopover}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup="dialog"
        aria-expanded={isPopoverOpen}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          backgroundColor: isPopoverOpen ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          border: isPopoverOpen ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.15)',
          color: isPopoverOpen ? '#60a5fa' : '#cbd5e1',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isPopoverOpen) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#ffffff';
          }
        }}
        onMouseLeave={(e) => {
          if (!isPopoverOpen) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#cbd5e1';
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 2px #3b82f6';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Bell SVG Icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread Badge Pill */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '9999px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '0.6875rem',
              fontWeight: 700,
              boxShadow: '0 0 0 2px #0f172a, 0 2px 4px rgba(0, 0, 0, 0.2)',
              animation: 'pulse 2s infinite',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Flyout */}
      <NotificationPopover onNavigate={onNavigate} />
    </div>
  );
}
