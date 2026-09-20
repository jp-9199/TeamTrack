'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  createApiClient,
  NotificationSyncManager,
  type ApiClient,
} from '@teamtrack/api-client';
import type {
  Notification,
  NotificationType,
  RealtimeEnvelope,
} from '@teamtrack/shared-types';

export interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  filter: 'all' | 'unread';
  setFilter: (filter: 'all' | 'unread') => void;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  isPopoverOpen: boolean;
  openPopover: () => void;
  closePopover: () => void;
  togglePopover: () => void;
  markRead: (notificationId: string) => Promise<void>;
  markUnread: (notificationId: string) => Promise<void>;
  markAllRead: (organizationId?: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';
  apiClient: ApiClient;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

import { useAuth } from '../auth/AuthContext';

export interface NotificationProviderProps {
  children: ReactNode;
  baseUrl?: string;
  token?: string;
  userId?: string;
}

export function NotificationProvider({
  children,
  baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  token,
  userId,
}: NotificationProviderProps) {
  const { user } = useAuth();
  const effectiveToken = typeof window !== 'undefined'
    ? (localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || token || '')
    : (token || '');
  const effectiveUserId = user?.id || userId || '';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  const apiClientRef = useRef<ApiClient>(createApiClient({ baseUrl, platform: 'web' }));
  const syncManagerRef = useRef<NotificationSyncManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize apiClient and syncManager
  if (!syncManagerRef.current) {
    if (effectiveToken) {
      apiClientRef.current.setAccessToken(effectiveToken);
    }

    syncManagerRef.current = new NotificationSyncManager({
      apiClient: apiClientRef.current,
      onStateChanged: ({ notifications: items, unreadCount: count }) => {
        setNotifications(items);
        setUnreadCount(count);
      },
      onGapDetected: () => {
        // Deterministic catch-up synchronization on sequence gap
        void handleCatchupSync();
      },
    });
  }

  // Synchronize token updates
  useEffect(() => {
    if (effectiveToken) {
      apiClientRef.current.setAccessToken(effectiveToken);
    }
  }, [effectiveToken]);

  /**
   * Authoritative catch-up sync using Phase 9C contract.
   */
  const handleCatchupSync = useCallback(async () => {
    if (!syncManagerRef.current) return;
    try {
      const localSeqStr = syncManagerRef.current.getLocalSeq().toString();
      const res = await apiClientRef.current.syncNotifications({
        snapshotMutationSeq: localSeqStr,
        limit: 50,
      });
      if (res.success && res.data) {
        syncManagerRef.current.applySyncResponse(res.data);
      }
    } catch (err: any) {
      console.warn('[NotificationSync] Catch-up sync warning:', err?.message || err);
    }
  }, []);

  /**
   * Initial notification load and unread count fetch.
   */
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [listRes, countRes] = await Promise.all([
        apiClientRef.current.listNotifications({ limit: 30 }),
        apiClientRef.current.getUnreadNotificationCount(),
      ]);

      if (listRes.success && listRes.data) {
        const items = listRes.data.items || [];
        const count = countRes.success && countRes.data ? countRes.data.unreadCount : items.filter((n) => !n.readAt).length;

        syncManagerRef.current?.setInitialNotifications(items, count);
        setNextCursor(listRes.data.nextCursor);
        setHasMore(listRes.data.hasMore);
      } else {
        setNotifications([]);
        setUnreadCount(0);
        setError(null);
      }
    } catch (err: any) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * WebSocket setup for realtime events with single-use ticket authentication.
   */
  const setupRealtime = useCallback(async () => {
    try {
      setWsStatus('reconnecting');
      const ticketRes = await apiClientRef.current.createWsTicket();
      if (!ticketRes.success || !ticketRes.data) {
        setWsStatus('disconnected');
        return;
      }

      const ticket = ticketRes.data.ticket;
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(wsUrl, ['teamtrack-ws', `tt-ticket.${ticket}`]);

      ws.onopen = () => {
        setWsStatus('connected');
        // Subscribe to user notification channel
        if (effectiveUserId) {
          ws.send(JSON.stringify({ type: 'subscribe', topic: `user:${effectiveUserId}` }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event' && msg.event?.startsWith('notification.')) {
            syncManagerRef.current?.handleRealtimeEvent(msg as RealtimeEnvelope<any>);
          }
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
      };

      ws.onerror = () => {
        setWsStatus('disconnected');
      };

      wsRef.current = ws;
    } catch {
      setWsStatus('disconnected');
    }
  }, [baseUrl, effectiveUserId]);

  // Initial load and WebSocket connection
  useEffect(() => {
    void loadInitialData();
    void setupRealtime();

    // Reconcile on window focus
    const handleFocus = () => {
      void handleCatchupSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [loadInitialData, setupRealtime, handleCatchupSync]);

  /**
   * Cursor-based pagination (Load More).
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await apiClientRef.current.listNotifications({
        cursor: nextCursor,
        limit: 20,
      });

      if (res.success && res.data) {
        const olderItems = res.data.items || [];
        syncManagerRef.current?.appendOlderNotifications(olderItems);
        setNextCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
      }
    } catch (err: any) {
      console.error('[NotificationContext] Failed to load more notifications:', err?.message || err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, nextCursor, isLoadingMore]);

  /**
   * Optimistic mark as read.
   */
  const markRead = useCallback(async (notificationId: string) => {
    if (!syncManagerRef.current) return;
    const snapshot = syncManagerRef.current.getSnapshot();
    syncManagerRef.current.markReadOptimistic(notificationId);

    try {
      const res = await apiClientRef.current.markNotificationRead(notificationId);
      if (!res.success) {
        syncManagerRef.current.restoreSnapshot(snapshot);
        setError(res.error?.message || 'Failed to mark notification as read');
      }
    } catch {
      syncManagerRef.current.restoreSnapshot(snapshot);
      setError('Network error marking notification as read');
    }
  }, []);

  /**
   * Optimistic mark as unread.
   */
  const markUnread = useCallback(async (notificationId: string) => {
    if (!syncManagerRef.current) return;
    const snapshot = syncManagerRef.current.getSnapshot();
    syncManagerRef.current.markUnreadOptimistic(notificationId);

    try {
      const res = await apiClientRef.current.markNotificationUnread(notificationId);
      if (!res.success) {
        syncManagerRef.current.restoreSnapshot(snapshot);
        setError(res.error?.message || 'Failed to mark notification as unread');
      }
    } catch {
      syncManagerRef.current.restoreSnapshot(snapshot);
      setError('Network error marking notification as unread');
    }
  }, []);

  /**
   * Optimistic mark all as read.
   */
  const markAllRead = useCallback(async (organizationId?: string) => {
    if (!syncManagerRef.current) return;
    const snapshot = syncManagerRef.current.getSnapshot();
    syncManagerRef.current.markAllReadOptimistic(new Date().toISOString(), organizationId);

    try {
      const res = await apiClientRef.current.markAllNotificationsRead(organizationId);
      if (!res.success) {
        syncManagerRef.current.restoreSnapshot(snapshot);
        setError(res.error?.message || 'Failed to mark all as read');
      }
    } catch {
      syncManagerRef.current.restoreSnapshot(snapshot);
      setError('Network error marking all as read');
    }
  }, []);

  /**
   * Optimistic delete / dismiss notification.
   */
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!syncManagerRef.current) return;
    const snapshot = syncManagerRef.current.getSnapshot();
    syncManagerRef.current.deleteOptimistic(notificationId);

    try {
      const res = await apiClientRef.current.deleteNotification(notificationId);
      if (!res.success) {
        syncManagerRef.current.restoreSnapshot(snapshot);
        setError(res.error?.message || 'Failed to delete notification');
      }
    } catch {
      syncManagerRef.current.restoreSnapshot(snapshot);
      setError('Network error deleting notification');
    }
  }, []);

  const openPopover = useCallback(() => setIsPopoverOpen(true), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        isLoadingMore,
        hasMore,
        error,
        filter,
        setFilter,
        typeFilter,
        setTypeFilter,
        isPopoverOpen,
        openPopover,
        closePopover,
        togglePopover,
        markRead,
        markUnread,
        markAllRead,
        deleteNotification,
        loadMore,
        refresh: loadInitialData,
        wsStatus,
        apiClient: apiClientRef.current,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
