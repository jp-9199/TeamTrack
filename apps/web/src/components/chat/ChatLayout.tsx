'use client';

import React from 'react';
import Link from 'next/link';
import { Avatar, Tooltip } from '@fluentui/react-components';
import { SearchRegular, MoreHorizontalRegular, PanelLeftRegular } from '@fluentui/react-icons';
import { useAuth } from '../auth/AuthContext';

interface ChatLayoutProps {
  navigationRail: React.ReactNode;
  sidebar: React.ReactNode;
  mainPanel: React.ReactNode;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({ 
  navigationRail, 
  sidebar, 
  mainPanel,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const { user } = useAuth();
  const userName = user?.displayName || 'Amir Asad Ullah Khan';
  const userInitials = userName.split(' ')[0] || 'Amir';

  return (
    <div className="flex flex-col h-screen w-screen bg-[#ECEEF0] overflow-hidden text-[#242424] font-sans">
      {/* ── 1. TOP WINDOW TITLE BAR (Exact Microsoft Teams Layout) ── */}
      <header className="h-[44px] bg-[#ECEEF0] flex items-center justify-between px-3 shrink-0 z-50 select-none">
        {/* Left: App Logo + Sidebar Toggle button right beside it */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[28px] h-[28px] rounded-lg bg-[#5B5FC7] flex items-center justify-center font-bold text-white shadow-xs">
            <span className="text-[14px] font-semibold tracking-tight">T</span>
          </div>

          <Tooltip content={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"} relationship="label">
            <button
              onClick={onToggleSidebar}
              className="w-[30px] h-[30px] flex items-center justify-center text-[#424242] hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer"
              aria-label="Toggle sidebar"
            >
              <PanelLeftRegular fontSize={18} />
            </button>
          </Tooltip>
        </div>

        {/* Center: Clean Search Bar with "Search" placeholder */}
        <div className="flex-1 max-w-[520px] relative flex items-center justify-center">
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#616161] pointer-events-none flex items-center">
              <SearchRegular fontSize={15} />
            </span>
            <input
              type="text"
              placeholder="Search"
              className="w-full h-[32px] pl-9 pr-3 rounded-lg border border-[#D1D5DB] bg-white text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:border-[#5B5FC7] focus:ring-1 focus:ring-[#5B5FC7] transition-all placeholder-[#707070]"
            />
          </div>
        </div>

        {/* Right: 3 Dots + User Avatar with Green Presence Checkmark */}
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip content="Settings and more" relationship="label">
            <button 
              className="text-[#616161] hover:bg-black/5 hover:text-[#242424] p-1.5 rounded-md transition-colors cursor-pointer"
              aria-label="Settings and more"
            >
              <MoreHorizontalRegular fontSize={18} />
            </button>
          </Tooltip>

          <Tooltip content={`${userName} (Available)`} relationship="label">
            <Link href="/settings/profile" className="inline-block relative">
              <div className="w-[30px] h-[30px] rounded-full bg-[#111827] text-white flex items-center justify-center text-[11px] font-semibold shadow-xs">
                {userInitials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#107C10] border-2 border-white flex items-center justify-center shadow-xs">
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          </Tooltip>
        </div>
      </header>

      {/* ── 2. MAIN APP CONTENT CONTAINER ───────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {navigationRail}
        {isSidebarOpen && sidebar}
        {mainPanel}
      </div>
    </div>
  );
};
