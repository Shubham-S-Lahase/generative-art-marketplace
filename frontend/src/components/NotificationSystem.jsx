import React, { useState, useEffect } from 'react';
import { X, Bell, Heart, MessageCircle, UserPlus, ShoppingCart } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

const NotificationSystem = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showToast, setShowToast] = useState(false);
  
  // Ensure notifications is always an array
  const safeNotifications = Array.isArray(notifications) ? notifications : [];

  useEffect(() => {
    if (unreadCount > 0) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  const latest = safeNotifications.length > 0 
    ? (safeNotifications.find((n) => !n.isRead && !n.read) || safeNotifications[0])
    : null;

  const getIcon = (type) => {
    switch (type) {
      case 'like':
        return <Heart className="h-5 w-5 text-red-500" />;
      case 'comment':
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'follow':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      case 'purchase':
        return <ShoppingCart className="h-5 w-5 text-purple-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <>
      {showToast && latest && (
        <div className="fixed top-20 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm border border-gray-200 dark:border-gray-700 animate-slide-down">
          <div className="flex items-start space-x-3">
            {getIcon(latest.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {latest.title}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {latest.message}
              </p>
            </div>
            <button
              onClick={() => {
                setShowToast(false);
                markAsRead(latest.id || latest._id);
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {safeNotifications.length > 0 && (
        <div className="fixed bottom-6 right-4 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700 w-80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
            </div>
            <button onClick={markAllAsRead} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {safeNotifications.slice(0, 6).map((n) => (
                <div
                key={n.id || n._id}
                className={`p-3 rounded-lg border border-gray-100 dark:border-gray-700 ${(!n.read && !n.isRead) ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'}`}
                onClick={() => markAsRead(n.id || n._id)}
                >
                <div className="flex items-start space-x-2">
                  {getIcon(n.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{n.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationSystem;
