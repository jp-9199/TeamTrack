'use client';

import React, { useState, useEffect, use } from 'react';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { OrganizationMemberWithUser, OrganizationRole } from '@teamtrack/shared-types';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationMembersPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

  async function fetchMembers() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const orgRes = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}`);
      const orgJson = await orgRes.json();
      if (orgJson.success && orgJson.data) {
        setCurrentRole(orgJson.data.memberRole || '');
      }

      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members`);
      const json = await res.json();
      if (json.success && json.data) {
        setMembers(json.data.members || []);
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load organization members.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection failed while loading members.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: OrganizationRole) {
    setActionLoadingId(userId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Member role updated successfully.' });
        fetchMembers();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update member role.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleStatusToggle(userId: string, currentStatus: string) {
    const isSuspending = currentStatus !== 'suspended';
    const confirmMsg = isSuspending
      ? 'Suspend this member? They will immediately lose all tenant access (realtime, messaging, meetings, AI, search) while preserving their user account.'
      : 'Restore this member to active status?';

    if (!confirm(confirmMsg)) return;

    setActionLoadingId(userId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: isSuspending ? 'suspended' : 'active' }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({
          type: 'success',
          text: isSuspending ? 'Member suspended and subscriptions invalidated.' : 'Member restored to active.',
        });
        fetchMembers();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to update member status.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRemoveMember(userId: string, memberEmail: string) {
    if (!confirm(`Are you sure you want to permanently remove ${memberEmail} from the organization?`)) {
      return;
    }

    setActionLoadingId(userId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Member removed from organization.' });
        fetchMembers();
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to remove member.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setActionLoadingId(null);
    }
  }

  const isPrivileged = currentRole === 'owner' || currentRole === 'admin';

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1.5rem' }}>
      <OrgNavTabs organizationId={organizationId} activeTab="members" />

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>Organization Members</h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>
              Manage membership roles and suspension statuses according to organization hierarchy policies.
            </p>
          </div>
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
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>Loading members...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {members.map((member) => {
              const isOwner = member.role === 'owner';
              const isAdmin = member.role === 'admin';
              const isSuspended = member.status === 'suspended';

              // Admin cannot modify Owner or other Admins
              const canModifyRole =
                currentRole === 'owner' ? !isOwner : currentRole === 'admin' ? !isOwner && !isAdmin : false;

              const canSuspendOrRemove =
                currentRole === 'owner' ? !isOwner : currentRole === 'admin' ? !isOwner && !isAdmin : false;

              return (
                <div
                  key={member.userId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 1.25rem',
                    borderRadius: '8px',
                    backgroundColor: isSuspended ? 'rgba(239, 68, 68, 0.05)' : '#0f172a',
                    border: isSuspended ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                      }}
                    >
                      {member.user?.displayName ? member.user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
                          {member.user?.displayName || 'Unnamed User'}
                        </span>
                        {isSuspended && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '9999px',
                            }}
                          >
                            SUSPENDED
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{member.user?.email}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Role Selector / Badge */}
                    {canModifyRole ? (
                      <select
                        value={member.role}
                        disabled={actionLoadingId === member.userId}
                        onChange={(e) => handleRoleChange(member.userId, e.target.value as OrganizationRole)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          color: '#f8fafc',
                          fontSize: '0.8125rem',
                        }}
                      >
                        {currentRole === 'owner' && <option value="admin">Admin</option>}
                        <option value="member">Member</option>
                        <option value="guest">Guest</option>
                      </select>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          padding: '0.25rem 0.625rem',
                          borderRadius: '6px',
                          backgroundColor: isOwner ? '#8b5cf6' : isAdmin ? '#3b82f6' : '#334155',
                          color: '#ffffff',
                        }}
                      >
                        {member.role}
                      </span>
                    )}

                    {/* Suspension Toggle */}
                    {canSuspendOrRemove && (
                      <button
                        onClick={() => handleStatusToggle(member.userId, member.status)}
                        disabled={actionLoadingId === member.userId}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          backgroundColor: isSuspended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          border: `1px solid ${isSuspended ? '#22c55e' : '#ef4444'}`,
                          color: isSuspended ? '#4ade80' : '#f87171',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {isSuspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}

                    {/* Removal Button */}
                    {canSuspendOrRemove && (
                      <button
                        onClick={() => handleRemoveMember(member.userId, member.user?.email || 'member')}
                        disabled={actionLoadingId === member.userId}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          backgroundColor: 'transparent',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          color: '#94a3b8',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
