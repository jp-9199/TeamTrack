'use client';

import React, { useState } from 'react';
import { ChatItem } from '../../types/chat';
import { Tooltip } from '@fluentui/react-components';
import {
  VideoRegular,
  CallRegular,
  PersonAddRegular,
  SearchRegular,
  MoreHorizontalRegular,
  PeopleTeamRegular,
} from '@fluentui/react-icons';

interface ChatHeaderProps {
  chat: ChatItem;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ chat }) => {
  const [selectedTab, setSelectedTab] = useState<'chat' | 'files' | 'photos'>('chat');
  const isSelf = chat.name.includes('(You)');
  const isGroup = (chat.memberCount && chat.memberCount > 2);
  const userInitials = chat.avatarText || chat.name.split(' ')[0] || 'Amir';

  return (
    <header className="h-[52px] px-4 border-b border-[#E1DFDD]/70 flex items-center justify-between bg-white shrink-0 z-10 select-none">
      <div className="flex items-center gap-3 h-full min-w-0">
        {/* Avatar with Presence Checkmark */}
        <div className="relative shrink-0">
          <div className="w-[34px] h-[34px] rounded-full bg-[#111827] text-white flex items-center justify-center text-[12px] font-semibold shadow-xs">
            {isGroup ? <PeopleTeamRegular fontSize={18} /> : userInitials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#107C10] border-2 border-white flex items-center justify-center shadow-xs">
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        {/* Name and optional Tabs */}
        <div className="flex items-center gap-4 h-full min-w-0">
          <h1 className="text-[17px] font-bold text-[#242424] tracking-tight truncate">
            {chat.name}
          </h1>

          {!isSelf && (
            <div className="flex items-center gap-4 text-[13px] h-full pt-1">
              <button 
                onClick={() => setSelectedTab('chat')}
                className={`h-full flex items-center px-1 font-semibold transition-colors border-b-[3px] ${
                  selectedTab === 'chat' ? 'border-[#5B5FC7] text-[#242424]' : 'border-transparent text-[#616161] hover:text-[#242424]'
                }`}
              >
                Chat
              </button>
              <button 
                onClick={() => setSelectedTab('files')}
                className={`h-full flex items-center px-1 font-semibold transition-colors border-b-[3px] ${
                  selectedTab === 'files' ? 'border-[#5B5FC7] text-[#242424]' : 'border-transparent text-[#616161] hover:text-[#242424]'
                }`}
              >
                Files
              </button>
              <button 
                onClick={() => setSelectedTab('photos')}
                className={`h-full flex items-center px-1 font-semibold transition-colors border-b-[3px] ${
                  selectedTab === 'photos' ? 'border-[#5B5FC7] text-[#242424]' : 'border-transparent text-[#616161] hover:text-[#242424]'
                }`}
              >
                Photos
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Right Action Icons */}
      <div className="flex items-center gap-1 text-[#424242] shrink-0">
        {!isSelf && (
          <>
            <Tooltip content="Video call" relationship="label">
              <button 
                className="p-1.5 hover:bg-black/5 text-[#5B5FC7] rounded-md transition-colors cursor-pointer"
                aria-label="Video call"
              >
                <VideoRegular fontSize={18} />
              </button>
            </Tooltip>

            <Tooltip content="Audio call" relationship="label">
              <button 
                className="p-1.5 hover:bg-black/5 text-[#5B5FC7] rounded-md transition-colors cursor-pointer"
                aria-label="Audio call"
              >
                <CallRegular fontSize={18} />
              </button>
            </Tooltip>

            <Tooltip content="Add people" relationship="label">
              <button 
                className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer"
                aria-label="Add people"
              >
                <PersonAddRegular fontSize={18} />
              </button>
            </Tooltip>
          </>
        )}

        <Tooltip content="Find in chat" relationship="label">
          <button 
            className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer"
            aria-label="Find in chat"
          >
            <SearchRegular fontSize={18} />
          </button>
        </Tooltip>

        <Tooltip content="More options" relationship="label">
          <button 
            className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer"
            aria-label="More options"
          >
            <MoreHorizontalRegular fontSize={18} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
