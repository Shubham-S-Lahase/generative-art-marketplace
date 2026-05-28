import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
  type ReactNode,
} from 'react';
import { useAuth } from './useAuth';
import api from '../services/api';
import { invalidateDedupKey } from '../services/requestDedup';
import { getAuthHeader } from '../services/api';

const NOTIFICATIONS_KEY = 'me/notifications';

const isUnread = (n: { isRead?: boolean; read?: boolean }) => !n.isRead && !n.read;

type NotificationsContextValue = {
  notifications: any[];
  unreadCount: number;
  loading: boolean;
  loadNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: any) => void;
  removeNotification: (notificationId: string) => void;
  showToast: (message: string, type?: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const useNotificationsState = (): NotificationsContextValue => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      invalidateDedupKey(NOTIFICATIONS_KEY);
      const data = await api.getNotifications();
      const notificationsArray = Array.isArray(data) ? data : [];
      setNotifications(notificationsArray);
      setUnreadCount(notificationsArray.filter(isUnread).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!notificationId) return;
      try {
        await api.markNotificationAsRead(notificationId);
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId || notification._id === notificationId
              ? { ...notification, read: true, isRead: true }
              : notification
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        invalidateDedupKey(NOTIFICATIONS_KEY);
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, read: true, isRead: true }))
      );
      setUnreadCount(0);
      invalidateDedupKey(NOTIFICATIONS_KEY);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, []);

  const addNotification = useCallback((notification) => {
    setNotifications((prev) => [notification, ...prev]);
    if (isUnread(notification)) {
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const removeNotification = useCallback((notificationId) => {
    setNotifications((prev) => {
      const notification = prev.find(
        (n) => n.id === notificationId || n._id === notificationId
      );
      if (notification && isUnread(notification)) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      return prev.filter((n) => n.id !== notificationId && n._id !== notificationId);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;

    const connect = async () => {
      const token = await getAuthHeader();
      if (!active) return;
      const base = window.location.origin.replace(/^http/, 'ws');
      const url = token ? `${base}/ws/events?token=${encodeURIComponent(token)}` : `${base}/ws/events`;
      socket = new WebSocket(url);

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.type === 'notification:new' && data?.payload) {
            addNotification(data.payload);
          }
          if (data?.type === 'message:new' && data?.payload) {
            window.dispatchEvent(new CustomEvent('realtime:message', { detail: data.payload }));
          }
          if (data?.type === 'message.read' && data?.payload) {
            window.dispatchEvent(new CustomEvent('realtime:message-read', { detail: data.payload }));
          }
          if (data?.type === 'conversation.updated' && data?.payload) {
            window.dispatchEvent(
              new CustomEvent('realtime:conversation-updated', { detail: data.payload })
            );
          }
          if (data?.type === 'conversation.deleted' && data?.payload) {
            window.dispatchEvent(
              new CustomEvent('realtime:conversation-deleted', { detail: data.payload })
            );
          }
        } catch {
          // Ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (!active) return;
        retryTimer = window.setTimeout(connect, 3000);
      };
    };

    connect().catch(() => {});

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [currentUser, addNotification]);

  const showToast = useCallback(
    (message, type = 'info') => {
      const notification = {
        id: Date.now().toString(),
        type,
        title: type.charAt(0).toUpperCase() + type.slice(1),
        message,
        timestamp: Date.now(),
        read: false,
        isToast: true,
      };

      addNotification(notification);

      setTimeout(() => {
        removeNotification(notification.id);
      }, 5000);
    },
    [addNotification, removeNotification]
  );

  return {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    addNotification,
    removeNotification,
    showToast,
  };
};

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const value = useNotificationsState();
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
};
