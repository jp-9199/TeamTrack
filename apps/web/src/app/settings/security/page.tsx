'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { UserSecuritySummary } from '@teamtrack/shared-types';

export default function SecuritySettingsPage() {
  const [security, setSecurity] = useState<UserSecuritySummary | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSecuritySummary();
  }, []);

  async function fetchSecuritySummary() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/users/me/security');
      const json = await res.json();
      if (json.success && json.data) {
        setSecurity(json.data);
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load security summary.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (newPassword.length < 8) {
      setStatusMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    if (newPassword === currentPassword) {
      setStatusMessage({ type: 'error', text: 'New password must be different from current password.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatusMessage({
          type: 'success',
          text: 'Password updated successfully. All other active sessions have been securely revoked.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchSecuritySummary();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update password.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred while updating password.' });
    } finally {
      setIsSubmitting(false);
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
            color: '#38bdf8',
            borderBottom: '2px solid #38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Security Overview Card */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#f8fafc' }}>Account Security Summary</h2>
          <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
            High-level overview of your credential security and active device posture.
          </p>

          {isLoading ? (
            <div style={{ color: '#94a3b8' }}>Loading security status...</div>
          ) : security ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Last Activity
                </span>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: 600 }}>
                  {security.lastLoginAt ? new Date(security.lastLoginAt).toLocaleDateString() : 'Never'}
                </p>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active Sessions
                </span>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: 600 }}>
                  {security.activeSessionCount} active {security.activeSessionCount === 1 ? 'session' : 'sessions'}
                </p>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Password Hashing
                </span>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', color: '#4ade80', fontWeight: 600 }}>
                  Argon2id Protected
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Change Password Card */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#f8fafc' }}>Change Password</h2>
          <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
            Enter your current password followed by your new password. Changing your password immediately revokes all other active sessions across web, desktop, and mobile.
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

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
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
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
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
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                Must be at least 8 characters. Avoid previously used passwords.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '0.625rem 1.5rem',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  transition: 'background-color 0.15s',
                }}
              >
                {isSubmitting ? 'Updating...' : 'Update Password & Invalidate Other Sessions'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
