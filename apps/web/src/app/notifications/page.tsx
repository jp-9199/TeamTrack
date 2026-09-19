'use client';

import React, { useState } from 'react';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useNotifications } from '../../components/notifications/NotificationContext';
import { Tooltip } from '@fluentui/react-components';
import {
  AlertRegular,
  AlertFilled,
  CheckmarkRegular,
  FilterRegular,
  SearchRegular,
  ChatRegular,
  PeopleTeamRegular,
  VideoRegular,
  MoreHorizontalRegular,
  ArrowClockwiseRegular,
  DismissRegular,
} from '@fluentui/react-icons';

const NOTIFICATION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'mention', label: 'Mentions (@)' },
  { value: 'direct_message', label: 'Direct Messages' },
  { value: 'channel_message', label: 'Channel Messages' },
  { value: 'meeting_invite', label: 'Meetings' },
  { value: 'team_activity', label: 'Team Activity' },
];

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
  const [feedType, setFeedType] = useState<'feed' | 'my_activity'>('feed');

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
          <div className="w-8 h-8 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center font-bold text-[14px]">
            @
          </div>
        );
      case 'direct_message':
      case 'channel_message':
        return (
          <div className="w-8 h-8 rounded-full bg-[#E1EDFA] text-[#0078D4] flex items-center justify-center">
            <ChatRegular fontSize={16} />
          </div>
        );
      case 'meeting_invite':
        return (
          <div className="w-8 h-8 rounded-full bg-[#DEF3DF] text-[#107C10] flex items-center justify-center">
            <VideoRegular fontSize={16} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-[#F3F2F1] text-[#5B5FC7] flex items-center justify-center">
            <AlertRegular fontSize={16} />
          </div>
        );
    }
  };

  // ── SECONDARY SIDEBAR: ACTIVITY FEED ──
  const sidebar = (
    <div className="flex flex-col h-full bg-[#ECEEF0] select-none text-[#242424]">
      {/* Sidebar Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[18px] font-bold tracking-tight">Activity</h2>
          <span className="text-[12.5px] text-[#616161]">({feedType === 'feed' ? 'Feed' : 'My Activity'})</span>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip content="Refresh activity" relationship="label">
            <button
              onClick={() => void refresh()}
              className="p-1.5 hover:bg-black/5 rounded-md text-[#424242] transition-colors cursor-pointer"
            >
              <ArrowClockwiseRegular fontSize={16} />
            </button>
          </Tooltip>

          {unreadCount > 0 && (
            <Tooltip content="Mark all as read" relationship="label">
              <button
                onClick={() => void markAllRead()}
                className="p-1.5 hover:bg-black/5 rounded-md text-[#5B5FC7] transition-colors cursor-pointer font-bold"
              >
                <CheckmarkRegular fontSize={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Filter Tabs (All / Unread) */}
      <div className="flex items-center gap-1 px-3 pb-2.5">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${
            filter === 'all'
              ? 'bg-white text-[#242424] border-[#B0B5BA] shadow-xs'
              : 'bg-transparent text-[#424242] border-[#C7CCD1] hover:bg-white/60'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${
            filter === 'unread'
              ? 'bg-white text-[#242424] border-[#B0B5BA] shadow-xs'
              : 'bg-transparent text-[#424242] border-[#C7CCD1] hover:bg-white/60'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto px-1.5 space-y-1 custom-scrollbar">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#616161] mt-6">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-2 text-[#5B5FC7]">
              <AlertRegular fontSize={24} />
            </div>
            <span className="text-[13px] font-bold text-[#242424]">All caught up!</span>
            <span className="text-[11px] text-[#707070] mt-1">No new notifications in this view.</span>
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
                    ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/5'
                    : 'hover:bg-black/5'
                }`}
              >
                <div className="relative shrink-0 mt-0.5">
                  {renderIcon(notif.type)}
                  {isUnread && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#5B5FC7] ring-2 ring-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className={`text-[12.5px] truncate ${isUnread ? 'font-bold text-[#242424]' : 'font-semibold text-[#424242]'}`}>
                      {notif.title}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#616161] line-clamp-2 leading-snug">
                    {notif.body}
                  </p>
                  <span className="text-[10px] text-[#8A8886] mt-1 block">
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
      {/* ── ACTIVE CANVAS: NOTIFICATION DETAIL / STAGE ── */}
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {selectedNotification ? (
          <div className="flex flex-col h-full">
            {/* Notification Header */}
            <header className="px-8 py-5 border-b border-[#E1DFDD] bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {renderIcon(selectedNotification.type)}
                <div>
                  <h1 className="text-[18px] font-bold text-[#242424] leading-tight">
                    {selectedNotification.title}
                  </h1>
                  <p className="text-[12px] text-[#616161]">
                    {new Date(selectedNotification.createdAt).toLocaleString()} &bull; Category: {selectedNotification.type.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void markAllRead()}
                  className="px-3.5 py-1.5 bg-[#5B5FC7] text-white font-semibold text-[12.5px] rounded-lg hover:bg-[#4F52B2] transition-colors cursor-pointer shadow-xs"
                >
                  Mark all read
                </button>
              </div>
            </header>

            {/* Notification Detail Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-[#FAF9F8]">
              <div className="max-w-2xl bg-white p-6 rounded-2xl border border-[#E1DFDD] shadow-sm space-y-4">
                <div className="text-[14px] text-[#242424] leading-relaxed whitespace-pre-wrap">
                  {selectedNotification.body}
                </div>

                {selectedNotification.resourceType && (
                  <div className="pt-4 border-t border-[#F3F2F1] flex items-center justify-between">
                    <span className="text-[12px] text-[#616161]">
                      Target: <strong className="text-[#242424] capitalize">{selectedNotification.resourceType}</strong>
                    </span>

                    {selectedNotification.resourceType === 'channel' && (
                      <a
                        href="/teams"
                        className="px-4 py-1.5 bg-[#5B5FC7] text-white rounded-lg text-[12.5px] font-semibold hover:bg-[#4F52B2] shadow-xs"
                      >
                        Go to Channel
                      </a>
                    )}
                    {selectedNotification.resourceType === 'conversation' && (
                      <a
                        href="/chat"
                        className="px-4 py-1.5 bg-[#5B5FC7] text-white rounded-lg text-[12.5px] font-semibold hover:bg-[#4F52B2] shadow-xs"
                      >
                        Open Chat
                      </a>
                    )}
                    {selectedNotification.resourceType === 'meeting' && (
                      <a
                        href={`/meetings/room/${selectedNotification.resourceId}`}
                        className="px-4 py-1.5 bg-[#107C10] text-white rounded-lg text-[12.5px] font-semibold hover:bg-[#0E6C0E] shadow-xs"
                      >
                        Join Meeting
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#616161]">
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mb-3 text-[#5B5FC7]">
              <AlertRegular fontSize={32} />
            </div>
            <h3 className="text-[17px] font-bold text-[#242424]">Select an activity item</h3>
            <p className="text-[13px] max-w-sm mt-1 text-[#707070]">
              Mentions, replies, and notifications will show their details here.
            </p>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
