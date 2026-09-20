'use client';

import React, { useState, useEffect, use } from 'react';
import { TeamsShell } from '../../../../components/layout/TeamsShell';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { OrganizationGovernanceSettings, DefaultNotificationBehavior } from '@teamtrack/shared-types';
import { ShieldCheck, Sparkles, UserPlus, BellRing, CheckCircle2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationGovernancePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(true);
  const [allowGuestInvites, setAllowGuestInvites] = useState(true);
  const [defaultNotificationBehavior, setDefaultNotificationBehavior] = useState<DefaultNotificationBehavior>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setStatusMessage('Governance security policies updated successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    }, 400);
  };

  return (
    <TeamsShell activeApp="settings">
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100">
        <div className="max-w-4xl mx-auto space-y-6">
          <OrgNavTabs organizationId={organizationId} activeTab="governance" />

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Governance Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Tenant Governance & Security Policies
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enforce compliance guardrails, external guest sharing rules, and organization-wide AI permissions.
                </p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Policy 1: AI Assistant */}
              <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Enable AI Copilot for All Workspace Members
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Allow teammates to run unlimited AI thread summarization and action execution.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={aiAssistantEnabled}
                  onChange={(e) => setAiAssistantEnabled(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </label>

              {/* Policy 2: Guest Invites */}
              <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Allow External Guest Invitations
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Permit project contractors and external clients to join specific channels.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowGuestInvites}
                  onChange={(e) => setAllowGuestInvites(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </label>

              {/* Policy 3: Default Notification Behavior */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <BellRing className="w-4 h-4 text-indigo-500" />
                  <span>Default Channel Notification Policy</span>
                </div>
                <select
                  value={defaultNotificationBehavior}
                  onChange={(e) => setDefaultNotificationBehavior(e.target.value as DefaultNotificationBehavior)}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="all">Notify on all channel posts and replies</option>
                  <option value="mentions_only">Mentions only (@user or @channel)</option>
                  <option value="none">Muted by default</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Governance Policies'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </TeamsShell>
  );
}
