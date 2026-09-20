'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { resolveSearchNavigationUrl } from '../../components/search/SearchBar';
import type { SearchResultItem, SearchCategoryFilter } from '@teamtrack/shared-types';
import {
  Search,
  MessageSquare,
  Users,
  Hash,
  Video,
  Folder,
  Layers,
  ArrowUpRight,
  Sparkles,
  Command,
  FileText,
} from 'lucide-react';

const CATEGORY_TABS: Array<{ value: SearchCategoryFilter; label: string; icon: any }> = [
  { value: 'all', label: 'All Results', icon: Layers },
  { value: 'messages', label: 'Messages', icon: MessageSquare },
  { value: 'users', label: 'People', icon: Users },
  { value: 'channels', label: 'Channels', icon: Hash },
  { value: 'teams', label: 'Teams', icon: Users },
  { value: 'meetings', label: 'Meetings', icon: Video },
  { value: 'files', label: 'Files', icon: Folder },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';
  const initialType = (searchParams.get('type') as SearchCategoryFilter) || 'all';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchCategoryFilter>(initialType);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSearchResults = useCallback(
    async (q: string, type: SearchCategoryFilter) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setItems([]);
        setHasMore(false);
        setNextCursor(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('q', trimmed);
        if (type !== 'all') params.set('type', type);
        params.set('limit', '25');

        const token = typeof window !== 'undefined'
          ? (localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '')
          : '';

        const res = await fetch(`/api/v1/search?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();

        if (data.success && data.data) {
          setItems(data.data.items || []);
          setHasMore(Boolean(data.data.hasMore));
          setNextCursor(data.data.nextCursor || null);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Sync with URL query parameter changes
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const type = (searchParams.get('type') as SearchCategoryFilter) || 'all';
    setQuery(q);
    setActiveTab(type);
    if (q) {
      fetchSearchResults(q, type);
    }
  }, [searchParams, fetchSearchResults]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}&type=${activeTab}`);
    }
  };

  const handleTabChange = (tab: SearchCategoryFilter) => {
    setActiveTab(tab);
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}&type=${tab}`);
    }
  };

  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'message':
        return { label: 'Message', bg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50', icon: MessageSquare };
      case 'file':
        return { label: 'File', bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50', icon: FileText };
      case 'meeting':
        return { label: 'Meeting', bg: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/50', icon: Video };
      case 'user':
        return { label: 'Person', bg: 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50', icon: Users };
      case 'channel':
      case 'team':
        return { label: 'Channel', bg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50', icon: Hash };
      default:
        return { label: 'Result', bg: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', icon: Layers };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-[#090D16]/50 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl w-full mx-auto p-6 md:p-8">
        {/* Search Header Form */}
        <div className="mb-6">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-3">
            Universal Workspace Search
          </h1>

          <form onSubmit={handleSearchSubmit} className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across all messages, people, files, channels, and meetings..."
                className="w-full h-11 pl-11 pr-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-5 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-all cursor-pointer shrink-0"
            >
              Search
            </button>
          </form>
        </div>

        {/* Filter Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar border-b border-slate-200 dark:border-slate-800/80">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Status / Loading */}
        {isLoading && (
          <div className="py-12 text-center text-slate-400 text-sm animate-fadeIn">
            <Search className="w-6 h-6 animate-pulse mx-auto mb-2 text-indigo-500" />
            <span>Scanning entire workspace...</span>
          </div>
        )}

        {/* Results List */}
        {!isLoading && items.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Found {items.length} matching result{items.length === 1 ? '' : 's'}
            </p>

            {items.map((item) => {
              const badge = getCategoryBadge(item.type);
              const BadgeIcon = badge.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => router.push(resolveSearchNavigationUrl(item))}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${badge.bg}`}>
                        <BadgeIcon className="w-3 h-3" />
                        <span>{badge.label}</span>
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.title}
                      </h3>
                    </div>

                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </div>

                  {item.snippet && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1 line-clamp-2">
                      {item.snippet}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State / Search Tips */}
        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center max-w-md mx-auto animate-fadeIn">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 mx-auto flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {query.trim() ? `No results found for "${query}"` : 'Fast Workspace Search'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {query.trim()
                ? 'Try checking for typos or searching with broader keywords.'
                : 'Search instantly across direct messages, channel announcements, code repositories, cloud files, and people.'}
            </p>

            {/* Shortcut Hint */}
            <div className="mt-6 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Command className="w-3.5 h-3.5 text-indigo-500" />
                <span>Search Filters:</span>
              </p>
              <p>• <code className="text-indigo-500">from:@name</code> — Filter messages by author</p>
              <p>• <code className="text-indigo-500">has:file</code> — Only show messages with attachments</p>
              <p>• <code className="text-indigo-500">in:#channel</code> — Limit search to a specific channel</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <TeamsShell activeApp="chat">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading search...</div>}>
        <SearchContent />
      </Suspense>
    </TeamsShell>
  );
}
