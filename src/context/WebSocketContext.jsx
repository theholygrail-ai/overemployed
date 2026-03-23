import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { getWsUrl, apiFetch } from '../config.js';

const WebSocketContext = createContext(null);

const MAX_MESSAGES = 100;
const MAX_RECONNECT_DELAY = 30000;
const API_HEALTH_MS = 30_000;

/** True if body looks like GET /api/metrics JSON (tolerates gateways that tweak types / omit Content-Type). */
function isMetricsPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const t = data.total;
  const totalNum = typeof t === 'number' ? t : Number(t);
  if (!Number.isFinite(totalNum)) return false;
  const bs = data.byStatus;
  if (bs == null || typeof bs !== 'object' || Array.isArray(bs)) return false;
  return true;
}

/**
 * Single WebSocket + API health connection for the whole app.
 * Previously each component calling useWebSocket() opened duplicate sockets.
 */
export function WebSocketProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [apiReachable, setApiReachable] = useState(false);
  const wsRef = useRef(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef(null);
  const unmounted = useRef(false);

  const wsUrl = useMemo(() => getWsUrl(), []);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    if (!wsUrl) {
      setWsConnected(false);
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) return;
      setWsConnected(true);
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
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setWsConnected(false);
      const delay = Math.min(reconnectDelay.current, MAX_RECONNECT_DELAY);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const r = await apiFetch('/metrics');
        if (!r.ok) {
          if (!cancelled) setApiReachable(false);
          return;
        }
        let data;
        try {
          data = await r.json();
        } catch {
          if (!cancelled) setApiReachable(false);
          return;
        }
        if (!cancelled) setApiReachable(isMetricsPayload(data));
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    };
    ping();
    const id = setInterval(ping, API_HEALTH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const usingWebSocket = Boolean(wsUrl);
  const connected = wsConnected || apiReachable;

  const value = useMemo(
    () => ({
      messages,
      lastMessage,
      connected,
      wsConnected,
      apiReachable,
      usingWebSocket,
    }),
    [messages, lastMessage, connected, wsConnected, apiReachable, usingWebSocket]
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocket must be used within <WebSocketProvider>');
  }
  return ctx;
}
