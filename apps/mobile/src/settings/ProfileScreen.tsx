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
} from 'react-native';
import type { ApiClient } from '@teamtrack/api-client';
import type { UserProfile } from '@teamtrack/shared-types';

export interface MobileProfileScreenProps {
  apiClient: ApiClient;
  onClose?: () => void;
}

export function MobileProfileScreen({ apiClient, onClose }: MobileProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en-US');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.getUserProfile();
      if (res.success && res.data) {
        setProfile(res.data);
        setDisplayName(res.data.displayName || '');
        setJobTitle(res.data.jobTitle || '');
        setTimezone(res.data.timezone || 'UTC');
        setLocale(res.data.locale || 'en-US');
      } else {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to load profile' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network connection failed' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setStatusMessage({ type: 'error', text: 'Display name is required' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await apiClient.updateUserProfile({
        displayName: displayName.trim(),
        jobTitle: jobTitle.trim() || undefined,
        timezone,
        locale,
      });

      if (res.success && res.data) {
        setProfile(res.data);
        setStatusMessage({ type: 'success', text: 'Profile saved successfully' });
      } else {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to update profile' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network connection failed' });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>User Profile</Text>
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

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={profile?.email || ''}
            editable={false}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor="#64748b"
            maxLength={100}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Job Title</Text>
          <TextInput
            style={styles.input}
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="e.g. Mobile Developer"
            placeholderTextColor="#64748b"
            maxLength={150}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Timezone</Text>
          <TextInput
            style={styles.input}
            value={timezone}
            onChangeText={setTimezone}
            placeholder="e.g. UTC, America/New_York"
            placeholderTextColor="#64748b"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Locale</Text>
          <TextInput
            style={styles.input}
            value={locale}
            onChangeText={setLocale}
            placeholder="e.g. en-US"
            placeholderTextColor="#64748b"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Profile'}</Text>
        </TouchableOpacity>
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
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e293b',
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  inputDisabled: {
    color: '#64748b',
    backgroundColor: '#0f172a',
  },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
