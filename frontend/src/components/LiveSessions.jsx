import React, { useState, useEffect } from 'react';
import { Plus, Users, MessageCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';

const LiveSessions = () => {
  const { currentUser } = useAuth();
  const { connect, disconnect, sendChat, isConnected, messages } = useWebSocket();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      const normalized = data.map((s) => ({
        ...s,
        id: s.id || s._id,
        hostName: s.hostName || s.hostId,
        participants: s.participants || [],
        currentParameters: s.currentParameters || { colors: [], pattern: '' },
      }));
      setSessions(normalized);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (sessionId) => {
    try {
      await api.joinSession(sessionId);
      connect(sessionId);
      setSelectedSession(sessionId);
    } catch (error) {
      console.error('Error joining session:', error);
    }
  };

  const handleLeaveSession = async (sessionId) => {
    try {
      await api.leaveSession(sessionId);
      disconnect();
      setSelectedSession(null);
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Live Sessions</h1>
            <p className="text-gray-600 dark:text-gray-300">
              Join collaborative art creation sessions or start your own
            </p>
          </div>

          {currentUser && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Create Session</span>
            </button>
          )}
        </div>

        {/* Connection Status */}
        <div className={`mb-6 p-4 rounded-lg ${isConnected ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className={`text-sm font-medium ${isConnected ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {isConnected ? 'Connected to live sessions' : 'Disconnected from live sessions'}
            </span>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sessions.map((session) => (
            <div key={session.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {session.name}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">
                    {session.description}
                  </p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Host: {session.hostName}</span>
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>{session.participants.length}/{session.maxParticipants}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {session.isActive && (
                    <span className="flex items-center space-x-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Live</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Participants */}
              <div className="mb-4">
                <div className="flex -space-x-2">
                  {session.participants.slice(0, 5).map((participant) => (
                    <img
                      key={participant.userId}
                      src={`https://ui-avatars.com/api/?name=${participant.username}&background=6366f1&color=fff`}
                      alt={participant.username}
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800"
                      title={participant.username}
                    />
                  ))}
                  {session.participants.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center">
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        +{session.participants.length - 5}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Current Parameters Preview */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Current Style:</div>
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    {session.currentParameters.colors.map((color, index) => (
                      <div
                        key={index}
                        className="w-4 h-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {session.currentParameters.pattern}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                {selectedSession === session.id ? (
                  <button
                    onClick={() => handleLeaveSession(session.id)}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Leave Session
                  </button>
                ) : (
                  <button
                    onClick={() => handleJoinSession(session.id)}
                    disabled={!currentUser || session.participants.length >= session.maxParticipants}
                    className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {session.participants.length >= session.maxParticipants ? 'Full' : 'Join Session'}
                  </button>
                )}

                <button className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <MessageCircle className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {sessions.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 dark:text-gray-500 mb-4">
              <Users className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No active sessions
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Be the first to start a collaborative art session
            </p>
            {currentUser && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Create First Session
              </button>
            )}
          </div>
        )}

        {selectedSession && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Session Chat</h3>
              <span className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div>
            <div className="h-64 overflow-y-auto space-y-3 border border-gray-200 dark:border-gray-700 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              {messages.length === 0 && <p className="text-sm text-gray-500">No messages yet</p>}
              {messages.slice(0, 50).map((msg, idx) => (
                <div key={idx} className="text-sm text-gray-800 dark:text-gray-200">
                  <span className="font-semibold">{msg.userId || 'user'}:</span> {msg.payload?.text || msg.payload?.event}
                </div>
              ))}
            </div>
            <div className="mt-3 flex space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={() => {
                  if (chatInput.trim()) {
                    sendChat(chatInput.trim());
                    setChatInput('');
                  }
                }}
                disabled={!isConnected}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-400"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSessions;
