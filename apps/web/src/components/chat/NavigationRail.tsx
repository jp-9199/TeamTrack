'use client';

import React from 'react';
import { RailItem } from '../../types/chat';
import { Tooltip, Badge } from '@fluentui/react-components';
import {
  ChatFilled,
  ChatRegular,
  VideoRegular,
  VideoFilled,
  ContactCardRegular,
  PeopleTeamRegular,
  CalendarLtrRegular,
  AlertRegular,
  DiamondRegular,
} from '@fluentui/react-icons';

interface NavigationRailProps {
  activeItem: RailItem;
  onItemSelect: (item: RailItem) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ 
  activeItem, 
  onItemSelect,
}) => {
  return (
    <aside className="w-[56px] bg-[#ECEEF0] flex flex-col items-center py-2 shrink-0 select-none h-full z-20 gap-2">
      {/* 1. Chat */}
      <Tooltip content="Chat" relationship="label">
        <button
          onClick={() => onItemSelect('chat')}
          className={`w-[44px] h-[40px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer ${
            activeItem === 'chat' 
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7]' 
              : 'text-[#323130] hover:bg-black/5'
          }`}
          aria-label="Chat"
        >
          <div className="relative flex items-center justify-center">
            {/* Teams Chat Bubble Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path 
                d="M20 11.5C20 15.6421 16.4183 19 12 19C10.5186 19 9.1278 18.6212 7.93514 17.9626L4.5 19L5.43743 15.9084C4.53676 14.6391 4 13.1257 4 11.5C4 7.35786 7.58172 4 12 4C16.4183 4 20 7.35786 20 11.5Z" 
                fill="#5B5FC7" 
              />
              <line x1="8" y1="10" x2="16" y2="10" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
              <line x1="8" y1="13.5" x2="13.5" y2="13.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="absolute -top-1.5 -right-2 bg-[#D83B01] text-white text-[10px] font-bold rounded-full w-[17px] h-[17px] flex items-center justify-center ring-2 ring-[#ECEEF0] shadow-xs">
              3
            </span>
          </div>
        </button>
      </Tooltip>

      {/* 2. Meet / Video */}
      <Tooltip content="Meet" relationship="label">
        <button
          onClick={() => onItemSelect('calls')}
          className={`w-[44px] h-[40px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer ${
            activeItem === 'calls' 
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7]' 
              : 'text-[#323130] hover:bg-black/5'
          }`}
          aria-label="Meet"
        >
          <VideoRegular fontSize={22} className={activeItem === 'calls' ? 'text-[#5B5FC7]' : 'text-[#323130]'} />
        </button>
      </Tooltip>

      {/* 3. Contacts */}
      <Tooltip content="Contacts" relationship="label">
        <button
          className="w-[44px] h-[40px] flex items-center justify-center text-[#323130] hover:bg-black/5 rounded-lg transition-all cursor-pointer"
          aria-label="Contacts"
        >
          <ContactCardRegular fontSize={22} />
        </button>
      </Tooltip>

      {/* 4. Copilot Ribbon */}
      <Tooltip content="Copilot" relationship="label">
        <button
          className="w-[44px] h-[40px] flex items-center justify-center hover:bg-black/5 rounded-lg transition-all cursor-pointer group"
          aria-label="Copilot"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:scale-105">
            <defs>
              <linearGradient id="copilot-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00A4EF" />
                <stop offset="100%" stopColor="#7FBA00" />
              </linearGradient>
              <linearGradient id="copilot-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F25022" />
                <stop offset="100%" stopColor="#E02460" />
              </linearGradient>
            </defs>
            <rect x="3" y="6" width="11" height="7.5" rx="3.5" fill="url(#copilot-g1)" transform="rotate(-30 8.5 9.5)" />
            <rect x="9.5" y="10.5" width="11" height="7.5" rx="3.5" fill="url(#copilot-g2)" transform="rotate(-30 15 14)" opacity="0.95" />
          </svg>
        </button>
      </Tooltip>

      {/* 5. Teams */}
      <Tooltip content="Teams" relationship="label">
        <button
          onClick={() => onItemSelect('teams')}
          className={`w-[44px] h-[40px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer ${
            activeItem === 'teams' 
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7]' 
              : 'text-[#323130] hover:bg-black/5'
          }`}
          aria-label="Teams"
        >
          <PeopleTeamRegular fontSize={22} className={activeItem === 'teams' ? 'text-[#5B5FC7]' : 'text-[#323130]'} />
        </button>
      </Tooltip>

      {/* 6. Calendar */}
      <Tooltip content="Calendar" relationship="label">
        <button
          onClick={() => onItemSelect('calendar')}
          className={`w-[44px] h-[40px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer ${
            activeItem === 'calendar' 
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7]' 
              : 'text-[#323130] hover:bg-black/5'
          }`}
          aria-label="Calendar"
        >
          <CalendarLtrRegular fontSize={22} className={activeItem === 'calendar' ? 'text-[#5B5FC7]' : 'text-[#323130]'} />
        </button>
      </Tooltip>

      {/* 7. Activity / Bell */}
      <Tooltip content="Activity" relationship="label">
        <button
          onClick={() => onItemSelect('activity')}
          className={`w-[44px] h-[40px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer ${
            activeItem === 'activity' 
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7]' 
              : 'text-[#323130] hover:bg-black/5'
          }`}
          aria-label="Activity"
        >
          <AlertRegular fontSize={22} className={activeItem === 'activity' ? 'text-[#5B5FC7]' : 'text-[#323130]'} />
        </button>
      </Tooltip>

      <div className="flex-1" />

      {/* 8. Apps / Diamond */}
      <Tooltip content="Apps" relationship="label">
        <button 
          className="w-[44px] h-[40px] flex items-center justify-center text-[#323130] hover:bg-black/5 rounded-lg transition-all cursor-pointer mb-1"
          aria-label="Apps"
        >
          <DiamondRegular fontSize={22} />
        </button>
      </Tooltip>
    </aside>
  );
};
