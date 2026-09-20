'use client';

import React, { useState, useEffect, use } from 'react';
import { TeamsShell } from '../../../../components/layout/TeamsShell';
import { OrgNavTabs } from '../../../../components/organization/OrgNavTabs';
import type { AuditLogEntry } from '@teamtrack/shared-types';
import { FileText, Shield, Clock, User, Activity } from 'lucide-react';

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

export default function OrganizationAuditLogPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.organizationId;

  const [logs, setLogs] = useState<AuditLogEntry[]>([
    {
      id: 'log-1',
      organizationId,
      actorId: 'usr-1',
      action: 'security.2fa_enabled',
      entityType: 'user_security',
      entityId: 'usr-1',
      ipAddress: '192.168.1.45',
      userAgent: 'TeamTrack Studio / Web',
      metadata: { method: 'authenticator_totp', ip: '192.168.1.45' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'log-2',
      organizationId,
      actorId: 'usr-1',
      action: 'channel.created',
      entityType: 'channel',
      entityId: 'chan-dev',
      ipAddress: '192.168.1.45',
      userAgent: 'TeamTrack Studio / Web',
      metadata: { channelName: 'engineering-releases', isPrivate: false },
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'log-3',
      organizationId,
      actorId: 'usr-2',
      action: 'meeting.started',
      entityType: 'meeting',
      entityId: 'meet-101',
      ipAddress: '110.38.12.90',
      userAgent: 'TeamTrack Studio / Desktop',
      metadata: { roomType: 'unlimited_huddle', participantCount: 6 },
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  return (
    <TeamsShell activeApp="settings">
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100">
        <div className="max-w-4xl mx-auto space-y-6">
          <OrgNavTabs organizationId={organizationId} activeTab="audit-log" />

          {/* Audit Log Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Real-Time Security Audit Logs
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Immutable enterprise audit trail recording tenant events, logins, and permission changes.
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                LIVE STREAMING
              </span>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Actor: {log.actorId || 'System'}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                      {JSON.stringify(log.metadata)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TeamsShell>
  );
}
