import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimEngineState } from '@server/engine/engine';
import { getEngineClient } from '../engine-host/engine-client';
import { processWorldEvent } from '../services/process-event';
import { useAgentStatsStore } from '../stores/agentStats';
import { useWorldStore, type Agent, type ResourceSpawn, type Shelter } from '../stores/world';
import { playSound } from './useAudio';
import type { ConnectionStatus } from './useSSE';

function mapEngineState(state: SimEngineState): {
  tick: number;
  agents: Agent[];
  resourceSpawns: ResourceSpawn[];
  shelters: Shelter[];
} {
  return {
    tick: state.tick,
    agents: state.agents.map((agent) => ({
      id: agent.id,
      name: (agent as Agent).name,
      llmType: agent.llmType,
      x: agent.x,
      y: agent.y,
      hunger: agent.hunger,
      energy: agent.energy,
      health: agent.health,
      balance: agent.balance,
      state: agent.state,
      color: agent.color,
      personality: agent.personality,
    })),
    resourceSpawns: state.resources.map((spawn) => ({
      id: spawn.id,
      x: spawn.x,
      y: spawn.y,
      resourceType: spawn.resourceType as ResourceSpawn['resourceType'],
      currentAmount: spawn.currentAmount,
      maxAmount: spawn.maxAmount,
      biome: spawn.biome as ResourceSpawn['biome'],
    })),
    shelters: state.shelters.map((shelter) => ({
      id: shelter.id,
      x: shelter.x,
      y: shelter.y,
      canSleep: shelter.canSleep,
    })),
  };
}

export function engineStateToWorldState(state: SimEngineState): ReturnType<typeof mapEngineState> {
  return mapEngineState(state);
}

export function useEngine() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const processedEventIds = useRef<Set<string>>(new Set());
  const { updateWorldState, setTick, updateAgent, addEvent, addBubble } = useWorldStore();
  const recordDecisionEvent = useAgentStatsStore((s) => s.recordDecisionEvent);

  useEffect(() => {
    const client = getEngineClient();
    const unsubscribeStatus = client.onStatus((nextStatus) => setStatus(nextStatus));
    const unsubscribeEvent = client.onEvent((event) => {
      processWorldEvent(event, {
        processedEventIds: processedEventIds.current,
        addEvent,
        addBubble,
        setTick,
        updateAgent,
        recordDecisionEvent,
        playSound,
      });
    });
    const unsubscribeState = client.onState((state) => {
      updateWorldState(mapEngineState(state));
    });

    return () => {
      unsubscribeStatus();
      unsubscribeEvent();
      unsubscribeState();
    };
  }, [addEvent, addBubble, setTick, updateAgent, updateWorldState, recordDecisionEvent]);

  const connect = useCallback(() => {
    setStatus(getEngineClient().getStatus());
  }, []);

  const disconnect = useCallback(() => {
    setStatus(getEngineClient().getStatus());
  }, []);

  return { status, mode: 'worker' as const, connect, disconnect };
}
