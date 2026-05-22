import { useRef, useState, useCallback } from 'react';

export const useWebSocket = () => {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  const connect = useCallback((sessionId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = `${window.location.origin.replace('http', 'ws')}/ws/sessions/${sessionId}`;
    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setMessages((prev) => [data, ...prev]);
      } catch (err) {
        // fallback to raw message
        setMessages((prev) => [evt.data, ...prev]);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendChat = useCallback((text) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', payload: { text } }));
    }
  }, []);

  const sendParams = useCallback((params) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'params', payload: params }));
    }
  }, []);

  return {
    isConnected,
    messages,
    connect,
    disconnect,
    sendChat,
    sendParams,
  };
};

