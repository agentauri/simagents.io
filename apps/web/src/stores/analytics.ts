/**
 * Analytics store for experimental metrics dashboard
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { isLocalEngineMode } from '../utils/env';
import { useWorldStore, type Agent, type WorldEvent } from './world';

// =============================================================================
// Types (matching backend)
// =============================================================================

export interface SurvivalMetrics {
  byLlmType: {
    llmType: string;
    aliveCount: number;
    deadCount: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    avgBalance: number;
  }[];
  overall: {
    totalAlive: number;
    totalDead: number;
    totalAgents: number;
  };
  deathCauses: {
    starvation: number;
    exhaustion: number;
  };
}

export interface EconomyMetrics {
  moneySupply: number;
  giniCoefficient: number;
  balanceDistribution: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  byLlmType: {
    llmType: string;
    totalBalance: number;
    avgBalance: number;
  }[];
}

export interface BehaviorMetrics {
  actionFrequency: {
    actionType: string;
    count: number;
    percentage: number;
  }[];
  byLlmType: {
    llmType: string;
    actions: Record<string, number>;
    fallbackRate: number;
    avgProcessingTime: number;
  }[];
}

export interface TemporalMetrics {
  tickDurations: {
    tick: number;
    duration: number;
    agentCount: number;
    actionsExecuted: number;
  }[];
  eventsByTick: {
    tick: number;
    eventCount: number;
  }[];
  currentTick: number;
}

export interface AnalyticsSnapshot {
  survival: SurvivalMetrics;
  economy: EconomyMetrics;
  behavior: BehaviorMetrics;
  temporal: TemporalMetrics;
  timestamp: number;
}

// =============================================================================
// Store
// =============================================================================

type TabType = 'survival' | 'economy' | 'behavior' | 'temporal';

interface AnalyticsState {
  // Data
  survival: SurvivalMetrics | null;
  economy: EconomyMetrics | null;
  behavior: BehaviorMetrics | null;
  temporal: TemporalMetrics | null;

  // UI State
  isLoading: boolean;
  lastUpdated: number | null;
  activeTab: TabType;
  isVisible: boolean;

  // Actions
  fetchSnapshot: () => Promise<void>;
  fetchSurvival: () => Promise<void>;
  fetchEconomy: () => Promise<void>;
  fetchBehavior: () => Promise<void>;
  fetchTemporal: () => Promise<void>;
  setActiveTab: (tab: TabType) => void;
  toggleVisibility: () => void;
  setVisible: (visible: boolean) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

type AnalyticsDataState = Pick<
  AnalyticsState,
  'survival' | 'economy' | 'behavior' | 'temporal' | 'lastUpdated'
>;

interface LocalActionEvent {
  event: WorldEvent;
  actionType: string;
}

const EVENT_ACTION_TYPES: Record<string, string> = {
  agent_moved: 'move',
  agent_worked: 'work',
  agent_sleeping: 'sleep',
  agent_rested: 'sleep',
  agent_bought: 'buy',
  agent_consumed: 'consume',
};

const ACTION_ALIASES: Record<string, string> = {
  agent_move: 'move',
  agent_work: 'work',
  agent_sleep: 'sleep',
  agent_rest: 'sleep',
  agent_buy: 'buy',
  agent_consume: 'consume',
};

function snapshotToState(data: AnalyticsSnapshot): AnalyticsDataState {
  return {
    survival: data.survival,
    economy: data.economy,
    behavior: data.behavior,
    temporal: data.temporal,
    lastUpdated: data.timestamp,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function calculateGini(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (sorted.length === 0 || total <= 0) return 0;

  const weightedDiff = sorted.reduce(
    (sum, value, index) => sum + (2 * (index + 1) - sorted.length - 1) * value,
    0
  );
  return clampRatio(weightedDiff / (sorted.length * total));
}

function isAgentAlive(agent: Agent): boolean {
  return agent.state !== 'dead';
}

function groupAgentsByLlm(agents: Agent[]): [string, Agent[]][] {
  const groups = new Map<string, Agent[]>();
  for (const agent of agents) {
    const llmType = agent.llmType || 'unknown';
    const existing = groups.get(llmType) ?? [];
    existing.push(agent);
    groups.set(llmType, existing);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function classifyDeathCause(event: WorldEvent): 'starvation' | 'exhaustion' | null {
  const cause = event.payload.cause ?? event.payload.reason ?? event.payload.deathCause;
  if (typeof cause !== 'string') return null;
  const normalized = cause.toLowerCase();
  if (normalized.includes('starv') || normalized.includes('hunger')) return 'starvation';
  if (normalized.includes('exhaust') || normalized.includes('energy')) return 'exhaustion';
  return null;
}

function buildDeathCauses(agents: Agent[], events: WorldEvent[]): SurvivalMetrics['deathCauses'] {
  let starvation = 0;
  let exhaustion = 0;

  for (const event of events) {
    if (event.type !== 'agent_died') continue;
    const cause = classifyDeathCause(event);
    if (cause === 'starvation') starvation += 1;
    if (cause === 'exhaustion') exhaustion += 1;
  }

  if (starvation > 0 || exhaustion > 0) {
    return { starvation, exhaustion };
  }

  for (const agent of agents) {
    if (isAgentAlive(agent)) continue;
    if (agent.hunger <= 0) starvation += 1;
    else if (agent.energy <= 0) exhaustion += 1;
  }

  return { starvation, exhaustion };
}

function buildSurvivalMetrics(agents: Agent[], events: WorldEvent[]): SurvivalMetrics {
  const byLlmType = groupAgentsByLlm(agents).map(([llmType, llmAgents]) => {
    const aliveAgents = llmAgents.filter(isAgentAlive);
    const aliveCount = aliveAgents.length;
    return {
      llmType,
      aliveCount,
      deadCount: llmAgents.length - aliveCount,
      avgHealth: average(aliveAgents.map((agent) => agent.health)),
      avgHunger: average(aliveAgents.map((agent) => agent.hunger)),
      avgEnergy: average(aliveAgents.map((agent) => agent.energy)),
      avgBalance: average(aliveAgents.map((agent) => agent.balance)),
    };
  });

  const totalAlive = agents.filter(isAgentAlive).length;
  return {
    byLlmType,
    overall: {
      totalAlive,
      totalDead: agents.length - totalAlive,
      totalAgents: agents.length,
    },
    deathCauses: buildDeathCauses(agents, events),
  };
}

function buildEconomyMetrics(agents: Agent[]): EconomyMetrics {
  const aliveAgents = agents.filter(isAgentAlive);
  const balances = aliveAgents.map((agent) => agent.balance);
  const positiveBalances = balances.filter((balance) => balance > 0);
  const moneySupply = balances.reduce((sum, balance) => sum + balance, 0);

  return {
    moneySupply,
    giniCoefficient: calculateGini(positiveBalances),
    balanceDistribution: {
      min: balances.length > 0 ? Math.min(...balances) : 0,
      max: balances.length > 0 ? Math.max(...balances) : 0,
      median: median(balances),
      mean: average(balances),
    },
    byLlmType: groupAgentsByLlm(aliveAgents).map(([llmType, llmAgents]) => {
      const totalBalance = llmAgents.reduce((sum, agent) => sum + agent.balance, 0);
      return {
        llmType,
        totalBalance,
        avgBalance: average(llmAgents.map((agent) => agent.balance)),
      };
    }),
  };
}

function normalizeActionType(action: string): string {
  const normalized = action.trim().toLowerCase();
  return ACTION_ALIASES[normalized] ?? normalized.replace(/^agent_/, '');
}

function getActionType(event: WorldEvent): string | null {
  const payloadAction = event.payload.action;
  if (typeof payloadAction === 'string' && payloadAction.trim()) {
    return normalizeActionType(payloadAction);
  }
  return EVENT_ACTION_TYPES[event.type] ?? null;
}

function collectActionEvents(events: WorldEvent[]): LocalActionEvent[] {
  return events.reduce<LocalActionEvent[]>((actions, event) => {
    const actionType = getActionType(event);
    if (actionType) actions.push({ event, actionType });
    return actions;
  }, []);
}

function getEventLlmType(event: WorldEvent, agentsById: Map<string, Agent>): string {
  if (event.agentId) {
    const agent = agentsById.get(event.agentId);
    if (agent?.llmType) return agent.llmType;
  }
  const payloadLlmType = event.payload.llmType;
  return typeof payloadLlmType === 'string' && payloadLlmType ? payloadLlmType : 'unknown';
}

function numericPayloadValue(event: WorldEvent, key: string): number | null {
  const value = event.payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildBehaviorMetrics(agents: Agent[], events: WorldEvent[]): BehaviorMetrics {
  const actionEvents = collectActionEvents(events);
  const totalActions = actionEvents.length;
  const actionCounts = new Map<string, number>();
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const llmBuckets = new Map<
    string,
    {
      actions: Record<string, number>;
      totalActions: number;
      fallbackCount: number;
      processingTotal: number;
      processingSamples: number;
    }
  >();

  for (const { event, actionType } of actionEvents) {
    actionCounts.set(actionType, (actionCounts.get(actionType) ?? 0) + 1);

    const llmType = getEventLlmType(event, agentsById);
    const bucket = llmBuckets.get(llmType) ?? {
      actions: {},
      totalActions: 0,
      fallbackCount: 0,
      processingTotal: 0,
      processingSamples: 0,
    };
    bucket.actions[actionType] = (bucket.actions[actionType] ?? 0) + 1;
    bucket.totalActions += 1;
    if (event.payload.usedFallback === true) bucket.fallbackCount += 1;

    const processingTime = numericPayloadValue(event, 'processingTimeMs');
    if (processingTime !== null) {
      bucket.processingTotal += processingTime;
      bucket.processingSamples += 1;
    }
    llmBuckets.set(llmType, bucket);
  }

  return {
    actionFrequency: [...actionCounts.entries()]
      .map(([actionType, count]) => ({
        actionType,
        count,
        percentage: totalActions === 0 ? 0 : (count / totalActions) * 100,
      }))
      .sort((a, b) => b.count - a.count),
    byLlmType: [...llmBuckets.entries()]
      .map(([llmType, bucket]) => ({
        llmType,
        actions: bucket.actions,
        fallbackRate: bucket.totalActions === 0 ? 0 : bucket.fallbackCount / bucket.totalActions,
        avgProcessingTime:
          bucket.processingSamples === 0 ? 0 : bucket.processingTotal / bucket.processingSamples,
      }))
      .sort((a, b) => a.llmType.localeCompare(b.llmType)),
  };
}

function buildTemporalMetrics(agents: Agent[], events: WorldEvent[], currentTick: number): TemporalMetrics {
  const actionEvents = collectActionEvents(events);
  const eventsByTickMap = new Map<number, number>();
  const actionsByTickMap = new Map<number, number>();
  const processingByTickMap = new Map<number, number[]>();

  for (const event of events) {
    eventsByTickMap.set(event.tick, (eventsByTickMap.get(event.tick) ?? 0) + 1);

    const processingTime = numericPayloadValue(event, 'processingTimeMs');
    if (processingTime !== null) {
      const values = processingByTickMap.get(event.tick) ?? [];
      values.push(processingTime);
      processingByTickMap.set(event.tick, values);
    }
  }

  for (const { event } of actionEvents) {
    actionsByTickMap.set(event.tick, (actionsByTickMap.get(event.tick) ?? 0) + 1);
  }

  const recentTicks = [...new Set([...eventsByTickMap.keys(), currentTick])]
    .sort((a, b) => a - b)
    .slice(-30);

  return {
    tickDurations: recentTicks.map((tick) => {
      const processingTimes = processingByTickMap.get(tick) ?? [];
      return {
        tick,
        duration: processingTimes.length === 0 ? 0 : Math.max(...processingTimes),
        agentCount: agents.length,
        actionsExecuted: actionsByTickMap.get(tick) ?? 0,
      };
    }),
    eventsByTick: [...eventsByTickMap.entries()]
      .map(([tick, eventCount]) => ({ tick, eventCount }))
      .sort((a, b) => a.tick - b.tick)
      .slice(-30),
    currentTick,
  };
}

function buildLocalAnalyticsSnapshot(): AnalyticsSnapshot {
  const { agents, events, tick } = useWorldStore.getState();
  return {
    survival: buildSurvivalMetrics(agents, events),
    economy: buildEconomyMetrics(agents),
    behavior: buildBehaviorMetrics(agents, events),
    temporal: buildTemporalMetrics(agents, events, tick),
    timestamp: Date.now(),
  };
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Initial state
  survival: null,
  economy: null,
  behavior: null,
  temporal: null,
  isLoading: false,
  lastUpdated: null,
  activeTab: 'survival',
  isVisible: false,

  // Fetch all analytics at once
  fetchSnapshot: async () => {
    set({ isLoading: true });
    if (isLocalEngineMode()) {
      set({
        ...snapshotToState(buildLocalAnalyticsSnapshot()),
        isLoading: false,
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/analytics/snapshot`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data: AnalyticsSnapshot = await res.json();
      set({
        ...snapshotToState(data),
        isLoading: false,
      });
    } catch (error) {
      console.error('[Analytics] Failed to fetch snapshot:', error);
      set({ isLoading: false });
    }
  },

  // Fetch individual metrics
  fetchSurvival: async () => {
    if (isLocalEngineMode()) {
      const { survival, timestamp } = buildLocalAnalyticsSnapshot();
      set({ survival, lastUpdated: timestamp });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/analytics/survival`);
      if (!res.ok) return;
      const data: SurvivalMetrics = await res.json();
      set({ survival: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch survival:', error);
    }
  },

  fetchEconomy: async () => {
    if (isLocalEngineMode()) {
      const { economy, timestamp } = buildLocalAnalyticsSnapshot();
      set({ economy, lastUpdated: timestamp });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/analytics/economy`);
      if (!res.ok) return;
      const data: EconomyMetrics = await res.json();
      set({ economy: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch economy:', error);
    }
  },

  fetchBehavior: async () => {
    if (isLocalEngineMode()) {
      const { behavior, timestamp } = buildLocalAnalyticsSnapshot();
      set({ behavior, lastUpdated: timestamp });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/analytics/behavior`);
      if (!res.ok) return;
      const data: BehaviorMetrics = await res.json();
      set({ behavior: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch behavior:', error);
    }
  },

  fetchTemporal: async () => {
    if (isLocalEngineMode()) {
      const { temporal, timestamp } = buildLocalAnalyticsSnapshot();
      set({ temporal, lastUpdated: timestamp });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/analytics/temporal`);
      if (!res.ok) return;
      const data: TemporalMetrics = await res.json();
      set({ temporal: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch temporal:', error);
    }
  },

  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
  setVisible: (visible) => set({ isVisible: visible }),
}));

// =============================================================================
// Selectors (individual to avoid re-render issues)
// =============================================================================

// Data selectors
export const useSurvivalMetrics = () => useAnalyticsStore((s) => s.survival);
export const useEconomyMetrics = () => useAnalyticsStore((s) => s.economy);
export const useBehaviorMetrics = () => useAnalyticsStore((s) => s.behavior);
export const useTemporalMetrics = () => useAnalyticsStore((s) => s.temporal);
export const useAnalyticsLoading = () => useAnalyticsStore((s) => s.isLoading);
export const useAnalyticsLastUpdated = () => useAnalyticsStore((s) => s.lastUpdated);

// UI selectors
export const useActiveTab = () => useAnalyticsStore((s) => s.activeTab);
export const useIsAnalyticsVisible = () => useAnalyticsStore((s) => s.isVisible);
export const useSetActiveTab = () => useAnalyticsStore((s) => s.setActiveTab);
export const useToggleVisibility = () => useAnalyticsStore((s) => s.toggleVisibility);
export const useFetchSnapshot = () => useAnalyticsStore((s) => s.fetchSnapshot);

// Legacy compound hooks (for convenience, using useShallow)
export const useAnalytics = () => useAnalyticsStore(useShallow((state) => ({
  survival: state.survival,
  economy: state.economy,
  behavior: state.behavior,
  temporal: state.temporal,
  isLoading: state.isLoading,
  lastUpdated: state.lastUpdated,
})));

export const useAnalyticsUI = () => useAnalyticsStore(useShallow((state) => ({
  activeTab: state.activeTab,
  isVisible: state.isVisible,
  setActiveTab: state.setActiveTab,
  toggleVisibility: state.toggleVisibility,
})));
