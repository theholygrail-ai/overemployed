import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../config.js';

const MAX_MESSAGES = 100;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const [messages, setMessages] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const wsUrl = getWsUrl();
    if (!wsUrl) {
      setConnected(false);
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) return;
      setConnected(true);
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const data = JSON.parse(event.data);
        const msg = { ...data, _ts: Date.now() };
        setLastMessage(msg);
        setMessages((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnected(false);
      const delay = Math.min(reconnectDelay.current, MAX_RECONNECT_DELAY);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { messages, lastMessage, connected };
}
