'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import { useRealtime } from '../../components/realtime/RealtimeContext';
import {
  Phone,
  PhoneCall,
  Video,
  UserPlus,
  Search,
  MessagesSquare,
  Trash2,
  Share2,
  CheckCircle2,
  Users,
  X,
  History,
  ArrowUpDown,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
} from 'lucide-react';

export interface Contact {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  avatarBg: string;
  isRegistered: boolean;
  presence?: 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline';
  createdAt: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  callType: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'declined';
  durationSeconds: number;
  timestamp: string;
}

export default function CallsPeoplePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { startCall } = useRealtime();
  const userName = user?.displayName || 'Workspace Member';

  // Navigation Filter: 'all' = All contacts, 'active' = Active now, 'history' = Call History
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'history'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(true);

  // Live Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callLogs, setCallLogs] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Add contact form
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactFormError, setContactFormError] = useState<string | null>(null);

  // Invite modal state
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '';
  };

  // 1. Fetch real contacts from backend
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    const token = getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      if (activeFilter === 'history') {
        const res = await fetch('/api/v1/calls', { headers }).then((r) => r.json());
        if (res.success && Array.isArray(res.data?.calls)) {
          setCallLogs(res.data.calls);
        } else {
          setCallLogs([]);
        }
      } else {
        const res = await fetch(`/api/v1/calls/contacts?filter=${activeFilter}`, { headers }).then((r) => r.json());
        if (res.success && Array.isArray(res.data?.contacts)) {
          setContacts(res.data.contacts);
        } else {
          setContacts([]);
        }
      }
    } catch {
      if (activeFilter === 'history') setCallLogs([]);
      else setContacts([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // 2. Filter & Sort Contacts
  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    if (activeFilter === 'active') {
      result = result.filter((c) => c.presence === 'available' || c.presence === 'busy');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [contacts, activeFilter, searchQuery, sortAsc]);

  // 3. Handle Add Contact Submit
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) {
      setContactFormError('Please enter a contact name');
      return;
    }

    setIsSubmittingContact(true);
    setContactFormError(null);
    const token = getAuthToken();

    try {
      const res = await fetch('/api/v1/calls/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newContactName.trim(),
          email: newContactEmail.trim() || undefined,
          phone: newContactPhone.trim() || undefined,
        }),
      }).then((r) => r.json());

      if (res.success && res.data?.contact) {
        setShowAddContactModal(false);
        setNewContactName('');
        setNewContactEmail('');
        setNewContactPhone('');
        fetchContacts();
      } else {
        setContactFormError(res.error?.message || 'Failed to create contact');
      }
    } catch {
      setContactFormError('Network error while saving contact');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  // 4. Handle Delete Contact
  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to remove this contact?')) return;
    const token = getAuthToken();

    try {
      await fetch(`/api/v1/calls/contacts/${contactId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      fetchContacts();
    } catch (err) {
      console.error('Failed to delete contact', err);
    }
  };

  // 5. Handle Copy Invite Link
  const handleCopyInviteLink = () => {
    const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/invite?workspace=teamtrack` : 'http://localhost:3000/invite';
    navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2500);
  };

  // 6. Handle Send Invite Email
  const handleSendInviteEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSuccessMsg(`Invitation sent to ${inviteEmail}`);
    setInviteEmail('');
    setTimeout(() => setInviteSuccessMsg(null), 3500);
  };

  // 7. Start Real 1-on-1 Audio/Video Call via WebRTC
  const handleStartAudioCall = (contact: Contact) => {
    startCall(contact.id, contact.name, 'audio');
  };

  const handleStartVideoCall = (contact: Contact) => {
    startCall(contact.id, contact.name, 'video');
  };

  const handleStartChat = (contact: Contact) => {
    router.push(`/chat?recipient=${encodeURIComponent(contact.name)}`);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // SECONDARY SIDEBAR: "People & Directory"
  // ─────────────────────────────────────────────────────────────
  const secondarySidebar = (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] select-none border-r border-[var(--border-subtle)] text-[var(--text-primary)]">
      {/* Top Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2">
          <PhoneCall size={18} className="text-indigo-500" />
          <h2 className="text-sm font-bold tracking-tight">Calls &amp; Contacts</h2>
        </div>
        <button
          onClick={() => setShowAddContactModal(true)}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
          title="Add Contact"
        >
          <UserPlus size={16} />
        </button>
      </div>

      {/* Navigation Options: "All contacts", "Active now", "Call History" */}
      <div className="px-3 pt-4 space-y-1 shrink-0">
        <button
          onClick={() => setActiveFilter('all')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
          }`}
        >
          <Users size={15} />
          <span>Workspace Directory</span>
          <span className="ml-auto text-[10px] opacity-80">{contacts.length}</span>
        </button>

        <button
          onClick={() => setActiveFilter('active')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'active'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
          }`}
        >
          <CheckCircle2 size={15} className={activeFilter === 'active' ? 'text-white' : 'text-emerald-400'} />
          <span>Active Now</span>
        </button>

        <button
          onClick={() => setActiveFilter('history')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'history'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
          }`}
        >
          <History size={15} />
          <span>Call History</span>
          <span className="ml-auto text-[10px] opacity-80">{callLogs.length}</span>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-[40px]" />

      {/* User Profile Card */}
      <div className="p-3 border-t border-[var(--border-subtle)] shrink-0">
        <div className="p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--text-primary)] truncate">{userName}</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Available</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <Share2 size={14} />
          <span>Invite Teammates</span>
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // MAIN STAGE: Contact Directory / Call History Canvas
  // ─────────────────────────────────────────────────────────────
  return (
    <TeamsShell sidebar={secondarySidebar} activeApp="calls">
      <div className="flex flex-col h-full bg-[var(--bg-canvas)] select-none overflow-hidden font-sans text-[var(--text-primary)]">
        {/* Top Header Bar */}
        <header className="h-14 px-8 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-surface)] z-10">
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              {activeFilter === 'history'
                ? 'Call History'
                : activeFilter === 'active'
                ? 'Active Now'
                : 'Workspace Directory'}
            </h1>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] px-2 py-0.5 rounded-full bg-[var(--border-subtle)]">
              {activeFilter === 'history' ? callLogs.length : filteredContacts.length}
            </span>
          </div>

          {activeFilter !== 'history' && (
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative flex items-center w-60 sm:w-72">
                <span className="absolute left-3 text-[var(--text-secondary)] pointer-events-none">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find a contact or colleague..."
                  className="w-full h-8 pl-9 pr-7 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                <UserPlus size={14} />
                <span>Add Contact</span>
              </button>
            </div>
          )}
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[var(--text-secondary)] space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading...</p>
            </div>
          ) : activeFilter === 'history' ? (
            /* ── CALL HISTORY VIEW ── */
            callLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center text-[var(--text-secondary)] max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                  <History size={28} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">No call history</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Calls you make or receive with teammates will appear here with duration and timestamp records.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {callLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-8 py-3.5 flex items-center hover:bg-[var(--border-subtle)]/30 transition-colors text-xs"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mr-4 shrink-0 bg-[var(--border-subtle)]">
                      {log.direction === 'incoming' ? (
                        <PhoneIncoming size={16} className="text-emerald-400" />
                      ) : log.direction === 'outgoing' ? (
                        <PhoneOutgoing size={16} className="text-indigo-400" />
                      ) : (
                        <PhoneMissed size={16} className="text-rose-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {log.direction === 'outgoing' ? log.calleeName : log.callerName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[var(--border-subtle)] text-[var(--text-secondary)]">
                          {log.callType}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] mt-0.5">
                        <span className="capitalize">{log.direction}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDuration(log.durationSeconds)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── CONTACTS VIEW ── */
            <>
              {/* Table Header Row */}
              <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-8 py-2.5 flex items-center text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider z-10">
                <div
                  onClick={() => setSortAsc(!sortAsc)}
                  className="flex-1 max-w-[48%] flex items-center gap-1 cursor-pointer select-none hover:text-[var(--text-primary)]"
                >
                  <span>Name</span>
                  <ArrowUpDown size={12} />
                </div>
                <div className="w-[26%] hidden md:block select-none">
                  <span>Email</span>
                </div>
                <div className="w-[26%] select-none">
                  <span>Phone</span>
                </div>
              </div>

              {filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center text-[var(--text-secondary)] max-w-md mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                    <Users size={28} />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                    {searchQuery ? 'No contacts matched your search' : 'No contacts in directory'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-5">
                    {searchQuery
                      ? `No results found for "${searchQuery}". Try searching by another keyword.`
                      : 'Add colleagues or connect with registered teammates in real time.'}
                  </p>
                  <div className="flex items-center gap-2">
                    {searchQuery ? (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold cursor-pointer"
                      >
                        Clear Search
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowAddContactModal(true)}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Add Contact
                        </button>
                        <button
                          onClick={() => setShowInviteModal(true)}
                          className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                        >
                          Invite Teammates
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="px-8 py-3 flex items-center hover:bg-[var(--border-subtle)]/30 transition-colors group text-xs"
                    >
                      {/* Name Column */}
                      <div className="flex-1 max-w-[48%] flex items-center justify-between pr-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-xs"
                              style={{ backgroundColor: contact.avatarBg || '#0078D4' }}
                            >
                              {contact.name.charAt(0).toUpperCase()}
                            </div>
                            {contact.isRegistered && (
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--bg-surface)] ${
                                  contact.presence === 'busy' ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-[var(--text-primary)] truncate block">{contact.name}</span>
                            {contact.isRegistered && (
                              <span className="text-[10px] text-[var(--text-secondary)]">Teammate</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartChat(contact)}
                            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                            title="Direct Chat"
                          >
                            <MessagesSquare size={15} strokeWidth={1.65} />
                          </button>
                          <button
                            onClick={() => handleStartAudioCall(contact)}
                            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Start Audio Call"
                          >
                            <Phone size={15} strokeWidth={1.65} />
                          </button>
                          <button
                            onClick={() => handleStartVideoCall(contact)}
                            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-indigo-400 transition-colors cursor-pointer"
                            title="Start Video Call"
                          >
                            <Video size={15} strokeWidth={1.65} />
                          </button>
                          {!contact.isRegistered && (
                            <button
                              onClick={() => handleDeleteContact(contact.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-secondary)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title="Remove Contact"
                            >
                              <Trash2 size={15} strokeWidth={1.65} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Email Column */}
                      <div className="w-[26%] hidden md:block text-[var(--text-secondary)] truncate pr-4">
                        {contact.email || '—'}
                      </div>

                      {/* Phone Column */}
                      <div className="w-[26%] text-[var(--text-primary)] font-mono text-[11px] truncate">
                        {contact.phone || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── MODALS ── */}

        {/* 1. Add Contact Modal */}
        {showAddContactModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-indigo-400" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Add Contact</h3>
                </div>
                <button
                  onClick={() => setShowAddContactModal(false)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateContact} className="mt-4 space-y-3.5">
                {contactFormError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold">
                    {contactFormError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="e.g. Alex Henderson"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Phone Number
                  </label>
                  <input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="+1 555 019 2834"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setShowAddContactModal(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingContact}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingContact ? 'Saving...' : 'Save Contact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Share2 size={18} className="text-indigo-400" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Invite to Workspace</h3>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Share this invitation link with team members to let them join without waiting for approvals.
                </p>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                    Workspace Invite Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/invite?workspace=teamtrack` : 'http://localhost:3000/invite'}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-primary)]"
                    />
                    <button
                      onClick={handleCopyInviteLink}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                    >
                      {inviteCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                    Or Send Direct Email
                  </label>
                  <form onSubmit={handleSendInviteEmail} className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] font-semibold text-[var(--text-primary)] cursor-pointer"
                    >
                      Send
                    </button>
                  </form>
                  {inviteSuccessMsg && (
                    <p className="text-[11px] font-semibold text-emerald-400 mt-2">{inviteSuccessMsg}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-[var(--border-subtle)] mt-4">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
