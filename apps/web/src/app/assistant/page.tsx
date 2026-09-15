'use client';

import React, { useState, useEffect, useRef } from 'react';
import type {
  AIMessage,
  AIConversation,
  AIActionProposal,
  AIResponse,
} from '@teamtrack/shared-types';

export default function AIAssistantPage() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeProposal, setActiveProposal] = useState<AIActionProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeProposal]);

  // Load user's conversations
  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch('/api/v1/ai/conversations');
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
      const res = await fetch(`/api/v1/ai/conversations/${encodeURIComponent(id)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMessages(json.data.messages || []);
      } else {
        setError(json.error?.message || 'Failed to load conversation');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setStatusMessage(null);
    setInputMessage('');

    // Optimistic user message display
    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId || 'pending',
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId || undefined,
          message: trimmed,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message || 'AI request failed');
        return;
      }

      const aiRes: AIResponse = json.data;
      if (!activeConversationId) {
        setActiveConversationId(aiRes.conversationId);
        fetchConversations();
      }

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
        return [...withoutTemp, tempUserMsg, aiRes.message];
      });

      if (aiRes.actionProposal) {
        setActiveProposal(aiRes.actionProposal);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmAction() {
    if (!activeProposal || !activeProposal.confirmationToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/ai/actions/${encodeURIComponent(activeProposal.id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationToken: activeProposal.confirmationToken }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || 'Confirmation failed');
        return;
      }

      setStatusMessage(`Action executed successfully! (${activeProposal.toolName})`);
      setActiveProposal(null);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelAction() {
    if (!activeProposal) return;
    setIsLoading(true);

    try {
      await fetch(`/api/v1/ai/actions/${encodeURIComponent(activeProposal.id)}/cancel`, {
        method: 'POST',
      });
      setStatusMessage('Action proposal cancelled.');
      setActiveProposal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setActiveProposal(null);
    setError(null);
    setStatusMessage(null);
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: '#0F172A', color: '#F8FAFC', fontFamily: 'sans-serif' }}>
      {/* Sidebar: Conversation History */}
      <div style={{ width: '280px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', background: '#1E293B' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>AI Workspace</h2>
          <button
            onClick={startNewConversation}
            style={{ padding: '6px 12px', background: '#3B82F6', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            + New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                marginBottom: '4px',
                cursor: 'pointer',
                background: activeConversationId === c.id ? '#334155' : 'transparent',
                fontSize: '0.85rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              💬 {c.title || 'Conversation'}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', background: '#1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🤖 TeamTrack Assistant
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#10B981', color: '#064E3B', borderRadius: '12px', fontWeight: 600 }}>
                SECURE BOUNDARY
              </span>
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94A3B8' }}>
              Zero Direct Database Access • Allowlisted Tools • Explicit Write Confirmation
            </p>
          </div>
        </div>

        {/* Messages List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#64748B', maxWidth: '400px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✨</div>
              <h3 style={{ color: '#F1F5F9', marginBottom: '8px' }}>How can I help you today?</h3>
              <p style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                Try: &quot;Find the messages about website redesign&quot;, &quot;Schedule a meeting with Ahmed tomorrow at 3 PM&quot;, or &quot;Show my meetings tomorrow&quot;.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                background: m.role === 'user' ? '#2563EB' : '#1E293B',
                color: '#F8FAFC',
                padding: '12px 16px',
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                border: m.role === 'user' ? 'none' : '1px solid #334155',
                fontSize: '0.9rem',
                lineHeight: '1.5',
              }}
            >
              {m.role === 'assistant' && (
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: '4px', fontWeight: 600 }}>
                  Assistant
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

              {/* Tool Activity Badge */}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '0.75rem', color: '#38BDF8' }}>
                  ⚙️ Executed tool: <code>{m.toolCalls[0].name}</code>
                </div>
              )}
            </div>
          ))}

          {/* Action Proposal Card */}
          {activeProposal && (
            <div
              style={{
                background: '#1E293B',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                padding: '16px',
                maxWidth: '500px',
                alignSelf: 'flex-start',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: 600, fontSize: '0.9rem' }}>
                ⚠️ Action Confirmation Required
              </div>
              <p style={{ fontSize: '0.85rem', color: '#E2E8F0', margin: '8px 0' }}>
                The assistant proposes to execute <strong>{activeProposal.toolName}</strong> with arguments:
              </p>
              <pre style={{ background: '#0F172A', padding: '10px', borderRadius: '4px', fontSize: '0.8rem', color: '#94A3B8', overflowX: 'auto' }}>
                {JSON.stringify(activeProposal.toolArguments, null, 2)}
              </pre>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '12px' }}>
                Expires: {new Date(activeProposal.expiresAt).toLocaleTimeString()}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleConfirmAction}
                  disabled={isLoading}
                  style={{ padding: '8px 16px', background: '#10B981', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  ✓ Confirm & Execute
                </button>
                <button
                  onClick={handleCancelAction}
                  disabled={isLoading}
                  style={{ padding: '8px 16px', background: '#EF4444', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div style={{ alignSelf: 'flex-start', color: '#94A3B8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Thinking & inspecting authorized domain services...</span>
            </div>
          )}

          {error && (
            <div style={{ background: '#7F1D1D', border: '1px solid #DC2626', color: '#FECACA', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}

          {statusMessage && (
            <div style={{ background: '#064E3B', border: '1px solid #10B981', color: '#D1FAE5', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem' }}>
              ✓ {statusMessage}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #334155', background: '#1E293B' }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Ask TeamTrack Assistant (e.g. schedule a meeting, find files)..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isLoading}
              style={{
                flex: 1,
                background: '#0F172A',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#F8FAFC',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              style={{
                padding: '12px 24px',
                background: isLoading || !inputMessage.trim() ? '#475569' : '#2563EB',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
