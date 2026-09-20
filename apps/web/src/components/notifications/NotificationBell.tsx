'use client';

import React from 'react';
import { useNotifications } from './NotificationContext';
import { NotificationPopover } from './NotificationPopover';
import { Bell } from 'lucide-react';

export interface NotificationBellProps {
  onNavigate?: (url: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { unreadCount, isPopoverOpen, togglePopover } = useNotifications();

  return (
    <div className="relative inline-block">
      <button
        id="notification-bell-btn"
        type="button"
        onClick={togglePopover}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup="dialog"
        aria-expanded={isPopoverOpen}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all cursor-pointer ${
          isPopoverOpen
            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/30'
            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
        }`}
      >
        <Bell className="w-4 h-4" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-xs border-2 border-slate-100 dark:border-[#0B1120] animate-pulse"
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
