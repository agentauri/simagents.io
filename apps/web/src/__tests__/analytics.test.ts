import { expect, test } from 'bun:test';
import { calculateGini, cumulativeBehavior } from '../stores/analytics';
import { emptyMetrics, accumulateMetrics } from '@simagents/engine/engine/metrics';
import { useAgentStatsStore } from '../stores/agentStats';
test('Gini includes zero balances and handles equal, empty and all-zero populations', () => {
  expect(calculateGini([0, 100])).toBe(0.5);
  expect(calculateGini([0, 0, 100])).toBeCloseTo(2 / 3);
  expect(calculateGini([10, 10])).toBe(0);
  expect(calculateGini([0, 0])).toBe(0);
  expect(calculateGini([])).toBe(0);
});
test('analytics and per-agent stats use cumulative counters; synchronizing twice does not double count', () => {
  const metrics = emptyMetrics();
  for (let i = 0; i < 5; i++) accumulateMetrics(metrics, { eventType: 'agent_move', agentId: 'agent', tick: i, payload: { action: 'move', processingTimeMs: 10, tokens: { input: 2 } } }, 'fixture');
  useAgentStatsStore.getState().syncMetrics(metrics);
  useAgentStatsStore.getState().syncMetrics(metrics);
  expect(useAgentStatsStore.getState().stats.agent.actionsCount).toBe(5);
  expect(useAgentStatsStore.getState().stats.agent.totalTokens).toBe(10);
  expect(cumulativeBehavior(metrics).actionFrequency[0].count).toBe(5);
  expect(cumulativeBehavior(metrics).byLlmType[0].avgProcessingTime).toBe(10);
  useAgentStatsStore.getState().resetAgentStats();
  expect(useAgentStatsStore.getState().metrics).toBeUndefined();
});

test('action rate uses elapsed simulation time and falls during inactivity', async () => {
  const { actionsPerSimMinute } = await import('../stores/agentStats');
  const metrics = emptyMetrics();
  accumulateMetrics(metrics, { eventType: 'agent_sleep', agentId: 'agent', tick: 0, payload: { action: 'sleep', simTimeMs: 0 } });
  useAgentStatsStore.getState().syncMetrics(metrics, 60000);
  expect(actionsPerSimMinute(useAgentStatsStore.getState().stats.agent)).toBe(1);
  useAgentStatsStore.getState().syncMetrics(metrics, 180000);
  expect(actionsPerSimMinute(useAgentStatsStore.getState().stats.agent)).toBeCloseTo(1 / 3);
  useAgentStatsStore.getState().resetAgentStats();
});
