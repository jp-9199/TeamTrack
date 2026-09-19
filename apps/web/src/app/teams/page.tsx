'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import {
  Tooltip,
  Button,
  Input,
  TabList,
  Tab,
  Avatar,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import {
  ChatRegular,
  AddRegular,
  DocumentRegular,
  LockClosedRegular,
  NumberSymbolRegular,
  DismissRegular,
  SendRegular,
  VideoRegular,
  FolderRegular,
  PeopleTeamRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  AttachRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../components/auth/AuthContext';
import { api } from '../../lib/api';
import { Channel } from '@teamtrack/shared-types';

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
  const [newPostSubject, setNewPostSubject] = useState('');
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
        const colors = ['#5B5FC7', '#0078D4', '#107C10', '#D83B01', '#008272', '#B4009E'];
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
          avatarBg: '#5B5FC7',
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
    setIsLoadingFiles(true);
    try {
      const res = await fetch(`/api/v1/channels/${chanId}/files`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || 'demo-user-token'}`,
        },
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
        setNewPostSubject('');
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

      await fetch(`/api/v1/channels/${selectedChannelId}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || 'demo-user-token'}`,
        },
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
    <div className="flex flex-col h-full bg-[#ECEEF0] select-none text-[#242424]">
      {/* Sidebar Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight">Teams</h2>
        <Tooltip content="Create a team" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<AddRegular fontSize={18} />}
            onClick={() => setShowCreateTeamModal(true)}
            aria-label="Create a team"
          />
        </Tooltip>
      </div>

      {/* Teams & Channels Accordions */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 custom-scrollbar">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#616161] mt-8">
            <div className="w-12 h-12 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center mb-2.5">
              <PeopleTeamRegular fontSize={24} />
            </div>
            <span className="text-[13.5px] font-bold text-[#242424]">No teams yet</span>
            <span className="text-[11.5px] text-[#707070] mt-1 max-w-[180px]">
              Create a team to organize channels, discussions, and shared files.
            </span>
            <Button
              appearance="primary"
              size="small"
              icon={<AddRegular fontSize={14} />}
              onClick={() => setShowCreateTeamModal(true)}
              style={{ marginTop: '12px' }}
            >
              Create a team
            </Button>
          </div>
        ) : (
          teams.map((team) => {
            const isExpanded = expandedTeams[team.id] ?? false;
            const isTeamActive = selectedTeamId === team.id;

            return (
              <div key={team.id} className="space-y-0.5">
                <div
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isTeamActive ? 'bg-black/5' : 'hover:bg-black/5'
                  }`}
                  onClick={() => handleToggleTeam(team.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#616161]">
                      {isExpanded ? <ChevronDownRegular fontSize={12} /> : <ChevronRightRegular fontSize={12} />}
                    </span>
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: team.iconBg }}
                    >
                      {team.name.charAt(0)}
                    </div>
                    <span className="text-[13px] font-bold text-[#242424] truncate">{team.name}</span>
                  </div>

                  <Tooltip content="Add channel" relationship="label">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTeamId(team.id);
                        setShowCreateChannelModal(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded transition-opacity"
                    >
                      <AddRegular fontSize={14} />
                    </button>
                  </Tooltip>
                </div>

                {isExpanded && (
                  <div className="pl-6 space-y-0.5">
                    {team.channels.length === 0 ? (
                      <div className="py-1 px-3 text-[11.5px] text-[#707070]">No channels yet</div>
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
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors text-[13px] ${
                              isChannelActive
                                ? 'bg-white text-[#5B5FC7] font-bold shadow-xs'
                                : 'text-[#424242] hover:bg-black/5 hover:text-[#242424]'
                            }`}
                          >
                            <span className="text-[#616161] shrink-0">
                              {chan.isPrivate ? <LockClosedRegular fontSize={14} /> : <NumberSymbolRegular fontSize={14} />}
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

      <div className="p-3 border-t border-[#E1DFDD]">
        <Button
          appearance="subtle"
          icon={<AddRegular fontSize={16} />}
          onClick={() => setShowCreateTeamModal(true)}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          Create team
        </Button>
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="teams">
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {activeTeam && activeChannel ? (
          <div className="flex flex-col h-full">
            {/* Channel Header */}
            <header className="px-8 pt-4 pb-0 border-b border-[#E1DFDD] bg-white shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[20px] text-[#616161]">
                    {activeChannel.isPrivate ? <LockClosedRegular fontSize={20} /> : <NumberSymbolRegular fontSize={20} />}
                  </span>
                  <div>
                    <h1 className="text-[19px] font-bold text-[#242424] leading-tight">
                      {activeChannel.name}
                    </h1>
                    <p className="text-[11.5px] text-[#616161] mt-0.5">
                      {activeTeam.name} &bull; {activeChannel.description || 'Channel collaboration space'}
                    </p>
                  </div>
                </div>

                <Button
                  appearance="primary"
                  icon={<VideoRegular fontSize={16} />}
                  onClick={() => router.push(`/meetings/room/chan-${activeChannel.id}`)}
                >
                  Meet
                </Button>
              </div>

              {/* Official Fluent UI TabList */}
              <TabList
                selectedValue={activeTab}
                onTabSelect={(_, d) => setActiveTab(d.value as typeof activeTab)}
              >
                <Tab value="posts">Posts</Tab>
                <Tab value="files">Files {channelFiles.length > 0 && `(${channelFiles.length})`}</Tab>
              </TabList>
            </header>

            {/* TAB CONTENT: POSTS */}
            {activeTab === 'posts' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF9F8]">
                {/* Posts Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {isLoadingPosts ? (
                    <div className="flex items-center justify-center py-12 text-[#616161] text-[13px]">
                      Loading channel posts...
                    </div>
                  ) : channelPosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-[#616161]">
                      <div className="w-16 h-16 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center mb-3">
                        <ChatRegular fontSize={32} />
                      </div>
                      <h3 className="text-[18px] font-bold text-[#242424]">Welcome to #{activeChannel.name}</h3>
                      <p className="text-[13px] text-[#707070] mt-1 max-w-sm">
                        {activeChannel.description || 'This channel is ready for posts and team discussions.'}
                      </p>
                      <Button
                        appearance="primary"
                        icon={<AddRegular fontSize={16} />}
                        onClick={() => setIsComposerExpanded(true)}
                        style={{ marginTop: '16px' }}
                      >
                        Start a post
                      </Button>
                    </div>
                  ) : (
                    channelPosts.map((post) => (
                      <div
                        key={post.id}
                        className="bg-white rounded-xl border border-[#E1DFDD] shadow-xs overflow-hidden transition-all hover:border-[#D1D5DB]"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={post.author} size={32} color="colorful" />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px] font-bold text-[#242424]">{post.author}</span>
                                </div>
                                <span className="text-[11px] text-[#8A8886]">{post.time}</span>
                              </div>
                            </div>
                          </div>

                          <p className="text-[13px] text-[#242424] leading-relaxed mt-2 whitespace-pre-wrap">
                            {post.content}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Start a Post Composer */}
                <div className="p-4 bg-white border-t border-[#E1DFDD] shrink-0">
                  {!isComposerExpanded ? (
                    <button
                      onClick={() => setIsComposerExpanded(true)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#EBEAF9]/50 text-[#616161] hover:text-[#5B5FC7] rounded-xl text-[13px] font-medium transition-all cursor-pointer border border-[#E1DFDD]"
                    >
                      <span>Start a post in #{activeChannel.name}...</span>
                      <SendRegular fontSize={18} />
                    </button>
                  ) : (
                    <form onSubmit={handleSendPost} className="space-y-2.5 bg-white border border-[#5B5FC7] rounded-xl p-3 shadow-sm">
                      <textarea
                        value={newPostContent}
                        onChange={(e) => setNewPostContent(e.target.value)}
                        placeholder="Start typing your post..."
                        rows={3}
                        className="w-full px-2 py-1 text-[13px] outline-none resize-none text-[#242424] placeholder-[#707070]"
                        autoFocus
                        required
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-[#F3F2F1]">
                        <div className="flex items-center gap-1 text-[#616161]">
                          <Tooltip content="Attach file" relationship="label">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<AttachRegular fontSize={18} />}
                              onClick={() => fileInputRef.current?.click()}
                            />
                          </Tooltip>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            appearance="secondary"
                            size="small"
                            onClick={() => {
                              setIsComposerExpanded(false);
                              setNewPostContent('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            appearance="primary"
                            size="small"
                            type="submit"
                            disabled={!newPostContent.trim() || isSubmittingPost}
                          >
                            {isSubmittingPost ? 'Posting...' : 'Post'}
                          </Button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: FILES */}
            {activeTab === 'files' && (
              <div className="flex-1 overflow-y-auto p-6 bg-[#FAF9F8]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-bold text-[#242424]">Channel Documents</h2>
                  <Button
                    appearance="primary"
                    icon={<AttachRegular fontSize={16} />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingFile}
                  >
                    {isUploadingFile ? 'Uploading...' : 'Upload File'}
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {isLoadingFiles ? (
                  <div className="py-12 text-center text-[#616161] text-[13px]">Loading files...</div>
                ) : channelFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-[#616161] bg-white rounded-xl border border-[#E1DFDD]">
                    <div className="w-14 h-14 rounded-full bg-black/5 flex items-center justify-center mb-2.5 text-[#5B5FC7]">
                      <FolderRegular fontSize={28} />
                    </div>
                    <span className="text-[14px] font-bold text-[#242424]">No files in this channel</span>
                    <span className="text-[12px] text-[#707070] mt-1 max-w-sm">
                      Upload specifications, reports, or assets to make them accessible to all channel members.
                    </span>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#E1DFDD] overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse text-[12.5px]">
                      <thead>
                        <tr className="border-b border-[#E1DFDD] bg-[#FAF9F8] text-[#616161] font-semibold">
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-4">Uploaded By</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelFiles.map((file) => (
                          <tr key={file.id} className="border-b border-[#F3F2F1] hover:bg-black/5 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-[#242424] flex items-center gap-2">
                              <DocumentRegular fontSize={16} className="text-[#5B5FC7]" />
                              {file.fileName}
                            </td>
                            <td className="py-2.5 px-4 text-[#424242]">{file.uploaderName}</td>
                            <td className="py-2.5 px-4 text-[#616161]">{new Date(file.createdAt).toLocaleDateString()}</td>
                            <td className="py-2.5 px-4 text-[#616161]">{Math.round(file.fileSizeBytes / 1024)} KB</td>
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
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white select-none">
            <div className="w-20 h-20 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center mb-4">
              <PeopleTeamRegular fontSize={40} />
            </div>
            <h2 className="text-[22px] font-bold text-[#242424]">Welcome to Teams</h2>
            <p className="text-[13.5px] text-[#616161] max-w-md mt-2 leading-relaxed">
              Collaborate with your organization in structured channels. Create teams for projects, departments, or cross-functional groups.
            </p>
            <Button
              appearance="primary"
              icon={<AddRegular fontSize={18} />}
              onClick={() => setShowCreateTeamModal(true)}
              style={{ marginTop: '20px' }}
            >
              Create a team
            </Button>
          </div>
        )}
      </div>

      {/* ── CREATE TEAM DIALOG ── */}
      <Dialog open={showCreateTeamModal} onOpenChange={(_, d) => setShowCreateTeamModal(d.open)}>
        <DialogSurface>
          <form onSubmit={handleCreateTeam}>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => setShowCreateTeamModal(false)}
                    aria-label="Close"
                  />
                }
              >
                Create a team
              </DialogTitle>
              <DialogContent className="space-y-4 py-2">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Team Name <span className="text-[#C4314B]">*</span>
                  </label>
                  <Input
                    value={newTeamName}
                    onChange={(_, d) => setNewTeamName(d.value)}
                    placeholder="e.g. Engineering, Sales, Product"
                    style={{ width: '100%' }}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Description
                  </label>
                  <textarea
                    value={newTeamDesc}
                    onChange={(e) => setNewTeamDesc(e.target.value)}
                    placeholder="What is this team about?"
                    rows={3}
                    className="w-full px-3 py-2 border border-[#D1D5DB] rounded-lg text-[13px] outline-none focus:border-[#5B5FC7] placeholder-[#707070] resize-none"
                  />
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setShowCreateTeamModal(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit" disabled={!newTeamName.trim() || isSubmittingTeam}>
                  {isSubmittingTeam ? 'Creating...' : 'Create Team'}
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>

      {/* ── CREATE CHANNEL DIALOG ── */}
      <Dialog open={showCreateChannelModal} onOpenChange={(_, d) => setShowCreateChannelModal(d.open)}>
        <DialogSurface>
          <form onSubmit={handleCreateChannel}>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => setShowCreateChannelModal(false)}
                    aria-label="Close"
                  />
                }
              >
                Create a channel
              </DialogTitle>
              <DialogContent className="space-y-4 py-2">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Channel Name <span className="text-[#C4314B]">*</span>
                  </label>
                  <Input
                    value={newChannelName}
                    onChange={(_, d) => setNewChannelName(d.value)}
                    contentBefore={<span className="text-[#616161] font-bold">#</span>}
                    placeholder="e.g. announcements, roadmap"
                    style={{ width: '100%' }}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Description
                  </label>
                  <textarea
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                    placeholder="What is this channel's purpose?"
                    rows={3}
                    className="w-full px-3 py-2 border border-[#D1D5DB] rounded-lg text-[13px] outline-none focus:border-[#5B5FC7] placeholder-[#707070] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1.5">
                    Privacy
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewChannelIsPrivate(false)}
                      className={`py-2 px-3 rounded-lg text-[12px] font-semibold border cursor-pointer transition-all flex items-center gap-1.5 ${
                        !newChannelIsPrivate
                          ? 'border-[#5B5FC7] bg-[#EBEAF9] text-[#5B5FC7]'
                          : 'border-[#D1D5DB] bg-white text-[#424242] hover:bg-black/5'
                      }`}
                    >
                      <NumberSymbolRegular fontSize={15} />
                      Standard (Public)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewChannelIsPrivate(true)}
                      className={`py-2 px-3 rounded-lg text-[12px] font-semibold border cursor-pointer transition-all flex items-center gap-1.5 ${
                        newChannelIsPrivate
                          ? 'border-[#5B5FC7] bg-[#EBEAF9] text-[#5B5FC7]'
                          : 'border-[#D1D5DB] bg-white text-[#424242] hover:bg-black/5'
                      }`}
                    >
                      <LockClosedRegular fontSize={15} />
                      Private
                    </button>
                  </div>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setShowCreateChannelModal(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit" disabled={!newChannelName.trim() || isSubmittingChannel}>
                  {isSubmittingChannel ? 'Creating...' : 'Create Channel'}
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>
    </TeamsShell>
  );
}
