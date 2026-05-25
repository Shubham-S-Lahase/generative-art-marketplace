import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import api from '../services/api';
import { invalidateDedupKey } from '../services/requestDedup';

const NOTIFICATIONS_KEY = 'me/notifications';

const isUnread = (n: { isRead?: boolean; read?: boolean }) => !n.isRead && !n.read;

export const useNotifications = () => {
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
