import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { MobileNotificationCenter } from './src/notifications/NotificationCenter';
import { MobileSearchScreen } from './src/search/SearchScreen';
import { MobileCalendarScreen } from './src/calendar/CalendarScreen';
import type { Notification, SearchResultItem } from '@teamtrack/shared-types';

export default function App(): React.JSX.Element {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  if (showCalendar) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <MobileCalendarScreen onClose={() => setShowCalendar(false)} />
      </SafeAreaView>
    );
  }

  if (showSearch) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <MobileSearchScreen
          onSearch={async (q, type) => {
            return [];
          }}
          onClose={() => setShowSearch(false)}
        />
      </SafeAreaView>
    );
  }

  if (showNotifications) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <MobileNotificationCenter
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={false}
          onMarkRead={async (id) => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
            );
            setUnreadCount((c) => Math.max(0, c - 1));
          }}
          onMarkUnread={async (id) => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, readAt: null } : n))
            );
            setUnreadCount((c) => c + 1);
          }}
          onMarkAllRead={async () => {
            setNotifications((prev) =>
              prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
            );
            setUnreadCount(0);
          }}
          onDelete={async (id) => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            setUnreadCount((c) => Math.max(0, c - 1));
          }}
          onRefresh={async () => {}}
          onClose={() => setShowNotifications(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.card}>
        <Text style={styles.title}>TeamTrack</Text>
        <Text style={styles.subtitle}>Phase 9E: Search & Discovery Ready</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Mobile Foundation Ready</Text>
        </View>

        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => setShowNotifications(true)}
        >
          <Text style={styles.notificationBtnText}>🔔 Open Notification Center</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.notificationBtn, { backgroundColor: '#0284c7', marginTop: 10 }]}
          onPress={() => setShowSearch(true)}
        >
          <Text style={styles.notificationBtnText}>🔍 Open Search & Discovery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.notificationBtn, { backgroundColor: '#7c3aed', marginTop: 10 }]}
          onPress={() => setShowCalendar(true)}
        >
          <Text style={styles.notificationBtnText}>📅 Open Calendar & Scheduling</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#60a5fa',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20,
  },
  badge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  badgeText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  notificationBtn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  notificationBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
