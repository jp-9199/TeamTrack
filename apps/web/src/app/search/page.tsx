'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getCategoryMeta, resolveSearchNavigationUrl } from '../../components/search/SearchBar';
import type { SearchResultItem, SearchCategoryFilter } from '@teamtrack/shared-types';

const CATEGORY_TABS: Array<{ value: SearchCategoryFilter; label: string; icon: string }> = [
  { value: 'all', label: 'All', icon: '🔍' },
  { value: 'messages', label: 'Messages', icon: '💬' },
  { value: 'users', label: 'People', icon: '@' },
  { value: 'channels', label: 'Channels', icon: '#' },
  { value: 'teams', label: 'Teams', icon: '👥' },
  { value: 'meetings', label: 'Meetings', icon: '📅' },
  { value: 'files', label: 'Files', icon: '📄' },
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSearchResults = useCallback(
    async (q: string, type: SearchCategoryFilter, cursor?: string, isAppend = false) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setItems([]);
        setHasMore(false);
        setNextCursor(null);
        return;
      }

      if (isAppend) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('q', trimmed);
        if (type !== 'all') params.set('type', type);
        params.set('limit', '20');
        if (cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/v1/search?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.data) {
          if (isAppend) {
            setItems((prev) => [...prev, ...data.data.items]);
          } else {
            setItems(data.data.items);
          }
          setHasMore(Boolean(data.data.hasMore));
          setNextCursor(data.data.nextCursor || null);
        } else {
          setError(data.error?.message || 'Search execution failed');
        }
      } catch {
        setError('Network error: Unable to reach search service');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
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

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      fetchSearchResults(query, activeTab, nextCursor, true);
    }
  };

  const handleNavigate = (item: SearchResultItem) => {
    const targetUrl = resolveSearchNavigationUrl(item);
    router.push(targetUrl);
  };

  return (
    <main
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '2rem 1.5rem',
      }}
    >
      {/* Top Search Input Box */}
      <div style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                fontSize: '1rem',
              }}
            >
              🔍
            </span>
            <input
              type="search"
              aria-label="Search query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across messages, people, teams, channels, meetings, files..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 2.5rem',
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '0.9375rem',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '0 1.5rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
        }}
      >
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                border: isActive ? '1px solid #3b82f6' : '1px solid transparent',
                borderRadius: '6px',
                color: isActive ? '#60a5fa' : '#94a3b8',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Status / Error Banner */}
      {error && (
        <div
          style={{
            padding: '0.875rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchSearchResults(query, activeTab)}
            style={{
              background: 'none',
              border: 'none',
              color: '#60a5fa',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Section */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
          <p style={{ margin: 0, fontSize: '0.9375rem' }}>Searching TeamTrack across authorized resources...</p>
        </div>
      ) : !query.trim() ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🔍</span>
          <h2 style={{ color: '#f8fafc', fontSize: '1.125rem', margin: '0 0 0.5rem 0' }}>Search & Discovery</h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Find messages, teammates, channels, meetings, and shared files in your organizations.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📭</span>
          <h2 style={{ color: '#f8fafc', fontSize: '1.125rem', margin: '0 0 0.5rem 0' }}>No results found</h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            No matching resources found for "{query}". Check spelling or try a different keyword.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
            Showing {items.length} result{items.length !== 1 ? 's' : ''} for "{query}"
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((item) => {
              const meta = getCategoryMeta(item.type);
              return (
                <article
                  key={item.id}
                  onClick={() => handleNavigate(item)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                    e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.15)';
                    e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        backgroundColor: meta.badgeBg,
                        color: meta.badgeColor,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {meta.icon}
                    </span>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        color: '#f8fafc',
                      }}
                    >
                      {item.title}
                    </h3>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        color: meta.badgeColor,
                        backgroundColor: meta.badgeBg,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {meta.label}
                    </span>
                    {item.subtitle && (
                      <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                        • {item.subtitle}
                      </span>
                    )}
                  </div>

                  {item.snippet && (
                    <p
                      style={{
                        margin: '0.4rem 0 0 0',
                        fontSize: '0.8125rem',
                        color: '#cbd5e1',
                        lineHeight: 1.5,
                      }}
                    >
                      {item.snippet}
                    </p>
                  )}

                  {item.timestamp && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.6875rem', color: '#64748b' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Cursor Pagination Button */}
          {hasMore && (
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{
                  padding: '0.65rem 1.5rem',
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                  opacity: isLoadingMore ? 0.6 : 1,
                  transition: 'background-color 0.15s',
                }}
              >
                {isLoadingMore ? 'Loading more results...' : 'Load more results'}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
          Loading search...
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}

