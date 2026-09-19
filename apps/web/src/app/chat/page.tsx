'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { ChatItem } from '../../types/chat';
import { useAuth } from '../../components/auth/AuthContext';
import { api } from '../../lib/api';
import { ConversationWithMembers, MessageWithSender } from '@teamtrack/shared-types';
import {
  Tooltip,
  Avatar,
  Button,
  Input,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import {
  SearchRegular,
  VideoRegular,
  CallRegular,
  ComposeRegular,
  PeopleTeamRegular,
  DismissRegular,
  ChatMultipleRegular,
  EmojiRegular,
  AttachRegular,
  ImageRegular,
  SendFilled,
  SendRegular,
  MoreHorizontalRegular,
  PersonAddRegular,
} from '@fluentui/react-icons';

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');
  const [conversationsData, setConversationsData] = useState<ConversationWithMembers[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, MessageWithSender[]>>({});
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isCalling, setIsCalling] = useState<'audio' | 'video' | null>(null);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatType, setNewChatType] = useState<'direct' | 'group'>('direct');
  const [newChatTitle, setNewChatTitle] = useState('');
  const [newChatParticipant, setNewChatParticipant] = useState('');
  const [isSubmittingChat, setIsSubmittingChat] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const userName = user?.displayName || 'You';

  // 1. Fetch conversations from backend
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.listConversations();
      if (res.success && res.data) {
        setConversationsData(res.data.conversations);
        if (res.data.conversations.length > 0 && !selectedChatId) {
          setSelectedChatId(res.data.conversations[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch conversations', e);
    }
  }, [user, selectedChatId]);

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
    } catch (e) {
      console.error('Failed to fetch messages', e);
    }
  }, [user]);

  useEffect(() => {
    if (selectedChatId) {
      fetchMessages(selectedChatId);
    }
  }, [selectedChatId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesMap, selectedChatId]);

  // 3. Map conversations to UI chat items
  const mappedChats: ChatItem[] = useMemo(() => {
    return conversationsData.map((conv) => {
      const isGroup = conv.type === 'group';
      let title = conv.title;
      let avatarText = 'CH';

      if (!title) {
        const otherMembers = conv.members.filter((m) => m.userId !== user?.id);
        if (otherMembers.length > 0) {
          title = otherMembers.map((m) => m.user.displayName).join(', ');
        } else {
          title = isGroup ? 'Group Conversation' : 'Direct Message';
        }
      }

      avatarText = title
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      const msgs = messagesMap[conv.id] || [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      return {
        id: conv.id,
        name: title,
        lastMessage: lastMsg ? lastMsg.content : 'No messages yet',
        time: lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        avatarBg: '#5B5FC7',
        avatarText,
        isUnread: false,
        memberCount: conv.members.length,
        messages: msgs.map((m) => ({
          id: m.id,
          sender: m.senderId === user?.id ? 'You' : m.sender?.displayName || 'User',
          text: m.content,
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: m.senderId === user?.id,
          reactions: [],
        })),
      };
    });
  }, [conversationsData, messagesMap, user]);

  const activeChat = mappedChats.find((c) => c.id === selectedChatId);

  // 4. Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedChatId) return;

    const textToSend = inputText.trim();
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
      content: textToSend,
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
      const res = await api.sendConversationMessage(selectedChatId, { content: textToSend });
      if (res.success && res.data) {
        setMessagesMap((prev) => ({
          ...prev,
          [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
            m.id === tempId ? (res.data!.message as MessageWithSender) : m
          ),
        }));
        void fetchConversations();
      }
    } catch (err) {
      console.error('Send conversation message error:', err);
    }
  };

  // 5. Create conversation
  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatParticipant.trim() && newChatType === 'direct') {
      setNewChatError('Please enter a participant name or ID.');
      return;
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
        participantIds: [newChatParticipant.trim() || 'user-contact-1'],
        title: newChatType === 'group' ? newChatTitle.trim() : undefined,
      });

      if (res.success && res.data) {
        setShowNewChatModal(false);
        setNewChatTitle('');
        setNewChatParticipant('');
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

  const handleStartCall = (type: 'audio' | 'video') => {
    if (!activeChat) return;
    setIsCalling(type);
    fetch('/api/v1/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calleeId: activeChat.id,
        calleeName: activeChat.name,
        callType: type,
        direction: 'outgoing',
        status: 'completed',
        durationSeconds: 0,
      }),
    }).catch(() => {});

    setTimeout(() => {
      router.push(`/meetings/room/${activeChat.id}`);
    }, 1200);
  };

  const filteredChats = mappedChats.filter((c) => {
    if (activeFilter === 'unread' && !c.isUnread) return false;
    if (searchQuery.trim() && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ── SECONDARY SIDEBAR: CONVERSATION LIST ──
  const sidebar = (
    <div className="flex flex-col h-full bg-[#ECEEF0] select-none text-[#242424]">
      {/* Sidebar Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight">Chat</h2>
        <div className="flex items-center gap-0.5 text-[#424242]">
          <Tooltip content="Filter chats" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<SearchRegular fontSize={16} />}
              onClick={() => setShowSearchInput(!showSearchInput)}
            />
          </Tooltip>

          <Tooltip content="Meet now" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<VideoRegular fontSize={16} />}
              onClick={() => router.push(`/meetings/room/quick-meet-${Date.now()}`)}
            />
          </Tooltip>

          <Tooltip content="New chat" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ComposeRegular fontSize={16} />}
              onClick={() => setShowNewChatModal(true)}
            />
          </Tooltip>
        </div>
      </div>

      {/* Quick Search Bar */}
      {showSearchInput && (
        <div className="px-3 pb-2">
          <Input
            value={searchQuery}
            onChange={(_, d) => setSearchQuery(d.value)}
            contentBefore={<SearchRegular fontSize={14} className="text-[#616161]" />}
            contentAfter={
              searchQuery ? (
                <button onClick={() => setSearchQuery('')} className="text-[#616161] hover:text-[#242424]">
                  <DismissRegular fontSize={12} />
                </button>
              ) : null
            }
            placeholder="Filter by name..."
            style={{ width: '100%' }}
            size="small"
            autoFocus
          />
        </div>
      )}

      {/* Chat Category Filter Pills */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto custom-scrollbar text-[12px] font-semibold shrink-0">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer border ${
            activeFilter === 'all'
              ? 'bg-white text-[#242424] border-[#B0B5BA] shadow-xs font-bold'
              : 'bg-transparent text-[#616161] border-transparent hover:bg-white/60'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilter('unread')}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer border ${
            activeFilter === 'unread'
              ? 'bg-white text-[#242424] border-[#B0B5BA] shadow-xs font-bold'
              : 'bg-transparent text-[#616161] border-transparent hover:bg-white/60'
          }`}
        >
          Unread
        </button>
      </div>

      {/* Conversation List with Fluent UI Avatars */}
      <div className="flex-1 overflow-y-auto px-1 pt-1 space-y-0.5 custom-scrollbar">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#616161] mt-8">
            <div className="w-12 h-12 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center mb-2.5">
              <ChatMultipleRegular fontSize={24} />
            </div>
            <span className="text-[13.5px] font-bold text-[#242424]">No chats yet</span>
            <span className="text-[11.5px] text-[#707070] mt-1 max-w-[180px]">
              Start a new conversation to collaborate with colleagues.
            </span>
            <Button
              appearance="primary"
              size="small"
              icon={<ComposeRegular fontSize={14} />}
              onClick={() => setShowNewChatModal(true)}
              style={{ marginTop: '14px' }}
            >
              New chat
            </Button>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatItemRow
              key={chat.id}
              chat={chat}
              isSelected={selectedChatId === chat.id}
              onSelect={() => setSelectedChatId(chat.id)}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="chat">
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {activeChat ? (
          <div className="flex flex-col h-full">
            {/* Chat Stage Header */}
            <header className="h-[52px] px-6 border-b border-[#E1DFDD] bg-white flex items-center justify-between shrink-0 select-none shadow-xs">
              <div className="flex items-center gap-3">
                <Avatar
                  name={activeChat.name}
                  size={32}
                  color="colorful"
                  badge={{ status: 'available' }}
                />
                <div>
                  <h1 className="text-[15px] font-bold text-[#242424] leading-tight truncate max-w-sm">
                    {activeChat.name}
                  </h1>
                  <p className="text-[11px] text-[#616161]">
                    {activeChat.memberCount ? `${activeChat.memberCount} members` : 'Direct message'}
                  </p>
                </div>
              </div>

              {/* Header Action Icons */}
              <div className="flex items-center gap-1 text-[#424242]">
                <Tooltip content="Instant Video call" relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<VideoRegular fontSize={18} />}
                    onClick={() => handleStartCall('video')}
                    style={{ color: '#5B5FC7' }}
                  />
                </Tooltip>

                <Tooltip content="Instant Audio call" relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<CallRegular fontSize={18} />}
                    onClick={() => handleStartCall('audio')}
                    style={{ color: '#5B5FC7' }}
                  />
                </Tooltip>

                <div className="w-[1px] h-[20px] bg-[#E1DFDD] mx-1" />

                <Tooltip content="Add people to chat" relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<PersonAddRegular fontSize={18} />}
                    onClick={() => setShowNewChatModal(true)}
                  />
                </Tooltip>

                <Tooltip content="More options" relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<MoreHorizontalRegular fontSize={18} />}
                  />
                </Tooltip>
              </div>
            </header>

            {/* Calling Banner */}
            {isCalling && (
              <div className="bg-[#5B5FC7] text-white px-6 py-2.5 flex items-center justify-between text-[13px] font-medium animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                  <span>Connecting {isCalling} call to {activeChat.name}...</span>
                </div>
                <button
                  onClick={() => setIsCalling(null)}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-[12px] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar bg-[#FAF9F8]">
              {activeChat.messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#616161]">
                  <Avatar name={activeChat.name} size={64} color="colorful" style={{ marginBottom: '12px' }} />
                  <h3 className="text-[17px] font-bold text-[#242424]">{activeChat.name}</h3>
                  <p className="text-[12.5px] text-[#707070] mt-1 max-w-sm">
                    This is the start of your conversation. Send a message below to start collaborating!
                  </p>
                </div>
              ) : (
                activeChat.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 max-w-[80%] ${msg.isMe ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    <Avatar
                      name={msg.sender}
                      size={28}
                      color="colorful"
                      style={{ marginTop: '2px', flexShrink: 0 }}
                    />

                    <div>
                      <div className={`flex items-baseline gap-2 mb-1 ${msg.isMe ? 'justify-end' : ''}`}>
                        <span className="text-[12px] font-bold text-[#242424]">{msg.isMe ? 'You' : msg.sender}</span>
                        <span className="text-[10.5px] text-[#616161]">{msg.time}</span>
                      </div>

                      <div
                        className={`p-3 rounded-2xl text-[13.5px] leading-relaxed shadow-xs ${
                          msg.isMe
                            ? 'bg-[#EBEAF9] text-[#242424] rounded-tr-xs border border-[#5B5FC7]/20'
                            : 'bg-white text-[#242424] rounded-tl-xs border border-[#E1DFDD]'
                        }`}
                      >
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer Footer */}
            <footer className="p-4 bg-white border-t border-[#E1DFDD] shrink-0">
              <form
                onSubmit={handleSendMessage}
                className="border border-[#D1D5DB] rounded-xl bg-white p-2.5 shadow-xs focus-within:border-[#5B5FC7] focus-within:ring-1 focus-within:ring-[#5B5FC7] transition-all"
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
                  placeholder={`Type a message to ${activeChat.name}...`}
                  rows={2}
                  className="w-full resize-none border-none outline-none text-[13.5px] text-[#242424] placeholder-[#707070] font-sans px-1"
                />

                <div className="flex items-center justify-between pt-2 border-t border-[#F3F2F1] text-[#616161]">
                  <div className="flex items-center gap-1">
                    <Tooltip content="Attach file" relationship="label">
                      <button type="button" className="p-1.5 hover:bg-black/5 rounded cursor-pointer">
                        <AttachRegular fontSize={18} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Insert emoji" relationship="label">
                      <button type="button" className="p-1.5 hover:bg-black/5 rounded cursor-pointer">
                        <EmojiRegular fontSize={18} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Insert image" relationship="label">
                      <button type="button" className="p-1.5 hover:bg-black/5 rounded cursor-pointer">
                        <ImageRegular fontSize={18} />
                      </button>
                    </Tooltip>
                  </div>

                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className={`p-2 rounded-lg transition-all cursor-pointer ${
                      inputText.trim() ? 'text-[#5B5FC7] hover:bg-[#5B5FC7]/10' : 'text-[#B0B5BA] cursor-not-allowed'
                    }`}
                    aria-label="Send message"
                  >
                    {inputText.trim() ? <SendFilled fontSize={19} /> : <SendRegular fontSize={19} />}
                  </button>
                </div>
              </form>
            </footer>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white select-none">
            <div className="w-20 h-20 rounded-full bg-[#F3F2F1] text-[#5B5FC7] flex items-center justify-center mb-4">
              <ChatMultipleRegular fontSize={40} />
            </div>
            <h2 className="text-[22px] font-bold text-[#242424]">Welcome to Chat</h2>
            <p className="text-[13.5px] text-[#616161] max-w-md mt-2 leading-relaxed">
              Connect with teammates through 1:1 direct messages or create collaborative group chats.
              Messages, calls, and shared files sync here in real-time.
            </p>
            <Button
              appearance="primary"
              icon={<ComposeRegular fontSize={18} />}
              onClick={() => setShowNewChatModal(true)}
              style={{ marginTop: '20px' }}
            >
              Start a new conversation
            </Button>
          </div>
        )}
      </div>

      {/* ── NEW CHAT DIALOG ── */}
      <Dialog open={showNewChatModal} onOpenChange={(_, d) => { setShowNewChatModal(d.open); setNewChatError(null); }}>
        <DialogSurface>
          <form onSubmit={handleCreateChat}>
            <DialogBody>
              <DialogTitle
                action={
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => {
                      setShowNewChatModal(false);
                      setNewChatError(null);
                    }}
                    aria-label="Close"
                  />
                }
              >
                Start a new conversation
              </DialogTitle>
              <DialogContent className="space-y-4 py-2">
                {newChatError && (
                  <div className="p-3 rounded-lg bg-red-50 text-red-700 text-[12.5px] border border-red-200">
                    {newChatError}
                  </div>
                )}

                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1.5">
                    Conversation Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewChatType('direct')}
                      className={`py-2 px-3 rounded-lg text-[12.5px] font-semibold border cursor-pointer transition-all ${
                        newChatType === 'direct'
                          ? 'border-[#5B5FC7] bg-[#EBEAF9] text-[#5B5FC7]'
                          : 'border-[#D1D5DB] bg-white text-[#424242] hover:bg-black/5'
                      }`}
                    >
                      1:1 Direct Message
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewChatType('group')}
                      className={`py-2 px-3 rounded-lg text-[12.5px] font-semibold border cursor-pointer transition-all ${
                        newChatType === 'group'
                          ? 'border-[#5B5FC7] bg-[#EBEAF9] text-[#5B5FC7]'
                          : 'border-[#D1D5DB] bg-white text-[#424242] hover:bg-black/5'
                      }`}
                    >
                      Group Chat
                    </button>
                  </div>
                </div>

                {newChatType === 'group' && (
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                      Group Title
                    </label>
                    <Input
                      value={newChatTitle}
                      onChange={(_, d) => setNewChatTitle(d.value)}
                      placeholder="e.g. Project Delivery Sync"
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[12.5px] font-semibold text-[#242424] mb-1">
                    Recipient Name, Email, or User ID
                  </label>
                  <Input
                    value={newChatParticipant}
                    onChange={(_, d) => setNewChatParticipant(d.value)}
                    placeholder="e.g. colleague@teamtrack.local"
                    style={{ width: '100%' }}
                    required
                    autoFocus
                  />
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setShowNewChatModal(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit" disabled={isSubmittingChat}>
                  {isSubmittingChat ? 'Starting...' : 'Start Chat'}
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>
    </TeamsShell>
  );
}

function ChatItemRow({
  chat,
  isSelected,
  onSelect,
}: {
  chat: ChatItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2.5 px-2.5 py-2 mx-1 rounded-lg cursor-pointer transition-all select-none ${
        isSelected
          ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/5 font-semibold'
          : 'hover:bg-black/5'
      }`}
    >
      <Avatar
        name={chat.name}
        size={32}
        color="colorful"
        badge={{ status: 'available' }}
        style={{ flexShrink: 0 }}
      />

      <div className="flex-1 min-w-0 pr-1">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className="text-[13px] truncate text-[#242424] font-medium">{chat.name}</span>
          <span className="text-[10.5px] text-[#616161] shrink-0 ml-1">{chat.time}</span>
        </div>
        <p className="text-[11.5px] text-[#616161] truncate">{chat.lastMessage || 'No messages yet'}</p>
      </div>
    </div>
  );
}
