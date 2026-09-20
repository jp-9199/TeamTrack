'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { ChatItem } from '../../types/chat';
import { useAuth } from '../../components/auth/AuthContext';
import { useRealtime } from '../../components/realtime/RealtimeContext';
import { api } from '../../lib/api';
import { ConversationWithMembers, MessageWithSender, UserProfile } from '@teamtrack/shared-types';
import {
  MessagesSquare,
  Search,
  Video,
  Radio,
  Plus,
  SmilePlus,
  Paperclip,
  Image,
  ArrowUp,
  ArrowLeft,
  Mic,
  MoreHorizontal,
  UserPlus,
  Sparkles,
  Phone,
  Check,
  CheckCheck,
  X,
  User,
} from 'lucide-react';

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');
  const [conversationsData, setConversationsData] = useState<ConversationWithMembers[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, MessageWithSender[]>>({});
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isCalling, setIsCalling] = useState<'audio' | 'video' | 'huddle' | null>(null);

  // New features
  const [reactionsMap, setReactionsMap] = useState<Record<string, string[]>>({});
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string } | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // New Chat Modal state & Directory search
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatType, setNewChatType] = useState<'direct' | 'group'>('direct');
  const [newChatTitle, setNewChatTitle] = useState('');
  const [newChatParticipant, setNewChatParticipant] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSubmittingChat, setIsSubmittingChat] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userName = user?.displayName || 'Amir Asad Ullah Khan';

  const { subscribe, unsubscribe, on, startCall } = useRealtime();

  // Search users whenever newChatParticipant input changes
  useEffect(() => {
    if (!newChatParticipant.trim()) {
      setUserSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await api.fetchWithAuth<{ users: UserProfile[] }>(
          `/users/search?q=${encodeURIComponent(newChatParticipant)}`
        );
        if (res.success && res.data) {
          setUserSearchResults(res.data.users || []);
        } else {
          setUserSearchResults([]);
        }
      } catch {
        setUserSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [newChatParticipant]);

  // 1. Fetch conversations from backend
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.listConversations();
      if (res.success && res.data) {
        setConversationsData(res.data.conversations);
      }
    } catch {
      // Keep resilient
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // 2. Fetch messages when selected chat changes
  const fetchMessages = useCallback(async (chatId: string) => {
    if (!user || !chatId) return;
    try {
      const res = await api.listConversationMessages(chatId, { limit: 50 });
      if (res.success && res.data) {
        setMessagesMap((prev) => ({
          ...prev,
          [chatId]: [...res.data!.items].reverse(),
        }));
      }
    } catch {
      // Keep resilient
    }
  }, [user]);

  useEffect(() => {
    if (selectedChatId) {
      fetchMessages(selectedChatId);
    }
  }, [selectedChatId, fetchMessages]);

  // 3. Realtime subscription to selected conversation
  useEffect(() => {
    if (!selectedChatId) return;
    const topic = `conversation:${selectedChatId}`;
    subscribe(topic);

    return () => {
      unsubscribe(topic);
    };
  }, [selectedChatId, subscribe, unsubscribe]);

  // 4. Realtime message listener
  useEffect(() => {
    const unsub = on('message.created', (msg: MessageWithSender) => {
      if (!msg || !msg.conversationId) return;
      const convId = msg.conversationId;

      setMessagesMap((prev) => {
        const currentMsgs = prev[convId] || [];
        if (currentMsgs.some((m) => m.id === msg.id)) {
          return prev;
        }
        return {
          ...prev,
          [convId]: [...currentMsgs, msg],
        };
      });

      // Update conversations list
      setConversationsData((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, updatedAt: msg.createdAt } : c))
      );
    });

    return () => {
      unsub();
    };
  }, [on]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesMap, selectedChatId, isTyping]);

  // 5. Map conversations to UI chat items from real PostgreSQL data
  const mappedChats: ChatItem[] = useMemo(() => {
    return conversationsData.map((conv) => {
      const isGroup = conv.type === 'group';
      let title = conv.title;

      if (!title) {
        const otherMembers = conv.members.filter((m) => m.userId !== user?.id);
        if (otherMembers.length > 0) {
          title = otherMembers.map((m) => m.user?.displayName || 'User').join(', ');
        } else {
          title = isGroup ? 'Engineering Group' : 'Direct Message';
        }
      }

      const msgs = messagesMap[conv.id] || [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      return {
        id: conv.id,
        name: title,
        lastMessage: lastMsg ? lastMsg.content : 'No messages yet',
        time: lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        avatarBg: '#6366F1',
        avatarText: (title || 'C').substring(0, 2).toUpperCase(),
        isUnread: false,
        memberCount: conv.members.length,
        messages: msgs.map((m) => ({
          id: m.id,
          sender: m.senderId === user?.id ? (user?.displayName || 'You') : m.sender?.displayName || 'User',
          text: m.content,
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: m.senderId === user?.id,
          reactions: (reactionsMap[m.id] || []).map((emoji) => ({ emoji, count: 1 })),
        })),
      };
    });
  }, [conversationsData, messagesMap, user, reactionsMap]);

  // Auto-select on desktop ONLY on initial mount once
  const hasInitialAutoSelectedRef = useRef(false);

  useEffect(() => {
    if (!hasInitialAutoSelectedRef.current && mappedChats.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768) {
      hasInitialAutoSelectedRef.current = true;
      setSelectedChatId(mappedChats[0].id);
    }
  }, [mappedChats]);

  const activeChat = mappedChats.find((c) => c.id === selectedChatId);

  // 4. Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachedFile) || !selectedChatId) return;

    let contentToSend = inputText.trim();
    if (attachedFile) {
      contentToSend = contentToSend
        ? `${contentToSend}\n📎 [Attachment: ${attachedFile.name} (${attachedFile.size})]`
        : `📎 [Attachment: ${attachedFile.name} (${attachedFile.size})]`;
      setAttachedFile(null);
    }

    setInputText('');

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: MessageWithSender = {
      id: tempId,
      conversationId: selectedChatId,
      channelId: null,
      parentMessageId: null,
      contentType: 'text',
      isEdited: false,
      isDeleted: false,
      deletedAt: null,
      idempotencyKey: null,
      senderId: user?.id || 'self',
      content: contentToSend,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: user?.id || 'self',
        displayName: userName,
        avatarUrl: null,
        email: user?.email || '',
      },
    };

    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: [...(prev[selectedChatId] || []), optimisticMsg],
    }));

    try {
      const res = await api.sendConversationMessage(selectedChatId, { content: contentToSend });
      if (res.success && res.data) {
        setMessagesMap((prev) => ({
          ...prev,
          [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
            m.id === tempId ? (res.data!.message as MessageWithSender) : m
          ),
        }));
        void fetchConversations();
      }
    } catch {
      // Keep optimistic
    }
  };

  const renderFormattedMessage = (text?: string) => {
    const parts = (text || '').split(/(@[a-zA-Z0-9._-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={index}
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-400 dark:text-indigo-300"
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const handleAddReaction = (msgId: string, emoji: string) => {
    setReactionsMap((prev) => {
      const current = prev[msgId] || [];
      const updated = current.includes(emoji) ? current.filter((e) => e !== emoji) : [...current, emoji];
      return { ...prev, [msgId]: updated };
    });
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setAttachedFile({ name: f.name, size: `${(f.size / 1024).toFixed(0)} KB` });
    }
  };

  const handleStartCall = (type: 'audio' | 'video' | 'huddle') => {
    const activeConv = conversationsData.find((c) => c.id === selectedChatId);
    const otherMember = activeConv?.members?.find((m) => m.userId !== user?.id);
    const targetId = otherMember?.userId;
    const targetName = otherMember?.user?.displayName || activeChat?.name || 'Colleague';

    if (targetId) {
      startCall(targetId, targetName, type === 'video' ? 'video' : 'audio');
    } else {
      alert('To start a call, select a conversation with another registered team member.');
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    let targetParticipantId = selectedUser?.id;

    if (newChatType === 'direct') {
      if (!targetParticipantId) {
        if (userSearchResults.length > 0) {
          targetParticipantId = userSearchResults[0].id;
        } else {
          setNewChatError('Please search and select a registered colleague to start a direct message.');
          return;
        }
      }
    }

    if (!newChatTitle.trim() && newChatType === 'group') {
      setNewChatError('Please enter a group title.');
      return;
    }

    setIsSubmittingChat(true);
    setNewChatError(null);

    try {
      const res = await api.createConversation({
        type: newChatType,
        participantIds: targetParticipantId ? [targetParticipantId] : [],
        title: newChatType === 'group' ? newChatTitle.trim() : undefined,
      });

      if (res.success && res.data) {
        setShowNewChatModal(false);
        setNewChatTitle('');
        setNewChatParticipant('');
        setSelectedUser(null);
        setUserSearchResults([]);
        await fetchConversations();
        setSelectedChatId(res.data.conversation.id);
      } else {
        setNewChatError(res.error?.message || 'Failed to create conversation');
      }
    } catch (err: any) {
      setNewChatError(err?.message || 'Error creating conversation');
    } finally {
      setIsSubmittingChat(false);
    }
  };

  const filteredChats = mappedChats.filter((c) => {
    if (activeFilter === 'unread' && !c.isUnread) return false;
    if (searchQuery.trim() && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ── SECONDARY SIDEBAR: CONVERSATION LIST ──
  const sidebar = (
    <div className="flex flex-col h-full bg-slate-50/90 dark:bg-[#0B1120]/95 text-slate-800 dark:text-slate-100 p-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-2">
        <h2 className="text-sm font-bold tracking-tight">Direct Chats</h2>
        <button
          onClick={() => setShowNewChatModal(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Quick Search */}
      <div className="mb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
          }`}
        >
          All Chats
        </button>
        <button
          onClick={() => setActiveFilter('unread')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeFilter === 'unread'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
          }`}
        >
          Unread
        </button>
      </div>

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {filteredChats.length === 0 ? (
          <div className="text-center py-10 px-3 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
              <MessagesSquare className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No conversations yet</p>
            <p className="text-[11px] text-slate-400">Start a chat with your colleagues to collaborate.</p>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Start New Chat
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = selectedChatId === chat.id;
            return (
              <div
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800/80 shadow-xs ring-1 ring-slate-200 dark:ring-slate-700 font-bold'
                    : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white font-bold text-xs flex items-center justify-center">
                    {chat.name[0]?.toUpperCase() || 'C'}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{chat.name}</p>
                    <span className="text-[10px] text-slate-400">{chat.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{chat.lastMessage}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="chat" mobileView={selectedChatId ? 'content' : 'sidebar'}>
      <div className="flex flex-col h-full bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100 overflow-hidden min-w-0">
        {activeChat ? (
          <div className="flex flex-col h-full min-w-0">
            {/* Header with Free 1-Click Huddle & Mobile Back Button */}
            <div className="h-14 px-3 sm:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#090D16]/70 backdrop-blur-md flex items-center justify-between shrink-0 min-w-0 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {/* Back to chat list button */}
                <button
                  onClick={() => setSelectedChatId('')}
                  className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Back to chat list"
                  title="Back to chats"
                >
                  <ArrowLeft className="w-5 h-5" strokeWidth={2} />
                </button>

                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center">
                    {activeChat.name[0]?.toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#090D16]" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-sm font-bold leading-tight truncate">{activeChat.name}</h1>
                  <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="truncate">Active Now</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Audio Call */}
                <button
                  onClick={() => handleStartCall('audio')}
                  className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Voice Call"
                >
                  <Phone className="w-4 h-4" strokeWidth={1.65} />
                </button>

                {/* Video Call */}
                <button
                  onClick={() => handleStartCall('video')}
                  className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Video Call"
                >
                  <Video className="w-4 h-4" strokeWidth={1.65} />
                </button>

                {/* Drop-in Audio Huddle */}
                <button
                  onClick={() => handleStartCall('huddle')}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer group shrink-0"
                  title="Voice Huddle"
                >
                  <Radio className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.8} />
                  <span>Huddle</span>
                </button>

                {/* Add People */}
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Add colleagues"
                >
                  <UserPlus className="w-4 h-4" strokeWidth={1.65} />
                </button>
              </div>
            </div>

            {/* Connecting Call Banner */}
            {isCalling && (
              <div className="bg-indigo-600 text-white px-3 sm:px-6 py-2 flex items-center justify-between text-xs font-semibold animate-fadeIn">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span className="truncate">Connecting {isCalling} to {activeChat.name} with free unlimited HD audio...</span>
                </div>
                <button
                  onClick={() => setIsCalling(null)}
                  className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[11px] shrink-0 ml-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5 space-y-4 custom-scrollbar bg-slate-50/40 dark:bg-[#090D16]/40 min-w-0">
              {activeChat.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 sm:gap-2.5 max-w-[90%] sm:max-w-[80%] group ${
                    msg.isMe ? 'ml-auto flex-row-reverse' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                    {msg.sender[0]?.toUpperCase()}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className={`flex items-baseline gap-2 text-[11px] text-slate-400 ${msg.isMe ? 'justify-end' : ''}`}>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{msg.sender}</span>
                      <span>{msg.time}</span>
                    </div>

                    <div className="relative group/msg">
                      <div
                        className={`p-3 sm:p-3.5 rounded-2xl text-[13.5px] leading-relaxed shadow-xs ${
                          msg.isMe
                            ? 'bg-indigo-600 text-white rounded-tr-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{renderFormattedMessage(msg.text)}</p>
                      </div>

                      {/* Hover Reaction Toolbar */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-md px-2 py-1 flex items-center gap-1 z-10 ${
                          msg.isMe ? '-left-28' : '-right-28'
                        }`}
                      >
                        {['👍', '❤️', '🚀', '🔥'].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleAddReaction(msg.id, emoji)}
                            className="hover:scale-125 transition-transform text-xs p-0.5 cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      {/* Displayed Reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex items-center gap-1 mt-1 ${msg.isMe ? 'justify-end' : ''}`}>
                          {msg.reactions.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs shadow-xs"
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[10px] text-slate-400">{r.count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex items-center gap-2 text-xs text-slate-400 animate-fadeIn">
                  <div className="flex gap-1 items-center px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-[11px] text-slate-400 ml-1.5">{activeChat.name} is typing...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer Footer */}
            <div className="p-2.5 sm:p-4 bg-white dark:bg-[#090D16] border-t border-slate-200 dark:border-slate-800/80 shrink-0">
              {/* Attachment Preview Chip */}
              {attachedFile && (
                <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs border border-indigo-200 dark:border-indigo-800">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>{attachedFile.name} ({attachedFile.size})</span>
                  <button onClick={() => setAttachedFile(null)} className="hover:text-rose-500">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <form
                onSubmit={handleSendMessage}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 p-2.5 transition-all"
              >
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={`Send a message to ${activeChat.name}... (Press Enter to send)`}
                  rows={2}
                  className="w-full resize-none border-none outline-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent px-1 font-sans"
                />

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-1 text-slate-400">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileAttach}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      title="Attach file"
                    >
                      <Paperclip className="w-4 h-4" strokeWidth={1.65} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setInputText((prev) => prev + ' 🚀 ')}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      title="Insert emoji"
                    >
                      <SmilePlus className="w-4 h-4" strokeWidth={1.65} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsRecordingAudio(true);
                        setTimeout(() => {
                          setIsRecordingAudio(false);
                          setInputText((prev) => prev + ' 🎙️ [Voice note: 0:14]');
                        }, 1800);
                      }}
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        isRecordingAudio ? 'text-rose-500 animate-pulse' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Record voice note"
                    >
                      <Mic className="w-4 h-4" strokeWidth={1.65} />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!inputText.trim() && !attachedFile}
                    className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white shadow-sm flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Send message"
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center text-slate-400">
            <MessagesSquare className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" strokeWidth={1.5} />
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">No chat selected</h2>
            <p className="text-xs text-slate-400 mt-1">Select a conversation or start a new chat above.</p>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-100 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold">Start a New Conversation</h2>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateChat} className="mt-4 space-y-3">
              {newChatError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs">
                  {newChatError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Chat Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewChatType('direct')}
                    className={`py-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                      newChatType === 'direct'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Direct Message
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChatType('group')}
                    className={`py-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                      newChatType === 'group'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Group Chat
                  </button>
                </div>
              </div>

              {newChatType === 'group' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Group Title
                  </label>
                  <input
                    type="text"
                    value={newChatTitle}
                    onChange={(e) => setNewChatTitle(e.target.value)}
                    placeholder="e.g. Design Systems & UX"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              )}

              <div className="relative">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {newChatType === 'group' ? 'Add Members (Names or emails)' : 'Search Colleague (Name or Email)'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedUser ? `${selectedUser.displayName} (${selectedUser.email})` : newChatParticipant}
                    onChange={(e) => {
                      setSelectedUser(null);
                      setNewChatParticipant(e.target.value);
                    }}
                    placeholder="Type a name or email (e.g. Alice, Bob)..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:border-indigo-500"
                    required={newChatType === 'direct'}
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Dropdown of search results */}
                {userSearchResults.length > 0 && !selectedUser && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden max-h-48 overflow-y-auto">
                    {userSearchResults.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => {
                          setSelectedUser(u);
                          setNewChatParticipant(u.displayName);
                          setUserSearchResults([]);
                        }}
                        className="px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-500 font-bold text-[10px] flex items-center justify-center">
                            {u.displayName[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{u.displayName}</p>
                            <p className="text-[10px] text-slate-400">{u.email}</p>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-semibold">
                          Select
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingChat}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingChat ? 'Creating...' : 'Create Conversation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TeamsShell>
  );
}
