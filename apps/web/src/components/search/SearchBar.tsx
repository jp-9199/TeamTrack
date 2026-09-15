'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResultItem, SearchResultType } from '@teamtrack/shared-types';

export function getCategoryMeta(type: SearchResultType): {
  icon: string;
  badgeBg: string;
  badgeColor: string;
  label: string;
} {
  switch (type) {
    case 'user':
      return { icon: '@', badgeBg: 'rgba(168, 85, 247, 0.15)', badgeColor: '#c084fc', label: 'Person' };
    case 'channel':
      return { icon: '#', badgeBg: 'rgba(34, 197, 94, 0.15)', badgeColor: '#4ade80', label: 'Channel' };
    case 'team':
      return { icon: '👥', badgeBg: 'rgba(14, 165, 233, 0.15)', badgeColor: '#38bdf8', label: 'Team' };
    case 'message':
      return { icon: '💬', badgeBg: 'rgba(59, 130, 246, 0.15)', badgeColor: '#60a5fa', label: 'Message' };
    case 'meeting':
      return { icon: '📅', badgeBg: 'rgba(245, 158, 11, 0.15)', badgeColor: '#fbbf24', label: 'Meeting' };
    case 'file':
      return { icon: '📄', badgeBg: 'rgba(244, 63, 94, 0.15)', badgeColor: '#fb7185', label: 'File' };
    case 'conversation':
    default:
      return { icon: '🗨️', badgeBg: 'rgba(148, 163, 184, 0.15)', badgeColor: '#94a3b8', label: 'Chat' };
  }
}

export function resolveSearchNavigationUrl(item: SearchResultItem): string {
  switch (item.type) {
    case 'user':
      return `/users/${encodeURIComponent(item.resourceId)}`;
    case 'channel':
      return `/channels/${encodeURIComponent(item.resourceId)}`;
    case 'team':
      return `/teams/${encodeURIComponent(item.resourceId)}`;
    case 'conversation':
      return `/conversations/${encodeURIComponent(item.resourceId)}`;
    case 'message':
      if (item.metadata?.channelId) {
        return `/channels/${encodeURIComponent(String(item.metadata.channelId))}?messageId=${encodeURIComponent(item.resourceId)}`;
      }
      if (item.metadata?.conversationId) {
        return `/conversations/${encodeURIComponent(String(item.metadata.conversationId))}?messageId=${encodeURIComponent(item.resourceId)}`;
      }
      return `/messages/${encodeURIComponent(item.resourceId)}`;
    case 'meeting':
      return `/meetings?meetingId=${encodeURIComponent(item.resourceId)}`;
    case 'file':
      return `/files/${encodeURIComponent(item.resourceId)}`;
    default:
      return `/search?q=${encodeURIComponent(item.title)}`;
  }
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global keyboard shortcut to focus search: Ctrl+K, Ctrl+E, or /
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'e')
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === '/' && document.activeElement !== inputRef.current && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dismiss dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query
  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}&limit=7`);
      const data = await res.json();
      if (data.success && data.data?.items) {
        setResults(data.data.items);
      } else {
        setResults([]);
      }
    } catch {
      setError('Search temporarily unavailable');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelectResult(results[selectedIndex]);
      } else if (query.trim()) {
        setIsOpen(false);
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  const handleSelectResult = (item: SearchResultItem) => {
    setIsOpen(false);
    const targetUrl = resolveSearchNavigationUrl(item);
    router.push(targetUrl);
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: '0 1 440px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Search Icon */}
      <span
        style={{
          position: 'absolute',
          left: '10px',
          color: '#64748b',
          fontSize: '0.875rem',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        🔍
      </span>

      {/* Input */}
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label="Search messages, channels, teams, meetings, people, or files"
        value={query}
        placeholder="Search messages, channels, files (Ctrl+K)"
        onChange={handleInputChange}
        onFocus={() => {
          if (query.trim()) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          padding: '0.45rem 2.25rem 0.45rem 2.25rem',
          backgroundColor: isOpen ? 'rgba(30, 41, 59, 0.95)' : 'rgba(30, 41, 59, 0.7)',
          border: isOpen ? '1px solid #3b82f6' : '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '6px',
          color: '#f8fafc',
          fontSize: '0.8125rem',
          outline: 'none',
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
      />

      {/* Clear Button / Spinner */}
      <div
        style={{
          position: 'absolute',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          zIndex: 2,
        }}
      >
        {isLoading && (
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '2px solid rgba(148, 163, 184, 0.25)',
              borderTopColor: '#60a5fa',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        {query && !isLoading && (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Clear search"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.875rem',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Results Popover Dropdown */}
      {isOpen && query.trim().length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: '#0f172a',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '8px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            overflow: 'hidden',
            maxHeight: '440px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {error ? (
            <div style={{ padding: '1rem', color: '#f87171', fontSize: '0.8125rem', textAlign: 'center' }}>
              {error}
            </div>
          ) : isLoading && results.length === 0 ? (
            <div style={{ padding: '1.25rem', color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center' }}>
              Searching TeamTrack...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '1.25rem', color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center' }}>
              No results found for "{query.trim()}"
            </div>
          ) : (
            <>
              {/* Result items */}
              <div style={{ overflowY: 'auto', maxHeight: '360px' }}>
                {results.map((item, idx) => {
                  const meta = getCategoryMeta(item.type);
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectResult(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.625rem 0.875rem',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                        borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s',
                      }}
                    >
                      {/* Type Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          backgroundColor: meta.badgeBg,
                          color: meta.badgeColor,
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {meta.icon}
                      </span>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              color: '#f8fafc',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.title}
                          </span>
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
                        </div>

                        {item.snippet ? (
                          <p
                            style={{
                              margin: '2px 0 0 0',
                              fontSize: '0.75rem',
                              color: '#94a3b8',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.snippet}
                          </p>
                        ) : item.subtitle ? (
                          <p
                            style={{
                              margin: '2px 0 0 0',
                              fontSize: '0.75rem',
                              color: '#64748b',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.subtitle}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* View All Footer */}
              <div
                onClick={() => {
                  setIsOpen(false);
                  router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                }}
                style={{
                  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                  padding: '0.5rem 0.875rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  color: '#60a5fa',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}
              >
                <span>See all results for "{query.trim()}"</span>
                <span>Press Enter ↵</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
