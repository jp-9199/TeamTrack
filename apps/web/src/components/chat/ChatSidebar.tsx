'use client';

import React, { useState } from 'react';
import { ChatItem } from '../../types/chat';
import { Avatar, Tooltip, Badge } from '@fluentui/react-components';
import {
  SearchRegular,
  VideoRegular,
  ComposeRegular,
  ChevronDownRegular,
  PeopleTeamRegular,
  DismissRegular,
  ChatMultipleRegular,
} from '@fluentui/react-icons';

interface ChatSidebarProps {
  chats: ChatItem[];
  selectedChatId: string;
  onSelectChat: (id: string) => void;
  activeFilter: 'all' | 'unread' | 'meeting' | 'unmuted';
  onFilterChange: (filter: 'all' | 'unread' | 'meeting' | 'unmuted') => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  chats,
  selectedChatId,
  onSelectChat,
  activeFilter,
  onFilterChange,
}) => {
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter((c) => {
    if (activeFilter === 'unread' && !c.isUnread) return false;
    if (searchQuery.trim() && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const favoriteChats = filteredChats.filter((c) => c.isFavorite);
  const regularChats = filteredChats.filter((c) => !c.isFavorite);

  return (
    <aside className="w-[300px] bg-[#ECEEF0] flex flex-col shrink-0 overflow-hidden select-none h-full border-r border-[#E1DFDD]/50">
      {/* Sidebar Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between select-none">
        <h2 className="text-[18px] font-bold text-[#242424] tracking-tight">Chat</h2>
        <div className="flex items-center gap-0.5 text-[#424242]">
          <Tooltip content="Filter" relationship="label">
            <button 
              onClick={() => setShowSearchInput(!showSearchInput)}
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="Filter"
            >
              <SearchRegular fontSize={16} />
            </button>
          </Tooltip>

          <Tooltip content="Meet now" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="Meet now"
            >
              <VideoRegular fontSize={16} />
            </button>
          </Tooltip>

          <Tooltip content="New chat" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="New chat"
            >
              <ComposeRegular fontSize={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Quick Search Bar if toggled */}
      {showSearchInput && (
        <div className="px-3 pb-2 animate-fadeIn">
          <div className="relative flex items-center">
            <SearchRegular fontSize={14} className="absolute left-2.5 text-[#616161]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name..."
              className="w-full h-[28px] pl-8 pr-7 bg-white rounded-md border border-[#C7CCD1] text-[12px] focus:outline-none focus:border-[#5B5FC7] transition-all"
              autoFocus
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#707070] hover:text-[#242424]"
              >
                <DismissRegular fontSize={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chat Filters */}
      <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto no-scrollbar select-none shrink-0">
        {[
          { id: 'unread', label: 'Unread' },
          { id: 'meeting', label: 'Meeting chats' },
          { id: 'unmuted', label: 'Unmuted' },
        ].map((pill) => {
          const isSelected = activeFilter === pill.id;
          return (
            <button
              key={pill.id}
              onClick={() => onFilterChange(isSelected ? 'all' : (pill.id as any))}
              className={`px-3 py-0.5 rounded-full text-[12px] whitespace-nowrap transition-all border cursor-pointer ${
                isSelected 
                  ? 'bg-white text-[#242424] font-medium border-[#B0B5BA] shadow-xs' 
                  : 'bg-transparent text-[#424242] font-normal border-[#C7CCD1] hover:bg-white/60'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Chat Lists */}
      <div className="flex-1 overflow-y-auto pb-4 custom-scrollbar">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[#616161] mt-10">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-2 text-[#616161]">
              <ChatMultipleRegular fontSize={22} />
            </div>
            <span className="text-[13px] font-semibold text-[#242424]">No conversations</span>
            <span className="text-[11px] text-[#707070] mt-1 max-w-[220px]">
              {searchQuery ? 'No chats match your filter.' : 'When conversations exist in TeamTrack, they will appear here.'}
            </span>
          </div>
        ) : (
          <>
            {favoriteChats.length > 0 && (
              <div className="py-1">
                <div className="px-4 py-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#616161] select-none hover:text-[#242424] transition-colors cursor-pointer">
                  <ChevronDownRegular fontSize={12} />
                  <span>Favorites</span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {favoriteChats.map((chat) => (
                    <ConversationItem
                      key={chat.id}
                      chat={chat}
                      isSelected={selectedChatId === chat.id}
                      onClick={() => onSelectChat(chat.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {regularChats.length > 0 && (
              <div className="py-1 mt-0.5">
                <div className="px-4 py-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#616161] select-none hover:text-[#242424] transition-colors cursor-pointer">
                  <ChevronDownRegular fontSize={12} />
                  <span>Chats</span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {regularChats.map((chat) => (
                    <ConversationItem
                      key={chat.id}
                      chat={chat}
                      isSelected={selectedChatId === chat.id}
                      onClick={() => onSelectChat(chat.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

interface ConversationItemProps {
  chat: ChatItem;
  isSelected: boolean;
  onClick: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({ chat, isSelected, onClick }) => {
  const isSelf = chat.name.includes('(You)') || chat.name.toLowerCase().includes('amir');
  const isMeeting = chat.lastMessage?.toLowerCase().includes('meeting');
  const isGroup = (chat.memberCount && chat.memberCount > 2);

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2.5 px-2.5 py-2 mx-1.5 rounded-lg cursor-pointer transition-all select-none ${
        isSelected 
          ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/5 relative z-10' 
          : 'bg-transparent hover:bg-black/5'
      }`}
    >
      {/* Avatar matching Image 2 */}
      <div className="shrink-0 relative">
        {isSelf ? (
          <div className="relative">
            <div className="w-[34px] h-[34px] rounded-full bg-[#111827] text-white flex items-center justify-center text-[11px] font-semibold shadow-xs">
              Amir
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#107C10] border-2 border-white flex items-center justify-center shadow-xs">
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ) : (
          <div 
            className="w-[34px] h-[34px] rounded-full text-white flex items-center justify-center text-[11px] font-semibold shadow-xs"
            style={{ backgroundColor: chat.avatarBg || '#5B5FC7' }}
          >
            {isGroup ? (
              <PeopleTeamRegular fontSize={18} className="text-white" />
            ) : (
              chat.avatarText || chat.name.slice(0, 2).toUpperCase()
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pr-0.5">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className={`text-[13px] truncate ${isSelected ? 'font-bold text-[#242424]' : 'font-semibold text-[#242424]'}`}>
            {chat.name}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <span className="text-[11px] text-[#616161]">{chat.time}</span>
            {chat.isUnread && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#242424] ml-0.5 inline-block" />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] truncate text-[#616161] flex items-center gap-1">
            {isMeeting && (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-[#616161] shrink-0">
                <path d="M2 5v6h2l4 4V1L4 5H2zm9 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            )}
            {chat.lastMessage || 'Start a conversation'}
          </span>
        </div>
      </div>
    </div>
  );
};
