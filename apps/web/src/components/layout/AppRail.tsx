'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tooltip } from '@fluentui/react-components';
import {
  ChatRegular,
  ChatFilled,
  VideoRegular,
  VideoFilled,
  BookContactsRegular,
  BookContactsFilled,
  PeopleCommunityRegular,
  PeopleCommunityFilled,
  CalendarMonthRegular,
  CalendarMonthFilled,
  AlertRegular,
  AlertFilled,
} from '@fluentui/react-icons';
import { useNotifications } from '../notifications/NotificationContext';

/* ── 1. Custom Modern TeamTrack 3D Inset Logo ── */
export const TeamTrackLogo: React.FC<{ size?: number; className?: string }> = ({
  size = 30,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Background Badge Gradient: Deep Royal Indigo to Teams Violet */}
      <linearGradient id="tt-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4338CA" />
        <stop offset="45%" stopColor="#5B5FC7" />
        <stop offset="100%" stopColor="#7B83EB" />
      </linearGradient>

      {/* Dynamic Velocity Track Gradient (Cyan to Electric Magenta) */}
      <linearGradient id="tt-track-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="50%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#C084FC" />
      </linearGradient>

      {/* Primary T Element Specular Gradient */}
      <linearGradient id="tt-t-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#EEF2FF" />
      </linearGradient>

      <filter id="tt-shadow" x="-1" y="0" width="34" height="34" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#1E1B4B" floodOpacity="0.35" />
      </filter>
    </defs>

    {/* Squircle Badge Base */}
    <rect
      x="1.5"
      y="1.5"
      width="29"
      height="29"
      rx="8"
      fill="url(#tt-bg-grad)"
      filter="url(#tt-shadow)"
    />

    {/* Subtle Inner Glass Specular Edge */}
    <rect
      x="2"
      y="2"
      width="28"
      height="28"
      rx="7.5"
      stroke="#FFFFFF"
      strokeOpacity="0.25"
      strokeWidth="1"
      fill="none"
    />

    {/* Dynamic Forward Velocity "Track" Arc in the background */}
    <path
      d="M10 24C6.5 21.5 5.5 16.5 7.5 12C9.5 7.5 14.5 5 19 6.5C20.5 7 21.5 7.8 22.5 8.8"
      stroke="url(#tt-track-grad)"
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.9"
    />

    {/* Forward Velocity Tracking Chevron */}
    <path
      d="M20.5 22.5L24.5 18.5L20.5 14.5"
      stroke="url(#tt-track-grad)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.85"
    />

    {/* Bold Modern Stylized 'T' Symbol in Forefront */}
    <path
      d="M9 10C9 9.45 9.45 9 10 9H20C20.55 9 21 9.45 21 10C21 10.55 20.55 11 20 11H16.2V21C16.2 21.55 15.75 22 15.2 22C14.65 22 14.2 21.55 14.2 21V11H10C9.45 11 9 10.55 9 10Z"
      fill="url(#tt-t-grad)"
    />

    {/* Pulse Signal Dot at the telemetry apex */}
    <circle cx="23.5" cy="8.5" r="1.8" fill="#38BDF8" />
  </svg>
);

/* ── 2. Unique Futuristic Generative AI / Copilot Icon ── */
export const UniqueAiIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Primary Neural Gradient: Cyan -> Electric Violet -> Magenta */}
      <linearGradient id="ai-lumina-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00F2FE" />
        <stop offset="35%" stopColor="#6366F1" />
        <stop offset="75%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#EC4899" />
      </linearGradient>

      {/* Satellite Sparkle Gradient 1: Amber to Coral */}
      <linearGradient id="ai-sat-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#EF4444" />
      </linearGradient>

      {/* Satellite Sparkle Gradient 2: Emerald to Cyan */}
      <linearGradient id="ai-sat-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#06B6D4" />
      </linearGradient>

      {/* Radiant Glow Filter */}
      <filter id="ai-glow" x="-2" y="-2" width="28" height="28" filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation="0.6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Primary Generative AI Star with curved bezier vertices */}
    <path
      d="M12 2C12.3 6.8 15.2 9.7 20 10C15.2 10.3 12.3 13.2 12 18C11.7 13.2 8.8 10.3 4 10C8.8 9.7 11.7 6.8 12 2Z"
      fill="url(#ai-lumina-grad)"
      filter="url(#ai-glow)"
    />

    {/* Inner Core Shimmer Star */}
    <path
      d="M12 6C12.15 8.4 13.6 9.85 16 10C13.6 10.15 12.15 11.6 12 14C11.85 11.6 10.4 10.15 8 10C10.4 9.85 11.85 8.4 12 6Z"
      fill="#FFFFFF"
      fillOpacity="0.88"
    />

    {/* Top-Right Secondary Spark (Generative thought satellite) */}
    <path
      d="M19 2.5C19.15 4.1 20.1 4.9 21.5 5C20.1 5.1 19.15 5.9 19 7.5C18.85 5.9 17.9 5.1 16.5 5C17.9 4.9 18.85 4.1 19 2.5Z"
      fill="url(#ai-sat-grad-1)"
    />

    {/* Bottom-Left Tertiary Micro-Spark (Context memory satellite) */}
    <path
      d="M5 16.5C5.1 17.8 5.9 18.4 7 18.5C5.9 18.6 5.1 19.2 5 20.5C4.9 19.2 4.1 18.6 3 18.5C4.1 18.4 4.9 17.8 5 16.5Z"
      fill="url(#ai-sat-grad-2)"
    />
  </svg>
);

interface AppRailProps {
  activeAppOverride?: string;
  onAppSelect?: (appId: string) => void;
}

export const AppRail: React.FC<AppRailProps> = ({ activeAppOverride, onAppSelect }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount: notifUnreadCount } = useNotifications();

  // Derive active app from pathname if not explicitly overridden
  const activeApp = activeAppOverride || (() => {
    if (pathname?.startsWith('/chat')) return 'chat';
    if (pathname?.startsWith('/meetings')) return 'meet';
    if (pathname?.startsWith('/calls') || pathname?.startsWith('/people')) return 'people';
    if (pathname?.startsWith('/assistant')) return 'copilot';
    if (pathname?.startsWith('/teams')) return 'teams';
    if (pathname?.startsWith('/calendar')) return 'calendar';
    if (pathname?.startsWith('/notifications')) return 'activity';
    if (pathname === '/') return 'chat';
    return '';
  })();

  const handleAppClick = (appId: string, href?: string) => {
    if (onAppSelect) {
      onAppSelect(appId);
    }
    if (href) {
      router.push(href);
    }
  };

  /* ── Core Navigation Items ── */
  const railItems = [
    {
      id: 'chat',
      label: 'Chat',
      href: '/chat',
      iconRegular: <ChatRegular fontSize={24} />,
      iconFilled: <ChatFilled fontSize={24} className="text-[#5B5FC7]" />,
      badgeCount: 1,
    },
    {
      id: 'meet',
      label: 'Meet',
      href: '/meetings',
      iconRegular: <VideoRegular fontSize={24} />,
      iconFilled: <VideoFilled fontSize={24} className="text-[#5B5FC7]" />,
    },
    {
      id: 'people',
      label: 'People',
      href: '/calls',
      iconRegular: <BookContactsRegular fontSize={24} />,
      iconFilled: <BookContactsFilled fontSize={24} className="text-[#5B5FC7]" />,
    },
    {
      id: 'copilot',
      label: 'AI Assistant',
      href: '/assistant',
      customIcon: <UniqueAiIcon size={24} />,
    },
    {
      id: 'teams',
      label: 'Communities',
      href: '/teams',
      iconRegular: <PeopleCommunityRegular fontSize={24} />,
      iconFilled: <PeopleCommunityFilled fontSize={24} className="text-[#5B5FC7]" />,
    },
    {
      id: 'calendar',
      label: 'Calendar',
      href: '/calendar',
      iconRegular: <CalendarMonthRegular fontSize={24} />,
      iconFilled: <CalendarMonthFilled fontSize={24} className="text-[#5B5FC7]" />,
    },
    {
      id: 'activity',
      label: 'Activity',
      href: '/notifications',
      iconRegular: <AlertRegular fontSize={24} />,
      iconFilled: <AlertFilled fontSize={24} className="text-[#5B5FC7]" />,
      badgeCount: notifUnreadCount > 0 ? notifUnreadCount : undefined,
    },
  ];

  useEffect(() => {
    // Prefetch all app rail routes on mount so tab switching is instantaneous
    railItems.forEach((item) => {
      if (item.href) {
        router.prefetch(item.href);
      }
    });
    router.prefetch('/settings');
  }, [router]);

  return (
    <nav
      role="navigation"
      aria-label="App rail"
      className="w-[50px] bg-[#ECEEF0] flex flex-col items-center py-2.5 shrink-0 select-none h-full z-30 border-r border-[#E1DFDD]/70 font-sans"
    >
      {/* ── 1. Custom TeamTrack Modern 3D Logo (Top Header) ── */}
      <Tooltip content="TeamTrack Home" relationship="label" positioning="after">
        <button
          onClick={() => handleAppClick('chat', '/chat')}
          onMouseEnter={() => router.prefetch('/chat')}
          className="w-[38px] h-[38px] flex items-center justify-center rounded-lg hover:bg-black/5 active:scale-95 transition-all cursor-pointer mb-2.5 focus:outline-none focus:ring-2 focus:ring-[#5B5FC7]"
          aria-label="TeamTrack Home"
        >
          <TeamTrackLogo size={30} />
        </button>
      </Tooltip>

      {/* ── 2. App Navigation Icons (Chat, Meet, People, AI, Teams, Calendar, Activity) ── */}
      <div className="flex flex-col items-center gap-2 w-full">
        {railItems.map((item) => {
          const isActive = activeApp === item.id;

          return (
            <Tooltip key={item.id} content={item.label} relationship="label" positioning="after">
              <button
                onClick={() => handleAppClick(item.id, item.href)}
                onMouseEnter={() => item.href && router.prefetch(item.href)}
                className={`w-[38px] h-[38px] flex items-center justify-center relative rounded-lg transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#5B5FC7] ${
                  isActive
                    ? 'bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-[#5B5FC7]'
                    : 'text-[#242424] hover:bg-black/5 hover:text-[#111111]'
                }`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Native active left indicator bar */}
                {isActive && (
                  <span className="absolute -left-[6px] top-1.5 bottom-1.5 w-[3px] bg-[#5B5FC7] rounded-r-md" />
                )}

                <div className="relative flex items-center justify-center">
                  {item.customIcon ? (
                    <div className="transition-transform group-hover:scale-110 group-active:scale-95">
                      {item.customIcon}
                    </div>
                  ) : isActive ? (
                    item.iconFilled
                  ) : (
                    item.iconRegular
                  )}

                  {/* Red/Orange Notification Badge */}
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-[#C4314B] text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center shadow-xs select-none border-2 border-[#ECEEF0] leading-none">
                      {item.badgeCount}
                    </span>
                  )}
                </div>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
};
