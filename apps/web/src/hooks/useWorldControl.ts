/**
 * Hook for controlling the simulation via backend API
 * Scientific model: uses resourceSpawns and shelters instead of typed locations
 */

import { getEngineClient } from '../engine-host/engine-client';
import { engineStateToWorldState } from './useEngine';
import { clearSavedWorld, loadSavedWorld } from '../services/persistence';
import { useAgentStatsStore } from '../stores/agentStats';
import { useApiKeysStore } from '../stores/apiKeys';
import { useConfigStore } from '../stores/config';
import { useRosterStore } from '../stores/roster';
import { useSettingsStore } from '../stores/settings';
import type { WorldEvent } from '../stores/world';
import { isLocalEngineMode } from '../utils/env';

const API_BASE = import.meta.env.VITE_API_URL || '';

function hasValues(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

function localRuntimeOverrides(pendingChanges: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (hasValues(pendingChanges.agent)) overrides.agent = pendingChanges.agent;
  if (hasValues(pendingChanges.needs)) overrides.needs = pendingChanges.needs;
  return overrides;
}

export interface AgentState {
  id: string;
  name?: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  color: string;
}

export interface ResourceSpawnState {
  id: string;
  x: number;
  y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
}

export interface ShelterState {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldState {
  tick: number;
  isPaused: boolean;
  isRunning: boolean;
  agentCount: number;
  resourceSpawnCount: number;
  shelterCount: number;
  agents: AgentState[];
  resourceSpawns: ResourceSpawnState[];
  shelters: ShelterState[];
}

export interface StartResult {
  success: boolean;
  error?: string;
  tick?: number;
  agents?: AgentState[];
  resourceSpawns?: ResourceSpawnState[];
  shelters?: ShelterState[];
  events?: WorldEvent[];
}

export interface StartOptions {
  resumeSavedWorld?: boolean;
}

export function useWorldControl() {
  /**
   * Fetch current world state from backend
   */
  const fetchState = async (): Promise<WorldState | null> => {
    if (isLocalEngineMode()) {
      try {
        const state = await getEngineClient().getState();
        const mapped = engineStateToWorldState(state);
        return {
          tick: mapped.tick,
          isPaused: getEngineClient().isPaused(),
          isRunning: getEngineClient().isRunning(),
          agentCount: mapped.agents.length,
          resourceSpawnCount: mapped.resourceSpawns.length,
          shelterCount: mapped.shelters.length,
          agents: mapped.agents,
          resourceSpawns: mapped.resourceSpawns,
          shelters: mapped.shelters,
        };
      } catch {
        return null;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/world/state`);
      if (!res.ok) return null;
      return res.json();
    } catch (error) {
      console.error('[useWorldControl] Failed to fetch state:', error);
      return null;
    }
  };

  /**
   * Start simulation (scientific model - no frontend locations needed)
   * Returns full world state with spawned agents, resource spawns, and shelters
   */
  const start = async (options: StartOptions = {}): Promise<StartResult> => {
    if (isLocalEngineMode()) {
      try {
        useAgentStatsStore.getState().resetAgentStats();
        const roster = useRosterStore.getState().roster;
        const keys = useApiKeysStore.getState().getActiveKeys();
        const proxyUrl = useSettingsStore.getState().proxyUrl.trim();
        const pendingChanges = useConfigStore.getState().pendingChanges as Record<string, unknown>;
        const configOverrides = localRuntimeOverrides(pendingChanges);
        const client = getEngineClient();
        const saved = options.resumeSavedWorld ? loadSavedWorld() : undefined;
        if (!saved) {
          clearSavedWorld();
        }
        const state = await client.init({
          roster,
          keys,
          proxyUrl: proxyUrl || undefined,
          speed: saved?.snapshot.speed ?? 10,
          worldSeed: saved?.snapshot.worldSeed ?? `browser-${Date.now()}`,
          configOverrides,
          resume: saved?.snapshot,
        });
        await client.start();
        const mapped = engineStateToWorldState(state);
        return {
          success: true,
          tick: mapped.tick,
          agents: mapped.agents,
          resourceSpawns: mapped.resourceSpawns,
          shelters: mapped.shelters,
          events: saved?.events,
        };
      } catch (error) {
        console.error('[useWorldControl] Failed to start local engine:', error);
        return { success: false, error: String(error) };
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/world/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        return { success: false, error: 'Failed to start simulation' };
      }
      return res.json();
    } catch (error) {
      console.error('[useWorldControl] Failed to start:', error);
      return { success: false, error: String(error) };
    }
  };

  /**
   * Pause simulation
   */
  const pause = async (): Promise<boolean> => {
    if (isLocalEngineMode()) {
      await getEngineClient().pause();
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/api/world/pause`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to pause:', error);
      return false;
    }
  };

  /**
   * Resume simulation
   */
  const resume = async (): Promise<boolean> => {
    if (isLocalEngineMode()) {
      await getEngineClient().resume();
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/api/world/resume`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to resume:', error);
      return false;
    }
  };

  /**
   * Reset simulation (full database wipe)
   */
  const reset = async (): Promise<boolean> => {
    if (isLocalEngineMode()) {
      getEngineClient().resetHard();
      useAgentStatsStore.getState().resetAgentStats();
      clearSavedWorld();
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/api/world/reset`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to reset:', error);
      return false;
    }
  };

  /**
   * Fetch recent events (for loading history on page refresh)
   */
  const fetchRecentEvents = async (limit = 50): Promise<Array<{
    id: string;
    type: string;
    tick: number;
    timestamp: number;
    agentId?: string;
    payload: Record<string, unknown>;
  }>> => {
    if (isLocalEngineMode()) {
      return [];
    }

    try {
      const res = await fetch(`${API_BASE}/api/events/recent?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    } catch (error) {
      console.error('[useWorldControl] Failed to fetch recent events:', error);
      return [];
    }
  };

  const setSpeed = async (speed: number): Promise<boolean> => {
    if (isLocalEngineMode()) {
      await getEngineClient().setSpeed(speed);
      return true;
    }
    return false;
  };

  return { fetchState, start, pause, resume, reset, fetchRecentEvents, setSpeed };
}
