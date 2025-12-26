import { useCallback, useRef, useState } from 'react';
import { useWorldStore, type WorldEvent, type AgentBubble } from '../stores/world';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Map event types to bubble content
function getBubbleContent(event: WorldEvent): { emoji: string; text: string } | null {
  switch (event.type) {
    case 'agent_moved':
      return { emoji: '🚶', text: 'Moving...' };
    case 'agent_worked':
      return { emoji: '🏭', text: 'Working...' };
    case 'agent_sleeping':
      return { emoji: '💤', text: 'Sleeping...' };
    case 'agent_woke':
      return { emoji: '☀️', text: 'Awake!' };
    case 'balance_changed': {
      const delta = (event.payload.newBalance as number) - (event.payload.oldBalance as number || 0);
      if (delta > 0) return { emoji: '💰', text: `+${delta} CITY` };
      if (delta < 0) return { emoji: '💸', text: `${delta} CITY` };
      return null;
    }
    case 'agent_died':
      return { emoji: '💀', text: 'Died!' };
    default:
      return null;
  }
}

export function useSSE() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const { setWorldState, setTick, updateAgent, addEvent, addBubble } = useWorldStore();

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WorldEvent;

        // Add to event feed
        addEvent(data);

        // Create bubble for agent if applicable
        if (data.agentId) {
          const bubbleContent = getBubbleContent(data);
          if (bubbleContent) {
            addBubble({
              agentId: data.agentId,
              text: bubbleContent.text,
              emoji: bubbleContent.emoji,
              timestamp: Date.now(),
            });
          }
        }

        // Handle specific event types
        switch (data.type) {
          case 'connected':
            console.log('[SSE] Connected at tick', data.tick);
            break;

          case 'tick_start':
            setTick(data.tick);
            break;

          case 'tick_end':
            setTick(data.tick);
            break;

          case 'agent_moved':
            if (data.agentId && data.payload.to) {
              const to = data.payload.to as { x: number; y: number };
              updateAgent(data.agentId, { x: to.x, y: to.y, state: 'idle' });
            }
            break;

          case 'agent_worked':
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'working' });
            }
            break;

          case 'agent_sleeping':
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'sleeping' });
            }
            break;

          case 'agent_woke':
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'idle' });
            }
            break;

          case 'needs_updated':
            if (data.agentId && data.payload) {
              const { hunger, energy, health } = data.payload as {
                hunger?: number;
                energy?: number;
                health?: number;
              };
              updateAgent(data.agentId, {
                ...(hunger !== undefined && { hunger }),
                ...(energy !== undefined && { energy }),
                ...(health !== undefined && { health }),
              });
            }
            break;

          case 'balance_changed':
            if (data.agentId && data.payload.newBalance !== undefined) {
              updateAgent(data.agentId, {
                balance: data.payload.newBalance as number,
              });
            }
            break;

          case 'agent_died':
            if (data.agentId) {
              updateAgent(data.agentId, { health: 0, state: 'dead' });
            }
            break;

          default:
            console.log('[SSE] Unhandled event type:', data.type);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse event:', error);
      }
    },
    [addEvent, addBubble, setTick, updateAgent]
  );

  const connect = useCallback(async () => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('connecting');

    // Fetch initial world state
    try {
      const response = await fetch('/api/world/state');
      const data = await response.json();
      setWorldState(data);
    } catch (error) {
      console.error('[SSE] Failed to fetch initial state:', error);
    }

    // Connect to SSE
    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus('connected');
      console.log('[SSE] Connection established');
    };

    eventSource.onmessage = handleEvent;

    // Handle named events
    eventSource.addEventListener('connected', handleEvent);
    eventSource.addEventListener('tick_start', handleEvent);
    eventSource.addEventListener('tick_end', handleEvent);
    eventSource.addEventListener('agent_moved', handleEvent);
    eventSource.addEventListener('agent_worked', handleEvent);
    eventSource.addEventListener('agent_sleeping', handleEvent);
    eventSource.addEventListener('agent_woke', handleEvent);
    eventSource.addEventListener('agent_died', handleEvent);
    eventSource.addEventListener('needs_updated', handleEvent);
    eventSource.addEventListener('balance_changed', handleEvent);
    eventSource.addEventListener('ping', () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      setStatus('disconnected');
      console.log('[SSE] Connection lost, reconnecting in 3s...');
      eventSource.close();

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [handleEvent, setWorldState]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  return { status, connect, disconnect };
}
