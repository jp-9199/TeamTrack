'use client';

import React from 'react';
import Link from 'next/link';
import { NotificationBell } from '../notifications/NotificationBell';
import { useNotifications } from '../notifications/NotificationContext';

import { SearchBar } from '../search/SearchBar';

export function AppHeader() {
  const { wsStatus } = useNotifications();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.625rem 1.5rem',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand & Left Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: '#ffffff',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
              color: '#ffffff',
            }}
          >
            T
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
            TeamTrack
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            href="/"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Dashboard
          </Link>

          <Link
            href="/calendar"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Calendar
          </Link>

          <Link
            href="/meetings"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Meetings
          </Link>


          <Link
            href="/notifications"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Notification Center
          </Link>

          <Link
            href="/search"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Search
          </Link>

          <Link
            href="/settings/profile"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Settings
          </Link>
        </nav>
      </div>

      {/* Center Search Bar (Teams style) */}
      <SearchBar />


      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Realtime Connection Indicator */}
        <div
          title={`Realtime: ${wsStatus}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            color: wsStatus === 'connected' ? '#4ade80' : wsStatus === 'reconnecting' ? '#fbbf24' : '#94a3b8',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor:
                wsStatus === 'connected'
                  ? '#4ade80'
                  : wsStatus === 'reconnecting'
                  ? '#fbbf24'
                  : '#64748b',
            }}
          />
          <span style={{ textTransform: 'capitalize', display: 'none' }}>{wsStatus}</span>
        </div>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile Avatar */}
        <Link
          href="/settings/profile"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#ffffff',
            cursor: 'pointer',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            textDecoration: 'none',
          }}
          title="Account Settings"
        >
          DU
        </Link>
      </div>
    </header>
  );
}
