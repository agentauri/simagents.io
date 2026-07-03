import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { WorldEvent } from './world';

export interface AgentDecisionStats {
  agentId: string;
  actionsCount: number;
  latencySamples: number;
  avgLatencyMs: number;
  fallbackCount: number;
  totalTokens: number;
  lastModelId?: string;
  firstTick: number;
  lastTick: number;
}

interface AgentStatsState {
  stats: Record<string, AgentDecisionStats>;
  recordDecisionEvent: (event: WorldEvent) => void;
  resetAgentStats: () => void;
}

function tokenTotal(tokens: unknown): number {
  if (!tokens || typeof tokens !== 'object') return 0;
  const record = tokens as { input?: unknown; output?: unknown };
  const input = typeof record.input === 'number' ? record.input : 0;
  const output = typeof record.output === 'number' ? record.output : 0;
  return input + output;
}

function isDecisionEvent(event: WorldEvent): boolean {
  return event.type.startsWith('agent_') && typeof event.payload?.action === 'string';
}

export function actionsPerSimMinute(stats: AgentDecisionStats | undefined): number {
  if (!stats || stats.actionsCount === 0) return 0;
  const elapsedMinutes = Math.max(1, stats.lastTick - stats.firstTick + 1);
  return stats.actionsCount / elapsedMinutes;
}

export function fallbackRatio(stats: AgentDecisionStats | undefined): number {
  if (!stats || stats.actionsCount === 0) return 0;
  return stats.fallbackCount / stats.actionsCount;
}

export const useAgentStatsStore = create<AgentStatsState>((set) => ({
  stats: {},

  recordDecisionEvent: (event) => {
    if (!event.agentId || !isDecisionEvent(event)) return;

    set((state) => {
      const current = state.stats[event.agentId!];
      const processingTimeMs = event.payload.processingTimeMs;
      const latency = typeof processingTimeMs === 'number' ? processingTimeMs : undefined;
      const latencySamples = current?.latencySamples ?? 0;
      const nextLatencySamples = latency === undefined ? latencySamples : latencySamples + 1;
      const avgLatencyMs =
        latency === undefined
          ? current?.avgLatencyMs ?? 0
          : ((current?.avgLatencyMs ?? 0) * latencySamples + latency) / nextLatencySamples;
      const modelId = typeof event.payload.modelId === 'string'
        ? event.payload.modelId
        : current?.lastModelId;
      const usedFallback = event.payload.usedFallback === true;

      return {
        stats: {
          ...state.stats,
          [event.agentId!]: {
            agentId: event.agentId!,
            actionsCount: (current?.actionsCount ?? 0) + 1,
            latencySamples: nextLatencySamples,
            avgLatencyMs,
            fallbackCount: (current?.fallbackCount ?? 0) + (usedFallback ? 1 : 0),
            totalTokens: (current?.totalTokens ?? 0) + tokenTotal(event.payload.tokens),
            lastModelId: modelId,
            firstTick: current?.firstTick ?? event.tick,
            lastTick: Math.max(current?.lastTick ?? event.tick, event.tick),
          },
        },
      };
    });
  },

  resetAgentStats: () => set({ stats: {} }),
}));

export const useAgentStats = (agentId: string) =>
  useAgentStatsStore((state) => state.stats[agentId]);

export const useAllAgentStats = () =>
  useAgentStatsStore(useShallow((state) => state.stats));
