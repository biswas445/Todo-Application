/**
 * Hook for WebSocket real-time notifications
 * Connects to Django Channels WebSocket for instant updates
 */

import { useEffect, useRef, useCallback } from 'react';

interface NotificationData {
  type: string;
  message: string;
  object?: unknown;
}

interface UseWebSocketNotificationsProps {
  onNotification?: (data: NotificationData) => void;
  onTaskCreated?: (data: unknown) => void;
  onTaskUpdated?: (data: unknown) => void;
  onTaskDeleted?: (data: unknown) => void;
  onNoteCreated?: (data: unknown) => void;
  onEventCreated?: (data: unknown) => void;
  enabled?: boolean;
}

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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds

  const connect = useCallback(() => {
    if (!enabled) return;

    // Get token from localStorage
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('[WebSocket] No auth token, skipping connection');
      return;
    }

    try {
      // Construct WebSocket URL based on current host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || '127.0.0.1:8000';
      const wsUrl = `${protocol}//${host}/ws/notifications/?token=${token}`;

      console.log('[WebSocket] Connecting to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message);

          switch (message.type) {
            case 'connection_established':
              console.log('[WebSocket]', message.message);
              break;
            
            case 'notification':
            case 'task_created':
              if (onNotification) onNotification(message.data);
              if (message.type === 'task_created' && onTaskCreated) {
                onTaskCreated(message.data.object);
              }
              break;
            
            case 'task_updated':
              if (onNotification) onNotification(message.data);
              if (onTaskUpdated) onTaskUpdated(message.data.object);
              break;
            
            case 'task_deleted':
              if (onNotification) onNotification(message.data);
              if (onTaskDeleted) onTaskDeleted(message.data);
              break;
            
            case 'note_created':
              if (onNotification) onNotification(message.data);
              if (onNoteCreated) onNoteCreated(message.data.object);
              break;
            
            case 'event_created':
              if (onNotification) onNotification(message.data);
              if (onEventCreated) onEventCreated(message.data.object);
              break;
            
            default:
              console.log('[WebSocket] Unknown message type:', message.type);
              if (onNotification) onNotification(message.data);
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
        
        // Attempt to reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current += 1;
          console.log(`[WebSocket] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[WebSocket] Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
    }
  }, [enabled, onNotification, onTaskCreated, onTaskUpdated, onTaskDeleted, onNoteCreated, onEventCreated]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client closing connection');
      wsRef.current = null;
      console.log('[WebSocket] Disconnected');
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    connected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: disconnect,
  };
};
