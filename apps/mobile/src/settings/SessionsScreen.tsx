import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import type { ApiClient } from '@teamtrack/api-client';
import type { UserSessionItem } from '@teamtrack/shared-types';

export interface MobileSessionsScreenProps {
  apiClient: ApiClient;
  onClose?: () => void;
}

export function MobileSessionsScreen({ apiClient, onClose }: MobileSessionsScreenProps) {
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.getUserSessions();
      if (res.success && res.data) {
        setSessions(res.data.sessions || []);
      } else {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to load sessions' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network connection failed' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    Alert.alert(
      'Revoke Session',
      'Are you sure you want to sign out this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokingId(sessionId);
            setStatusMessage(null);
            try {
              const res = await apiClient.revokeSession(sessionId);
              if (res.success) {
                setStatusMessage({ type: 'success', text: 'Session revoked successfully' });
                loadSessions();
              } else {
                setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to revoke session' });
              }
            } catch {
              setStatusMessage({ type: 'error', text: 'Network error occurred' });
            } finally {
              setRevokingId(null);
            }
          },
        },
      ]
    );
  }

  async function handleRevokeAll() {
    Alert.alert(
      'Revoke All Other Sessions',
      'Are you sure you want to sign out all other devices? Your current mobile session will remain active.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke All Others',
          style: 'destructive',
          onPress: async () => {
            setIsRevokingAll(true);
            setStatusMessage(null);
            try {
              const res = await apiClient.revokeAllSessions(true);
              if (res.success) {
                setStatusMessage({
                  type: 'success',
                  text: `Revoked ${res.data?.revokedCount ?? 0} other active session(s).`,
                });
                loadSessions();
              } else {
                setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to revoke sessions' });
              }
            } catch {
              setStatusMessage({ type: 'error', text: 'Network error occurred' });
            } finally {
              setIsRevokingAll(false);
            }
          },
        },
      ]
    );
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Active Sessions</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {otherSessions.length > 0 && (
          <TouchableOpacity
            style={[styles.revokeAllBtn, isRevokingAll && styles.btnDisabled]}
            onPress={handleRevokeAll}
            disabled={isRevokingAll}
          >
            <Text style={styles.revokeAllBtnText}>
              {isRevokingAll ? 'Revoking...' : 'Revoke All Other Sessions'}
            </Text>
          </TouchableOpacity>
        )}

        {statusMessage && (
          <View
            style={[
              styles.alert,
              statusMessage.type === 'success' ? styles.alertSuccess : styles.alertError,
            ]}
          >
            <Text
              style={[
                styles.alertText,
                statusMessage.type === 'success' ? styles.alertTextSuccess : styles.alertTextError,
              ]}
            >
              {statusMessage.text}
            </Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={[styles.sessionCard, item.isCurrent && styles.currentSessionCard]}>
                <View style={styles.sessionInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.deviceText}>
                      {item.userAgent ? item.userAgent.slice(0, 45) : 'Unknown Device'}
                    </Text>
                    {item.isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>THIS DEVICE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.metaText}>IP: {item.ipAddress || 'Not recorded'}</Text>
                  <Text style={styles.metaText}>
                    Created: {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                {!item.isCurrent && (
                  <TouchableOpacity
                    style={[styles.revokeBtn, revokingId === item.id && styles.btnDisabled]}
                    onPress={() => handleRevoke(item.id)}
                    disabled={revokingId === item.id}
                  >
                    <Text style={styles.revokeBtnText}>
                      {revokingId === item.id ? '...' : 'Revoke'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '600',
  },
  revokeAllBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  revokeAllBtnText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 14,
  },
  alert: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  alertSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22c55e',
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  alertText: {
    fontSize: 14,
  },
  alertTextSuccess: {
    color: '#4ade80',
  },
  alertTextError: {
    color: '#f87171',
  },
  listContent: {
    gap: 12,
  },
  sessionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentSessionCard: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  sessionInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  deviceText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  currentBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    marginLeft: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  revokeBtnText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '500',
  },
});
