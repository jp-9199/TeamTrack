'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  MessagesSquare,
  Video,
  Sparkles,
  FileBox,
  CalendarDays,
  Layers,
  SlidersHorizontal,
  Moon,
  Sun,
  X,
  ArrowRight,
  Zap,
  Radio,
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: 'Actions' | 'Navigation' | 'Results';
  action: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync dark mode state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDarkMode = document.documentElement.classList.contains('dark') ||
        localStorage.getItem('theme') === 'dark';
      setIsDark(isDarkMode);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      }
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
    setIsOpen(false);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const baseItems: CommandItem[] = [
    {
      id: 'action-meet',
      title: 'Start Instant Voice Huddle / Video Call',
      subtitle: 'Unlimited HD room with free AI live captions',
      category: 'Actions',
      icon: <Radio className="w-4 h-4 text-emerald-500 animate-pulse" strokeWidth={1.8} />,
      action: () => {
        router.push(`/meetings/room/studio-${Date.now().toString(36)}`);
        setIsOpen(false);
      },
    },
    {
      id: 'action-copilot',
      title: 'Ask AI Copilot Assistant',
      subtitle: 'Unlimited Pro Edition • Summarize, draft & search',
      category: 'Actions',
      icon: <Sparkles className="w-4 h-4 text-indigo-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/assistant');
        setIsOpen(false);
      },
    },
    {
      id: 'action-theme',
      title: isDark ? 'Switch to Pure Light Mode' : 'Switch to Obsidian Dark Mode',
      subtitle: 'Toggle application color scheme',
      category: 'Actions',
      icon: isDark ? <Sun className="w-4 h-4 text-amber-500" strokeWidth={1.65} /> : <Moon className="w-4 h-4 text-indigo-400" strokeWidth={1.65} />,
      action: toggleTheme,
    },
    {
      id: 'nav-chat',
      title: 'Go to Chat & Messages',
      subtitle: 'Direct messages and group conversations',
      category: 'Navigation',
      icon: <MessagesSquare className="w-4 h-4 text-blue-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/chat');
        setIsOpen(false);
      },
    },
    {
      id: 'nav-meetings',
      title: 'Go to Meetings & Huddles',
      subtitle: 'Scheduled calls and instant rooms',
      category: 'Navigation',
      icon: <Video className="w-4 h-4 text-cyan-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/meetings');
        setIsOpen(false);
      },
    },
    {
      id: 'nav-teams',
      title: 'Go to Channels & Communities',
      subtitle: 'Team channels, discussions, and updates',
      category: 'Navigation',
      icon: <Layers className="w-4 h-4 text-purple-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/teams');
        setIsOpen(false);
      },
    },
    {
      id: 'nav-files',
      title: 'Go to Cloud Files Hub',
      subtitle: 'Unlimited storage, code, and document viewer',
      category: 'Navigation',
      icon: <FileBox className="w-4 h-4 text-amber-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/files');
        setIsOpen(false);
      },
    },
    {
      id: 'nav-calendar',
      title: 'Go to Calendar',
      subtitle: 'Schedule meetings and view events',
      category: 'Navigation',
      icon: <CalendarDays className="w-4 h-4 text-rose-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/calendar');
        setIsOpen(false);
      },
    },
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      subtitle: 'Profile, 2FA security, audio devices, and sessions',
      category: 'Navigation',
      icon: <SlidersHorizontal className="w-4 h-4 text-slate-500" strokeWidth={1.65} />,
      action: () => {
        router.push('/settings');
        setIsOpen(false);
      },
    },
  ];

  const filteredItems = query.trim()
    ? baseItems.filter((i) =>
        i.title.toLowerCase().includes(query.toLowerCase()) ||
        (i.subtitle && i.subtitle.toLowerCase().includes(query.toLowerCase()))
      )
    : baseItems;

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      } else if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-xs transition-opacity animate-fadeIn"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-[620px] bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/80">
          <Search className="w-5 h-5 text-indigo-500 shrink-0" strokeWidth={1.65} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDownList}
            placeholder="Type a command or search anything..."
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.65} />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No commands matching &quot;{query}&quot;
              </p>
              <button
                onClick={() => {
                  router.push(`/search?q=${encodeURIComponent(query)}`);
                  setIsOpen(false);
                }}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 transition-colors"
              >
                <span>Search all workspace messages & files</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.65} />
              </button>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-500/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold px-2 py-0.5 rounded bg-indigo-100/60 dark:bg-indigo-900/60 shrink-0 ml-2">
                      ↵ Enter
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
          <div className="flex items-center gap-1 text-emerald-500 font-medium">
            <Zap className="w-3.5 h-3.5" strokeWidth={1.65} />
            <span>TeamTrack Studio • Pro Free</span>
          </div>
        </div>
      </div>
    </div>
  );
}
