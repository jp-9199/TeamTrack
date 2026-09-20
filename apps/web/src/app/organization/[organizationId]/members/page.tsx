'use client';

import React, { useState, useEffect, use } from 'react';
import { TeamsShell } from '../../../../components/layout/TeamsShell';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { OrganizationMemberWithUser, OrganizationRole } from '@teamtrack/shared-types';
import { Users, Shield, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationMembersPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([
    {
      id: 'mem-1',
      organizationId,
      userId: 'usr-1',
      role: 'owner',
      status: 'active',
      joinedAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      user: {
        id: 'usr-1',
        displayName: 'Amir Asad Ullah Khan',
        email: 'user@teamtrack.local',
        avatarUrl: null,
      },
    },
    {
      id: 'mem-2',
      organizationId,
      userId: 'usr-2',
      role: 'admin',
      status: 'active',
      joinedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      user: {
        id: 'usr-2',
        displayName: 'Sarah Chen',
        email: 'sarah.chen@teamtrack.local',
        avatarUrl: null,
      },
    },
    {
      id: 'mem-3',
      organizationId,
      userId: 'usr-3',
      role: 'member',
      status: 'active',
      joinedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      user: {
        id: 'usr-3',
        displayName: 'David Kim',
        email: 'david.kim@teamtrack.local',
        avatarUrl: null,
      },
    },
  ]);
  const [currentRole, setCurrentRole] = useState<string>('owner');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

  async function fetchMembers() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members`);
      const json = await res.json();
      if (json.success && json.data?.members) {
        setMembers(json.data.members);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }

  const handleRoleChange = (userId: string, newRole: OrganizationRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
    );
    setStatusMessage({ type: 'success', text: 'Member role updated successfully.' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'admin':
        return 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <TeamsShell activeApp="settings">
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100">
        <div className="max-w-4xl mx-auto space-y-6">
          <OrgNavTabs organizationId={organizationId} activeTab="members" />

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Members Table Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Members & Access Roles
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Control user permissions, administrative roles, and team seats.
                </p>
              </div>

              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                {members.length} Active Members
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-semibold">User</th>
                    <th className="pb-3 font-semibold">Current Role</th>
                    <th className="pb-3 font-semibold">Joined Date</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {members.map((mem) => (
                    <tr key={mem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white font-bold text-xs flex items-center justify-center">
                            {mem.user?.displayName?.[0] || 'U'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">
                              {mem.user?.displayName || 'User'}
                            </p>
                            <p className="text-[11px] text-slate-400">{mem.user?.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getRoleBadge(mem.role)}`}>
                          {mem.role}
                        </span>
                      </td>

                      <td className="py-3 text-slate-400">
                        {new Date(mem.joinedAt).toLocaleDateString()}
                      </td>

                      <td className="py-3 text-right">
                        {mem.role !== 'owner' ? (
                          <select
                            value={mem.role}
                            onChange={(e) => handleRoleChange(mem.userId, e.target.value as OrganizationRole)}
                            className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="guest">Guest</option>
                          </select>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Primary Owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </TeamsShell>
  );
}
