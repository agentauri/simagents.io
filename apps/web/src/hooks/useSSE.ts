import { useCallback, useRef, useState } from 'react';
import { useWorldStore, type WorldEvent } from '../stores/world';
import { playSound } from './useAudio';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type ConnectionMode = 'sse' | 'polling';

// =============================================================================
// Constants
// =============================================================================

/** Polling interval in milliseconds */
const POLLING_INTERVAL = 2000;

/** SSE failure threshold - if SSE fails this quickly, switch to polling */
const SSE_FAILURE_THRESHOLD = 5000;

// =============================================================================
// Helpers
// =============================================================================

/** Detect Safari iOS which has SSE issues */
function isSafariIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari;
}

// Map event types to bubble content (using LLM reasoning when available)
function getBubbleContent(event: WorldEvent): { emoji: string; text: string } | null {
  const reasoning = event.payload?.reasoning as string | undefined;

  switch (event.type) {
    // Tick-engine decision events (present tense - have reasoning)
    case 'agent_move':
      return { emoji: '🚶', text: reasoning || 'Moving...' };
    case 'agent_work':
      return { emoji: '🏭', text: reasoning || 'Working...' };
    case 'agent_sleep':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_buy':
      return { emoji: '🛒', text: reasoning || 'Buying...' };
    case 'agent_consume':
      return { emoji: '🍔', text: reasoning || 'Eating...' };
    // Action handler events (past tense)
    case 'agent_moved':
      return { emoji: '🚶', text: reasoning || 'Moved!' };
    case 'agent_worked':
      return { emoji: '🏭', text: reasoning || 'Worked!' };
    case 'agent_sleeping':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_woke':
      return { emoji: '☀️', text: reasoning || 'Awake!' };
    case 'agent_bought':
      return { emoji: '🛒', text: reasoning || 'Bought!' };
    case 'agent_consumed':
      return { emoji: '🍔', text: reasoning || 'Ate!' };
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

// =============================================================================
// Hook
// =============================================================================

export function useSSE() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [mode, setMode] = useState<ConnectionMode>('sse');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const processedEventIds = useRef<Set<string>>(new Set());
  const lastProcessedTick = useRef<number>(-1);
  const sseConnectTimeRef = useRef<number>(0);

  const { updateWorldState, setTick, updateAgent, addEvent, addBubble } = useWorldStore();

  // Process a single event
  const processEvent = useCallback(
    (data: WorldEvent) => {
      // Skip if we've already processed this event (use Set for proper deduplication)
      if (data.id) {
        if (processedEventIds.current.has(data.id)) {
          return;
        }
        processedEventIds.current.add(data.id);
        // Keep set size bounded (remove old entries)
        if (processedEventIds.current.size > 200) {
          const idsArray = Array.from(processedEventIds.current);
          processedEventIds.current = new Set(idsArray.slice(-100));
        }
      }

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
        case 'ping':
          break;

        case 'tick_start':
          setTick(data.tick);
          playSound('tick');
          break;

        case 'tick_end':
          setTick(data.tick);
          break;

        case 'agent_move':
          if (data.agentId && data.payload.params) {
            const params = data.payload.params as { toX: number; toY: number };
            updateAgent(data.agentId, { x: params.toX, y: params.toY, state: 'walking' });
          }
          break;

        case 'agent_moved':
          if (data.agentId && data.payload.to) {
            const to = data.payload.to as { x: number; y: number };
            updateAgent(data.agentId, { x: to.x, y: to.y, state: 'idle' });
          }
          break;

        case 'agent_work':
          if (data.agentId) {
            updateAgent(data.agentId, { state: 'working' });
          }
          break;

        case 'agent_worked':
          if (data.agentId) {
            updateAgent(data.agentId, { state: 'working' });
            playSound('work');
          }
          break;

        case 'agent_sleep':
          if (data.agentId) {
            updateAgent(data.agentId, { state: 'sleeping' });
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
            const delta = (data.payload.newBalance as number) - (data.payload.oldBalance as number || 0);
            if (delta < 0) {
              playSound('buy');
            } else if (delta > 0) {
              playSound('trade');
            }
          }
          break;

        case 'agent_died':
          if (data.agentId) {
            updateAgent(data.agentId, { health: 0, state: 'dead' });
            playSound('death');
          }
          break;

        case 'agent_traded':
          playSound('trade');
          break;

        case 'agent_harmed':
          playSound('harm');
          break;

        case 'agent_gathered':
          playSound('gather');
          break;

        default:
          // Silently ignore unknown events
          break;
      }
    },
    [addEvent, addBubble, setTick, updateAgent]
  );

  // Handle SSE message event
  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WorldEvent;
        processEvent(data);
      } catch (error) {
        console.error('[SSE] Failed to parse event:', error);
      }
    },
    [processEvent]
  );

  // Polling mode: fetch world state and recent events
  const poll = useCallback(async () => {
    try {
      // Fetch world state
      const stateResponse = await fetch('/api/world/state');
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        updateWorldState(stateData);
      }

      // Fetch recent events
      const eventsResponse = await fetch('/api/events/recent?limit=20');
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        const events = eventsData.events as WorldEvent[];
        // Process events in chronological order (oldest first)
        for (const event of events.reverse()) {
          processEvent(event);
        }
      }
    } catch (error) {
      console.error('[Polling] Failed to fetch:', error);
    }
  }, [processEvent, updateWorldState]);

  // Start polling mode
  const startPolling = useCallback(() => {
    console.log('[SSE] Switching to polling mode');
    setMode('polling');
    setStatus('connected');

    // Initial poll
    poll();

    // Set up interval
    pollingIntervalRef.current = window.setInterval(poll, POLLING_INTERVAL);
  }, [poll]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Connect with SSE, fallback to polling
  const connect = useCallback(async () => {
    // Close existing connections
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    stopPolling();

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('connecting');

    // Fetch initial world state
    try {
      const response = await fetch('/api/world/state');
      const data = await response.json();
      updateWorldState(data);
    } catch (error) {
      console.error('[SSE] Failed to fetch initial state:', error);
    }

    // Use polling directly for Safari iOS
    if (isSafariIOS()) {
      console.log('[SSE] Safari iOS detected, using polling mode');
      startPolling();
      return;
    }

    // Try SSE first
    setMode('sse');
    sseConnectTimeRef.current = Date.now();

    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus('connected');
      console.log('[SSE] Connection established');
    };

    eventSource.onmessage = handleEvent;

    // Handle named events
    const eventTypes = [
      'connected', 'tick_start', 'tick_end',
      'agent_moved', 'agent_worked', 'agent_sleeping', 'agent_woke',
      'agent_died', 'agent_bought', 'agent_consumed',
      'agent_move', 'agent_work', 'agent_sleep', 'agent_buy', 'agent_consume',
      'needs_updated', 'balance_changed',
      'agent_traded', 'agent_harmed', 'agent_gathered',
    ];

    for (const type of eventTypes) {
      eventSource.addEventListener(type, handleEvent);
    }

    eventSource.addEventListener('ping', () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      eventSource.close();

      const timeSinceConnect = Date.now() - sseConnectTimeRef.current;

      // If SSE failed quickly, switch to polling
      if (timeSinceConnect < SSE_FAILURE_THRESHOLD) {
        console.log('[SSE] Connection failed quickly, switching to polling');
        startPolling();
        return;
      }

      // Otherwise try to reconnect SSE
      setStatus('disconnected');
      console.log('[SSE] Connection lost, reconnecting in 3s...');

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [handleEvent, updateWorldState, startPolling, stopPolling]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    stopPolling();

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('disconnected');
  }, [stopPolling]);

  return { status, mode, connect, disconnect };
}
