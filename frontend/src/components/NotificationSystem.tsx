import React, { useState, useEffect } from 'react';
import { X, Heart, MessageCircle, UserPlus, ShoppingCart, Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

/** Brief toast for the latest unread notification (panel is in header NotificationBell). */
const NotificationSystem = () => {
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const [showToast, setShowToast] = useState(false);

  const serverNotifications = (Array.isArray(notifications) ? notifications : []).filter(
    (n) => !n.isToast
  );

  const latest = serverNotifications.find((n) => !n.isRead && !n.read) || null;

  useEffect(() => {
    if (latest && unreadCount > 0) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 5000);
      return () => clearTimeout(timer);
    }
    setShowToast(false);
  }, [latest?.id, unreadCount]);

  const getIcon = (type?: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-5 w-5 text-red-500" />;
      case 'comment':
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'follow':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      case 'purchase':
        return <ShoppingCart className="h-5 w-5 text-purple-500" />;
      case 'message':
        return <MessageCircle className="h-5 w-5 text-indigo-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  if (!showToast || !latest) return null;

  return (
    <div className="fixed top-20 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-start space-x-3">
        {getIcon(latest.type)}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{latest.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{latest.message}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowToast(false);
            markAsRead(latest.id || latest._id);
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationSystem;
