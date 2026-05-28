import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Heart, MessageCircle, UserPlus, ShoppingCart, CheckCheck } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { formatNotificationTime } from '../utils/notificationTime';

const NotificationBell = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, loadNotifications } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const serverNotifications = (Array.isArray(notifications) ? notifications : []).filter(
    (n) => !n.isToast
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const getIcon = (type?: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-4 w-4 text-red-500 shrink-0" />;
      case 'comment':
        return <MessageCircle className="h-4 w-4 text-blue-500 shrink-0" />;
      case 'follow':
        return <UserPlus className="h-4 w-4 text-green-500 shrink-0" />;
      case 'purchase':
        return <ShoppingCart className="h-4 w-4 text-purple-500 shrink-0" />;
      case 'message':
        return <MessageCircle className="h-4 w-4 text-indigo-500 shrink-0" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500 shrink-0" />;
    }
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) loadNotifications();
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    await markAllAsRead();
    setMarkingAll(false);
  };

  const handleClick = async (n: {
    id?: string;
    _id?: string;
    type?: string;
    sourceId?: string;
    isRead?: boolean;
    read?: boolean;
  }) => {
    const id = n.id || n._id;
    if (id && !n.isRead && !n.read) await markAsRead(id);
    setOpen(false);
    if (n.sourceId && (n.type === 'purchase' || n.type === 'like' || n.type === 'comment')) {
      navigate(`/artwork/${n.sourceId}`);
    } else if (n.type === 'follow') {
      navigate('/dashboard');
    } else if (n.type === 'message') {
      navigate('/messages');
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <span className="font-semibold text-gray-900 dark:text-white">Notifications</span>
            {serverNotifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? 'Updating…' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {serverNotifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet</p>
            ) : (
              serverNotifications.map((n) => {
                const unread = !n.isRead && !n.read;
                return (
                  <button
                    key={n.id || n._id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      unread ? 'bg-indigo-50/80 dark:bg-indigo-900/20' : ''
                    }`}
                  >
                    <div className="flex gap-2">
                      {getIcon(n.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {n.title}
                          </p>
                          {unread && (
                            <span className="w-2 h-2 mt-1.5 rounded-full bg-indigo-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {formatNotificationTime(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {serverNotifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-center">
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View dashboard
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
