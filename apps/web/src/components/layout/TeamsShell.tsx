'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  Button,
  Input,
  Avatar,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
} from '@fluentui/react-components';
import {
  SearchRegular,
  MoreHorizontalRegular,
  PanelLeftRegular,
  PanelLeftFilled,
  PersonRegular,
  SettingsRegular,
  SignOutRegular,
} from '@fluentui/react-icons';
import { AppRail } from './AppRail';
import { useAuth } from '../auth/AuthContext';

interface TeamsShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  activeApp?: string;
  headerActions?: React.ReactNode;
  hideSidebar?: boolean;
}

export const TeamsShell: React.FC<TeamsShellProps> = ({
  children,
  sidebar,
  activeApp,
  headerActions,
  hideSidebar = false,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.teamtrack?.window) {
      setIsElectron(true);
      const winBridge = window.teamtrack.window;
      winBridge.isMaximized().then(setIsMaximized).catch(() => {});
      if (typeof winBridge.onMaximizedChange === 'function') {
        const cleanup = winBridge.onMaximizedChange((max) => {
          setIsMaximized(max);
        });
        return cleanup;
      }
    }
  }, []);

  const handleMinimize = () => {
    window.teamtrack?.window.minimize();
  };

  const handleMaximize = async () => {
    if (!window.teamtrack?.window) return;
    await window.teamtrack.window.maximize();
    const max = await window.teamtrack.window.isMaximized();
    setIsMaximized(max);
  };

  const handleClose = () => {
    window.teamtrack?.window.close();
  };

  const userName = user?.displayName || 'Amir Asad Ullah Khan';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#ECEEF0] overflow-hidden text-[#242424] font-sans antialiased">
      {/* ── 1. NATIVE MICROSOFT TEAMS TOP TITLE BAR ── */}
      <header
        className="h-[48px] bg-[#ECEEF0] flex items-center justify-between px-3 shrink-0 z-40 select-none border-b border-[#E1DFDD]/70"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Secondary Sidebar Toggle & Brand Title */}
        <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {!hideSidebar && sidebar && (
            <Tooltip content={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={isSidebarOpen ? <PanelLeftRegular fontSize={18} /> : <PanelLeftFilled fontSize={18} className="text-[#5B5FC7]" />}
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                aria-label="Toggle secondary sidebar"
              />
            </Tooltip>
          )}
          <span className="text-[13px] font-bold tracking-tight text-[#242424] select-none">
            TeamTrack
          </span>
        </div>

        {/* Center: Global Fluent UI Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex-1 max-w-[540px] flex items-center justify-center mx-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-full">
            <Input
              value={searchQuery}
              onChange={(_, data) => setSearchQuery(data.value)}
              contentBefore={<SearchRegular fontSize={16} className="text-[#616161]" />}
              contentAfter={
                <span className="text-[10px] text-[#8A8886] font-semibold border border-[#E1DFDD] rounded px-1.5 py-0.5 bg-[#FAF9F8] hidden md:inline select-none">
                  Ctrl+E
                </span>
              }
              placeholder="Search people, messages, and files (Ctrl+E)"
              style={{ width: '100%' }}
              size="medium"
            />
          </div>
        </form>

        {/* Right Action Icons, User Avatar & Native Window Controls */}
        <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {headerActions}

          <Tooltip content="Settings and more" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<MoreHorizontalRegular fontSize={18} />}
              onClick={() => router.push('/settings')}
              aria-label="Settings and more"
            />
          </Tooltip>

          {/* User Profile & Account Menu */}
          <Menu positioning={{ position: 'below', align: 'end' }}>
            <MenuTrigger disableButtonEnhancement>
              <button
                className="rounded-full p-0.5 hover:ring-2 hover:ring-[#5B5FC7] transition-all cursor-pointer focus:outline-none"
                aria-label={`${userName} account settings`}
              >
                <Avatar
                  name={userName}
                  size={28}
                  color="colorful"
                  badge={{ status: 'available' }}
                />
              </button>
            </MenuTrigger>
            <MenuPopover className="z-50 min-w-[220px]">
              <MenuList>
                <div className="px-3 py-2 border-b border-[#EDEBE9]">
                  <p className="text-[13px] font-semibold text-[#242424] truncate">{userName}</p>
                  <p className="text-[11px] text-[#616161] truncate">{user?.email || 'user@teamtrack.local'}</p>
                </div>
                <MenuItem icon={<PersonRegular fontSize={16} />} onClick={() => router.push('/settings/profile')}>
                  My profile
                </MenuItem>
                <MenuItem icon={<SettingsRegular fontSize={16} />} onClick={() => router.push('/settings')}>
                  Settings
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={<SignOutRegular fontSize={16} />} onClick={() => logout ? logout() : router.push('/login')}>
                  Sign out
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>

          {/* Native Windows Window Controls (Rendered when inside Electron) */}
          {isElectron && (
            <div className="flex items-center h-[48px] ml-2 -mr-3 border-l border-[#E1DFDD]/70">
              <button
                type="button"
                onClick={handleMinimize}
                className="w-[44px] h-full flex items-center justify-center hover:bg-black/5 text-[#424242] transition-colors focus:outline-none"
                title="Minimize"
                aria-label="Minimize"
              >
                <svg viewBox="0 0 10 1" width="10" height="1">
                  <rect width="10" height="1" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleMaximize}
                className="w-[44px] h-full flex items-center justify-center hover:bg-black/5 text-[#424242] transition-colors focus:outline-none"
                title={isMaximized ? 'Restore' : 'Maximize'}
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? (
                  <svg viewBox="0 0 10 10" width="10" height="10">
                    <path d="M2.5 0.5h6v6h-1v-5h-5z" fill="currentColor" />
                    <rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 10 10" width="10" height="10">
                    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-[44px] h-full flex items-center justify-center hover:bg-[#C42B1C] hover:text-white text-[#424242] transition-colors focus:outline-none"
                title="Close"
                aria-label="Close"
              >
                <svg viewBox="0 0 10 10" width="10" height="10">
                  <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── 2. STANDARDIZED 3-PANE WORKSPACE BODY ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Pane 1: Persistent Left App Rail */}
        <AppRail activeAppOverride={activeApp} />

        {/* Pane 2: Collapsible Dynamic Secondary Sidebar */}
        {!hideSidebar && sidebar && (
          <div
            className={`transition-all duration-200 ease-in-out h-full overflow-hidden shrink-0 border-r border-[#E1DFDD]/60 bg-[#ECEEF0] ${
              isSidebarOpen ? 'w-[300px] opacity-100' : 'w-0 opacity-0 pointer-events-none border-r-0'
            }`}
          >
            <div className="w-[300px] h-full overflow-hidden">
              {sidebar}
            </div>
          </div>
        )}

        {/* Pane 3: Responsive Stage Area / Active Canvas */}
        <main className="flex-1 h-full overflow-hidden relative bg-white flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};
