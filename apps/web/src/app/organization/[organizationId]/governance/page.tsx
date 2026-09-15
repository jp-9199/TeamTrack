'use client';

import React, { useState, useEffect, use } from 'react';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { OrganizationGovernanceSettings, DefaultNotificationBehavior } from '@teamtrack/shared-types';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationGovernancePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [settings, setSettings] = useState<OrganizationGovernanceSettings | null>(null);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(true);
  const [allowGuestInvites, setAllowGuestInvites] = useState(true);
  const [defaultNotificationBehavior, setDefaultNotificationBehavior] = useState<DefaultNotificationBehavior>('all');
  const [memberRole, setMemberRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchGovernanceSettings();
  }, [organizationId]);

  async function fetchGovernanceSettings() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const orgRes = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}`);
      const orgJson = await orgRes.json();
      if (orgJson.success && orgJson.data) {
        setMemberRole(orgJson.data.memberRole || '');
      }

      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/governance`);
      if (res.status === 403) {
        setStatusMessage({ type: 'error', text: 'You must be an Owner or Admin to view governance settings.' });
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
        setAiAssistantEnabled(json.data.aiAssistantEnabled);
        setAllowGuestInvites(json.data.allowGuestInvites);
        setDefaultNotificationBehavior(json.data.defaultNotificationBehavior);
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load governance policies.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/governance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiAssistantEnabled,
          allowGuestInvites,
          defaultNotificationBehavior,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
        setStatusMessage({ type: 'success', text: 'Governance policies updated and enforced immediately.' });
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update governance policies.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred while saving policies.' });
    } finally {
      setIsSaving(false);
    }
  }

  const isPrivileged = memberRole === 'owner' || memberRole === 'admin';

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' }}>
      <OrgNavTabs organizationId={organizationId} activeTab="governance" />

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>Organization Governance</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
          Enforce tenant-wide policies for AI assistant interactions, guest invitations, and default notification delivery.
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
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>Loading governance settings...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* AI Assistant Policy */}
            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc', display: 'block' }}>
                  Enable AI Assistant
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'block', marginTop: '0.25rem' }}>
                  When disabled, all AI chat queries, tools, action proposals, and confirmations are blocked with HTTP 403 AI_ORGANIZATION_DISABLED for all members of this organization.
                </span>
              </div>
              <input
                type="checkbox"
                disabled={!isPrivileged}
                checked={aiAssistantEnabled}
                onChange={(e) => setAiAssistantEnabled(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: isPrivileged ? 'pointer' : 'not-allowed' }}
              />
            </div>

            {/* Guest Invites Policy */}
            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc', display: 'block' }}>
                  Allow Guest Invitations
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'block', marginTop: '0.25rem' }}>
                  When disabled, attempts to add or invite members with the Guest role are rejected with HTTP 403 GUEST_INVITES_DISABLED.
                </span>
              </div>
              <input
                type="checkbox"
                disabled={!isPrivileged}
                checked={allowGuestInvites}
                onChange={(e) => setAllowGuestInvites(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: isPrivileged ? 'pointer' : 'not-allowed' }}
              />
            </div>

            {/* Default Notification Behavior */}
            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
              }}
            >
              <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc', display: 'block', marginBottom: '0.375rem' }}>
                Default Notification Behavior
              </label>
              <span style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'block', marginBottom: '0.75rem' }}>
                Fallback delivery behavior for members who have not configured explicit notification preferences.
              </span>
              <select
                disabled={!isPrivileged}
                value={defaultNotificationBehavior}
                onChange={(e) => setDefaultNotificationBehavior(e.target.value as DefaultNotificationBehavior)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#f8fafc',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All Notifications (Deliver all activity notifications)</option>
                <option value="mentions_only">Mentions & Direct Only (Only deliver direct mentions and DMs)</option>
                <option value="muted">Muted by Default (Suppress all background notifications unless opted in)</option>
              </select>
            </div>

            {/* Deferred Features Information Banner */}
            <div
              style={{
                backgroundColor: 'rgba(100, 116, 139, 0.1)',
                padding: '1rem 1.25rem',
                borderRadius: '8px',
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                fontSize: '0.8125rem',
                color: '#94a3b8',
              }}
            >
              <strong style={{ color: '#cbd5e1' }}>Deferred Governance Features:</strong>
              <p style={{ margin: '0.25rem 0 0' }}>
                Per Phase 13 specifications, <em>Message & File Data Retention Policies</em> are strictly deferred until the background pruning and legal hold enforcement engine is implemented. No un-enforced database settings or placeholder toggles are exposed.
              </p>
            </div>

            {isPrivileged && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                  }}
                >
                  {isSaving ? 'Saving Policies...' : 'Save Governance Policies'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
