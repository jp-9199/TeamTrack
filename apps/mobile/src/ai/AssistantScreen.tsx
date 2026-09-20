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
  ScrollView,
} from 'react-native';
import type {
  AIMessage,
  AIActionProposal,
  AIResponse,
} from '@teamtrack/shared-types';
import { CopilotIcon } from '../components/MobileIcons';

export interface MobileAssistantScreenProps {
  onSendMessage: (message: string, conversationId?: string) => Promise<AIResponse>;
  onConfirmAction: (actionId: string, confirmationToken: string) => Promise<void>;
  onCancelAction: (actionId: string) => Promise<void>;
  onClose: () => void;
}

const SUGGESTIONS = [
  { id: '1', title: '📋 Summarize workspace', prompt: 'Summarize today\'s highlights and critical updates across my teams.' },
  { id: '2', title: '📅 Schedule standup', prompt: 'Schedule a 30-minute Sprint Alignment meeting tomorrow at 2 PM with Sarah and David.' },
  { id: '3', title: '🚀 Draft release notes', prompt: 'Draft an executive release note celebrating the new Android 16 Mobile & Windows Desktop builds.' },
  { id: '4', title: '🔒 Security status', prompt: 'Check the security compliance and test suite status across our architecture.' },
];

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

  async function handleSend(textToSend?: string) {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    setError(null);
    if (!textToSend) setInput('');
    setIsLoading(true);

    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationId || 'local',
      role: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await onSendMessage(query, conversationId);
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
        {/* ============================================================
            ANDROID 16 / COPILOT HEADER
            ============================================================ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.copilotBadge}>
              <CopilotIcon size={20} focused />
            </View>
            <View>
              <Text style={styles.headerTitle}>Copilot AI</Text>
              <Text style={styles.headerSubtitle}>Enterprise Workspace Intelligence</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
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
                <View style={styles.assistantHeaderRow}>
                  <CopilotIcon size={16} focused />
                  <Text style={styles.assistantHeaderLabel}>Copilot</Text>
                  <Text style={styles.modelTag}>Enterprise Reasoner</Text>
                </View>
              )}
              <Text
                style={[
                  styles.messageContent,
                  item.role === 'user' ? styles.userContent : styles.assistantContent,
                ]}
              >
                {item.content}
              </Text>
              {item.toolCalls && item.toolCalls.length > 0 && (
                <View style={styles.toolBadge}>
                  <Text style={styles.toolBadgeText}>
                    ⚡ Action Dispatched: {item.toolCalls[0].name}
                  </Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <CopilotIcon size={36} focused />
              </View>
              <Text style={styles.emptyTitle}>How can Copilot assist you?</Text>
              <Text style={styles.emptyDescription}>
                Ask questions about your teams, draft executive updates, coordinate meetings, or inspect security invariants.
              </Text>

              {/* Suggestions row */}
              <View style={styles.suggestionsContainer}>
                {SUGGESTIONS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionCard}
                    onPress={() => handleSend(item.prompt)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionTitle}>{item.title}</Text>
                    <Text style={styles.suggestionPrompt}>{item.prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {/* Action Proposal Card */}
        {activeProposal && (
          <View style={styles.proposalCard}>
            <View style={styles.proposalHeader}>
              <Text style={styles.proposalBadge}>Action Required</Text>
              <Text style={styles.proposalTitle}>{activeProposal.toolName}</Text>
            </View>
            <Text style={styles.proposalText}>
              {activeProposal.summary || 'Copilot is ready to execute this action on your behalf:'}
            </Text>
            <View style={styles.proposalPayload}>
              <Text style={styles.payloadCode}>
                {JSON.stringify(activeProposal.toolArguments, null, 2)}
              </Text>
            </View>
            <View style={styles.proposalButtons}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.confirmBtn]}
                onPress={handleConfirm}
                disabled={isLoading}
              >
                <Text style={styles.confirmBtnText}>✓ Approve & Execute</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={handleCancel}
                disabled={isLoading}
              >
                <Text style={styles.cancelBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Android 16 Input Composer Bar */}
        <View style={styles.inputContainer}>
          <View style={styles.inputPill}>
            <TextInput
              style={styles.input}
              placeholder="Ask Copilot anything..."
              placeholderTextColor="#9CA3AF"
              value={input}
              onChangeText={setInput}
              editable={!isLoading}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!input.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copilotBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#18181B',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5B5FC7',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#71717A',
  },
  messageList: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    marginVertical: 6,
    maxWidth: '86%',
    borderRadius: 20,
    padding: 14,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#5B5FC7',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  assistantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  assistantHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
  },
  modelTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5B5FC7',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
  messageContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  userContent: {
    color: '#FFFFFF',
  },
  assistantContent: {
    color: '#27272A',
  },
  toolBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  toolBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#71717A',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 10,
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B5FC7',
    marginBottom: 4,
  },
  suggestionPrompt: {
    fontSize: 12,
    color: '#52525B',
    lineHeight: 16,
  },
  proposalCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    elevation: 4,
    shadowColor: '#5B5FC7',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  proposalBadge: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proposalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  proposalText: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 8,
  },
  proposalPayload: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payloadCode: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#334155',
  },
  proposalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: '#5B5FC7',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#F4F4F5',
  },
  cancelBtnText: {
    color: '#52525B',
    fontSize: 13,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    marginHorizontal: 16,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#18181B',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5B5FC7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#E4E4E7',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
