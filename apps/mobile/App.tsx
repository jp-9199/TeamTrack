import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { MobileChatScreen } from './src/chat/ChatScreen';
import { MobileTeamsScreen } from './src/teams/TeamsScreen';
import { MobileCallsScreen } from './src/calls/CallsScreen';
import { MobileCalendarScreen } from './src/calendar/CalendarScreen';
import { MobileNotificationCenter } from './src/notifications/NotificationCenter';
import { MobileSearchScreen } from './src/search/SearchScreen';
import { MobileAssistantScreen } from './src/ai/AssistantScreen';
import type { Notification, CalendarAttendeeResponseStatus } from '@teamtrack/shared-types';

type TabKey = 'activity' | 'chat' | 'teams' | 'calendar' | 'calls' | 'copilot';

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    recipientId: 'user-1',
    organizationId: 'org-1',
    actorId: null,
    type: 'mention',
    title: 'Sarah Chen mentioned you',
    body: 'Could you please review the updated Fluent 2 tokens?',
    resourceType: null,
    resourceId: null,
    dataPayload: {},
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    mutationSeq: '1',
  },
  {
    id: 'n2',
    recipientId: 'user-1',
    organizationId: 'org-1',
    actorId: null,
    type: 'meeting_started',
    title: 'Daily Standup started',
    body: 'Virtual Room 1 is now active.',
    resourceType: null,
    resourceId: null,
    dataPayload: {},
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    mutationSeq: '2',
  },
  {
    id: 'n3',
    recipientId: 'user-1',
    organizationId: 'org-1',
    actorId: null,
    type: 'direct_message',
    title: 'David Kim',
    body: 'Redis cluster failover tests passed with zero drops.',
    resourceType: null,
    resourceId: null,
    dataPayload: {},
    readAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    mutationSeq: '3',
  },
];

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [showSearch, setShowSearch] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(SAMPLE_NOTIFICATIONS);
  const [unreadNotifs, setUnreadNotifs] = useState(2);
  const [presenceStatus, setPresenceStatus] = useState<'available' | 'busy' | 'away' | 'offline'>('available');
  const [showProfileModal, setShowProfileModal] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#92C353';
      case 'busy':
        return '#C4314B';
      case 'away':
        return '#F8D22A';
      default:
        return '#8A8886';
    }
  };

  const getTabTitle = (tab: TabKey) => {
    switch (tab) {
      case 'activity':
        return 'Activity';
      case 'chat':
        return 'Chat';
      case 'teams':
        return 'Teams';
      case 'calendar':
        return 'Calendar';
      case 'calls':
        return 'Calls';
      case 'copilot':
        return 'Copilot';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ============================================================
          TOP HEADER (Microsoft Teams Mobile Bar)
          ============================================================ */}
      <View style={styles.topHeader}>
        {/* User Profile Avatar with Presence Badge */}
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => setShowProfileModal(true)}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>AM</Text>
          </View>
          <View
            style={[
              styles.presenceDot,
              { backgroundColor: getStatusColor(presenceStatus) },
            ]}
          />
        </TouchableOpacity>

        {/* Section Title */}
        <Text style={styles.headerTitle}>{getTabTitle(activeTab)}</Text>

        {/* Header Right Actions */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowSearch(true)}
          >
            <Text style={styles.headerIcon}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setActiveTab('copilot')}
          >
            <Text style={styles.headerIcon}>✨</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================
          MAIN BODY CONTENT
          ============================================================ */}
      <View style={styles.contentArea}>
        {activeTab === 'chat' && <MobileChatScreen />}
        {activeTab === 'teams' && <MobileTeamsScreen />}
        {activeTab === 'calls' && <MobileCallsScreen />}

        {activeTab === 'activity' && (
          <MobileNotificationCenter
            notifications={notifications}
            unreadCount={unreadNotifs}
            isLoading={false}
            onMarkRead={async (id) => {
              setNotifications((prev) =>
                prev.map((n) =>
                  n.id === id ? { ...n, readAt: new Date().toISOString() } : n
                )
              );
              setUnreadNotifs((c) => Math.max(0, c - 1));
            }}
            onMarkUnread={async (id) => {
              setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, readAt: null } : n))
              );
              setUnreadNotifs((c) => c + 1);
            }}
            onMarkAllRead={async () => {
              setNotifications((prev) =>
                prev.map((n) => ({
                  ...n,
                  readAt: n.readAt || new Date().toISOString(),
                }))
              );
              setUnreadNotifs(0);
            }}
            onDelete={async (id) => {
              setNotifications((prev) => prev.filter((n) => n.id !== id));
              setUnreadNotifs((c) => Math.max(0, c - 1));
            }}
            onRefresh={async () => {}}
            onClose={() => setActiveTab('chat')}
          />
        )}

        {activeTab === 'calendar' && (
          <MobileCalendarScreen
            onClose={() => setActiveTab('chat')}
            onRsvp={async (_id: string, _status: CalendarAttendeeResponseStatus) => {}}
            onJoinMeeting={(_id: string) => {
              setActiveTab('calls');
            }}
          />
        )}

        {activeTab === 'copilot' && (
          <MobileAssistantScreen
            onClose={() => setActiveTab('chat')}
            onSendMessage={async (_msg: string) => {
              return {
                conversationId: 'conv-1',
                message: {
                  id: `ai-${Date.now()}`,
                  conversationId: 'conv-1',
                  role: 'assistant',
                  content: `Here is the summary based on your team data:\n\n• Phase 13 Enterprise Security passed with 41 test suites.\n• Standup scheduled for 10:00 AM.\n• Sarah uploaded the Fluent 2 design system tokens.`,
                  createdAt: new Date().toISOString(),
                },
                executionTimeMs: 120,
              };
            }}
            onConfirmAction={async () => {}}
            onCancelAction={async () => {}}
          />
        )}
      </View>

      {/* ============================================================
          BOTTOM TAB BAR (Microsoft Teams Fluent Mobile)
          ============================================================ */}
      <View style={styles.bottomTabBar}>
        {/* 1. Activity */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('activity')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'activity' && styles.tabIconActive,
              ]}
            >
              🔔
            </Text>
            {unreadNotifs > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadNotifs}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'activity' && styles.tabLabelActive,
            ]}
          >
            Activity
          </Text>
        </TouchableOpacity>

        {/* 2. Chat */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('chat')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'chat' && styles.tabIconActive,
              ]}
            >
              💬
            </Text>
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>1</Text>
            </View>
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'chat' && styles.tabLabelActive,
            ]}
          >
            Chat
          </Text>
        </TouchableOpacity>

        {/* 3. Teams */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('teams')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'teams' && styles.tabIconActive,
              ]}
            >
              👥
            </Text>
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'teams' && styles.tabLabelActive,
            ]}
          >
            Teams
          </Text>
        </TouchableOpacity>

        {/* 4. Calendar */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('calendar')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'calendar' && styles.tabIconActive,
              ]}
            >
              📅
            </Text>
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'calendar' && styles.tabLabelActive,
            ]}
          >
            Calendar
          </Text>
        </TouchableOpacity>

        {/* 5. Calls */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('calls')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'calls' && styles.tabIconActive,
              ]}
            >
              📞
            </Text>
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'calls' && styles.tabLabelActive,
            ]}
          >
            Calls
          </Text>
        </TouchableOpacity>

        {/* 6. Copilot */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('copilot')}
        >
          <View style={styles.tabIconWrap}>
            <Text
              style={[
                styles.tabIcon,
                activeTab === 'copilot' && styles.tabIconActive,
              ]}
            >
              ✨
            </Text>
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'copilot' && styles.tabLabelActive,
            ]}
          >
            Copilot
          </Text>
        </TouchableOpacity>
      </View>

      {/* ============================================================
          SEARCH OVERLAY MODAL
          ============================================================ */}
      <Modal visible={showSearch} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <MobileSearchScreen
            onClose={() => setShowSearch(false)}
            onSearch={async () => []}
          />
        </SafeAreaView>
      </Modal>

      {/* ============================================================
          PROFILE & PRESENCE MODAL
          ============================================================ */}
      <Modal visible={showProfileModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.profileModalOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileModal(false)}
        >
          <View style={styles.profileCard}>
            <View style={styles.profileCardHeader}>
              <View style={styles.userAvatarLarge}>
                <Text style={styles.userAvatarLargeText}>AM</Text>
              </View>
              <View style={styles.profileCardInfo}>
                <Text style={styles.profileCardName}>Alex Morgan</Text>
                <Text style={styles.profileCardEmail}>
                  alex.morgan@teamtrack.enterprise
                </Text>
                <Text style={styles.profileCardRole}>Principal Engineer</Text>
              </View>
            </View>

            <View style={styles.presenceDivider} />

            <Text style={styles.presenceHeading}>Set Status</Text>

            {(['available', 'busy', 'away', 'offline'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.presenceOption}
                onPress={() => {
                  setPresenceStatus(s);
                  setShowProfileModal(false);
                }}
              >
                <View
                  style={[
                    styles.statusDotModal,
                    { backgroundColor: getStatusColor(s) },
                  ]}
                />
                <Text
                  style={[
                    styles.presenceOptionText,
                    presenceStatus === s && styles.presenceOptionTextActive,
                  ]}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                {presenceStatus === s && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
  },
  avatarButton: {
    position: 'relative',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#242424',
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    padding: 6,
  },
  headerIcon: {
    fontSize: 18,
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#FAF9F8',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1DFDD',
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 2,
  },
  tabIconWrap: {
    position: 'relative',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.65,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#C4314B',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#616161',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#5B5FC7',
    fontWeight: '700',
  },

  // Profile Modal
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userAvatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarLargeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  profileCardInfo: {
    flex: 1,
  },
  profileCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#242424',
  },
  profileCardEmail: {
    fontSize: 12,
    color: '#616161',
    marginTop: 2,
  },
  profileCardRole: {
    fontSize: 11,
    color: '#5B5FC7',
    fontWeight: '600',
    marginTop: 2,
  },
  presenceDivider: {
    height: 1,
    backgroundColor: '#E1DFDD',
    marginVertical: 16,
  },
  presenceHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8886',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  presenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statusDotModal: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  presenceOptionText: {
    fontSize: 14,
    color: '#242424',
    flex: 1,
  },
  presenceOptionTextActive: {
    fontWeight: '700',
    color: '#5B5FC7',
  },
  checkIcon: {
    fontSize: 16,
    color: '#5B5FC7',
    fontWeight: '700',
  },
});
