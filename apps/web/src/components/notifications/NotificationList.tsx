'use client';

import React from 'react';
import type { Notification } from '@teamtrack/shared-types';
import { NotificationItem } from './NotificationItem';

export interface NotificationListProps {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate?: (url: string) => void;
  compact?: boolean;
  emptyMessage?: string;
}

export function NotificationList({
  notifications,
  isLoading,
  error,
  onRetry,
  onNavigate,
  compact = false,
  emptyMessage = "You're all caught up!",
}: NotificationListProps) {
  // 1. Error State
  if (error) {
    return (
      <div
        style={{
          padding: compact ? '2rem 1rem' : '3rem 2rem',
          textAlign: 'center',
          color: '#f87171',
        }}
      >
        <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>⚠️</div>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '0.4rem 0.85rem',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // 2. Loading State (Skeletons)
  if (isLoading && notifications.length === 0) {
    return (
      <div style={{ padding: '0.5rem 0' }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: compact ? '0.75rem 1rem' : '1rem 1.25rem',
              borderBottom: '1px solid rgba(148, 163, 184, 0.05)',
            }}
          >
            <div
              style={{
                width: compact ? '32px' : '38px',
                height: compact ? '32px' : '38px',
                borderRadius: '50%',
                backgroundColor: 'rgba(148, 163, 184, 0.15)',
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: '14px',
                  width: '60%',
                  backgroundColor: 'rgba(148, 163, 184, 0.15)',
                  borderRadius: '4px',
                  marginBottom: '0.4rem',
                }}
              />
              <div
                style={{
                  height: '11px',
                  width: '85%',
                  backgroundColor: 'rgba(148, 163, 184, 0.1)',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 3. Empty State
  if (notifications.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '2.5rem 1.5rem' : '4rem 2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: '#4ade80',
            fontSize: '1.5rem',
            marginBottom: '0.75rem',
          }}
        >
          ✓
        </div>
        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
          {emptyMessage}
        </h4>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
          No notifications to show right now.
        </p>
      </div>
    );
  }

  // 4. Notification Items
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {notifications.map((notif) => (
        <NotificationItem
          key={notif.id}
          notification={notif}
          onNavigate={onNavigate}
          compact={compact}
        />
      ))}
    </div>
  );
}
