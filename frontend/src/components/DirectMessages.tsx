import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { DirectConversation, DirectMessage, User } from '../types';

type ConversationsById = Record<string, DirectConversation>;
type MessagesByConversationId = Record<string, DirectMessage[]>;
type PendingByClientMessageId = Record<string, { conversationId: string; tempId: string }>;

const mineStatusForSeq = (
  seq: number,
  peerReadSeq: number
): DirectMessage['status'] => (seq > 0 && seq <= peerReadSeq ? 'read' : 'sent');

const DirectMessages = () => {
  const { currentUser } = useAuth();
  const [conversationsById, setConversationsById] = useState<ConversationsById>({});
  const [conversationOrder, setConversationOrder] = useState<string[]>([]);
  const [messagesByConversationId, setMessagesByConversationId] =
    useState<MessagesByConversationId>({});
  const [pendingByClientMessageId, setPendingByClientMessageId] =
    useState<PendingByClientMessageId>({});
  const [activeConversationId, setActiveConversationId] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);

  const myId = String(currentUser?.id || currentUser?._id || '');
  const conversations = useMemo(
    () => conversationOrder.map((id) => conversationsById[id]).filter(Boolean),
    [conversationOrder, conversationsById]
  );
  const activeConversation = useMemo(
    () => (activeConversationId ? conversationsById[activeConversationId] : undefined),
    [conversationsById, activeConversationId]
  );
  const activeMessages = useMemo(
    () => (activeConversationId ? messagesByConversationId[activeConversationId] || [] : []),
    [messagesByConversationId, activeConversationId]
  );
  const upsertConversation = useCallback((conversation: DirectConversation) => {
    if (!conversation?.id) return;
    setConversationsById((prev) => ({ ...prev, [conversation.id]: conversation }));
    setConversationOrder((prev) => [conversation.id, ...prev.filter((id) => id !== conversation.id)]);
  }, []);

  const mergeConversations = useCallback(
    (list: DirectConversation[]) => {
      list.forEach((conversation) => upsertConversation(conversation));
    },
    [upsertConversation]
  );

  const refreshConversations = useCallback(async () => {
    const data = await api.getMessageConversations();
    const list = (Array.isArray(data) ? data : []).filter((c) => c?.id);
    mergeConversations(list);
    return list;
  }, [mergeConversations]);

  const loadConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const data = await api.getMessageConversations();
      const list = (Array.isArray(data) ? data : []).filter((c) => c?.id);
      const byId: ConversationsById = {};
      const order: string[] = [];
      list.forEach((conversation) => {
        byId[conversation.id] = conversation;
        order.push(conversation.id);
      });
      setConversationsById(byId);
      setConversationOrder(order);
      if (!activeConversationId && order.length > 0) {
        setActiveConversationId(order[0]);
      }
    } finally {
      setLoadingConversations(false);
    }
  }, [activeConversationId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const data = await api.getConversationMessages(conversationId);
    const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
    const peerReadSeq = Number(data?.peerLastReadSeq || 0);
    const normalized: DirectMessage[] = list
      .map((m) => {
        const mine = Boolean(m.isMine);
        const seq = Number(m.seq || 0);
        return {
          ...m,
          isMine: mine,
          status: mine ? mineStatusForSeq(seq, peerReadSeq) : m.status,
        };
      })
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
    setMessagesByConversationId((prev) => ({ ...prev, [conversationId]: normalized }));
    setConversationsById((prev) => {
      const existing = prev[conversationId];
      if (!existing) return prev;
      return { ...prev, [conversationId]: { ...existing, peerLastReadSeq: peerReadSeq } };
    });
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    loadMessages(activeConversationId).catch(() =>
      setMessagesByConversationId((prev) => ({ ...prev, [activeConversationId]: [] }))
    );
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!myId) return;
    const onRealtimeMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail as DirectMessage | undefined;
      if (!detail) return;
      const senderId = String(detail.senderId || '');
      const receiverId = String(detail.receiverId || '');
      if (senderId !== myId && receiverId !== myId) return;

      const conversationId = String(detail.conversationId || '');
      if (!conversationId) return;
      const isMine = senderId === myId;
      const text = detail.text || '';
      const createdAt = detail.createdAt || new Date().toISOString();
      const messageId = String(detail.id || '');
      const incomingClientMessageId = String(detail.clientMessageId || '');

      setMessagesByConversationId((prev) => {
        const current = prev[conversationId] || [];
        const matchIndex = current.findIndex(
          (m) =>
            (messageId && m.id === messageId) ||
            (incomingClientMessageId && m.clientMessageId === incomingClientMessageId)
        );
        const peerRead = Number(conversationsById[conversationId]?.peerLastReadSeq || 0);
        if (matchIndex >= 0) {
          const next = [...current];
          const base = next[matchIndex];
          const seq = Number(detail.seq || base.seq || 0);
          next[matchIndex] = {
            ...base,
            ...detail,
            isMine,
            status: isMine ? mineStatusForSeq(seq, peerRead) : undefined,
          };
          return { ...prev, [conversationId]: next.sort((a, b) => (a.seq || 0) - (b.seq || 0)) };
        }
        const seq = Number(detail.seq || 0);
        return {
          ...prev,
          [conversationId]: [
            ...current,
            {
              ...detail,
              isMine,
              status: isMine ? mineStatusForSeq(seq, peerRead) : undefined,
            },
          ].sort((a, b) => (a.seq || 0) - (b.seq || 0)),
        };
      });

      setConversationsById((prev) => {
        const existing = prev[conversationId];
        if (!existing) {
          void refreshConversations();
          return prev;
        }
        return {
          ...prev,
          [conversationId]: {
            ...existing,
            lastMessagePreview: text,
            lastMessageAt: createdAt,
            lastSeq: Number(detail.seq || existing.lastSeq || 0),
            unreadCount:
              !isMine && conversationId !== activeConversationId
                ? (existing.unreadCount || 0) + 1
                : existing.unreadCount || 0,
          },
        };
      });
      setConversationOrder((prev) => [conversationId, ...prev.filter((id) => id !== conversationId)]);

      if (incomingClientMessageId) {
        setPendingByClientMessageId((prev) => {
          if (!prev[incomingClientMessageId]) return prev;
          const { [incomingClientMessageId]: _ignore, ...rest } = prev;
          return rest;
        });
      }
    };

    window.addEventListener('realtime:message', onRealtimeMessage);
    return () => window.removeEventListener('realtime:message', onRealtimeMessage);
  }, [activeConversationId, myId, conversationsById, refreshConversations]);

  useEffect(() => {
    const onConversationUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as { conversationId?: string } | undefined;
      const conversationId = String(detail?.conversationId || '');
      if (!conversationId) return;
      if (!conversationsById[conversationId]) {
        void refreshConversations();
      }
    };
    window.addEventListener('realtime:conversation-updated', onConversationUpdated);
    return () =>
      window.removeEventListener('realtime:conversation-updated', onConversationUpdated);
  }, [conversationsById, refreshConversations]);

  useEffect(() => {
    if (!myId) return;
    const onRealtimeRead = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { conversationId?: string; readerUserId?: string; lastReadSeq?: number }
        | undefined;
      if (!detail) return;
      const conversationId = String(detail.conversationId || '');
      const readerUserId = String(detail.readerUserId || '');
      if (!conversationId || !readerUserId || readerUserId === myId) return;
      const lastRead = Number(detail.lastReadSeq || 0);
      if (!lastRead) return;

      setConversationsById((prev) => {
        const existing = prev[conversationId];
        if (!existing) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...existing,
            peerLastReadSeq: Math.max(Number(existing.peerLastReadSeq || 0), lastRead),
          },
        };
      });

      setMessagesByConversationId((prev) => {
        const current = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: current.map((m) => {
            if (!m.isMine) return m;
            const seq = Number(m.seq || 0);
            if (seq > 0 && seq <= lastRead) return { ...m, status: 'read', isRead: true };
            return m;
          }),
        };
      });
    };

    window.addEventListener('realtime:message-read', onRealtimeRead);
    return () => window.removeEventListener('realtime:message-read', onRealtimeRead);
  }, [myId]);

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
    api
      .createOrGetConversation(id)
      .then((conversation) => {
        if (!conversation?.id) return;
        upsertConversation(conversation);
        setActiveConversationId(conversation.id);
        setUserResults([]);
        setSearch('');
      })
      .catch(() => {});
  };

  const openConversation = (conversationId: string) => {
    const conversation = conversationsById[conversationId];
    if (!conversation) return;
    setActiveConversationId(conversationId);
    if ((conversation.lastSeq || 0) > 0) {
      api.markConversationRead(conversationId, conversation.lastSeq || 0).catch(() => {});
    }
    setConversationsById((prev) => ({
      ...prev,
      [conversationId]: { ...conversation, unreadCount: 0 },
    }));
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!activeConversationId || !text || sending) return;
    const nowIso = new Date().toISOString();
    const optimisticSeq =
      activeMessages.length > 0 ? Math.max(...activeMessages.map((m) => Number(m.seq || 0))) + 1 : 1;
    const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimisticId = `temp-${clientMessageId}`;
    try {
      setSending(true);
      setDraft('');
      setPendingByClientMessageId((prev) => ({
        ...prev,
        [clientMessageId]: { conversationId: activeConversationId, tempId: optimisticId },
      }));
      setMessagesByConversationId((prev) => {
        const current = prev[activeConversationId] || [];
        return {
          ...prev,
          [activeConversationId]: [
            ...current,
            {
              id: optimisticId,
              conversationId: activeConversationId,
              senderId: myId,
              text,
              clientMessageId,
              seq: optimisticSeq,
              createdAt: nowIso,
              isMine: true,
              status: 'sending',
            },
          ],
        };
      });
      setConversationsById((prev) => {
        const existing = prev[activeConversationId];
        if (!existing) return prev;
        return {
          ...prev,
          [activeConversationId]: {
            ...existing,
            lastMessagePreview: text,
            lastMessageAt: nowIso,
            lastSeq: Math.max(Number(existing.lastSeq || 0), optimisticSeq),
            unreadCount: 0,
          },
        };
      });
      setConversationOrder((prev) => [activeConversationId, ...prev.filter((id) => id !== activeConversationId)]);

      const sent = await api.sendDirectMessage(activeConversationId, text, clientMessageId);
      setPendingByClientMessageId((prev) => {
        const { [clientMessageId]: _ignore, ...rest } = prev;
        return rest;
      });
      setMessagesByConversationId((prev) => {
        const current = prev[activeConversationId] || [];
        const next = current.map((m) =>
          m.id === optimisticId || m.clientMessageId === clientMessageId
            ? {
                ...m,
                ...sent,
                isMine: true,
                status: mineStatusForSeq(
                  Number(sent.seq || 0),
                  Number(conversationsById[activeConversationId]?.peerLastReadSeq || 0)
                ),
              }
            : m
        );
        return { ...prev, [activeConversationId]: next.sort((a, b) => (a.seq || 0) - (b.seq || 0)) };
      });
      setConversationsById((prev) => {
        const existing = prev[activeConversationId];
        if (!existing) return prev;
        return {
          ...prev,
          [activeConversationId]: {
            ...existing,
            lastMessagePreview: text,
            lastMessageAt: sent.createdAt || nowIso,
            lastSeq: Math.max(Number(existing.lastSeq || 0), Number(sent.seq || 0)),
            unreadCount: 0,
          },
        };
      });
      if (typeof sent.seq === 'number') {
        api.markConversationRead(activeConversationId, sent.seq).catch(() => {});
      }
    } catch {
      setPendingByClientMessageId((prev) => {
        const { [clientMessageId]: _ignore, ...rest } = prev;
        return rest;
      });
      setMessagesByConversationId((prev) => {
        const current = prev[activeConversationId] || [];
        return {
          ...prev,
          [activeConversationId]: current.map((m) =>
            m.id === optimisticId ? { ...m, status: 'failed' } : m
          ),
        };
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
                      key={c.id}
                      type="button"
                      onClick={() => openConversation(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg ${
                        c.id === activeConversationId
                          ? 'bg-indigo-50 dark:bg-indigo-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">@{c.peerUsername}</span>
                        {c.unreadCount > 0 && (
                          <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{c.lastMessagePreview || 'Start chatting'}</p>
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
              {!activeConversationId ? (
                <p className="text-sm text-gray-500">Pick a conversation or search a user to start messaging.</p>
              ) : activeMessages.length === 0 ? (
                <p className="text-sm text-gray-500">No messages yet. Say hi 👋</p>
              ) : (
                activeMessages.map((m) => (
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
                        {m.isMine && (
                          <span className="ml-2">
                            {pendingByClientMessageId[m.clientMessageId || ''] || m.status === 'sending'
                              ? 'Sending...'
                              : m.status === 'failed'
                              ? 'Failed'
                              : m.status === 'read'
                              ? 'Read'
                              : 'Sent'}
                          </span>
                        )}
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
                disabled={!activeConversationId}
                placeholder={activeConversationId ? 'Type a message…' : 'Select a conversation first'}
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
                disabled={!activeConversationId || !draft.trim() || sending}
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
