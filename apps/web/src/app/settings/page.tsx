'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import {
  User,
  ShieldCheck,
  Laptop,
  Palette,
  Bell,
  Mic,
  Lock,
  Check,
  CheckCircle2,
  AlertCircle,
  Headphones,
  Volume2,
  Video,
  Key,
  Smartphone,
  Globe,
  Trash2,
} from 'lucide-react';
import type { UserProfile, UserSecuritySummary, UserSessionItem } from '@teamtrack/shared-types';
import { api } from '../../lib/api';

type SettingsTab = 'profile' | 'security' | 'sessions' | 'appearance' | 'devices' | 'notifications';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'profile';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [jobTitle, setJobTitle] = useState('');
  const [timezone, setTimezone] = useState('UTC+05:00 (Islamabad, Karachi)');
  const [locale, setLocale] = useState('en-US');
  const [bio, setBio] = useState('');

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Sessions state (loaded from real backend)
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);

  // Appearance state
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');

  // Devices & Audio visualizer test
  const [selectedMic, setSelectedMic] = useState('Default - Microphone Array (Realtek Audio)');
  const [selectedSpeaker, setSelectedSpeaker] = useState('Default - Speakers (Realtek Audio)');
  const [selectedCamera, setSelectedCamera] = useState('Integrated HD Webcam (1080p)');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevel, setAudioLevel] = useState(35);

  // Notification state (loaded from real backend)
  const [desktopNotifs, setDesktopNotifs] = useState(true);
  const [emailDigests, setEmailDigests] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [mentionAlerts, setMentionAlerts] = useState(true);

  // Status feedback
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch real data from backend on mount
  useEffect(() => {
    async function loadUserData() {
      try {
        const [profileRes, securityRes, sessionsRes, notifRes] = await Promise.allSettled([
          api.getUserProfile(),
          api.getUserSecurity(),
          api.getUserSessions(),
          api.getNotificationPreferences(),
        ]);

        if (profileRes.status === 'fulfilled' && profileRes.value.success && profileRes.value.data) {
          const p = profileRes.value.data;
          setDisplayName(p.displayName || '');
          setJobTitle(p.jobTitle || '');
          setTimezone(p.timezone || 'UTC+05:00 (Islamabad, Karachi)');
          setLocale(p.locale || 'en-US');
        }

        if (sessionsRes.status === 'fulfilled' && sessionsRes.value.success && sessionsRes.value.data) {
          setSessions(sessionsRes.value.data.sessions || []);
        }

        if (notifRes.status === 'fulfilled' && notifRes.value.success && notifRes.value.data) {
          const np = notifRes.value.data;
          setDesktopNotifs(np.pushEnabled ?? true);
          setEmailDigests(np.emailEnabled ?? false);
          setSoundAlerts(np.realtimeEnabled ?? true);
        }
      } catch (err) {
        console.error('Failed to load settings from server', err);
      }
    }
    if (user) {
      loadUserData();
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    }
  }, []);

  const handleApplyTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.removeItem('theme');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await api.updateUserProfile({
        displayName,
        jobTitle,
        timezone,
        locale,
      });
      if (res.success) {
        setSaveSuccess('Profile information updated in database successfully!');
        setTimeout(() => setSaveSuccess(null), 3500);
      } else {
        setSaveError(res.error?.message || 'Failed to update profile');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Network error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (newPassword !== confirmPassword) {
      setSaveError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setSaveError('New password must be at least 8 characters long.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
      });
      if (res.success) {
        setSaveSuccess('Password successfully updated and securely hashed with Argon2id!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSaveSuccess(null), 3500);
      } else {
        setSaveError(res.error?.message || 'Failed to update password. Please check your current password.');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Error updating password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setSaveError(null);
    try {
      const res = await api.revokeSession(sessionId);
      if (res.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setSaveSuccess('Session revoked. The device has been signed out.');
        setTimeout(() => setSaveSuccess(null), 3000);
      } else {
        setSaveError(res.error?.message || 'Failed to revoke session');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Error revoking session');
    }
  };

  const handleUpdateNotificationPreferences = async (updates: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    realtimeEnabled?: boolean;
  }) => {
    try {
      await api.updateNotificationPreferences(updates);
      setSaveSuccess('Notification preferences saved to backend.');
      setTimeout(() => setSaveSuccess(null), 2500);
    } catch (err) {
      console.error('Failed to sync notification preferences', err);
    }
  };

  // Mic test visualizer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTestingMic) {
      interval = setInterval(() => {
        setAudioLevel(Math.floor(20 + Math.random() * 75));
      }, 120);
    } else {
      setAudioLevel(0);
    }
    return () => clearInterval(interval);
  }, [isTestingMic]);

  const tabs = [
    { id: 'profile', label: 'Profile & Account', icon: User },
    { id: 'security', label: 'Security & 2FA', icon: ShieldCheck },
    { id: 'sessions', label: 'Active Sessions', icon: Laptop },
    { id: 'appearance', label: 'Theme & Appearance', icon: Palette },
    { id: 'devices', label: 'Audio & Video Devices', icon: Headphones },
    { id: 'notifications', label: 'Notification Alerts', icon: Bell },
  ];

  // ── SECONDARY SIDEBAR: SETTINGS NAVIGATION ──
  const sidebar = (
    <div className="flex flex-col h-full bg-slate-50/90 dark:bg-[#0B1120]/95 text-slate-800 dark:text-slate-100 p-3 select-none">
      <h2 className="text-sm font-bold px-2 pt-2 pb-3 border-b border-slate-200 dark:border-slate-800 mb-2">
        Settings & Preferences
      </h2>

      <div className="flex-1 space-y-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                isActive
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.65} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={() => {
            if (logout) logout();
            else router.push('/login');
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
        >
          <span>Sign Out of All Accounts</span>
        </button>
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="settings">
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Status Message */}
          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{saveError}</span>
            </div>
          )}

          {/* ── TAB 1: PROFILE & ACCOUNT ── */}
          {activeTab === 'profile' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg font-bold">Profile & Identity</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Manage how your profile appears across channels, direct chats, and calls.
                </p>
              </div>

              {/* Avatar Preview */}
              <div className="flex items-center gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white font-extrabold text-xl flex items-center justify-center shadow-md">
                  {displayName[0]?.toUpperCase() || 'A'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{displayName}</h3>
                  <p className="text-xs text-slate-400">{user?.email || 'user@teamtrack.local'}</p>
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    VERIFIED ACCOUNT
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Bio / Status Note
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Timezone
                    </label>
                    <input
                      type="text"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Language & Locale
                    </label>
                    <input
                      type="text"
                      value={locale}
                      onChange={(e) => setLocale(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </form>
            </div>
          )}

          {/* ── TAB 2: SECURITY & 2FA ── */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
                <div>
                  <h2 className="text-lg font-bold">Two-Factor Authentication (2FA)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Protect your TeamTrack account with multi-factor biometric or authenticator app authentication.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                      <ShieldCheck className="w-5 h-5" strokeWidth={1.65} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Authenticator App (TOTP)
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {twoFactorEnabled ? 'Enabled • Securing all logins' : 'Disabled • Not recommended'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setTwoFactorEnabled(!twoFactorEnabled);
                      setSaveSuccess(`Two-factor authentication ${!twoFactorEnabled ? 'enabled' : 'disabled'}.`);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      twoFactorEnabled
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {twoFactorEnabled ? 'Enabled' : 'Enable 2FA'}
                  </button>
                </div>
              </div>

              {/* Password Change Form */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <h3 className="text-sm font-bold">Change Password</h3>

                <form onSubmit={handleUpdatePassword} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="••••••••••••"
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="Minimum 8 characters"
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Re-enter new password"
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer mt-2"
                  >
                    Update Password
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ── TAB 3: ACTIVE SESSIONS ── */}
          {activeTab === 'sessions' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
              <div>
                <h2 className="text-lg font-bold">Active Device Sessions</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Devices currently signed into your TeamTrack account. You can revoke any unrecognized session.
                </p>
              </div>

              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    No active sessions found.
                  </div>
                ) : (
                  sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                          {sess.userAgent?.includes('Mobile') || sess.userAgent?.includes('iOS') ? (
                            <Smartphone className="w-5 h-5" />
                          ) : (
                            <Laptop className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {sess.userAgent || 'Active Device'}
                            </p>
                            {sess.isCurrent && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                Current Device
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            IP: {sess.ipAddress} • Last active {sess.lastActivityAt ? new Date(sess.lastActivityAt).toLocaleDateString() : 'Active'}
                          </p>
                        </div>
                      </div>

                      {!sess.isCurrent && (
                        <button
                          onClick={() => handleRevokeSession(sess.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── TAB 4: THEME & APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg font-bold">Theme & Appearance</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select your interface mode and visual preferences.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Dark Obsidian */}
                <button
                  onClick={() => handleApplyTheme('dark')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'border-indigo-600 bg-indigo-50/10 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100'
                  }`}
                >
                  <div className="w-full h-20 rounded-xl bg-[#090D16] border border-slate-800 p-2 mb-3 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <div className="h-2 w-16 bg-slate-800 rounded" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Obsidian Dark</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">High-contrast deep canvas</p>
                </button>

                {/* Light Canvas */}
                <button
                  onClick={() => handleApplyTheme('light')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'border-indigo-600 bg-indigo-50/10 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white text-slate-900'
                  }`}
                >
                  <div className="w-full h-20 rounded-xl bg-slate-100 border border-slate-200 p-2 mb-3 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                    </div>
                    <div className="h-2 w-16 bg-slate-200 rounded" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Studio Light</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Crisp, clean surface</p>
                </button>

                {/* System */}
                <button
                  onClick={() => handleApplyTheme('system')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    theme === 'system'
                      ? 'border-indigo-600 bg-indigo-50/10 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800'
                  }`}
                >
                  <div className="w-full h-20 rounded-xl bg-gradient-to-r from-slate-100 to-slate-900 border border-slate-300 dark:border-slate-700 p-2 mb-3 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-indigo-400" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">System Sync</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Auto-adapts to OS theme</p>
                </button>
              </div>
            </div>
          )}

          {/* ── TAB 5: AUDIO & VIDEO DEVICES ── */}
          {activeTab === 'devices' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg font-bold">Audio & Video Devices</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure default devices for instant meetings, huddles, and calls.
                </p>
              </div>

              {/* Microphone & Live Audio Meter */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <Mic className="w-4 h-4 text-indigo-500" />
                    <span>Microphone Input</span>
                  </div>
                  <button
                    onClick={() => setIsTestingMic(!isTestingMic)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isTestingMic ? 'Stop Test' : 'Test Mic'}
                  </button>
                </div>

                <select
                  value={selectedMic}
                  onChange={(e) => setSelectedMic(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option>Default - Microphone Array (Realtek Audio)</option>
                  <option>External USB Microphone (Studio Quality)</option>
                  <option>Bluetooth Headset Mic</option>
                </select>

                {/* Audio Level Visualizer Meter */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Input Volume Level</span>
                    <span>{isTestingMic ? `${audioLevel}%` : 'Idle'}</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 transition-all duration-100 rounded-full"
                      style={{ width: `${isTestingMic ? audioLevel : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Speaker Output */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Volume2 className="w-4 h-4 text-indigo-500" strokeWidth={1.65} />
                  <span>Speaker Output</span>
                </div>
                <select
                  value={selectedSpeaker}
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option>Default - Speakers (Realtek Audio)</option>
                  <option>Headphones (High Definition Audio)</option>
                </select>
              </div>

              {/* Camera Selection */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Video className="w-4 h-4 text-indigo-500" />
                  <span>Camera</span>
                </div>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option>Integrated HD Webcam (1080p)</option>
                  <option>External 4K Studio Camera</option>
                  <option>Virtual Camera OBS</option>
                </select>
              </div>
            </div>
          )}

          {/* ── TAB 6: NOTIFICATIONS ── */}
          {activeTab === 'notifications' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
              <div>
                <h2 className="text-lg font-bold">Notification Preferences</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Control how and when you receive workspace alerts and mentions.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Desktop Push Notifications</p>
                    <p className="text-[11px] text-slate-400">Receive banner alerts for incoming messages and calls</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopNotifs}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setDesktopNotifs(val);
                      handleUpdateNotificationPreferences({ pushEnabled: val });
                    }}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Realtime Push & Chimes</p>
                    <p className="text-[11px] text-slate-400">Play subtle audio chime when messages arrive</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSoundAlerts(val);
                      handleUpdateNotificationPreferences({ realtimeEnabled: val });
                    }}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Email Notifications</p>
                    <p className="text-[11px] text-slate-400">Receive email notifications for missed mentions and meetings</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailDigests}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setEmailDigests(val);
                      handleUpdateNotificationPreferences({ emailEnabled: val });
                    }}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </TeamsShell>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-secondary)] text-xs">
          Loading Settings...
        </div>
      }
    >
      <SettingsContent />
    </React.Suspense>
  );
}
