import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { Notification, NotificationType } from '@teamtrack/shared-types';

export interface MobileNotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  onMarkRead: (id: string) => Promise<void>;
  onMarkUnread: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNavigate?: (resourceType: string, resourceId?: string) => void;
  onClose?: () => void;
}

function getIconForType(type: NotificationType): string {
  switch (type) {
    case 'mention':
      return '@';
    case 'direct_message':
      return '💬';
    case 'channel_message':
      return '#';
    case 'reply':
      return '↩';
    case 'meeting_invite':
    case 'meeting_started':
    case 'meeting_update':
    case 'meeting_participant':
      return '📅';
    case 'team_activity':
      return '👥';
    case 'system':
    default:
      return '📢';
  }
}

export function MobileNotificationCenter({
  notifications,
  unreadCount,
  isLoading,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onDelete,
  onRefresh,
  onNavigate,
  onClose,
}: MobileNotificationCenterProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = notifications.filter((item) => {
    if (filter === 'unread') return item.readAt === null;
    return true;
  });

  const renderItem = ({ item }: { item: Notification }) => {
    const isUnread = item.readAt === null;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (isUnread) void onMarkRead(item.id);
          if (onNavigate && item.resourceType) {
            onNavigate(item.resourceType, item.resourceId || undefined);
          }
        }}
        style={[styles.itemCard, isUnread && styles.unreadCard]}
      >
        <View style={styles.itemHeader}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>{getIconForType(item.type)}</Text>
          </View>
          <View style={styles.itemHeaderText}>
            <Text style={styles.itemType}>{item.type.replace('_', ' ').toUpperCase()}</Text>
            <Text style={styles.itemDate}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {isUnread && <View style={styles.unreadDot} />}
        </View>

        <Text style={[styles.itemTitle, isUnread && styles.unreadTitle]}>{item.title}</Text>
        <Text style={styles.itemBody} numberOfLines={2}>
          {item.body}
        </Text>

        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (isUnread) void onMarkRead(item.id);
              else void onMarkUnread(item.id);
            }}
          >
            <Text style={styles.actionText}>{isUnread ? 'Mark Read' : 'Mark Unread'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => void onDelete(item.id)}
          >
            <Text style={[styles.actionText, styles.deleteText]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={() => void onMarkAllRead()}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.activeTab]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, filter === 'unread' && styles.activeTab]}
          onPress={() => setFilter('unread')}
        >
          <Text style={[styles.tabText, filter === 'unread' && styles.activeTabText]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {isLoading && notifications.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>You're all caught up!</Text>
          <Text style={styles.emptySubtitle}>No notifications to display</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={isLoading}
          onRefresh={() => void onRefresh()}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.15)',
    backgroundColor: '#1e293b',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    gap: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeTab: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  unreadCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60a5fa',
  },
  itemHeaderText: {
    flex: 1,
  },
  itemType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60a5fa',
  },
  itemDate: {
    fontSize: 11,
    color: '#64748b',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cbd5e1',
    marginBottom: 4,
  },
  unreadTitle: {
    color: '#ffffff',
    fontWeight: '700',
  },
  itemBody: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 8,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
    paddingTop: 8,
  },
  actionButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '500',
  },
  deleteButton: {
    opacity: 0.8,
  },
  deleteText: {
    color: '#f87171',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
  },
});
