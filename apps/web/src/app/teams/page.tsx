'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import { api } from '../../lib/api';
import type { Channel } from '@teamtrack/shared-types';
import {
  Hash,
  Lock,
  Video,
  Plus,
  Users,
  MessageSquare,
  Folder,
  FileText,
  Send,
  Paperclip,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Radio,
  X,
  RadioTower,
  Download,
  Search,
  Smile,
  Flame,
  Check,
  Zap,
  ArrowLeft,
} from 'lucide-react';

interface Post {
  id: string;
  subject: string;
  author: string;
  avatarBg?: string;
  roleTag?: string;
  time: string;
  content: string;
  reactions: Record<string, number>;
  userReactions: string[];
}

interface ChannelItem {
  id: string;
  name: string;
  isPrivate: boolean;
  description: string;
  unreadCount?: number;
}

interface TeamItem {
  id: string;
  name: string;
  iconBg: string;
  channels: ChannelItem[];
}

interface ChannelFileItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploaderName: string;
  createdAt: string;
  downloadUrl: string;
}

export default function TeamsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'posts' | 'files'>('posts');
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  // Real channel posts & files
  const [channelPosts, setChannelPosts] = useState<Post[]>([]);
  const [channelFiles, setChannelFiles] = useState<ChannelFileItem[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Modals state
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);

  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(false);
  const [isSubmittingChannel, setIsSubmittingChannel] = useState(false);

  // Post composer
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // 1. Fetch organizations and teams
  const fetchTeamsData = useCallback(async () => {
    if (!user) return;
    try {
      let orgId = activeOrgId;
      if (!orgId) {
        const orgRes = await api.listOrganizations();
        if (orgRes.success && orgRes.data?.organizations && orgRes.data.organizations.length > 0) {
          orgId = orgRes.data.organizations[0].id;
          setActiveOrgId(orgId);
        } else {
          const createOrgRes = await api.createOrganization({ name: 'TeamTrack Workspace' });
          if (createOrgRes.success && createOrgRes.data) {
            orgId = createOrgRes.data.organization.id;
            setActiveOrgId(orgId);
          }
        }
      }

      if (!orgId) return;

      const teamsRes = await api.listTeams(orgId);
      if (teamsRes.success && teamsRes.data?.teams) {
        const colors = ['#6366f1', '#3b82f6', '#10b981', '#f97316', '#06b6d4', '#ec4899'];
        const fullTeams: TeamItem[] = [];

        for (let i = 0; i < teamsRes.data.teams.length; i++) {
          const t = teamsRes.data.teams[i];
          const chanRes = await api.listChannels(t.id);
          const rawChannels: Channel[] = chanRes.success && chanRes.data?.channels ? chanRes.data.channels : [];

          const channels: ChannelItem[] = rawChannels.map((c) => ({
            id: c.id,
            name: c.name,
            isPrivate: Boolean(c.isPrivate),
            description: c.description || '',
          }));

          fullTeams.push({
            id: t.id,
            name: t.name,
            iconBg: colors[i % colors.length],
            channels,
          });
        }

        setTeams(fullTeams);

        if (fullTeams.length > 0) {
          const firstTeam = fullTeams[0];
          setSelectedTeamId((prev) => prev || firstTeam.id);
          setExpandedTeams((prev) => ({ ...prev, [firstTeam.id]: true }));
          if (firstTeam.channels.length > 0) {
            setSelectedChannelId((prev) => prev || firstTeam.channels[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load teams data', e);
    }
  }, [user, activeOrgId]);

  useEffect(() => {
    fetchTeamsData();
  }, [fetchTeamsData]);

  // 2. Fetch posts when channel changes
  const fetchChannelPosts = useCallback(async (chanId: string) => {
    if (!chanId) {
      setChannelPosts([]);
      return;
    }
    setIsLoadingPosts(true);
    try {
      const res = await api.listChannelMessages(chanId, { limit: 50 });
      if (res.success && res.data) {
        const rawItems: any[] = (res.data as any).items || (res.data as any).messages || [];
        const posts: Post[] = rawItems.map((m: any) => ({
          id: m.id,
          subject: '',
          author: m.senderName || m.sender?.displayName || 'Member',
          avatarBg: '#6366f1',
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: m.content,
          reactions: {},
          userReactions: [],
        }));
        setChannelPosts(posts);
      } else {
        setChannelPosts([]);
      }
    } catch {
      setChannelPosts([]);
    } finally {
      setIsLoadingPosts(false);
    }
  }, []);

  // 3. Fetch files when channel changes
  const fetchChannelFiles = useCallback(async (chanId: string) => {
    if (!chanId) {
      setChannelFiles([]);
      return;
    }
    const token = typeof window !== 'undefined' ? (localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '') : '';
    try {
      const res = await fetch(`/api/v1/channels/${chanId}/files`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => r.json());

      if (res.success && Array.isArray(res.data?.files)) {
        setChannelFiles(res.data.files);
      } else {
        setChannelFiles([]);
      }
    } catch {
      setChannelFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChannelId) {
      fetchChannelPosts(selectedChannelId);
      fetchChannelFiles(selectedChannelId);
    }
  }, [selectedChannelId, fetchChannelPosts, fetchChannelFiles]);

  const activeTeam = teams.find((t) => t.id === selectedTeamId);
  const activeChannel = activeTeam?.channels.find((c) => c.id === selectedChannelId);

  const handleToggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
    setSelectedTeamId(teamId);
  };

  // Create Team
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !activeOrgId) return;

    setIsSubmittingTeam(true);
    try {
      const res = await api.createTeam(activeOrgId, {
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });

      if (res.success && res.data) {
        const newTeamId = res.data.team.id;
        await api.createChannel(newTeamId, {
          name: 'general',
          description: 'General discussions for team.',
          isPrivate: false,
        });

        setShowCreateTeamModal(false);
        setNewTeamName('');
        setNewTeamDesc('');
        await fetchTeamsData();
        setSelectedTeamId(newTeamId);
      }
    } catch (err) {
      console.error('Failed to create team', err);
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  // Create Channel
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !selectedTeamId) return;

    setIsSubmittingChannel(true);
    try {
      const formattedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
      const res = await api.createChannel(selectedTeamId, {
        name: formattedName,
        description: newChannelDesc.trim() || undefined,
        isPrivate: newChannelIsPrivate,
      });

      if (res.success && res.data) {
        setShowCreateChannelModal(false);
        setNewChannelName('');
        setNewChannelDesc('');
        setNewChannelIsPrivate(false);
        await fetchTeamsData();
        setSelectedChannelId(res.data.channel.id);
      }
    } catch (err) {
      console.error('Failed to create channel', err);
    } finally {
      setIsSubmittingChannel(false);
    }
  };

  // Send Post
  const handleSendPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !selectedChannelId) return;

    setIsSubmittingPost(true);
    const content = newPostContent.trim();

    try {
      const res = await api.sendChannelMessage(selectedChannelId, { content });
      if (res.success) {
        setNewPostContent('');
        setIsComposerExpanded(false);
        await fetchChannelPosts(selectedChannelId);
      }
    } catch (err) {
      console.error('Failed to send channel post', err);
    } finally {
      setIsSubmittingPost(false);
    }
  };

  // File Upload to Channel
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedChannelId) return;

    const file = files[0];
    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = typeof window !== 'undefined' ? (localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '') : '';
      await fetch(`/api/v1/channels/${selectedChannelId}/files`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      await fetchChannelFiles(selectedChannelId);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── SECONDARY SIDEBAR: TEAMS & CHANNELS HIERARCHY ──
  const sidebar = (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] select-none text-[var(--text-primary)]">
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight">Teams &amp; Spaces</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold">
            {teams.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreateTeamModal(true)}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
          title="Create a team"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Free Tier Unlocked Banner in Sidebar */}
      <div className="mx-3 mt-2.5 p-2 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-[11px]">
          <Sparkles size={12} />
          <span>Unlimited Channels</span>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase">
          Free
        </span>
      </div>

      {/* Teams & Channels Accordions */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary)] mt-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
              <Users size={22} />
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)]">No teams yet</span>
            <span className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-[180px] leading-relaxed">
              Create your first team to organize channels and discussions.
            </span>
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Team</span>
            </button>
          </div>
        ) : (
          teams.map((team) => {
            const isExpanded = expandedTeams[team.id] ?? false;
            const isTeamActive = selectedTeamId === team.id;

            return (
              <div key={team.id} className="space-y-0.5">
                <div
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-xl cursor-pointer transition-colors ${
                    isTeamActive ? 'bg-[var(--border-subtle)] text-[var(--text-primary)]' : 'hover:bg-[var(--border-subtle)]/50 text-[var(--text-secondary)]'
                  }`}
                  onClick={() => handleToggleTeam(team.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[var(--text-secondary)]">
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-xs"
                      style={{ backgroundColor: team.iconBg }}
                    >
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold truncate text-[var(--text-primary)]">{team.name}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTeamId(team.id);
                      setShowCreateChannelModal(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-opacity cursor-pointer"
                    title="Add channel"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="pl-6 space-y-0.5 mt-0.5">
                    {team.channels.length === 0 ? (
                      <div className="py-1 px-2 text-[11px] text-[var(--text-secondary)]">No channels yet</div>
                    ) : (
                      team.channels.map((chan) => {
                        const isChannelActive = selectedTeamId === team.id && selectedChannelId === chan.id;
                        return (
                          <div
                            key={chan.id}
                            onClick={() => {
                              setSelectedTeamId(team.id);
                              setSelectedChannelId(chan.id);
                            }}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-medium ${
                              isChannelActive
                                ? 'bg-indigo-600/15 text-indigo-400 font-bold border border-indigo-500/20'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/40 hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <span className="shrink-0 text-[var(--text-secondary)]">
                              {chan.isPrivate ? <Lock size={12} /> : <Hash size={12} />}
                            </span>
                            <span className="truncate">{chan.name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-[var(--border-subtle)]">
        <button
          onClick={() => setShowCreateTeamModal(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <Plus size={14} />
          <span>New Team</span>
        </button>
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="teams" mobileView={selectedChannelId ? 'content' : 'sidebar'}>
      <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-canvas)] min-w-0">
        {activeTeam && activeChannel ? (
          <div className="flex flex-col h-full min-w-0">
            {/* Channel Header */}
            <header className="px-4 sm:px-6 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 flex flex-col gap-3 min-w-0">
              <div className="flex items-center justify-between min-w-0 gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Mobile Back Button */}
                  <button
                    onClick={() => setSelectedChannelId('')}
                    className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
                    aria-label="Back to channels"
                    title="Back to channels"
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                    {activeChannel.isPrivate ? <Lock size={16} /> : <Hash size={16} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-base font-bold text-[var(--text-primary)] leading-none">
                        {activeChannel.name}
                      </h1>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-subtle)] text-[var(--text-secondary)] font-medium">
                        {activeTeam.name}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {activeChannel.description || 'Collaboration & discussions space'}
                    </p>
                  </div>
                </div>

                {/* Header Action Buttons: Drop-in Huddle + Video Meet */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/meetings/room/huddle-${activeChannel.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                    title="Start an instant channel voice huddle"
                  >
                    <RadioTower size={14} className="animate-pulse" />
                    <span>Drop-In Huddle</span>
                  </button>

                  <button
                    onClick={() => router.push(`/meetings/room/chan-${activeChannel.id}`)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                  >
                    <Video size={14} />
                    <span>Meet</span>
                  </button>
                </div>
              </div>

              {/* View Tabs: Posts vs Files */}
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] -mb-3.5 pt-1">
                <button
                  onClick={() => setActiveTab('posts')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'posts'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <MessageSquare size={13} />
                  <span>Discussions</span>
                </button>

                <button
                  onClick={() => setActiveTab('files')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'files'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Folder size={13} />
                  <span>Files &amp; Assets</span>
                  {channelFiles.length > 0 && (
                    <span className="text-[10px] px-1 rounded-full bg-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {channelFiles.length}
                    </span>
                  )}
                </button>
              </div>
            </header>

            {/* TAB CONTENT: POSTS */}
            {activeTab === 'posts' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-canvas)]">
                {/* Posts Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {isLoadingPosts ? (
                    <div className="flex items-center justify-center py-12 text-[var(--text-secondary)] text-xs">
                      Loading channel feed...
                    </div>
                  ) : channelPosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--text-secondary)]">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                        <MessageSquare size={28} />
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">Welcome to #{activeChannel.name}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                        {activeChannel.description || 'This channel is ready for posts, updates, and team collaboration.'}
                      </p>
                      <button
                        onClick={() => setIsComposerExpanded(true)}
                        className="mt-4 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Start a Conversation</span>
                      </button>
                    </div>
                  ) : (
                    channelPosts.map((post) => (
                      <div
                        key={post.id}
                        className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xs hover:border-[var(--border-subtle)]/80 transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              {post.author.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">
                                {post.author}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)]">{post.time}</span>
                            </div>
                          </div>
                        </div>

                          <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                            {post.content}
                          </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Start a Post Composer */}
                <div className="p-4 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] shrink-0">
                  {!isComposerExpanded ? (
                    <button
                      onClick={() => setIsComposerExpanded(true)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-canvas)] hover:bg-[var(--border-subtle)]/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl text-xs font-medium transition-all cursor-pointer border border-[var(--border-subtle)]"
                    >
                      <span>Start a new discussion in #{activeChannel.name}...</span>
                      <Send size={15} />
                    </button>
                  ) : (
                    <form onSubmit={handleSendPost} className="space-y-3 bg-[var(--bg-surface)] border border-indigo-500/50 rounded-xl p-3 shadow-md">
                      <textarea
                        value={newPostContent}
                        onChange={(e) => setNewPostContent(e.target.value)}
                        placeholder="Write a message, share a link, or ask the team..."
                        rows={3}
                        className="w-full p-2 text-xs outline-none resize-none text-[var(--text-primary)] placeholder-[var(--text-secondary)] bg-transparent"
                        autoFocus
                        required
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                        <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] rounded-lg transition-colors cursor-pointer"
                            title="Attach document or asset"
                          >
                            <Paperclip size={16} />
                          </button>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsComposerExpanded(false);
                              setNewPostContent('');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!newPostContent.trim() || isSubmittingPost}
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isSubmittingPost ? 'Posting...' : 'Post'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: FILES */}
            {activeTab === 'files' && (
              <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-canvas)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Channel Assets &amp; Files</h2>
                    <p className="text-xs text-[var(--text-secondary)]">Unlimited cloud storage enabled for this space.</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingFile}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Paperclip size={14} />
                    <span>{isUploadingFile ? 'Uploading...' : 'Upload File'}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {isLoadingFiles ? (
                  <div className="py-12 text-center text-[var(--text-secondary)] text-xs">Loading files...</div>
                ) : channelFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)]">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3 text-indigo-400">
                      <Folder size={24} />
                    </div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">No files shared yet</span>
                    <span className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm leading-relaxed">
                      Upload PDFs, source code, designs, or recordings to make them accessible to all channel members.
                    </span>
                  </div>
                ) : (
                  <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] font-semibold">
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-4">Uploaded By</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Size</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelFiles.map((file) => (
                          <tr key={file.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--border-subtle)]/30 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)] flex items-center gap-2">
                              <FileText size={15} className="text-indigo-400 shrink-0" />
                              <span className="truncate max-w-[200px]">{file.fileName}</span>
                            </td>
                            <td className="py-2.5 px-4 text-[var(--text-secondary)]">{file.uploaderName}</td>
                            <td className="py-2.5 px-4 text-[var(--text-secondary)]">{new Date(file.createdAt).toLocaleDateString()}</td>
                            <td className="py-2.5 px-4 text-[var(--text-secondary)]">{Math.round(file.fileSizeBytes / 1024)} KB</td>
                            <td className="py-2.5 px-4 text-right">
                              <a
                                href={file.downloadUrl || '#'}
                                download
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                              >
                                <Download size={13} />
                                <span>Download</span>
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-canvas)] select-none">
            <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Welcome to Teams &amp; Spaces</h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mt-1.5 leading-relaxed">
              Organize real-time communication by team, department, or project. Channels include instant voice huddles, unlimited file storage, and integrated AI.
            </p>
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="mt-5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
            >
              <Plus size={16} />
              <span>Create a Team</span>
            </button>
          </div>
        )}
      </div>

      {/* ── CREATE TEAM MODAL ── */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Create Team</h3>
              </div>
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Team Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Core Engineering, Product Design"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Description
                </label>
                <textarea
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="What is this team responsible for?"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim() || isSubmittingTeam}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE CHANNEL MODAL ── */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Hash size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Create Channel</h3>
              </div>
              <button
                onClick={() => setShowCreateChannelModal(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Channel Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-[var(--text-secondary)] font-bold text-xs">#</span>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="roadmap, sprint-planning"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Description
                </label>
                <textarea
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  placeholder="What is this channel for?"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Privacy
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewChannelIsPrivate(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                      !newChannelIsPrivate
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                    }`}
                  >
                    <Hash size={14} />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChannelIsPrivate(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                      newChannelIsPrivate
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                    }`}
                  >
                    <Lock size={14} />
                    <span>Private</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowCreateChannelModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newChannelName.trim() || isSubmittingChannel}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingChannel ? 'Creating...' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TeamsShell>
  );
}
