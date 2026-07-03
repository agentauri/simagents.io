import { useCallback, useRef, useState } from 'react';
import { useWorldStore, type WorldEvent } from '../stores/world';
import { useAgentStatsStore } from '../stores/agentStats';
import { processWorldEvent } from '../services/process-event';
import { playSound } from './useAudio';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type ConnectionMode = 'sse' | 'polling';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
  const recordDecisionEvent = useAgentStatsStore((s) => s.recordDecisionEvent);

  // Process a single event
  const processEvent = useCallback(
    (data: WorldEvent) => {
      processWorldEvent(data, {
        processedEventIds: processedEventIds.current,
        addEvent,
        addBubble,
        setTick,
        updateAgent,
        recordDecisionEvent,
        playSound,
      });
    },
    [addEvent, addBubble, setTick, updateAgent, recordDecisionEvent]
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
      const stateResponse = await fetch(`${API_BASE}/api/world/state`);
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        updateWorldState(stateData);
      }

      // Fetch recent events
      const eventsResponse = await fetch(`${API_BASE}/api/events/recent?limit=20`);
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
      const response = await fetch(`${API_BASE}/api/world/state`);
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

    const eventSource = new EventSource(`${API_BASE}/api/events`);
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
