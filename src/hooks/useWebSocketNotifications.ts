/**
 * Hook for WebSocket real-time notifications
 * Connects to Django Channels WebSocket for instant updates
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { notifyUnauthorized } from '@/api';

interface NotificationData {
  type: string;
  message: string;
  object?: unknown;
}

// Every frame the backend sends is one of these shapes. Registering them as a
// discriminated union (instead of parsing into `any`) keeps the switch below
// honest: a new server message type fails typecheck until it is handled.
export type WsServerMessage =
  | { type: 'connection_established'; message: string }
  | { type: 'notification'; data: NotificationData }
  | { type: 'task_created'; data: NotificationData }
  | { type: 'task_updated'; data: NotificationData }
  | { type: 'task_deleted'; data: NotificationData }
  | { type: 'note_created'; data: NotificationData }
  | { type: 'event_created'; data: NotificationData };

interface UseWebSocketNotificationsProps {
  onNotification?: (data: NotificationData) => void;
  onTaskCreated?: (data: unknown) => void;
  onTaskUpdated?: (data: unknown) => void;
  onTaskDeleted?: (data: unknown) => void;
  onNoteCreated?: (data: unknown) => void;
  onEventCreated?: (data: unknown) => void;
  enabled?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

export const useWebSocketNotifications = ({
  onNotification,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onNoteCreated,
  onEventCreated,
  enabled = true,
}: UseWebSocketNotificationsProps = {}) => {
  const wsRef = useRef<WebSocket | null>(null);
  // Reactive connection flag. Reading wsRef.current.readyState in the return
  // value was never reactive (a ref mutation does not re-render), so consumers
  // could never observe connect/disconnect. State fixes that.
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  // Bumped on every connect/disconnect so a slow ticket fetch cannot open a
  // socket after a newer connect or a disconnect has superseded it.
  const connectGeneration = useRef(0);
  // Reconnection backs off exponentially and is capped at a maximum delay,
  // but never permanently gives up: a socket lost to a server restart or a
  // network blip must recover on its own. Attempts reset once a connection
  // succeeds, so the delay shrinks back to the base after a recovery.
  const BASE_RECONNECT_DELAY = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  // Keep the latest callbacks in a ref so connect() stays referentially
  // stable and the effect below does not tear down the socket on every render.
  const callbacksRef = useRef({
    onNotification, onTaskCreated, onTaskUpdated, onTaskDeleted, onNoteCreated, onEventCreated,
  });
  useEffect(() => {
    callbacksRef.current = {
      onNotification, onTaskCreated, onTaskUpdated, onTaskDeleted, onNoteCreated, onEventCreated,
    };
  });

  const connect = useCallback(async () => {
    if (!enabled) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const generation = ++connectGeneration.current;

    // The app stores the DRF auth token under 'auth_token'
    const token = localStorage.getItem('auth_token');

    if (!token) {
      console.log('[WebSocket] No auth token, skipping connection');
      return;
    }

    // Retry a failed ticket exchange through the same backoff used for dropped
    // sockets. Defined here (not as a useCallback) so it can self-schedule
    // `connect` without a dependency cycle. The delay grows exponentially and
    // is capped; there is no attempt limit, so the hook keeps retrying until
    // the connection recovers.
    const scheduleReconnect = () => {
      if (connectGeneration.current !== generation) return;
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current),
        MAX_RECONNECT_DELAY
      );
      reconnectAttempts.current += 1;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    try {
      // Exchange the long-lived API token for a short-lived ticket first:
      // the token must never appear in the WebSocket URL, because query
      // strings leak into server/proxy logs and browser history.
      let ticketResponse: Response;
      try {
        ticketResponse = await fetch(`${API_BASE_URL}/auth/ws_ticket/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${token}`,
          },
        });
      } catch (networkError) {
        // Network blip reaching the ticket endpoint: retry via backoff rather
        // than silently giving up until the next remount.
        console.warn('[WebSocket] Ticket request failed:', networkError);
        scheduleReconnect();
        return;
      }

      if (!ticketResponse.ok) {
        if (ticketResponse.status === 401) {
          // The token itself was rejected (expired/rotated/revoked): retrying
          // would loop forever. Sign out globally so the auth screen appears.
          console.warn('[WebSocket] Ticket request unauthorized; ending session');
          notifyUnauthorized();
          return;
        }
        console.warn('[WebSocket] Could not obtain a ticket:', ticketResponse.status);
        scheduleReconnect();
        return;
      }
      const { ticket } = await ticketResponse.json();

      // A disconnect or newer connect happened while the ticket was in flight.
      if (connectGeneration.current !== generation) return;

      // Derive the WS origin from the API base URL so the dev frontend
      // (port 5173) connects to the Django backend (port 8000).
      const httpOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
      const wsOrigin = httpOrigin.replace(/^http/, 'ws');
      const wsUrl = `${wsOrigin}/ws/notifications/?ticket=${encodeURIComponent(ticket)}`;

      console.log('[WebSocket] Connecting with short-lived ticket');

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttempts.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsServerMessage;
          const callbacks = callbacksRef.current;

          switch (message.type) {
            case 'connection_established':
              // The server's registration confirmation; treat it as the
              // authoritative "connected" signal in addition to onopen.
              console.log('[WebSocket]', message.message);
              setConnected(true);
              break;

            case 'notification':
            case 'task_created':
              if (callbacks.onNotification) callbacks.onNotification(message.data);
              if (message.type === 'task_created' && callbacks.onTaskCreated) {
                callbacks.onTaskCreated(message.data.object);
              }
              break;

            case 'task_updated':
              if (callbacks.onNotification) callbacks.onNotification(message.data);
              if (callbacks.onTaskUpdated) callbacks.onTaskUpdated(message.data.object);
              break;

            case 'task_deleted':
              if (callbacks.onNotification) callbacks.onNotification(message.data);
              if (callbacks.onTaskDeleted) callbacks.onTaskDeleted(message.data);
              break;

            case 'note_created':
              if (callbacks.onNotification) callbacks.onNotification(message.data);
              if (callbacks.onNoteCreated) callbacks.onNoteCreated(message.data.object);
              break;

            case 'event_created':
              if (callbacks.onNotification) callbacks.onNotification(message.data);
              if (callbacks.onEventCreated) callbacks.onEventCreated(message.data.object);
              break;

            default: {
              // Unreachable per the union, but JSON.parse can still yield
              // unknown shapes at runtime; loosen the type to log them safely.
              const unknownMessage = message as { type?: string; data?: NotificationData };
              console.log('[WebSocket] Unknown message type:', unknownMessage.type);
              if (callbacks.onNotification && unknownMessage.data) {
                callbacks.onNotification(unknownMessage.data);
              }
            }
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        if (wsRef.current !== ws) return; // Replaced by a newer connection
        wsRef.current = null;
        setConnected(false);

        // Reconnect unless this was an intentional client-initiated close.
        // Backoff is unbounded (capped delay), so a dropped socket always
        // recovers instead of giving up after a fixed number of attempts.
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setConnected(false);
    }
  }, [enabled]);

  const disconnect = useCallback(() => {
    // Bumping the generation invalidates any in-flight ticket fetch and any
    // pending backoff timer, so nothing reopens the socket after this point.
    connectGeneration.current += 1;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnected(false);

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client closing connection');
      wsRef.current = null;
      console.log('[WebSocket] Disconnected');
    }
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (enabled) {
      reconnectAttempts.current = 0;
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Recovery: when the browser regains connectivity, abandon any pending
  // backoff delay and reconnect immediately instead of waiting it out.
  useEffect(() => {
    const handleOnline = () => {
      reconnect();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [reconnect]);

  return {
    connected,
    reconnect,
  };
};
