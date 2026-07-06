import { getEngineClient } from '../engine-host/engine-client';
import { engineStateToWorldState } from './useEngine';
import { clearSavedWorld, loadSavedWorld } from '../services/persistence';
import { clearReplayFrames } from '../services/replayFrames';
import { clearPromptLogs } from '../services/promptLogs';
import { useAgentStatsStore } from '../stores/agentStats';
import { useApiKeysStore } from '../stores/apiKeys';
import { useConfigStore } from '../stores/config';
import { usePromptStore } from '../stores/promptStore';
import { useRosterStore } from '../stores/roster';
import { useSettingsStore } from '../stores/settings';
import type { WorldEvent } from '../stores/world';

function hasValues(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

function localRuntimeOverrides(pendingChanges: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (hasValues(pendingChanges.agent)) overrides.agent = pendingChanges.agent;
  if (hasValues(pendingChanges.needs)) overrides.needs = pendingChanges.needs;
  if (hasValues(pendingChanges.experiment)) overrides.experiment = pendingChanges.experiment;
  if (hasValues(pendingChanges.actions)) overrides.actions = pendingChanges.actions;
  if (hasValues(pendingChanges.economy)) overrides.economy = pendingChanges.economy;
  if (hasValues(pendingChanges.cooperation)) overrides.cooperation = pendingChanges.cooperation;
  if (hasValues(pendingChanges.spoilage)) overrides.spoilage = pendingChanges.spoilage;
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
  const fetchState = async (): Promise<WorldState | null> => {
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
  };

  const start = async (options: StartOptions = {}): Promise<StartResult> => {
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
        clearReplayFrames();
        clearPromptLogs();
      }

      const state = await client.init({
        roster,
        keys,
        proxyUrl: proxyUrl || undefined,
        speed: saved?.snapshot.speed ?? 10,
        worldSeed: saved?.snapshot.worldSeed ?? `browser-${Date.now()}`,
        configOverrides,
        customPrompt: usePromptStore.getState().customPrompt,
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
  };

  const pause = async (): Promise<boolean> => {
    await getEngineClient().pause();
    return true;
  };

  const resume = async (): Promise<boolean> => {
    await getEngineClient().resume();
    return true;
  };

  const reset = async (): Promise<boolean> => {
    getEngineClient().resetHard();
    useAgentStatsStore.getState().resetAgentStats();
    clearSavedWorld();
    clearReplayFrames();
    clearPromptLogs();
    return true;
  };

  const fetchRecentEvents = async (_limit = 50): Promise<WorldEvent[]> => [];

  const setSpeed = async (speed: number): Promise<boolean> => {
    await getEngineClient().setSpeed(speed);
    return true;
  };

  return { fetchState, start, pause, resume, reset, fetchRecentEvents, setSpeed };
}
