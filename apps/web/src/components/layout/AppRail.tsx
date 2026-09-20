'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookContacts24Regular,
  BookContacts24Filled,
  PeopleTeam24Regular,
  PeopleTeam24Filled,
  CalendarLtr24Regular,
  CalendarLtr24Filled,
  Alert24Regular,
  Alert24Filled,
  Folder24Regular,
  Folder24Filled,
  Settings24Regular,
  Settings24Filled,
  Search24Regular,
  WeatherSunny24Regular,
  WeatherMoon24Regular,
} from '@fluentui/react-icons';
import { useNotifications } from '../notifications/NotificationContext';

/* ── 1. Official MS Teams Chat Icon (Violet Gradient Speech Bubble with 2 White Lines) ── */
export const OfficialTeamsChatIcon: React.FC<{ active?: boolean; size?: number; className?: string }> = ({
  size = 24,
  className = '',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="ms-chat-grad-rail" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8288F4" />
        <stop offset="100%" stopColor="#5E63C8" />
      </linearGradient>
    </defs>
    {/* Rounded speech bubble with tail */}
    <path
      d="M12 2.5C6.75 2.5 2.5 6.75 2.5 12c0 2.05.65 3.95 1.76 5.51L3.1 21.05a.7.7 0 0 0 .85.85l3.54-1.16A9.45 9.45 0 0 0 12 21.5c5.25 0 9.5-4.25 9.5-9.5S17.25 2.5 12 2.5z"
      fill="url(#ms-chat-grad-rail)"
    />
    {/* Two horizontal white lines */}
    <line x1="7.8" y1="10" x2="16.2" y2="10" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="7.8" y1="14" x2="13.2" y2="14" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/* ── 2. Official MS Teams Meet Icon (Violet Gradient Video Camera) ── */
export const OfficialTeamsMeetIcon: React.FC<{ active?: boolean; size?: number; className?: string }> = ({
  size = 24,
  className = '',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="ms-meet-grad-rail" x1="12" y1="5" x2="12" y2="19" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8288F4" />
        <stop offset="100%" stopColor="#5E63C8" />
      </linearGradient>
    </defs>
    {/* Rounded Camera Body */}
    <rect x="2.5" y="6" width="13" height="12" rx="3.5" fill="url(#ms-meet-grad-rail)" />
    {/* Camera Lens */}
    <path
      d="M16 10l4.5-3.15A1 1 0 0 1 22 7.68v8.64a1 1 0 0 1-1.5.83L16 14v-4z"
      fill="url(#ms-meet-grad-rail)"
    />
  </svg>
);

/* ── 3. Official Microsoft Copilot Ribbon Icon ── */
export const OfficialCopilotRibbonIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className = '',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="copilot-ribbon-cyan-green" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#00A4EF" />
        <stop offset="100%" stopColor="#8CBD18" />
      </linearGradient>
      <linearGradient id="copilot-ribbon-magenta-orange" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#E02460" />
        <stop offset="50%" stopColor="#F25022" />
        <stop offset="100%" stopColor="#FFB900" />
      </linearGradient>
    </defs>
    {/* Left Loop: Cyan -> Green */}
    <rect
      x="4"
      y="5"
      width="10.8"
      height="7.5"
      rx="3.75"
      fill="url(#copilot-ribbon-cyan-green)"
      transform="rotate(-28 9.4 8.75)"
    />
    {/* Right Loop: Magenta -> Orange */}
    <rect
      x="9.2"
      y="11.2"
      width="10.8"
      height="7.5"
      rx="3.75"
      fill="url(#copilot-ribbon-magenta-orange)"
      transform="rotate(-28 14.6 14.95)"
      opacity="0.96"
    />
  </svg>
);

/* ── Official MS Teams Brand Emblem ── */
export const OfficialTeamsLogo: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = '',
}) => (
  <div
    style={{ width: size, height: size }}
    className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-[#464775] via-[#5B5FC7] to-[#7B83EB] shadow-md shadow-indigo-600/20 select-none overflow-hidden ${className}`}
  >
    <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
      {/* People background layer */}
      <path
        d="M17.5 7a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM17.5 13.5c1.93 0 3.5 1.12 3.5 2.5v1.25a.75.75 0 0 1-.75.75H14a3.8 3.8 0 0 1 3.5-4.5z"
        fill="#9299F7"
        opacity="0.9"
      />
      {/* Front primary rounded badge */}
      <rect x="2" y="4.5" width="13" height="15" rx="3.5" fill="#4F52B2" />
      {/* White Bold 'T' */}
      <path
        d="M5 8h7v2.2H9.6v5.8H7.4v-5.8H5V8z"
        fill="#FFFFFF"
      />
    </svg>
  </div>
);

// Backward compatibility export
export const StudioLogo = OfficialTeamsLogo;

interface AppRailProps {
  activeAppOverride?: string;
  onAppSelect?: (appId: string) => void;
}

export const AppRail: React.FC<AppRailProps> = ({ activeAppOverride, onAppSelect }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDark(document.documentElement.classList.contains('dark'));
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const activeApp = activeAppOverride || (() => {
    if (pathname?.startsWith('/chat')) return 'chat';
    if (pathname?.startsWith('/meetings')) return 'meet';
    if (pathname?.startsWith('/calls') || pathname?.startsWith('/people')) return 'people';
    if (pathname?.startsWith('/assistant')) return 'copilot';
    if (pathname?.startsWith('/teams')) return 'teams';
    if (pathname?.startsWith('/calendar')) return 'calendar';
    if (pathname?.startsWith('/notifications')) return 'activity';
    if (pathname?.startsWith('/files')) return 'files';
    if (pathname?.startsWith('/settings')) return 'settings';
    if (pathname === '/') return 'chat';
    return '';
  })();

  const handleAppClick = (appId: string, href?: string) => {
    if (onAppSelect) onAppSelect(appId);
    if (href) router.push(href);
  };

  /* ── Exact Official MS Teams App Rail Sequence (matching official client) ── */
  const railItems = [
    {
      id: 'chat',
      label: 'Chat',
      href: '/chat',
      renderIcon: (active: boolean) => <OfficialTeamsChatIcon active={active} size={24} />,
      badgeCount: 1,
    },
    {
      id: 'meet',
      label: 'Meet',
      href: '/meetings',
      renderIcon: (active: boolean) => <OfficialTeamsMeetIcon active={active} size={24} />,
    },
    {
      id: 'people',
      label: 'Contacts',
      href: '/calls',
      renderIcon: (active: boolean) =>
        active ? (
          <BookContacts24Filled className="w-6 h-6 text-[#5B5FC7] dark:text-[#7F85F5]" />
        ) : (
          <BookContacts24Regular className="w-6 h-6 text-[#323130] dark:text-[#D1D1D1]" />
        ),
    },
    {
      id: 'copilot',
      label: 'Copilot',
      href: '/assistant',
      renderIcon: (_active: boolean) => <OfficialCopilotRibbonIcon size={24} />,
    },
    {
      id: 'teams',
      label: 'Teams',
      href: '/teams',
      renderIcon: (active: boolean) =>
        active ? (
          <PeopleTeam24Filled className="w-6 h-6 text-[#5B5FC7] dark:text-[#7F85F5]" />
        ) : (
          <PeopleTeam24Regular className="w-6 h-6 text-[#323130] dark:text-[#D1D1D1]" />
        ),
    },
    {
      id: 'calendar',
      label: 'Calendar',
      href: '/calendar',
      renderIcon: (active: boolean) =>
        active ? (
          <CalendarLtr24Filled className="w-6 h-6 text-[#5B5FC7] dark:text-[#7F85F5]" />
        ) : (
          <CalendarLtr24Regular className="w-6 h-6 text-[#323130] dark:text-[#D1D1D1]" />
        ),
    },
    {
      id: 'activity',
      label: 'Activity',
      href: '/notifications',
      renderIcon: (active: boolean) =>
        active ? (
          <Alert24Filled className="w-6 h-6 text-[#5B5FC7] dark:text-[#7F85F5]" />
        ) : (
          <Alert24Regular className="w-6 h-6 text-[#323130] dark:text-[#D1D1D1]" />
        ),
      badgeCount: notifUnreadCount > 0 ? notifUnreadCount : undefined,
    },
    {
      id: 'files',
      label: 'Files',
      href: '/files',
      renderIcon: (active: boolean) =>
        active ? (
          <Folder24Filled className="w-6 h-6 text-[#5B5FC7] dark:text-[#7F85F5]" />
        ) : (
          <Folder24Regular className="w-6 h-6 text-[#323130] dark:text-[#D1D1D1]" />
        ),
    },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Teams app rail"
      className="w-[50px] sm:w-[58px] bg-[#ECEEF0] dark:bg-[#1B1B1B] flex flex-col items-center justify-between py-2 shrink-0 select-none h-full z-30 border-r border-[#E0E0E0] dark:border-[#2D2D2D] transition-colors"
    >
      {/* ── Top Section: Official Teams Emblem & Navigation Icons ── */}
      <div className="flex flex-col items-center w-full gap-1">
        {/* Teams Brand Emblem */}
        <button
          onClick={() => handleAppClick('chat', '/chat')}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:scale-105 active:scale-95 transition-transform cursor-pointer mb-1 focus:outline-none"
          title="Microsoft Teams"
          aria-label="Microsoft Teams Home"
        >
          <OfficialTeamsLogo size={32} />
        </button>

        {/* Official Teams App Rail Items */}
        <div className="flex flex-col items-center gap-1 w-full px-1.5">
          {railItems.map((item) => {
            const isActive = activeApp === item.id;

            return (
              <div key={item.id} className="relative group w-full flex justify-center">
                {/* Active Left Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3.5px] h-4.5 rounded-r bg-[#5B5FC7] dark:bg-[#7F85F5] z-10" />
                )}

                <button
                  onClick={() => handleAppClick(item.id, item.href)}
                  className={`w-11 h-10 flex items-center justify-center relative rounded-lg transition-all duration-150 cursor-pointer focus:outline-none ${
                    isActive
                      ? 'bg-white dark:bg-[#2B2B2B] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="transition-transform group-hover:scale-105 group-active:scale-95 flex items-center justify-center">
                    {item.renderIcon(isActive)}
                  </div>

                  {/* Badge Notification */}
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#D83B01] text-white text-[9px] font-extrabold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center shadow-xs border-2 border-[#ECEEF0] dark:border-[#1B1B1B] leading-none">
                      {item.badgeCount}
                    </span>
                  )}
                </button>

                {/* Fluent Tooltip */}
                <div className="absolute left-[54px] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#242424] text-white text-xs font-semibold rounded shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#242424]" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Section: Search, Theme Toggle, Settings ── */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5 pt-2 border-t border-[#E0E0E0] dark:border-[#2D2D2D]">
        {/* Command Search (Ctrl+K) */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
            }}
            className="w-11 h-10 flex items-center justify-center rounded-lg text-[#424242] dark:text-[#D1D1D1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Command Palette (Ctrl+K)"
          >
            <Search24Regular className="w-5 h-5" />
          </button>
          <div className="absolute left-[54px] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#242424] text-white text-xs font-semibold rounded shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
            Search &amp; Commands (Ctrl+K)
          </div>
        </div>

        {/* Theme Switcher */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={toggleTheme}
            className="w-11 h-10 flex items-center justify-center rounded-lg text-[#424242] dark:text-[#D1D1D1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Toggle Dark/Light mode"
          >
            {isDark ? (
              <WeatherSunny24Regular className="w-5 h-5 text-amber-500" />
            ) : (
              <WeatherMoon24Regular className="w-5 h-5 text-[#5B5FC7]" />
            )}
          </button>
          <div className="absolute left-[54px] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#242424] text-white text-xs font-semibold rounded shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
            {isDark ? 'Light Theme' : 'Dark Theme'}
          </div>
        </div>

        {/* Settings */}
        <div className="relative group w-full flex justify-center">
          {activeApp === 'settings' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3.5px] h-4.5 rounded-r bg-[#5B5FC7] dark:bg-[#7F85F5] z-10" />
          )}
          <button
            onClick={() => handleAppClick('settings', '/settings')}
            className={`w-11 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              activeApp === 'settings'
                ? 'bg-white dark:bg-[#2B2B2B] shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#5B5FC7] dark:text-[#7F85F5]'
                : 'text-[#424242] dark:text-[#D1D1D1] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            aria-label="Settings"
          >
            {activeApp === 'settings' ? (
              <Settings24Filled className="w-5 h-5 text-[#5B5FC7] dark:text-[#7F85F5]" />
            ) : (
              <Settings24Regular className="w-5 h-5 text-[#424242] dark:text-[#D1D1D1]" />
            )}
          </button>
          <div className="absolute left-[54px] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#242424] text-white text-xs font-semibold rounded shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
            Settings &amp; Security
          </div>
        </div>
      </div>
    </nav>
  );
};
