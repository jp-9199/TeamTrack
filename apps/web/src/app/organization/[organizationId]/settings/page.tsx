'use client';

import React, { useState, useEffect, use } from 'react';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { Organization, OrganizationMemberWithUser } from '@teamtrack/shared-types';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationSettingsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [org, setOrg] = useState<Organization | null>(null);
  const [memberRole, setMemberRole] = useState<string>('');
  const [name, setName] = useState('');
  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [selectedTargetOwner, setSelectedTargetOwner] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchOrgDetails();
  }, [organizationId]);

  async function fetchOrgDetails() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}`);
      if (res.status === 403) {
        setStatusMessage({ type: 'error', text: 'You do not have access to manage this organization.' });
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setOrg(json.data.organization);
        setMemberRole(json.data.memberRole || '');
        setName(json.data.organization.name || '');

        if (json.data.memberRole === 'owner') {
          // Fetch members for ownership transfer dropdown
          const membersRes = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members`);
          const membersJson = await membersRes.json();
          if (membersJson.success && membersJson.data?.members) {
            setMembers(membersJson.data.members);
          }
        }
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load organization settings.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateOrg(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setOrg(json.data.organization);
        setStatusMessage({ type: 'success', text: 'Organization name updated successfully.' });
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update organization.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransferOwnership(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTargetOwner) return;
    if (!transferConfirmed) {
      setStatusMessage({ type: 'error', text: 'Please check the box confirming ownership transfer.' });
      return;
    }

    if (!confirm('FINAL CONFIRMATION: You are transferring organization ownership. You will be demoted to Admin. This action cannot be undone by you.')) {
      return;
    }

    setIsTransferring(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerUserId: selectedTargetOwner }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Ownership successfully transferred. You are now an Admin.' });
        fetchOrgDetails();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to transfer ownership.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred during ownership transfer.' });
    } finally {
      setIsTransferring(false);
      setTransferConfirmed(false);
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' }}>
      <OrgNavTabs organizationId={organizationId} activeTab="settings" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {statusMessage && (
          <div
            style={{
              padding: '0.875rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: statusMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${statusMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
              color: statusMessage.type === 'success' ? '#4ade80' : '#f87171',
              fontSize: '0.875rem',
            }}
          >
            {statusMessage.text}
          </div>
        )}

        {/* General Settings */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>Organization Settings</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
            Manage organization identity and tenant governance. Your current role: <strong style={{ color: '#38bdf8' }}>{memberRole.toUpperCase()}</strong>
          </p>

          {isLoading ? (
            <div style={{ color: '#94a3b8' }}>Loading organization settings...</div>
          ) : (
            <form onSubmit={handleUpdateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={memberRole !== 'owner' && memberRole !== 'admin'}
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
                  Organization Slug
                </label>
                <input
                  type="text"
                  disabled
                  value={org?.slug || ''}
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
              </div>

              {(memberRole === 'owner' || memberRole === 'admin') && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    disabled={isSaving}
                    style={{
                      padding: '0.625rem 1.25rem',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    {isSaving ? 'Saving...' : 'Update Settings'}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Ownership Transfer (Owner Only) */}
        {memberRole === 'owner' && (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#f87171' }}>Transfer Ownership</h2>
            <p style={{ margin: '0 0 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>
              Transfer the single Owner role to another active member of this organization. Under the Sole Owner Invariant, there can only be exactly one Owner at all times. You will become an Admin upon completion.
            </p>

            <form onSubmit={handleTransferOwnership} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.375rem' }}>
                  Select New Owner
                </label>
                <select
                  value={selectedTargetOwner}
                  onChange={(e) => setSelectedTargetOwner(e.target.value)}
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
                >
                  <option value="">-- Choose active member --</option>
                  {members
                    .filter((m) => m.role !== 'owner' && m.status === 'active')
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user?.displayName || m.user?.email} ({m.role})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="confirmTransfer"
                  checked={transferConfirmed}
                  onChange={(e) => setTransferConfirmed(e.target.checked)}
                />
                <label htmlFor="confirmTransfer" style={{ fontSize: '0.875rem', color: '#cbd5e1', cursor: 'pointer' }}>
                  I understand that I am permanently transferring ownership and cannot reverse this action myself.
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isTransferring || !selectedTargetOwner || !transferConfirmed}
                  style={{
                    padding: '0.625rem 1.25rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isTransferring || !selectedTargetOwner || !transferConfirmed ? 'not-allowed' : 'pointer',
                    opacity: isTransferring || !selectedTargetOwner || !transferConfirmed ? 0.6 : 1,
                  }}
                >
                  {isTransferring ? 'Transferring Ownership...' : 'Transfer Ownership to Selected Member'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
