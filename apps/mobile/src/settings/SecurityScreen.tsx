import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import type { ApiClient } from '@teamtrack/api-client';
import type { UserSecuritySummary } from '@teamtrack/shared-types';

export interface MobileSecurityScreenProps {
  apiClient: ApiClient;
  onClose?: () => void;
}

export function MobileSecurityScreen({ apiClient, onClose }: MobileSecurityScreenProps) {
  const [security, setSecurity] = useState<UserSecuritySummary | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSecurity();
  }, []);

  async function loadSecurity() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.getUserSecurity();
      if (res.success && res.data) {
        setSecurity(res.data);
      } else {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to load security summary' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network connection failed' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatusMessage({ type: 'error', text: 'All password fields are required' });
      return;
    }

    if (newPassword.length < 8) {
      setStatusMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword === currentPassword) {
      setStatusMessage({ type: 'error', text: 'New password must differ from current password' });
      return;
    }

    Alert.alert(
      'Change Password',
      'Changing your password will sign out all other active sessions across your devices. Do you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Update',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            setStatusMessage(null);
            try {
              const res = await apiClient.changePassword({
                currentPassword,
                newPassword,
              });

              if (res.success) {
                setStatusMessage({
                  type: 'success',
                  text: 'Password updated successfully. Other sessions have been revoked.',
                });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                loadSecurity();
              } else {
                setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to update password' });
              }
            } catch {
              setStatusMessage({ type: 'error', text: 'Network error occurred' });
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading security status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Account Security</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

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

        {/* Security Overview Cards */}
        {security && (
          <View style={styles.cardsRow}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Active Sessions</Text>
              <Text style={styles.cardValue}>{security.activeSessionCount}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Encryption</Text>
              <Text style={[styles.cardValue, { color: '#4ade80' }]}>Argon2id</Text>
            </View>
          </View>
        )}

        {/* Change Password Form */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionHeader}>Change Password</Text>
          <Text style={styles.subtext}>
            Enter current password to set a new password. All other sessions will be invalidated immediately.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="At least 8 characters"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm new password"
              placeholderTextColor="#64748b"
            />
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, isSubmitting && styles.btnDisabled]}
            onPress={handleChangePassword}
            disabled={isSubmitting}
          >
            <Text style={styles.actionBtnText}>{isSubmitting ? 'Updating...' : 'Update Password'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  cardLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 4,
  },
  formContainer: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  actionBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
