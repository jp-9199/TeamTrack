'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import {
  Tooltip,
  Avatar,
  PresenceBadge,
  Button,
  Input,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItemRadio,
  MenuGroup,
  MenuGroupHeader,
} from '@fluentui/react-components';
import {
  PeopleRegular,
  PeopleFilled,
  CheckmarkCircleRegular,
  CheckmarkCircleFilled,
  SettingsRegular,
  MoreHorizontalRegular,
  SearchRegular,
  AddRegular,
  ShareRegular,
  ChatRegular,
  CallRegular,
  DismissRegular,
  PersonAddRegular,
  LinkRegular,
  ArrowSortUpRegular,
  ArrowSortDownRegular,
  DeleteRegular,
  PhoneRegular,
  MailRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../components/auth/AuthContext';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarBg: string;
  isRegistered: boolean;
  presence?: 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline';
  createdAt: string;
}

export default function CallsPeoplePage() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.displayName || 'Amir Asad Ullah Khan';

  // Navigation Filter: 'all' = All contacts, 'active' = Active now
  const [activeFilter, setActiveFilter] = useState<'all' | 'active'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(true);

  // Live Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Profile status
  const [presenceStatus, setPresenceStatus] = useState<'available' | 'busy' | 'away' | 'offline'>('available');

  // Modals
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  // Calling action feedback
  const [callingContact, setCallingContact] = useState<Contact | null>(null);

  // 1. Fetch real contacts from backend
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const res = await fetch(`/api/v1/calls/contacts?filter=${activeFilter}`, { headers }).then((r) => r.json());
      if (res.success && Array.isArray(res.data?.contacts)) {
        setContacts(res.data.contacts);
      } else {
        setContacts([]);
      }
    } catch {
      setContacts([]);
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';

    try {
      const res = await fetch('/api/v1/calls/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || 'demo-user-token' : 'demo-user-token';

    try {
      await fetch(`/api/v1/calls/contacts/${contactId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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

  // 7. Start Call / Chat action
  const handleStartCall = (contact: Contact) => {
    setCallingContact(contact);
    setTimeout(() => {
      setCallingContact(null);
      router.push(`/meetings/room/call-${contact.id}`);
    }, 1200);
  };

  const handleStartChat = (contact: Contact) => {
    router.push(`/chat?recipient=${encodeURIComponent(contact.name)}`);
  };

  // ─────────────────────────────────────────────────────────────
  // SECONDARY SIDEBAR: "People" (Fluent UI v9 Controls)
  // ─────────────────────────────────────────────────────────────
  const secondarySidebar = (
    <div className="flex flex-col h-full bg-white select-none border-r border-[#EDEBE9]">
      {/* Top Header: "People" + Settings Button */}
      <div className="h-[56px] px-5 flex items-center justify-between border-b border-transparent shrink-0">
        <h2 className="text-[19px] font-bold text-[#242424] tracking-tight">People</h2>
        <Tooltip content="People settings" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<SettingsRegular fontSize={18} />}
            onClick={() => setShowSettingsModal(true)}
            aria-label="People settings"
          />
        </Tooltip>
      </div>

      {/* Navigation Options: "All contacts" & "Active now" */}
      <div className="px-3 pt-2 space-y-1.5 shrink-0">
        <button
          onClick={() => setActiveFilter('all')}
          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[13.5px] font-medium transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'border border-[#242424] bg-[#F5F5F5] text-[#242424] font-bold shadow-xs'
              : 'text-[#424242] hover:bg-[#F5F5F5] hover:text-[#242424]'
          }`}
        >
          {activeFilter === 'all' ? (
            <PeopleFilled fontSize={18} className="text-[#242424]" />
          ) : (
            <PeopleRegular fontSize={18} className="text-[#616161]" />
          )}
          <span>All contacts</span>
        </button>

        <button
          onClick={() => setActiveFilter('active')}
          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[13.5px] font-medium transition-all cursor-pointer ${
            activeFilter === 'active'
              ? 'border border-[#242424] bg-[#F5F5F5] text-[#242424] font-bold shadow-xs'
              : 'text-[#424242] hover:bg-[#F5F5F5] hover:text-[#242424]'
          }`}
        >
          {activeFilter === 'active' ? (
            <CheckmarkCircleFilled fontSize={18} className="text-[#107C10]" />
          ) : (
            <CheckmarkCircleRegular fontSize={18} className="text-[#616161]" />
          )}
          <span>Active now</span>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-[40px]" />

      {/* User Profile Summary Card with Fluent UI Avatar & Presence Menu */}
      <div className="px-3 pb-4 shrink-0 relative">
        <div className="p-2.5 rounded-xl hover:bg-[#F5F5F5] transition-colors flex items-center justify-between border border-transparent hover:border-[#EDEBE9]">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={userName}
              size={36}
              color="colorful"
              badge={{ status: presenceStatus }}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[#242424] truncate leading-tight">{userName}</div>
              <div className="text-[11.5px] text-[#616161] mt-0.5">Your profile</div>
            </div>
          </div>

          <Menu
            positioning={{ position: 'above', align: 'end' }}
            checkedValues={{ presence: [presenceStatus] }}
            onCheckedValueChange={(_, data) => {
              const selected = data.checkedItems[0] as typeof presenceStatus;
              if (selected) setPresenceStatus(selected);
            }}
          >
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                size="small"
                icon={<MoreHorizontalRegular fontSize={16} />}
                aria-label="Profile options"
              />
            </MenuTrigger>
            <MenuPopover className="z-50 min-w-[200px]">
              <MenuList>
                <MenuGroup>
                  <MenuGroupHeader>Set presence</MenuGroupHeader>
                  <MenuItemRadio name="presence" value="available" icon={<PresenceBadge status="available" />}>
                    Available
                  </MenuItemRadio>
                  <MenuItemRadio name="presence" value="busy" icon={<PresenceBadge status="busy" />}>
                    Busy
                  </MenuItemRadio>
                  <MenuItemRadio name="presence" value="away" icon={<PresenceBadge status="away" />}>
                    Away
                  </MenuItemRadio>
                  <MenuItemRadio name="presence" value="offline" icon={<PresenceBadge status="offline" />}>
                    Appear offline
                  </MenuItemRadio>
                </MenuGroup>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      {/* Bottom Action: "Invite to Teams" Button */}
      <div className="p-3 border-t border-[#EDEBE9] shrink-0 bg-white">
        <Button
          appearance="secondary"
          icon={<ShareRegular fontSize={16} />}
          onClick={() => setShowInviteModal(true)}
          style={{ width: '100%' }}
        >
          Invite to Teams
        </Button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // MAIN STAGE: "All contacts" Table & Canvas
  // ─────────────────────────────────────────────────────────────
  return (
    <TeamsShell sidebar={secondarySidebar} activeApp="calls">
      <div className="flex flex-col h-full bg-white select-none overflow-hidden font-sans">
        {/* Top Header Bar */}
        <header className="h-[60px] px-8 border-b border-[#EDEBE9] flex items-center justify-between shrink-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-[#242424] tracking-tight">
              {activeFilter === 'active' ? 'Active now' : 'All contacts'}
            </h1>
            <span className="text-[12px] font-semibold text-[#616161] px-2 py-0.5 rounded-full bg-[#F5F5F5]">
              {filteredContacts.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input: Fluent UI Input */}
            <div className="w-[240px] sm:w-[280px]">
              <Input
                value={searchQuery}
                onChange={(_, data) => setSearchQuery(data.value)}
                contentBefore={<SearchRegular fontSize={16} className="text-[#616161]" />}
                contentAfter={
                  searchQuery ? (
                    <button onClick={() => setSearchQuery('')} className="p-0.5 hover:text-[#242424] text-[#888]">
                      <DismissRegular fontSize={14} />
                    </button>
                  ) : null
                }
                placeholder="Find a contact"
                style={{ width: '100%' }}
              />
            </div>

            {/* "+ Add contact" Button */}
            <Button
              appearance="primary"
              icon={<AddRegular fontSize={16} />}
              onClick={() => setShowAddContactModal(true)}
            >
              Add contact
            </Button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Table Header Row */}
          <div className="sticky top-0 bg-white border-b border-[#EDEBE9] px-8 py-2.5 flex items-center text-[12px] font-semibold text-[#616161] z-10">
            <div
              onClick={() => setSortAsc(!sortAsc)}
              className="flex-1 max-w-[48%] flex items-center gap-1 cursor-pointer select-none hover:text-[#242424]"
            >
              <span>Name</span>
              {sortAsc ? <ArrowSortUpRegular fontSize={14} /> : <ArrowSortDownRegular fontSize={14} />}
            </div>
            <div className="w-[26%] hidden md:block select-none">
              <span>Email</span>
            </div>
            <div className="w-[26%] select-none">
              <span>Phone</span>
            </div>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#616161] space-y-3">
              <div className="w-8 h-8 border-2 border-[#5B5FC7] border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] font-medium">Loading contacts...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            /* Empty State (Zero Dummy Data) */
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center text-[#616161] max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-[#5B5FC7]/10 text-[#5B5FC7] flex items-center justify-center mb-4">
                <PeopleRegular fontSize={32} />
              </div>
              <h3 className="text-[17px] font-bold text-[#242424] mb-1.5">
                {searchQuery ? 'No contacts matched your search' : 'No contacts yet'}
              </h3>
              <p className="text-[13px] text-[#616161] leading-relaxed mb-6">
                {searchQuery
                  ? `No contacts found for "${searchQuery}". Try clearing your search.`
                  : 'Add your colleagues or invite teammates to connect with them via chat, audio, and video calls.'}
              </p>
              <div className="flex items-center gap-3">
                {searchQuery ? (
                  <Button appearance="secondary" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <>
                    <Button appearance="primary" onClick={() => setShowAddContactModal(true)}>
                      + Add contact
                    </Button>
                    <Button appearance="secondary" onClick={() => setShowInviteModal(true)}>
                      Invite to Teams
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Table Rows with Native Fluent UI Avatars & Buttons */
            <div className="divide-y divide-[#EDEBE9]">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="px-8 py-2.5 flex items-center hover:bg-[#F8F8F8] transition-colors group text-[13px]"
                >
                  {/* Name Column (~48% width) */}
                  <div className="flex-1 max-w-[48%] flex items-center justify-between pr-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={contact.name}
                        size={32}
                        color="colorful"
                        badge={
                          contact.isRegistered && contact.presence
                            ? { status: contact.presence === 'do_not_disturb' ? 'do-not-disturb' : contact.presence }
                            : undefined
                        }
                      />
                      <span className="font-semibold text-[#242424] truncate">{contact.name}</span>
                    </div>

                    {/* Action Pill / Icons in Name Column */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {contact.isRegistered ? (
                        <div className="flex items-center gap-1 text-[#616161]">
                          <Tooltip content="Start chat" relationship="label">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<ChatRegular fontSize={16} />}
                              onClick={() => handleStartChat(contact)}
                            />
                          </Tooltip>
                          <Tooltip content="Audio call" relationship="label">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<CallRegular fontSize={16} />}
                              onClick={() => handleStartCall(contact)}
                            />
                          </Tooltip>
                          <Tooltip content="Remove contact" relationship="label">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<DeleteRegular fontSize={16} />}
                              onClick={() => handleDeleteContact(contact.id)}
                            />
                          </Tooltip>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            appearance="secondary"
                            size="small"
                            icon={<LinkRegular fontSize={12} />}
                            onClick={() => setShowInviteModal(true)}
                          >
                            Invite
                          </Button>

                          <Button
                            appearance="subtle"
                            size="small"
                            icon={<DeleteRegular fontSize={14} />}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteContact(contact.id)}
                            aria-label="Delete contact"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Email Column (~26% width) */}
                  <div className="w-[26%] hidden md:block text-[#616161] truncate pr-4 text-[12.5px]">
                    {contact.email || ''}
                  </div>

                  {/* Phone Column (~26% width) */}
                  <div className="w-[26%] text-[#242424] font-normal tracking-wide text-[12.5px] truncate">
                    {contact.phone || ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── OFFICIAL FLUENT UI DIALOGS ── */}

        {/* 1. Add Contact Dialog */}
        <Dialog open={showAddContactModal} onOpenChange={(_, data) => setShowAddContactModal(data.open)}>
          <DialogSurface>
            <form onSubmit={handleCreateContact}>
              <DialogBody>
                <DialogTitle
                  action={
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular />}
                      onClick={() => setShowAddContactModal(false)}
                      aria-label="Close"
                    />
                  }
                >
                  <div className="flex items-center gap-2">
                    <PersonAddRegular fontSize={20} className="text-[#5B5FC7]" />
                    <span>Add new contact</span>
                  </div>
                </DialogTitle>

                <DialogContent className="space-y-4 py-2">
                  {contactFormError && (
                    <div className="p-3 bg-[#FDE7E9] text-[#C4314B] rounded-lg text-[12.5px] font-semibold">
                      {contactFormError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Full Name <span className="text-[#C4314B]">*</span>
                    </label>
                    <Input
                      value={newContactName}
                      onChange={(_, d) => setNewContactName(d.value)}
                      placeholder="e.g. A Rehman Haf or Abubakar"
                      style={{ width: '100%' }}
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Phone Number
                    </label>
                    <Input
                      value={newContactPhone}
                      onChange={(_, d) => setNewContactPhone(d.value)}
                      contentBefore={<PhoneRegular fontSize={16} className="text-[#888]" />}
                      placeholder="+92 341 0087555"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      value={newContactEmail}
                      onChange={(_, d) => setNewContactEmail(d.value)}
                      contentBefore={<MailRegular fontSize={16} className="text-[#888]" />}
                      placeholder="contact@company.com"
                      style={{ width: '100%' }}
                    />
                  </div>
                </DialogContent>

                <DialogActions>
                  <Button appearance="secondary" onClick={() => setShowAddContactModal(false)}>
                    Cancel
                  </Button>
                  <Button appearance="primary" type="submit" disabled={isSubmittingContact}>
                    {isSubmittingContact ? 'Saving...' : 'Save Contact'}
                  </Button>
                </DialogActions>
              </DialogBody>
            </form>
          </DialogSurface>
        </Dialog>

        {/* 2. Invite to Teams Dialog */}
        <Dialog open={showInviteModal} onOpenChange={(_, data) => setShowInviteModal(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => setShowInviteModal(false)}
                    aria-label="Close"
                  />
                }
              >
                <div className="flex items-center gap-2">
                  <ShareRegular fontSize={20} className="text-[#5B5FC7]" />
                  <span>Invite people to Teams</span>
                </div>
              </DialogTitle>

              <DialogContent className="space-y-4 py-2">
                <p className="text-[13px] text-[#616161] leading-relaxed">
                  Share this link with colleagues to invite them directly to your TeamTrack workspace.
                </p>

                <div>
                  <label className="block text-[12px] font-semibold text-[#616161] mb-1.5">
                    Shareable workspace link
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/invite?workspace=teamtrack` : 'http://localhost:3000/invite'}
                      style={{ flex: 1 }}
                    />
                    <Button appearance="primary" onClick={handleCopyInviteLink}>
                      {inviteCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#EDEBE9]">
                  <label className="block text-[12px] font-semibold text-[#616161] mb-1.5">
                    Or invite via email
                  </label>
                  <form onSubmit={handleSendInviteEmail} className="flex gap-2">
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(_, d) => setInviteEmail(d.value)}
                      placeholder="teammate@company.com"
                      style={{ flex: 1 }}
                    />
                    <Button appearance="secondary" type="submit">
                      Send
                    </Button>
                  </form>
                  {inviteSuccessMsg && (
                    <p className="text-[12px] font-semibold text-[#107C10] mt-2 animate-fadeIn">{inviteSuccessMsg}</p>
                  )}
                </div>
              </DialogContent>

              <DialogActions>
                <Button appearance="secondary" onClick={() => setShowInviteModal(false)}>
                  Close
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/* 3. People Settings Dialog */}
        <Dialog open={showSettingsModal} onOpenChange={(_, data) => setShowSettingsModal(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => setShowSettingsModal(false)}
                    aria-label="Close"
                  />
                }
              >
                People Settings
              </DialogTitle>
              <DialogContent className="space-y-3 py-2 text-[13px] text-[#616161]">
                <p>Manage how contacts appear and sync with your Microsoft 365 or Google Workspace account.</p>
                <div className="p-3 bg-[#F5F5F5] rounded-xl flex justify-between items-center text-[12.5px] text-[#242424]">
                  <span>Auto-sync phone contacts</span>
                  <input type="checkbox" defaultChecked className="rounded text-[#5B5FC7]" />
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setShowSettingsModal(false)}>
                  Done
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/* 4. Calling Overlay Notification */}
        {callingContact && (
          <div className="fixed bottom-6 right-6 bg-[#242424] text-white p-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-4 z-50 animate-bounce">
            <div className="w-10 h-10 rounded-full bg-[#107C10] flex items-center justify-center text-white">
              <CallRegular fontSize={20} />
            </div>
            <div>
              <div className="text-[13.5px] font-bold">Calling {callingContact.name}...</div>
              <div className="text-[11.5px] text-[#A6A6A6]">Connecting to room...</div>
            </div>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
