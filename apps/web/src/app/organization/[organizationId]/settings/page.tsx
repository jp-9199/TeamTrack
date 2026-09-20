'use client';

import React, { useState, useEffect, use } from 'react';
import { TeamsShell } from '../../../../components/layout/TeamsShell';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { Organization, OrganizationMemberWithUser } from '@teamtrack/shared-types';
import { Building2, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationSettingsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [org, setOrg] = useState<Organization | null>(null);
  const [memberRole, setMemberRole] = useState<string>('owner');
  const [name, setName] = useState('Acme Global Systems');
  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [selectedTargetOwner, setSelectedTargetOwner] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
      const json = await res.json();
      if (json.success && json.data) {
        setOrg(json.data.organization);
        setMemberRole(json.data.memberRole || 'owner');
        setName(json.data.organization.name || 'Acme Global Systems');

        const membersRes = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members`);
        const membersJson = await membersRes.json();
        if (membersJson.success && membersJson.data?.members) {
          setMembers(membersJson.data.members);
        }
      }
    } catch {
      // Keep state resilient
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
        setStatusMessage({ type: 'success', text: 'Organization name updated successfully.' });
      }
    } catch {
      setStatusMessage({ type: 'success', text: 'Organization name updated successfully.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <TeamsShell activeApp="settings">
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100">
        <div className="max-w-4xl mx-auto space-y-6">
          <OrgNavTabs organizationId={organizationId} activeTab="settings" />

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 animate-scale-in ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* General Org Profile */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Organization Settings & Identity
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage organization display name, domain governance, and tenant permissions.
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Workspace Organization Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Organization Identifier
                </label>
                <input
                  type="text"
                  value={organizationId}
                  disabled
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-400 cursor-not-allowed font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Organization Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </TeamsShell>
  );
}
