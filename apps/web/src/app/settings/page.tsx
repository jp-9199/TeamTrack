'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import {
  Button,
  Input,
  Switch,
  Dropdown,
  Option,
  Avatar,
  Divider,
  Card,
  Tab,
  TabList,
} from '@fluentui/react-components';
import {
  PersonRegular,
  ColorRegular,
  AlertRegular,
  MicRegular,
  LockClosedRegular,
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'general' | 'appearance' | 'notifications' | 'devices' | 'privacy'>('general');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [soundNotifs, setSoundNotifs] = useState(true);
  const [bannerNotifs, setBannerNotifs] = useState(true);
  const [selectedMic, setSelectedMic] = useState('Default - Microphone (High Definition Audio)');
  const [selectedSpeaker, setSelectedSpeaker] = useState('Default - Speakers (Realtek Audio)');
  const [selectedCamera, setSelectedCamera] = useState('Integrated Webcam (04f2:b6d9)');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const userName = user?.displayName || 'Amir Asad Ullah Khan';
  const userEmail = user?.email || 'user@teamtrack.local';

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-[#ECEEF0] text-[#242424] p-3 select-none">
      <h2 className="text-[18px] font-bold px-2 pt-2 pb-3">Settings</h2>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setSelectedTab('general')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all text-left cursor-pointer ${
            selectedTab === 'general' ? 'bg-white font-semibold text-[#5B5FC7] shadow-xs' : 'hover:bg-black/5 text-[#424242]'
          }`}
        >
          <PersonRegular fontSize={18} />
          <span>General & Account</span>
        </button>

        <button
          onClick={() => setSelectedTab('appearance')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all text-left cursor-pointer ${
            selectedTab === 'appearance' ? 'bg-white font-semibold text-[#5B5FC7] shadow-xs' : 'hover:bg-black/5 text-[#424242]'
          }`}
        >
          <ColorRegular fontSize={18} />
          <span>Appearance</span>
        </button>

        <button
          onClick={() => setSelectedTab('notifications')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all text-left cursor-pointer ${
            selectedTab === 'notifications' ? 'bg-white font-semibold text-[#5B5FC7] shadow-xs' : 'hover:bg-black/5 text-[#424242]'
          }`}
        >
          <AlertRegular fontSize={18} />
          <span>Notifications</span>
        </button>

        <button
          onClick={() => setSelectedTab('devices')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all text-left cursor-pointer ${
            selectedTab === 'devices' ? 'bg-white font-semibold text-[#5B5FC7] shadow-xs' : 'hover:bg-black/5 text-[#424242]'
          }`}
        >
          <MicRegular fontSize={18} />
          <span>Devices (Audio & Video)</span>
        </button>

        <button
          onClick={() => setSelectedTab('privacy')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all text-left cursor-pointer ${
            selectedTab === 'privacy' ? 'bg-white font-semibold text-[#5B5FC7] shadow-xs' : 'hover:bg-black/5 text-[#424242]'
          }`}
        >
          <LockClosedRegular fontSize={18} />
          <span>Privacy & Security</span>
        </button>
      </div>

      <div className="mt-auto p-2 border-t border-[#E1DFDD]/60">
        <Link
          href="/settings/profile"
          className="text-[12px] text-[#5B5FC7] hover:underline block py-1 font-medium"
        >
          → Detailed Profile Settings
        </Link>
        <Link
          href="/settings/security"
          className="text-[12px] text-[#5B5FC7] hover:underline block py-1 font-medium"
        >
          → Security & Password
        </Link>
        <Link
          href="/settings/sessions"
          className="text-[12px] text-[#5B5FC7] hover:underline block py-1 font-medium"
        >
          → Active Sessions
        </Link>
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="settings">
      <div className="flex-1 overflow-y-auto bg-white p-8 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-6">
          {savedSuccess && (
            <div className="p-3 bg-green-50 text-green-800 border border-green-200 rounded-lg flex items-center gap-2 text-[13px] animate-fadeIn">
              <CheckmarkCircleRegular fontSize={18} className="text-green-600" />
              <span>Settings saved successfully.</span>
            </div>
          )}

          {/* 1. General & Account Tab */}
          {selectedTab === 'general' && (
            <section className="space-y-6">
              <div>
                <h1 className="text-[20px] font-bold text-[#242424]">General & Account</h1>
                <p className="text-[13px] text-[#616161] mt-0.5">Manage your profile, language, and startup preferences.</p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#FAF9F8] border border-[#E1DFDD]">
                <Avatar name={userName} size={56} color="colorful" badge={{ status: 'available' }} />
                <div>
                  <h3 className="text-[15px] font-bold text-[#242424]">{userName}</h3>
                  <p className="text-[12px] text-[#616161]">{userEmail}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-[#EBEAF9] text-[#5B5FC7] text-[11px] font-semibold rounded">
                    Enterprise Member
                  </span>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-[13px] font-semibold text-[#242424] mb-1">Display Name</label>
                  <Input defaultValue={userName} style={{ width: '100%' }} />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#242424] mb-1">Email Address</label>
                  <Input defaultValue={userEmail} disabled style={{ width: '100%' }} />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Auto-start application</div>
                    <div className="text-[12px] text-[#616161]">Automatically start TeamTrack when logging into Windows.</div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Open application in background</div>
                    <div className="text-[12px] text-[#616161]">Start TeamTrack minimized to the system tray.</div>
                  </div>
                  <Switch />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <Button appearance="primary" onClick={handleSave}>Save changes</Button>
                <Button appearance="secondary" onClick={() => logout ? logout() : router.push('/login')}>Sign out</Button>
              </div>
            </section>
          )}

          {/* 2. Appearance Tab */}
          {selectedTab === 'appearance' && (
            <section className="space-y-6">
              <div>
                <h1 className="text-[20px] font-bold text-[#242424]">Appearance & Theme</h1>
                <p className="text-[13px] text-[#616161] mt-0.5">Customize your Microsoft Teams visual experience.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    theme === 'light' ? 'border-[#5B5FC7] bg-[#EBEAF9]/40 shadow-xs' : 'border-[#E1DFDD] hover:border-[#B0B5BA]'
                  }`}
                >
                  <div className="h-20 rounded-lg bg-[#ECEEF0] border border-[#D1D5DB] mb-2.5 flex items-center justify-center">
                    <div className="w-12 h-6 bg-white rounded shadow-xs" />
                  </div>
                  <div className="text-[13px] font-bold text-center text-[#242424]">Light Theme (Default)</div>
                </div>

                <div
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    theme === 'dark' ? 'border-[#5B5FC7] bg-[#EBEAF9]/40 shadow-xs' : 'border-[#E1DFDD] hover:border-[#B0B5BA]'
                  }`}
                >
                  <div className="h-20 rounded-lg bg-[#1F1F1F] border border-[#333] mb-2.5 flex items-center justify-center">
                    <div className="w-12 h-6 bg-[#292929] rounded shadow-xs" />
                  </div>
                  <div className="text-[13px] font-bold text-center text-[#242424]">Dark Theme</div>
                </div>

                <div
                  onClick={() => setTheme('system')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    theme === 'system' ? 'border-[#5B5FC7] bg-[#EBEAF9]/40 shadow-xs' : 'border-[#E1DFDD] hover:border-[#B0B5BA]'
                  }`}
                >
                  <div className="h-20 rounded-lg bg-gradient-to-r from-[#ECEEF0] to-[#1F1F1F] border border-[#D1D5DB] mb-2.5 flex items-center justify-center">
                    <div className="w-12 h-6 bg-white/80 rounded shadow-xs" />
                  </div>
                  <div className="text-[13px] font-bold text-center text-[#242424]">Match System</div>
                </div>
              </div>

              <div className="pt-4">
                <Button appearance="primary" onClick={handleSave}>Apply theme</Button>
              </div>
            </section>
          )}

          {/* 3. Notifications Tab */}
          {selectedTab === 'notifications' && (
            <section className="space-y-6">
              <div>
                <h1 className="text-[20px] font-bold text-[#242424]">Notification Preferences</h1>
                <p className="text-[13px] text-[#616161] mt-0.5">Control how and when you receive message alerts.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E1DFDD]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Desktop Toast Banners</div>
                    <div className="text-[12px] text-[#616161]">Show native system banner popups for new messages and mentions.</div>
                  </div>
                  <Switch checked={bannerNotifs} onChange={(_, d) => setBannerNotifs(d.checked)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E1DFDD]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Notification Sounds</div>
                    <div className="text-[12px] text-[#616161]">Play Microsoft Teams audio chimes for incoming calls and notifications.</div>
                  </div>
                  <Switch checked={soundNotifs} onChange={(_, d) => setSoundNotifs(d.checked)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E1DFDD]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Missed Activity Emails</div>
                    <div className="text-[12px] text-[#616161]">Receive periodic digest emails when you are away from your computer.</div>
                  </div>
                  <Switch checked={emailNotifs} onChange={(_, d) => setEmailNotifs(d.checked)} />
                </div>
              </div>

              <div className="pt-4">
                <Button appearance="primary" onClick={handleSave}>Save preferences</Button>
              </div>
            </section>
          )}

          {/* 4. Devices Tab */}
          {selectedTab === 'devices' && (
            <section className="space-y-6">
              <div>
                <h1 className="text-[20px] font-bold text-[#242424]">Devices (Audio & Video)</h1>
                <p className="text-[13px] text-[#616161] mt-0.5">Configure hardware devices for Teams video meetings and calls.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#242424] mb-1.5">Microphone</label>
                  <Input value={selectedMic} onChange={(_, d) => setSelectedMic(d.value)} style={{ width: '100%' }} />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#242424] mb-1.5">Speakers</label>
                  <Input value={selectedSpeaker} onChange={(_, d) => setSelectedSpeaker(d.value)} style={{ width: '100%' }} />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#242424] mb-1.5">Camera</label>
                  <Input value={selectedCamera} onChange={(_, d) => setSelectedCamera(d.value)} style={{ width: '100%' }} />
                </div>

                <div className="p-4 rounded-xl bg-[#FAF9F8] border border-[#E1DFDD] flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Noise Suppression</div>
                    <div className="text-[12px] text-[#616161]">Suppress background noise during calls (AI-powered).</div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="pt-4">
                <Button appearance="primary" onClick={handleSave}>Save device setup</Button>
              </div>
            </section>
          )}

          {/* 5. Privacy Tab */}
          {selectedTab === 'privacy' && (
            <section className="space-y-6">
              <div>
                <h1 className="text-[20px] font-bold text-[#242424]">Privacy & Security</h1>
                <p className="text-[13px] text-[#616161] mt-0.5">Enterprise security and data compliance controls.</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E1DFDD]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Read Receipts</div>
                    <div className="text-[12px] text-[#616161]">Let others know when you have seen their messages.</div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E1DFDD]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#242424]">Telemetry & Diagnostics</div>
                    <div className="text-[12px] text-[#616161]">Send crash reports and anonymous diagnostic telemetry.</div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="pt-4">
                <Button appearance="primary" onClick={handleSave}>Save privacy settings</Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </TeamsShell>
  );
}
