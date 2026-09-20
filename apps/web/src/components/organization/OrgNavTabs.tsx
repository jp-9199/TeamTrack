'use client';

import React from 'react';
import Link from 'next/link';
import { Settings, Users, ShieldCheck, FileText } from 'lucide-react';

interface OrgNavTabsProps {
  organizationId: string;
  activeTab: 'settings' | 'members' | 'governance' | 'audit-log';
}

export function OrgNavTabs({ organizationId, activeTab }: OrgNavTabsProps) {
  const tabs = [
    { id: 'settings', label: 'Organization Settings', href: `/organization/${organizationId}/settings`, icon: Settings },
    { id: 'members', label: 'Members & Roles', href: `/organization/${organizationId}/members`, icon: Users },
    { id: 'governance', label: 'Governance Policies', href: `/organization/${organizationId}/governance`, icon: ShieldCheck },
    { id: 'audit-log', label: 'Audit Logs', href: `/organization/${organizationId}/audit-log`, icon: FileText },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
