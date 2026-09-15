'use client';

import React from 'react';
import Link from 'next/link';

interface OrgNavTabsProps {
  organizationId: string;
  activeTab: 'settings' | 'members' | 'governance' | 'audit-log';
}

export function OrgNavTabs({ organizationId, activeTab }: OrgNavTabsProps) {
  const tabs = [
    { id: 'settings', label: 'Organization Settings', href: `/organization/${organizationId}/settings` },
    { id: 'members', label: 'Members & Roles', href: `/organization/${organizationId}/members` },
    { id: 'governance', label: 'Governance Policies', href: `/organization/${organizationId}/governance` },
    { id: 'audit-log', label: 'Audit Logs', href: `/organization/${organizationId}/audit-log` },
  ];

  return (
    <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', marginBottom: '2rem' }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            style={{
              padding: '0.75rem 1rem',
              color: isActive ? '#38bdf8' : '#94a3b8',
              borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
              textDecoration: 'none',
              fontWeight: isActive ? 600 : 500,
              fontSize: '0.95rem',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
