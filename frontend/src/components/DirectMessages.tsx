import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { DirectConversation, DirectMessage, User } from '../types';

const DirectMessages = () => {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activePeerId, setActivePeerId] = useState('');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.peerId === activePeerId),
    [conversations, activePeerId]
  );

  const loadConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const data = await api.getMessageConversations();
      const list = Array.isArray(data) ? data : [];
      setConversations(list);
      if (!activePeerId && list.length > 0) {
        setActivePeerId(list[0].peerId);
      }
    } finally {
      setLoadingConversations(false);
    }
  }, [activePeerId]);

  const loadMessages = useCallback(async (peerId: string) => {
    if (!peerId) {
      setMessages([]);
      return;
    }
    const data = await api.getConversationMessages(peerId);
    setMessages(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    loadMessages(activePeerId).catch(() => setMessages([]));
  }, [activePeerId, loadMessages]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .searchUsers(q)
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          const filtered = list.filter(
            (u) => String(u.id || u._id || '') !== String(currentUser?.id || currentUser?._id || '')
          );
          setUserResults(filtered.slice(0, 6));
        })
        .catch(() => setUserResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, currentUser?.id, currentUser?._id]);

  const startConversation = (u: User) => {
    const id = String(u.id || u._id || '');
    if (!id) return;
    setActivePeerId(id);
    setUserResults([]);
    setSearch('');
    setConversations((prev) => {
      const exists = prev.some((c) => c.peerId === id);
      if (exists) return prev;
      return [
        {
          peerId: id,
          peerUsername: u.username,
          peerAvatarUrl: u.profile?.avatar as string | undefined,
          lastMessage: '',
          lastSenderId: '',
          lastAt: new Date().toISOString(),
          unreadCount: 0,
        },
        ...prev,
      ];
    });
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!activePeerId || !text || sending) return;
    try {
      setSending(true);
      const sent = await api.sendDirectMessage(activePeerId, text);
      setDraft('');
      setMessages((prev) => [...prev, sent]);
      setConversations((prev) => {
        const now = new Date().toISOString();
        const existing = prev.find((c) => c.peerId === activePeerId);
        const updated: DirectConversation = existing
          ? { ...existing, lastMessage: text, lastAt: now, lastSenderId: String(currentUser?.id || currentUser?._id || '') }
          : {
              peerId: activePeerId,
              peerUsername: activeConversation?.peerUsername || 'User',
              peerAvatarUrl: activeConversation?.peerAvatarUrl,
              lastMessage: text,
              lastSenderId: String(currentUser?.id || currentUser?._id || ''),
              lastAt: now,
              unreadCount: 0,
            };
        return [updated, ...prev.filter((c) => c.peerId !== activePeerId)];
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Direct Messages</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Chat privately with other artists.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <aside className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users to message…"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
            {userResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {userResults.map((u) => (
                  <button
                    key={String(u.id || u._id)}
                    type="button"
                    onClick={() => startConversation(u)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                  >
                    @{u.username}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold tracking-wide uppercase text-gray-500 mb-2">Conversations</p>
              {loadingConversations ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-gray-500">No conversations yet.</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((c) => (
                    <button
                      key={c.peerId}
                      type="button"
                      onClick={() => setActivePeerId(c.peerId)}
                      className={`w-full text-left px-3 py-2 rounded-lg ${
                        c.peerId === activePeerId
                          ? 'bg-indigo-50 dark:bg-indigo-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">@{c.peerUsername || c.peerId.slice(0, 6)}</span>
                        {c.unreadCount > 0 && (
                          <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{c.lastMessage || 'Start chatting'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-[560px]">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="font-semibold text-gray-900 dark:text-white">
                {activeConversation ? `@${activeConversation.peerUsername}` : 'Select a conversation'}
              </p>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {!activePeerId ? (
                <p className="text-sm text-gray-500">Pick a conversation or search a user to start messaging.</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-gray-500">No messages yet. Say hi 👋</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                        m.isMine
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p className={`text-[10px] mt-1 ${m.isMine ? 'text-indigo-100' : 'text-gray-500'}`}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!activePeerId}
                placeholder={activePeerId ? 'Type a message…' : 'Select a conversation first'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!activePeerId || !draft.trim() || sending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DirectMessages;
