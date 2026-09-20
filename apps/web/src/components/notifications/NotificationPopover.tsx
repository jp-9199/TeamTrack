'use client';

import React, { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationContext';
import { NotificationList } from './NotificationList';
import { CheckCheck, RefreshCw, X } from 'lucide-react';

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

  const displayedNotifications =
    filter === 'unread'
      ? notifications.filter((n) => n.readAt === null)
      : notifications;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Notification Center"
      aria-modal="true"
      className="absolute top-11 right-0 w-[380px] max-w-[92vw] max-h-[520px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-scale-in text-slate-800 dark:text-slate-100"
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
            title="Refresh alerts"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={closePopover}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <NotificationList
          notifications={displayedNotifications}
          isLoading={isLoading}
          error={error}
          onNavigate={(url) => {
            closePopover();
            if (onNavigate) onNavigate(url);
          }}
          onRetry={() => void refresh()}
          compact
        />
      </div>
    </div>
  );
}
