import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { MobileChatScreen } from './src/chat/ChatScreen';
import { MobileTeamsScreen } from './src/teams/TeamsScreen';
import { MobileCallsScreen } from './src/calls/CallsScreen';
import { MobileCalendarScreen } from './src/calendar/CalendarScreen';
import { MobileNotificationCenter } from './src/notifications/NotificationCenter';
import { MobileSearchScreen } from './src/search/SearchScreen';
import { MobileAssistantScreen } from './src/ai/AssistantScreen';
import {
  ActivityIcon,
  ChatIcon,
  TeamsIcon,
  CalendarIcon,
  CallsIcon,
  CopilotIcon,
  SearchIcon,
  PlusIcon,
} from './src/components/MobileIcons';
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
  const [filterChip, setFilterChip] = useState<'all' | 'unread' | 'channels' | 'files'>('all');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#107C41';
      case 'busy':
        return '#C4314B';
      case 'away':
        return '#F8D22A';
      default:
        return '#8A8886';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'busy':
        return 'Busy / In Call';
      case 'away':
        return 'Away';
      default:
        return 'Offline';
    }
  };

  const getTabTitle = (tab: TabKey) => {
    switch (tab) {
      case 'activity':
        return 'Activity';
      case 'chat':
        return 'Chats';
      case 'teams':
        return 'Teams & Channels';
      case 'calendar':
        return 'Calendar';
      case 'calls':
        return 'Calls & Huddles';
      case 'copilot':
        return 'Copilot AI';
    }
  };

  const getFabLabel = () => {
    switch (activeTab) {
      case 'chat':
        return 'New Chat';
      case 'teams':
        return 'New Channel';
      case 'calendar':
        return 'New Meeting';
      case 'calls':
        return 'Meet Now';
      case 'copilot':
        return 'Ask Copilot';
      default:
        return 'Action';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8F9FA"
        translucent={Platform.OS === 'android'}
      />

      {/* ============================================================
          ANDROID 16 / MATERIAL 3 EXPRESSIVE TOP APP BAR
          ============================================================ */}
      <View style={styles.topAppBar}>
        {/* Row 1: Profile Avatar, Title, and Action Badges */}
        <View style={styles.topAppBarRow}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>AA</Text>
            </View>
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: getStatusColor(presenceStatus) },
              ]}
            />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>{getTabTitle(activeTab)}</Text>
            <Text style={styles.headerSubtitle}>TeamTrack Enterprise</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setShowSearch(true)}
              activeOpacity={0.7}
            >
              <SearchIcon size={18} color="#242424" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.headerBtn,
                activeTab === 'copilot' && styles.headerBtnActive,
              ]}
              onPress={() => setActiveTab('copilot')}
              activeOpacity={0.7}
            >
              <CopilotIcon size={20} focused={activeTab === 'copilot'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Android 16 Search Bar Chip */}
        <TouchableOpacity
          style={styles.searchChip}
          onPress={() => setShowSearch(true)}
          activeOpacity={0.9}
        >
          <SearchIcon size={16} color="#5F6368" />
          <Text style={styles.searchPlaceholder}>
            Search chats, channels, files, and people...
          </Text>
        </TouchableOpacity>

        {/* Row 3: Android 16 Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(['all', 'unread', 'channels', 'files'] as const).map((chip) => (
            <TouchableOpacity
              key={chip}
              style={[
                styles.chipButton,
                filterChip === chip && styles.chipButtonActive,
              ]}
              onPress={() => setFilterChip(chip)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipButtonText,
                  filterChip === chip && styles.chipButtonTextActive,
                ]}
              >
                {chip === 'all'
                  ? 'All'
                  : chip === 'unread'
                  ? 'Unread'
                  : chip === 'channels'
                  ? 'Channels'
                  : 'Files'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ============================================================
          MAIN BODY CONTENT AREA
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
                  content: `Here is the verified executive summary:\n\n• **Enterprise Security**: Phase 13 Passed (41 automated suites)\n• **Studio Shell**: Desktop & Mobile clients synchronized with zero packet drops\n• **Calendar**: Daily Engineering Standup active at 10:00 AM\n\nAll tools are unlocked with zero token caps.`,
                  createdAt: new Date().toISOString(),
                },
                executionTimeMs: 95,
              };
            }}
            onConfirmAction={async () => {}}
            onCancelAction={async () => {}}
          />
        )}
      </View>

      {/* ============================================================
          ANDROID 16 EXPRESSIVE FLOATING ACTION BUTTON (FAB)
          ============================================================ */}
      {activeTab !== 'activity' && (
        <TouchableOpacity
          style={styles.floatingFab}
          activeOpacity={0.85}
          onPress={() => {
            if (activeTab === 'copilot') {
              // trigger new conversation
            } else if (activeTab === 'calls') {
              // trigger quick call
            }
          }}
        >
          <View style={styles.fabInner}>
            <PlusIcon size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>{getFabLabel()}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ============================================================
          ANDROID 16 FLOATING PILL BOTTOM NAVIGATION BAR
          ============================================================ */}
      <View style={styles.bottomNavContainer}>
        <View style={styles.floatingDock}>
          {/* 1. Activity */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('activity')}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'activity' && styles.pillIndicatorActive,
              ]}
            >
              <ActivityIcon
                size={22}
                focused={activeTab === 'activity'}
                color="#616161"
              />
              {unreadNotifs > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{unreadNotifs}</Text>
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
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'chat' && styles.pillIndicatorActive,
              ]}
            >
              <ChatIcon
                size={22}
                focused={activeTab === 'chat'}
                color="#616161"
              />
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>1</Text>
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
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'teams' && styles.pillIndicatorActive,
              ]}
            >
              <TeamsIcon
                size={22}
                focused={activeTab === 'teams'}
                color="#616161"
              />
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
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'calendar' && styles.pillIndicatorActive,
              ]}
            >
              <CalendarIcon
                size={22}
                focused={activeTab === 'calendar'}
                color="#616161"
              />
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
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'calls' && styles.pillIndicatorActive,
              ]}
            >
              <CallsIcon
                size={22}
                focused={activeTab === 'calls'}
                color="#616161"
              />
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
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.pillIndicator,
                activeTab === 'copilot' && styles.pillIndicatorActive,
              ]}
            >
              <CopilotIcon size={22} focused={activeTab === 'copilot'} />
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
          PROFILE & PRESENCE MODAL (Material 3 Bottom Sheet)
          ============================================================ */}
      <Modal visible={showProfileModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.profileModalOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileModal(false)}
        >
          <View style={styles.profileSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.profileHeader}>
              <View style={styles.userAvatarLarge}>
                <Text style={styles.userAvatarLargeText}>AA</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>Amir Asad Ullah Khan</Text>
                <Text style={styles.profileEmail}>amir.asad@teamtrack.enterprise</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>Lead System Architect</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <Text style={styles.sheetSubheading}>Set Presence Status</Text>

            {(['available', 'busy', 'away', 'offline'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.presenceRow,
                  presenceStatus === s && styles.presenceRowActive,
                ]}
                onPress={() => {
                  setPresenceStatus(s);
                  setShowProfileModal(false);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.presenceStatusDot,
                    { backgroundColor: getStatusColor(s) },
                  ]}
                />
                <Text
                  style={[
                    styles.presenceLabel,
                    presenceStatus === s && styles.presenceLabelActive,
                  ]}
                >
                  {getStatusLabel(s)}
                </Text>
                {presenceStatus === s && (
                  <View style={styles.checkmarkPill}>
                    <Text style={styles.checkmarkText}>✓ Active</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <View style={styles.sectionDivider} />

            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setShowProfileModal(false)}
            >
              <Text style={styles.sheetCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  /* Android 16 Top App Bar */
  topAppBar: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topAppBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarButton: {
    position: 'relative',
    marginRight: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5B5FC7',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#5B5FC7',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5B5FC7',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#5B5FC7',
  },

  /* Android 16 Search Bar Chip */
  searchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  searchPlaceholder: {
    fontSize: 13,
    color: '#71717A',
    marginLeft: 10,
    flex: 1,
  },

  /* Filter Chips */
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipButtonActive: {
    backgroundColor: '#5B5FC7',
    borderColor: '#5B5FC7',
  },
  chipButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  chipButtonTextActive: {
    color: '#FFFFFF',
  },

  /* Main Body Area */
  contentArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* Android 16 Floating Action Button (FAB) */
  floatingFab: {
    position: 'absolute',
    right: 20,
    bottom: 92,
    zIndex: 99,
    borderRadius: 24,
    backgroundColor: '#5B5FC7',
    elevation: 6,
    shadowColor: '#5B5FC7',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* Android 16 Floating Pill Bottom Navigation Dock */
  bottomNavContainer: {
    position: 'relative',
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 4 : 10,
    paddingTop: 6,
  },
  floatingDock: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  pillIndicator: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pillIndicatorActive: {
    backgroundColor: '#EEF2FF',
  },
  badgeContainer: {
    position: 'absolute',
    top: -2,
    right: 4,
    backgroundColor: '#C4314B',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#71717A',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#5B5FC7',
    fontWeight: '700',
  },

  /* Android 16 Bottom Sheet Profile */
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  profileSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    elevation: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  userAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5B5FC7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarLargeText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  profileEmail: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5B5FC7',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  sheetSubheading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  presenceRowActive: {
    backgroundColor: '#F4F4F5',
  },
  presenceStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  presenceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#27272A',
    flex: 1,
  },
  presenceLabelActive: {
    color: '#18181B',
    fontWeight: '700',
  },
  checkmarkPill: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  checkmarkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  sheetCloseBtn: {
    marginTop: 10,
    backgroundColor: '#5B5FC7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
