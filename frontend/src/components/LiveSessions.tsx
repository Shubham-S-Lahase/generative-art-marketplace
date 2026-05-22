import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Users, MessageCircle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { debounce } from '../utils/helpers';
import SessionArtCanvas from './SessionArtCanvas';

const DEFAULT_PARAMS = {
  colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
  shapes: ['circles'],
  pattern: 'spiral',
  complexity: 5,
  seed: 42,
};

const PATTERNS = ['spiral', 'geometric', 'organic', 'random'];
const COLOR_PRESETS = [
  ['#FF6B6B', '#4ECDC4', '#45B7D1'],
  ['#ff0000', '#00ff00', '#0000ff'],
  ['#f72585', '#7209b7', '#4cc9f0'],
  ['#2d6a4f', '#52b788', '#d8f3dc'],
];

const participantKey = (p) => String(p.userId?.$oid ?? p.userId ?? '');

const isUserParticipant = (session, user) => {
  if (!session || !user) return false;
  const uid = String(user.id ?? user._id ?? '');
  return session.participants.some((p) => participantKey(p) === uid);
};

const dedupeParticipants = (participants) => {
  const byId = new Map();
  for (const p of participants) {
    const key = participantKey(p);
    if (!key) continue;
    const existing = byId.get(key);
    if (!existing || p.role === 'host') {
      byId.set(key, p);
    }
  }
  return Array.from(byId.values());
};

const normalizeSession = (s) => ({
  ...s,
  id: s.id || s._id,
  hostName: s.hostName || s.hostId,
  participants: dedupeParticipants(s.participants || []).map((p) => ({
    ...p,
    username: p.username || p.userId,
  })),
  currentParameters: {
    ...DEFAULT_PARAMS,
    ...(s.currentParameters || {}),
    colors: s.currentParameters?.colors?.length
      ? s.currentParameters.colors
      : DEFAULT_PARAMS.colors,
    shapes: s.currentParameters?.shapes?.length
      ? s.currentParameters.shapes
      : DEFAULT_PARAMS.shapes,
  },
});

const LiveSessions = () => {
  const { currentUser } = useAuth();
  const { connect, disconnect, sendChat, sendParams, isConnected, messages } = useWebSocket();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [liveParameters, setLiveParameters] = useState({ ...DEFAULT_PARAMS });
  const [chatInput, setChatInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    maxParticipants: 10,
    isPublic: true,
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const isSessionHost =
    selectedSession &&
    currentUser &&
    String(selectedSession.hostId?.$oid ?? selectedSession.hostId) ===
      String(currentUser.id ?? currentUser._id);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      setSessions((Array.isArray(data) ? data : []).map(normalizeSession));
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const latestParticipantEvent = useMemo(() => {
    const m = messages.find(
      (msg) =>
        msg.type === 'system' &&
        ['join', 'leave', 'session_ended', 'participants_updated'].includes(
          msg.payload?.event as string
        )
    );
    if (!m) return null;
    return `${m.payload?.event}:${m.userId ?? ''}:${m.payload?.text ?? ''}`;
  }, [messages]);

  useEffect(() => {
    if (!latestParticipantEvent) return;
    const event = latestParticipantEvent.split(':')[0];
    if (event === 'session_ended') {
      disconnect();
      setSelectedSessionId(null);
      loadSessions();
      return;
    }
    loadSessions();
  }, [latestParticipantEvent, disconnect]);

  const updateSessionParams = useCallback((sessionId, params) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, currentParameters: { ...s.currentParameters, ...params } } : s
      )
    );
  }, []);

  const debouncedSendParams = useMemo(
    () =>
      debounce((params) => {
        sendParams(params);
      }, 350),
    [sendParams]
  );

  const handleIncomingParams = useCallback(
    (params) => {
      setLiveParameters((prev) => {
        const next = { ...prev, ...params };
        if (selectedSessionId) {
          updateSessionParams(selectedSessionId, next);
        }
        return next;
      });
    },
    [selectedSessionId, updateSessionParams]
  );

  const handleJoinSession = async (session) => {
    const sessionId = session.id || session._id;
    try {
      await api.joinSession(sessionId);
      setSelectedSessionId(sessionId);
      setLiveParameters({ ...session.currentParameters });
      await connect(sessionId, { onParams: handleIncomingParams });
      await loadSessions();
    } catch (error) {
      console.error('Error joining session:', error);
      alert(error.response?.data?.error || 'Failed to join session');
    }
  };

  const handleLeaveSession = async () => {
    if (!selectedSessionId) return;
    try {
      await api.leaveSession(selectedSessionId);
      disconnect();
      setSelectedSessionId(null);
      await loadSessions();
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    try {
      setCreating(true);
      const created = await api.createSession({
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        maxParticipants: Number(createForm.maxParticipants) || 10,
        isPublic: createForm.isPublic,
        currentParameters: { ...DEFAULT_PARAMS, seed: Math.floor(Math.random() * 100000) },
      });
      const normalized = normalizeSession(created);
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', maxParticipants: 10, isPublic: true });
      await loadSessions();
      await handleJoinSession(normalized);
    } catch (error) {
      console.error('Error creating session:', error);
      alert(error.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleParamChange = (key, value) => {
    setLiveParameters((prev) => {
      const next = { ...prev, [key]: value };
      if (selectedSessionId && isConnected) {
        debouncedSendParams(next);
        updateSessionParams(selectedSessionId, next);
      }
      return next;
    });
  };

  const chatMessages = messages.filter((m) => m.type === 'chat' || m.type === 'system');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Live Sessions</h1>
            <p className="text-gray-600 dark:text-gray-300">
              Collaborate on generative art in real time
            </p>
          </div>
          {currentUser && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-5 w-5" />
              Create Session
            </button>
          )}
        </div>

        <div
          className={`mb-6 p-4 rounded-lg ${
            isConnected ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span
              className={`text-sm font-medium ${
                isConnected ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
              }`}
            >
              {isConnected
                ? `Connected${selectedSession ? ` to "${selectedSession.name}"` : ''}`
                : 'Not connected to a session'}
            </span>
          </div>
        </div>

        {selectedSession && (
          <div className="mb-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Live canvas — {selectedSession.name}
                  </h2>
                  <button
                    type="button"
                    onClick={handleLeaveSession}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    {isSessionHost ? 'End session' : 'Leave session'}
                  </button>
                </div>
                <SessionArtCanvas parameters={liveParameters} />
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Collaborative controls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Pattern</label>
                    <select
                      value={liveParameters.pattern}
                      onChange={(e) => handleParamChange('pattern', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    >
                      {PATTERNS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Complexity: {liveParameters.complexity}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={liveParameters.complexity}
                      onChange={(e) => handleParamChange('complexity', Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-2">Color presets</label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PRESETS.map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleParamChange('colors', preset)}
                          className="flex gap-1 p-1 rounded border border-gray-200 dark:border-gray-600 hover:border-indigo-500"
                        >
                          {preset.map((c) => (
                            <span
                              key={c}
                              className="w-5 h-5 rounded-full border border-gray-300"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Seed</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={liveParameters.seed}
                        onChange={(e) => handleParamChange('seed', Number(e.target.value))}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleParamChange('seed', Math.floor(Math.random() * 100000))
                        }
                        className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg"
                      >
                        Random
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Changes sync to everyone in the session in real time.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Session chat
                </h3>
                <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              <div className="flex-1 min-h-[280px] max-h-[400px] overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 mb-3">
                {chatMessages.length === 0 && (
                  <p className="text-sm text-gray-500">No messages yet. Say hello!</p>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className="text-sm">
                    {msg.type === 'system' ? (
                      <p className="text-gray-500 italic text-xs">
                        {msg.payload?.text || msg.payload?.event}
                      </p>
                    ) : (
                      <p className="text-gray-800 dark:text-gray-200">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {msg.username || 'User'}:
                        </span>{' '}
                        {msg.payload?.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      sendChat(chatInput.trim());
                      setChatInput('');
                    }
                  }}
                  placeholder="Type a message..."
                  disabled={!isConnected}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (chatInput.trim()) {
                      sendChat(chatInput.trim());
                      setChatInput('');
                    }
                  }}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:bg-gray-400"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sessions.map((session) => {
            const maxParticipants = session.maxParticipants || 10;
            const atCapacity = session.participants.length >= maxParticipants;
            const alreadyIn = isUserParticipant(session, currentUser);
            const joinDisabled = !currentUser || (atCapacity && !alreadyIn);
            const joinLabel = alreadyIn ? 'Rejoin' : atCapacity ? 'Full' : 'Join';

            return (
            <div key={session.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{session.name}</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">{session.description}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                    <span>Host: {session.hostName}</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {session.participants.length}/{session.maxParticipants || 10}
                    </span>
                  </div>
                </div>
                {session.isActive && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>

              <div className="flex -space-x-2 mb-4">
                {session.participants.slice(0, 6).map((p) => (
                  <img
                    key={participantKey(p)}
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(p.username || 'U')}&background=6366f1&color=fff`}
                    alt={p.username}
                    title={p.username}
                    className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800"
                  />
                ))}
              </div>

              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-xs text-gray-500 mb-2">Current style</div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {(session.currentParameters.colors || []).map((color, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-sm capitalize text-gray-700 dark:text-gray-300">
                    {session.currentParameters.pattern}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {selectedSessionId === session.id ? (
                  <button
                    type="button"
                    onClick={handleLeaveSession}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 text-sm"
                  >
                    {String(session.hostId?.$oid ?? session.hostId) ===
                    String(currentUser?.id ?? currentUser?._id)
                      ? 'End'
                      : 'Leave'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleJoinSession(session)}
                    disabled={joinDisabled}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 text-sm"
                  >
                    {joinLabel}
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {sessions.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No active sessions</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">Start the first collaborative session</p>
            {currentUser && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
              >
                Create First Session
              </button>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create live session</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Session name *
                </label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Friday night jam"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="What will you create together?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max participants
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={createForm.maxParticipants}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, maxParticipants: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={createForm.isPublic}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isPublic: e.target.checked }))}
                  className="rounded"
                />
                Public session (visible in list)
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={creating || !createForm.name.trim()}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create & join'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveSessions;
