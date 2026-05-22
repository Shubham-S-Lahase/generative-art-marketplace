import { useRef, useState, useCallback } from 'react';
import { getAuthHeader } from '../services/api';

export interface WSMessage {
  type?: string;
  userId?: string;
  username?: string;
  payload?: { text?: string; event?: string; [key: string]: unknown };
  sentAt?: number;
}

interface ConnectOptions {
  onParams?: (params: Record<string, unknown>) => void;
}

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const onParamsRef = useRef<((params: Record<string, unknown>) => void) | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const connect = useCallback(async (id: string, options: ConnectOptions = {}) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    onParamsRef.current = options.onParams ?? null;
    setSessionId(id);
    setMessages([]);

    const token = await getAuthHeader();
    const base = window.location.origin.replace(/^http/, 'ws');
    const url = token
      ? `${base}/ws/sessions/${id}?token=${encodeURIComponent(token)}`
      : `${base}/ws/sessions/${id}`;

    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as WSMessage;
        if (data.type === 'params' && data.payload) {
          onParamsRef.current?.(data.payload as Record<string, unknown>);
        }
        setMessages((prev) => [data, ...prev].slice(0, 100));
      } catch {
        setMessages((prev) => [{ type: 'raw', payload: { text: String(evt.data) } }, ...prev]);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setSessionId(null);
    onParamsRef.current = null;
  }, []);

  const sendChat = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', payload: { text } }));
    }
  }, []);

  const sendParams = useCallback((params: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'params', payload: params }));
    }
  }, []);

  return {
    isConnected,
    messages,
    sessionId,
    connect,
    disconnect,
    sendChat,
    sendParams,
  };
};
