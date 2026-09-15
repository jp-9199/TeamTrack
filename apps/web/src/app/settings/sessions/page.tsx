'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { UserSessionItem } from '@teamtrack/shared-types';

export default function SessionsSettingsPage() {
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/users/me/sessions');
      const json = await res.json();
      if (json.success && json.data) {
        setSessions(json.data.sessions || []);
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load sessions.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed while loading sessions.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    if (!confirm('Are you sure you want to revoke this session? The device will be signed out immediately.')) {
      return;
    }

    setRevokingId(sessionId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/users/me/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Session revoked successfully.' });
        fetchSessions();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to revoke session.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred while revoking session.' });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAll() {
    if (
      !confirm(
        'Are you sure you want to revoke all other active sessions? All other devices will be signed out immediately.'
      )
    ) {
      return;
    }

    setIsRevokingAll(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/users/me/sessions/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preserveCurrent: true }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({
          type: 'success',
          text: `Revoked ${json.data?.revokedCount ?? 0} other active session(s). Your current session remains active.`,
        });
        fetchSessions();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to revoke sessions.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setIsRevokingAll(false);
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' }}>
      {/* Settings Tab Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', marginBottom: '2rem' }}>
        <Link
          href="/settings/profile"
          style={{
            padding: '0.75rem 1rem',
            color: '#94a3b8',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          Profile
        </Link>
        <Link
          href="/settings/security"
          style={{
            padding: '0.75rem 1rem',
            color: '#94a3b8',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          Security & Password
        </Link>
        <Link
          href="/settings/sessions"
          style={{
            padding: '0.75rem 1rem',
            color: '#38bdf8',
            borderBottom: '2px solid #38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          Active Sessions
        </Link>
      </div>

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>Active Sessions & Devices</h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>
              Review and manage logged-in sessions across web browsers, desktop clients, and mobile devices.
            </p>
          </div>

          {sessions.filter((s) => !s.isCurrent).length > 0 && (
            <button
              onClick={handleRevokeAll}
              disabled={isRevokingAll}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: isRevokingAll ? 'not-allowed' : 'pointer',
                opacity: isRevokingAll ? 0.7 : 1,
              }}
            >
              {isRevokingAll ? 'Revoking...' : 'Revoke All Other Sessions'}
            </button>
          )}
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '0.875rem 1.25rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              backgroundColor: statusMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${statusMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
              color: statusMessage.type === 'success' ? '#4ade80' : '#f87171',
              fontSize: '0.875rem',
            }}
          >
            {statusMessage.text}
          </div>
        )}

        {isLoading ? (
          <div style={{ color: '#94a3b8', padding: '2rem 0', textAlign: 'center' }}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={{ color: '#94a3b8', padding: '2rem 0', textAlign: 'center' }}>No active sessions found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  backgroundColor: session.isCurrent ? 'rgba(56, 189, 248, 0.05)' : '#0f172a',
                  border: session.isCurrent ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc' }}>
                      {session.userAgent ? session.userAgent.slice(0, 60) : 'Unknown Device'}
                    </span>
                    {session.isCurrent && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                        }}
                      >
                        CURRENT SESSION
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', color: '#94a3b8' }}>
                    <span>IP: {session.ipAddress || 'Not recorded'}</span>
                    <span>Created: {new Date(session.createdAt).toLocaleDateString()}</span>
                    <span>Expires: {new Date(session.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div>
                  {!session.isCurrent && (
                    <button
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokingId === session.id}
                      style={{
                        padding: '0.375rem 0.75rem',
                        borderRadius: '6px',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#f87171',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        cursor: revokingId === session.id ? 'not-allowed' : 'pointer',
                        opacity: revokingId === session.id ? 0.6 : 1,
                      }}
                    >
                      {revokingId === session.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
