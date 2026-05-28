import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, UserPlus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { ActivityEvent } from '../types';

const ActivityFeed = () => {
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getActivityFeed(40)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const buckets: Record<string, ActivityEvent[]> = {};
    for (const item of items) {
      const d = new Date(item.createdAt || Date.now());
      const key = d.toDateString();
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(item);
    }
    return Object.entries(buckets);
  }, [items]);

  const iconFor = (type?: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-4 w-4 text-red-500" />;
      case 'comment':
        return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case 'follow':
        return <UserPlus className="h-4 w-4 text-emerald-500" />;
      default:
        return <Sparkles className="h-4 w-4 text-indigo-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Public Activity</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Live social stream of follows, likes, comments, and new artwork posts.
          </p>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm text-gray-500">Loading activity…</div>
        ) : items.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm text-gray-500">No activity yet.</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([day, events]) => (
              <section key={day}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{day}</h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {events.map((e, idx) => (
                    <div
                      key={`${e.type}-${e.createdAt}-${idx}`}
                      className={`px-4 py-3 flex items-start gap-3 ${idx < events.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                    >
                      <div className="mt-0.5">{iconFor(e.type)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          <span className="font-semibold">@{e.actor || 'artist'}</span> {e.message}{' '}
                          {e.target && <span className="font-semibold">@{e.target}</span>}
                          {e.artwork && (
                            <>
                              {' '}
                              on{' '}
                              {e.artworkId ? (
                                <Link to={`/artwork/${e.artworkId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                  {e.artwork}
                                </Link>
                              ) : (
                                <span className="font-semibold">{e.artwork}</span>
                              )}
                            </>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(e.createdAt).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
