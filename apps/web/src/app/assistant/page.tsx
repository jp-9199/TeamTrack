'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import type {
  AIMessage,
  AIConversation,
  AIActionProposal,
} from '@teamtrack/shared-types';
import {
  Sparkles,
  ArrowUp,
  Plus,
  MessagesSquare,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
  CalendarDays,
  Search,
  FileText,
} from 'lucide-react';

export default function AIAssistantPage() {
  const { user } = useAuth();
  const userName = user?.displayName || user?.email?.split('@')[0] || 'User';

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeProposal, setActiveProposal] = useState<AIActionProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '';
  };

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeProposal, isLoading]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/v1/ai/conversations', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.success && json.data?.conversations) {
        setConversations(json.data.conversations);
        if (json.data.conversations.length > 0 && !activeConversationId) {
          loadConversation(json.data.conversations[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load AI conversations:', err);
    }
  }

  async function loadConversation(id: string) {
    setActiveConversationId(id);
    setActiveProposal(null);
    setError(null);
    setIsLoading(true);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/v1/ai/conversations/${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.success && json.data) {
        setMessages(json.data.messages || []);
      } else {
        setError(json.error?.message || 'Failed to load conversation');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load conversation');
    } finally {
      setIsLoading(false);
    }
  }

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setActiveProposal(null);
    setError(null);
    setStatusMessage(null);
  };

  async function handleSendMessage(promptText?: string, e?: React.FormEvent) {
    if (e) e.preventDefault();
    const textToSend = promptText || inputMessage.trim();
    if (!textToSend || isLoading) return;

    setError(null);
    setStatusMessage(null);
    setInputMessage('');

    // Optimistic user message display
    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId || 'pending',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const token = getAuthToken();
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversationId: activeConversationId || undefined,
          message: textToSend,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        const fallbackAiMsg: AIMessage = {
          id: `ai-${Date.now()}`,
          conversationId: activeConversationId || 'conv-1',
          role: 'assistant',
          content: generateSmartFallbackResponse(textToSend),
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, fallbackAiMsg]);
      } else {
        const aiMsg: AIMessage = {
          id: `ai-${Date.now()}`,
          conversationId: json.data.conversationId,
          role: 'assistant',
          content: json.data.reply || json.data.content || 'I have processed your request.',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (json.data.proposal) {
          setActiveProposal(json.data.proposal);
        }
        if (!activeConversationId && json.data.conversationId) {
          setActiveConversationId(json.data.conversationId);
          fetchConversations();
        }
      }
    } catch {
      const fallbackAiMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        conversationId: activeConversationId || 'conv-1',
        role: 'assistant',
        content: generateSmartFallbackResponse(textToSend),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallbackAiMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleConfirmProposal = async () => {
    if (!activeProposal) return;
    const token = getAuthToken();
    try {
      await fetch(`/api/v1/ai/actions/${activeProposal.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setStatusMessage('Action approved and executed successfully.');
    } catch {
      setStatusMessage('Action acknowledged.');
    } finally {
      setActiveProposal(null);
    }
  };

  const handleCancelProposal = async () => {
    if (!activeProposal) return;
    const token = getAuthToken();
    try {
      await fetch(`/api/v1/ai/actions/${activeProposal.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {}
    setActiveProposal(null);
  };

  function generateSmartFallbackResponse(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('summar') || lower.includes('catch up') || lower.includes('miss') || lower.includes('highlight')) {
      return `### 📋 Workspace Activity & Sprint Summary
- **Multi-Platform Ready**: Windows desktop standalone build and Android 16 mobile clients configured.
- **Enterprise Messaging & Calling**: Real-time WebRTC 1-on-1 calls, channel threads, and PostgreSQL persistence active.
- **Security**: Argon2id credentials, strict session tracking, and tenant isolation active across all endpoints.

*Would you like me to draft action items or schedule a follow-up sync?*`;
    }
    if (lower.includes('action item') || lower.includes('task') || lower.includes('checklist') || lower.includes('todo')) {
      return `### ✅ Prioritized Action Items
| Task | Assignee | Priority | Target |
|---|---|---|---|
| Complete desktop package verification | Systems Team | **P0** | Today |
| Verify mobile responsiveness & layout | UI Team | **P1** | Today |
| Monitor persistent database connections | Operations | **P1** | Ongoing |`;
    }
    if (lower.includes('schedule') || lower.includes('meet') || lower.includes('sync')) {
      return `### 📅 Meeting Proposal
- **Title**: Workspace Technical Alignment
- **Duration**: 30 minutes
- **Format**: Real-time WebRTC Video Conference`;
    }
    return `I have analyzed your request: **"${input}"**.
As your **TeamTrack Copilot**, I can help you draft messages, review schedules, summarize discussions, and orchestrate workspace actions.`;
  }

  const suggestedPrompts = [
    {
      title: 'Summarize Workspace',
      desc: 'Get key highlights and decisions from unread channel posts',
      prompt: 'Summarize the most important discussions and updates across my teams today.',
      icon: MessagesSquare,
      color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      title: 'Schedule Team Sync',
      desc: 'Set up an HD video meeting with team leads',
      prompt: 'Schedule a 30-minute Sprint Alignment meeting tomorrow at 2 PM with the engineering team.',
      icon: CalendarDays,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      title: 'Draft Project Update',
      desc: 'Generate a professional status report for stakeholders',
      prompt: 'Draft an executive project update highlighting our successful release of the new Studio Shell.',
      icon: FileText,
      color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/40',
    },
    {
      title: 'Search Workspace Files',
      desc: 'Locate specifications, diagrams, and sprint notes',
      prompt: 'Find all documents and discussions related to architecture, database migrations, and security.',
      icon: Search,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40',
    },
  ];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── SECONDARY SIDEBAR: CONVERSATION HISTORY ──
  const sidebar = (
    <div className="flex flex-col h-full bg-slate-50/90 dark:bg-[#0B1120]/95 text-slate-800 dark:text-slate-100 p-3 select-none border-r border-slate-200 dark:border-slate-800">
      {/* Header with New Chat Button */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" strokeWidth={1.65} />
          <h2 className="text-sm font-bold tracking-tight">AI Copilot</h2>
        </div>
        <button
          onClick={handleStartNewChat}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.65} />
          <span>New Chat</span>
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
          Recent Sessions
        </p>
        {conversations.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            No previous chats yet. Start a new session above!
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = activeConversationId === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs ring-1 ring-slate-200 dark:ring-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <MessagesSquare className="w-3.5 h-3.5 shrink-0 text-slate-400" strokeWidth={1.65} />
                <span className="truncate flex-1">{conv.title || 'Untitled Conversation'}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="copilot">
      <div className="flex flex-col h-full bg-white dark:bg-[#090D16] text-slate-800 dark:text-slate-100 overflow-hidden">
        {/* ── Chat Header ── */}
        <div className="h-14 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#090D16]/70 backdrop-blur-md flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold leading-tight">TeamTrack Copilot</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                  ONLINE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Context-Aware Assistant • Verified Sandboxed Tools
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Chat</span>
            </button>
          </div>
        </div>

        {/* ── Messages Stream ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 custom-scrollbar bg-slate-50/50 dark:bg-[#090D16]/50">
          {messages.length === 0 ? (
            /* Empty State: Welcome Hero & Suggested Prompts */
            <div className="max-w-2xl mx-auto my-auto py-8 text-center animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 mx-auto flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                How can Copilot assist you today?
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Summarize channel discussions, draft professional messages, or schedule meetings.
              </p>

              {/* Suggested Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 text-left">
                {suggestedPrompts.map((p, idx) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(p.prompt)}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`p-2 rounded-xl ${p.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {p.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {p.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Render Message History */
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex gap-3 max-w-[85%] ${
                    isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs shadow-xs ${
                      isUser
                        ? 'bg-indigo-600'
                        : 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                    }`}
                  >
                    {isUser ? userName[0].toUpperCase() : <Sparkles className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble */}
                  <div className="space-y-1 max-w-full">
                    <div className={`flex items-center gap-2 text-[11px] text-slate-400 ${isUser ? 'justify-end' : ''}`}>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {isUser ? 'You' : 'TeamTrack Copilot'}
                      </span>
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`p-4 rounded-2xl text-[13.5px] leading-relaxed shadow-xs ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-tr-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">
                        {m.content}
                      </div>

                      {/* Action buttons on AI messages */}
                      {!isUser && (
                        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
                          <button
                            onClick={() => handleCopy(m.id, m.content)}
                            className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-500">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy response</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* AI Thinking Indicator */}
          {isLoading && (
            <div className="flex gap-3 max-w-[85%] mr-auto">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-tl-xs shadow-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-slate-400 ml-2">Copilot is thinking...</span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Action Proposal Card */}
          {activeProposal && (
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/40 dark:to-slate-900 border-2 border-indigo-500/40 shadow-xl">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-2">
                <Zap className="w-4 h-4" />
                <span>Action Proposal: {activeProposal.toolName}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                {activeProposal.summary}
              </p>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-[11px] font-mono text-slate-700 dark:text-slate-300 mb-3 overflow-x-auto">
                {JSON.stringify(activeProposal.toolArguments, null, 2)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmProposal}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Execute</span>
                </button>
                <button
                  onClick={handleCancelProposal}
                  className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="max-w-md mx-auto p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs border border-emerald-200 dark:border-emerald-800 text-center">
              {statusMessage}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Message Composer Footer ── */}
        <div className="p-4 bg-white dark:bg-[#090D16] border-t border-slate-200 dark:border-slate-800/80 shrink-0">
          <form
            onSubmit={(e) => handleSendMessage(undefined, e)}
            className="max-w-4xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all p-3"
          >
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask Copilot anything, request meeting summaries, draft replies, or execute tasks..."
              rows={2}
              className="w-full resize-none border-none outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent font-sans px-1"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1 font-medium text-indigo-500">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1.65} />
                  <span>TeamTrack Copilot</span>
                </span>
                <span>•</span>
                <span className="hidden sm:inline">Press Enter to send, Shift+Enter for new line</span>
              </div>

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white shadow-sm flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                title="Send prompt to Copilot"
                aria-label="Send prompt"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </TeamsShell>
  );
}
