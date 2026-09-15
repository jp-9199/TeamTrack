import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type {
  AIMessage,
  AIActionProposal,
  AIResponse,
} from '@teamtrack/shared-types';

export interface MobileAssistantScreenProps {
  onSendMessage: (message: string, conversationId?: string) => Promise<AIResponse>;
  onConfirmAction: (actionId: string, confirmationToken: string) => Promise<void>;
  onCancelAction: (actionId: string) => Promise<void>;
  onClose: () => void;
}

export function MobileAssistantScreen({
  onSendMessage,
  onConfirmAction,
  onCancelAction,
  onClose,
}: MobileAssistantScreenProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeProposal, setActiveProposal] = useState<AIActionProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput('');
    setIsLoading(true);

    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationId || 'local',
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await onSendMessage(trimmed, conversationId);
      if (!conversationId) {
        setConversationId(res.conversationId);
      }
      setMessages((prev) => [...prev, res.message]);
      if (res.actionProposal) {
        setActiveProposal(res.actionProposal);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to communicate with AI Assistant');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    if (!activeProposal || !activeProposal.confirmationToken) return;
    setIsLoading(true);
    setError(null);

    try {
      await onConfirmAction(activeProposal.id, activeProposal.confirmationToken);
      setActiveProposal(null);
    } catch (err: any) {
      setError(err.message || 'Action execution failed');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    if (!activeProposal) return;
    setIsLoading(true);

    try {
      await onCancelAction(activeProposal.id);
      setActiveProposal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🤖 AI Assistant</Text>
            <Text style={styles.headerSubtitle}>Authorized Tools • Zero DB Access</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Message Feed */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {item.role === 'assistant' && (
                <Text style={styles.senderLabel}>Assistant</Text>
              )}
              <Text style={styles.messageContent}>{item.content}</Text>
              {item.toolCalls && item.toolCalls.length > 0 && (
                <View style={styles.toolBadge}>
                  <Text style={styles.toolBadgeText}>
                    ⚙️ Executed: {item.toolCalls[0].name}
                  </Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>TeamTrack AI Workspace</Text>
              <Text style={styles.emptyDescription}>
                Ask questions, search resources, schedule meetings, or draft messages.
              </Text>
            </View>
          }
        />

        {/* Action Proposal Card */}
        {activeProposal && (
          <View style={styles.proposalCard}>
            <Text style={styles.proposalTitle}>⚠️ Action Confirmation</Text>
            <Text style={styles.proposalText}>
              Execute <Text style={styles.bold}>{activeProposal.toolName}</Text>?
            </Text>
            <View style={styles.proposalButtons}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.confirmBtn]}
                onPress={handleConfirm}
                disabled={isLoading}
              >
                <Text style={styles.btnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={handleCancel}
                disabled={isLoading}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#64748B"
            value={input}
            onChangeText={setInput}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#94A3B8',
    fontSize: 18,
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#2563EB',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: '#1E293B',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
  },
  toolBadge: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  toolBadgeText: {
    fontSize: 11,
    color: '#38BDF8',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  emptyDescription: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  proposalCard: {
    margin: 16,
    padding: 14,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  proposalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
  },
  proposalText: {
    fontSize: 13,
    color: '#F8FAFC',
    marginBottom: 10,
  },
  bold: {
    fontWeight: '700',
  },
  proposalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: '#10B981',
  },
  cancelBtn: {
    backgroundColor: '#EF4444',
  },
  btnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#7F1D1D',
    borderRadius: 6,
  },
  errorText: {
    color: '#FECACA',
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    backgroundColor: '#1E293B',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 14,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#475569',
  },
  sendButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
