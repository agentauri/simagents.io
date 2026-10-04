import type { WorldMetrics, ReportedTokenUsage } from '@simagents/engine/engine/metrics';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export interface AgentDecisionStats {
  agentId: string;
  elapsedSimMs?: number;
  actionsCount: number;
  latencySamples: number;
  avgLatencyMs: number;
  fallbackCount: number;
  totalTokens: number;
  tokenUsage?: ReportedTokenUsage;
  lastModelId?: string;
  firstTick: number;
  lastTick: number;
}

interface AgentStatsState {
  metrics?: WorldMetrics;
  syncMetrics: (metrics?: WorldMetrics, simTimeMs?: number) => void;
  stats: Record<string, AgentDecisionStats>;
  resetAgentStats: () => void;
}

export function actionsPerSimMinute(stats: AgentDecisionStats | undefined): number {
  if (!stats || stats.actionsCount === 0) return 0;
  const elapsedMinutes = Math.max(1, (stats.elapsedSimMs ?? 0) / 60000);
  return stats.actionsCount / elapsedMinutes;
}

export function fallbackRatio(stats: AgentDecisionStats | undefined): number {
  if (!stats || stats.actionsCount === 0) return 0;
  return stats.fallbackCount / stats.actionsCount;
}

export const useAgentStatsStore = create<AgentStatsState>((set) => ({
  stats: {},
  syncMetrics: (metrics, simTimeMs = 0) => set({ metrics, stats: Object.fromEntries((metrics?.agents ?? []).map(agent => [agent.agentId, {
    elapsedSimMs: Math.max(0, simTimeMs - agent.firstSimTimeMs),
    agentId: agent.agentId, actionsCount: agent.actionsCount, latencySamples: agent.latencySamples,
    avgLatencyMs: agent.latencySamples ? agent.latencyTotalMs / agent.latencySamples : 0,
    fallbackCount: agent.fallbackCount, totalTokens: agent.totalTokens, tokenUsage: agent.tokenUsage, lastModelId: agent.lastModelId,
    firstTick: agent.firstTick, lastTick: agent.lastTick,
  }])) }),
  resetAgentStats: () => set({ stats: {}, metrics: undefined }),
}));

export const useAgentStats = (agentId: string) =>
  useAgentStatsStore((state) => state.stats[agentId]);

export const useAllAgentStats = () =>
  useAgentStatsStore(useShallow((state) => state.stats));
