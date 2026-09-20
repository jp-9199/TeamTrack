'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
  Sparkles,
  SlidersHorizontal,
  User,
  LogOut,
  ShieldCheck,
  Bell,
  CheckCircle2,
  Clock,
  MinusCircle,
  CircleDot,
  Radio,
} from 'lucide-react';
import { AppRail } from './AppRail';
import { CommandPalette } from '../common/CommandPalette';
import { useAuth } from '../auth/AuthContext';
import { useNotifications } from '../notifications/NotificationContext';

interface TeamsShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  activeApp?: string;
  headerActions?: React.ReactNode;
  hideSidebar?: boolean;
  mobileView?: 'sidebar' | 'content' | 'both';
}

type PresenceType = 'available' | 'busy' | 'dnd' | 'away' | 'offline';

export const TeamsShell: React.FC<TeamsShellProps> = ({
  children,
  sidebar,
  activeApp,
  headerActions,
  hideSidebar = false,
  mobileView,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceType>('available');
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && !mobileView) {
      setIsSidebarOpen(false);
    }
  }, [mobileView]);

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

  const handleMinimize = () => window.teamtrack?.window.minimize();
  const handleMaximize = async () => {
    if (!window.teamtrack?.window) return;
    await window.teamtrack.window.maximize();
    const max = await window.teamtrack.window.isMaximized();
    setIsMaximized(max);
  };
  const handleClose = () => window.teamtrack?.window.close();

  const userName = user?.displayName || 'Amir Asad Ullah Khan';
  const userEmail = user?.email || 'user@teamtrack.local';
  const orgId = (user as any)?.organizationId || 'default-org';

  const presenceConfig: Record<PresenceType, { label: string; color: string; icon: any }> = {
    available: { label: 'Available', color: 'bg-emerald-500', icon: CheckCircle2 },
    busy: { label: 'Busy (In Calls)', color: 'bg-rose-500', icon: MinusCircle },
    dnd: { label: 'Do Not Disturb', color: 'bg-red-600', icon: MinusCircle },
    away: { label: 'Be Right Back / Away', color: 'bg-amber-500', icon: Clock },
    offline: { label: 'Appear Offline', color: 'bg-slate-400', icon: CircleDot },
  };

  const getBreadcrumbTitle = () => {
    if (pathname?.startsWith('/chat')) return 'Chat';
    if (pathname?.startsWith('/meetings/room')) return 'Meeting Room';
    if (pathname?.startsWith('/meetings')) return 'Meetings';
    if (pathname?.startsWith('/calls') || pathname?.startsWith('/people')) return 'Calls';
    if (pathname?.startsWith('/assistant')) return 'AI Copilot';
    if (pathname?.startsWith('/teams')) return 'Teams & Channels';
    if (pathname?.startsWith('/calendar')) return 'Calendar';
    if (pathname?.startsWith('/files')) return 'Files';
    if (pathname?.startsWith('/notifications')) return 'Activity';
    if (pathname?.startsWith('/search')) return 'Search';
    if (pathname?.startsWith('/settings')) return 'Settings';
    return 'Workspace';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-[#090D16] text-slate-800 dark:text-slate-100 font-sans antialiased overflow-hidden select-none transition-colors">
      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette />

      {/* ── 1. STUDIO TITLE BAR ── */}
      <header
        className="h-[46px] bg-slate-100/90 dark:bg-[#0B1120]/90 backdrop-blur-md flex items-center justify-between px-2 sm:px-3 shrink-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 gap-1 sm:gap-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Sidebar Toggle & Section Name */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {!hideSidebar && sidebar && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-all cursor-pointer shrink-0"
              title={isSidebarOpen ? 'Collapse panel' : 'Expand panel'}
              aria-label="Toggle sidebar panel"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.65} />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-indigo-500" strokeWidth={1.65} />
              )}
            </button>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              <span className="hidden sm:inline">TeamTrack</span>
              <span className="sm:hidden">TeamTrack</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">/</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden lg:inline whitespace-nowrap truncate max-w-[160px]">
              {getBreadcrumbTitle()}
            </span>
          </div>
        </div>

        {/* Center: Interactive Global Command Bar Pill (Ctrl+K) */}
        <div
          className="flex-1 max-w-[460px] mx-1 sm:mx-3 min-w-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
            }}
            className="w-full h-8 px-2 sm:px-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500/60 shadow-xs flex items-center justify-between text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all cursor-pointer group min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0 truncate">
              <Search className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-indigo-500 transition-colors" strokeWidth={1.65} />
              <span className="truncate text-xs">Search chats, files, meetings, or commands...</span>
            </div>
            <kbd className="hidden md:inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 ml-1.5">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: Quick Actions, User Avatar & Window Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {headerActions}

          {/* Quick Instant Drop-in Huddle Button */}
          <button
            onClick={() => router.push(`/meetings/room/huddle-${Date.now().toString(36)}`)}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/50 transition-all cursor-pointer group shrink-0"
            title="Start instant free voice huddle"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-500" strokeWidth={1.8} />
            <span>Drop-in Huddle</span>
          </button>

          {/* Quick AI Copilot Trigger */}
          <button
            onClick={() => router.push('/assistant')}
            className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer shrink-0"
            title="Open AI Copilot"
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.65} />
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => router.push('/notifications')}
            className="p-1.5 relative rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
            title="Activity & Notifications"
          >
            <Bell className="w-4 h-4" strokeWidth={1.65} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* User Presence & Profile Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-1.5 p-1 rounded-full hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer focus:outline-none"
            >
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {userName[0].toUpperCase()}
                </div>
                {/* Active presence status dot */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-100 dark:border-[#0B1120] ${presenceConfig[presence].color}`}
                />
              </div>
            </button>

            {/* Profile Flyout Menu */}
            {isProfileMenuOpen && (
              <div
                className="absolute right-0 top-10 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 animate-scale-in text-xs"
                onMouseLeave={() => setIsProfileMenuOpen(false)}
              >
                {/* Profile Header */}
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{userName}</p>
                  <p className="text-slate-400 text-[11px] truncate">{userEmail}</p>
                </div>

                {/* Presence Status Selector */}
                <div className="py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Presence Status
                  </p>
                  {(Object.keys(presenceConfig) as PresenceType[]).map((pKey) => {
                    const cfg = presenceConfig[pKey];
                    const isSelected = presence === pKey;
                    return (
                      <button
                        key={pKey}
                        onClick={() => {
                          setPresence(pKey);
                          setIsProfileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Account Links */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      router.push('/settings');
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.65} />
                    <span>Settings & Preferences</span>
                  </button>

                  <button
                    onClick={() => {
                      router.push(`/organization/${orgId}/settings`);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.65} />
                    <span>Organization Governance</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      if (logout) logout();
                      else router.push('/login');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.65} />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Native Window Controls for Electron */}
          {isElectron && (
            <div className="flex items-center h-[46px] ml-2 -mr-3 border-l border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleMinimize}
                className="w-10 h-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 transition-colors"
                title="Minimize"
              >
                <span className="w-2.5 h-[1.5px] bg-currentColor" />
              </button>
              <button
                type="button"
                onClick={handleMaximize}
                className="w-10 h-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 transition-colors"
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                <span className="w-2.5 h-2.5 border border-currentColor" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-10 h-full flex items-center justify-center hover:bg-rose-600 hover:text-white text-slate-500 transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── 2. STUDIO WORKSPACE BODY ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left App Dock */}
        <AppRail activeAppOverride={activeApp} />

        {/* Collapsible Secondary Sidebar (Channels, Chats, History, Filters) */}
        {!hideSidebar && sidebar && (
          <aside
            className={`transition-all duration-200 ease-in-out h-full overflow-hidden shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-[#0B1120]/95 ${
              isSidebarOpen ? 'w-full md:w-[310px] opacity-100' : 'w-0 opacity-0 pointer-events-none border-r-0'
            } ${
              mobileView === 'content' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="w-full md:w-[310px] h-full overflow-hidden flex flex-col">
              {sidebar}
            </div>
          </aside>
        )}

        {/* Primary Stage / Interactive Canvas */}
        <main
          className={`flex-1 min-w-0 h-full overflow-hidden relative bg-white dark:bg-[#090D16] flex flex-col transition-colors ${
            mobileView === 'sidebar' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
