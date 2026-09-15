'use client';

import React, { useState, useEffect, use } from 'react';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { AuditLogEntry } from '@teamtrack/shared-types';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationAuditLogPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchLogs(true);
  }, [organizationId]);

  async function fetchLogs(reset = false, cursor?: string) {
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setStatusMessage(null);

    const params = new URLSearchParams();
    params.set('limit', '25');
    if (cursor) params.set('cursor', cursor);
    if (actionFilter) params.set('action', actionFilter.trim());
    if (actorIdFilter) params.set('actorId', actorIdFilter.trim());
    if (entityTypeFilter) params.set('entityType', entityTypeFilter.trim());

    try {
      const res = await fetch(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/audit-logs?${params.toString()}`
      );

      if (res.status === 403) {
        setStatusMessage({ type: 'error', text: 'You must be an Owner or Admin to inspect organization audit logs.' });
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        if (reset) {
          setLogs(json.data.items || []);
        } else {
          setLogs((prev) => [...prev, ...(json.data.items || [])]);
        }
        setNextCursor(json.data.nextCursor);
        setHasMore(json.data.hasMore);
      } else {
        setStatusMessage({ type: 'error', text: json.error?.message || 'Failed to load audit logs.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network connection error while retrieving audit logs.' });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs(true);
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1.5rem' }}>
      <OrgNavTabs organizationId={organizationId} activeTab="audit-log" />

      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f8fafc' }}>Compliance & Audit Logs</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
          Tamper-evident, tenant-isolated security audit log. All sensitive values (passwords, tokens, credentials) are strictly redacted.
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

        {/* Filter Controls */}
        <form
          onSubmit={handleFilterSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) auto',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Action
            </label>
            <input
              type="text"
              placeholder="e.g. USER_PASSWORD_CHANGED"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#f8fafc',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Entity Type
            </label>
            <input
              type="text"
              placeholder="e.g. organization_member"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#f8fafc',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Actor User ID
            </label>
            <input
              type="text"
              placeholder="UUID"
              value={actorIdFilter}
              onChange={(e) => setActorIdFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#f8fafc',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <button
              type="submit"
              style={{
                padding: '0.5rem 1.25rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Filter
            </button>
          </div>
        </form>

        {/* Audit Log Table */}
        {isLoading ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No audit records matched.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  backgroundColor: '#0f172a',
                  borderRadius: '8px',
                  padding: '1rem',
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: '#334155',
                        color: '#38bdf8',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {log.action}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                      Entity: <strong style={{ color: '#f8fafc' }}>{log.entityType}</strong> ({log.entityId})
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  <span>Actor: {log.actorId || 'SYSTEM'}</span>
                  <span>IP: {log.ipAddress || 'Internal'}</span>
                  <span>UA: {log.userAgent ? log.userAgent.slice(0, 40) : 'N/A'}</span>
                </div>

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <pre
                    style={{
                      margin: 0,
                      backgroundColor: '#1e293b',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                  onClick={() => fetchLogs(false, nextCursor || undefined)}
                  disabled={isLoadingMore}
                  style={{
                    padding: '0.5rem 1.5rem',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#38bdf8',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                    opacity: isLoadingMore ? 0.6 : 1,
                  }}
                >
                  {isLoadingMore ? 'Loading more...' : 'Load More Records'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
