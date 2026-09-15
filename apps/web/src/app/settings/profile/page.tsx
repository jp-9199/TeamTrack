'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { UserProfile } from '@teamtrack/shared-types';

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en-US');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/users/me');
      if (res.status === 401) {
        setStatusMessage({ type: 'error', text: 'You are not logged in. Please sign in to view your profile.' });
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setProfile(json.data);
        setDisplayName(json.data.displayName || '');
        setJobTitle(json.data.jobTitle || '');
        setTimezone(json.data.timezone || 'UTC');
        setLocale(json.data.locale || 'en-US');
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load profile' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed while loading profile.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          jobTitle: jobTitle.trim() || undefined,
          timezone,
          locale,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setProfile(json.data);
        setStatusMessage({ type: 'success', text: 'Profile updated successfully.' });
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update profile.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred while saving profile.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1.5rem' }}>
      {/* Settings Tab Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', marginBottom: '2rem' }}>
        <Link
          href="/settings/profile"
          style={{
            padding: '0.75rem 1rem',
            color: '#38bdf8',
            borderBottom: '2px solid #38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
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
            color: '#94a3b8',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          Active Sessions
        </Link>
      </div>

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>User Profile</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
          Manage your personal details, preferred timezone, and locale.
        </p>

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
          <div style={{ color: '#94a3b8', padding: '2rem 0', textAlign: 'center' }}>Loading profile...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                Email Address
              </label>
              <input
                type="text"
                disabled
                value={profile?.email || ''}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  color: '#64748b',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                Primary login email cannot be changed directly from settings.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#f8fafc',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                maxLength={150}
                placeholder="e.g. Senior Software Engineer"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#f8fafc',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '6px',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (Eastern Time)</option>
                  <option value="America/Chicago">America/Chicago (Central Time)</option>
                  <option value="America/Denver">America/Denver (Mountain Time)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                  Locale
                </label>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '6px',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="en-US">English (United States) [en-US]</option>
                  <option value="en-GB">English (United Kingdom) [en-GB]</option>
                  <option value="de-DE">Deutsch (Germany) [de-DE]</option>
                  <option value="fr-FR">Français (France) [fr-FR]</option>
                  <option value="es-ES">Español (Spain) [es-ES]</option>
                  <option value="ja-JP">日本語 (Japan) [ja-JP]</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  padding: '0.625rem 1.5rem',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                  transition: 'background-color 0.15s',
                }}
              >
                {isSaving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
