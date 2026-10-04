import { beforeEach, expect, test } from 'bun:test';
import { accumulateMetrics, emptyMetrics, validMetrics } from '../../engine/metrics';
import { resetStore, store, STORE_EVENT_CAP } from '../../engine-memory/store';
import { appendEvent, getEventCount } from '../../engine-memory/queries/events';
import { serializeWorld, hydrateWorld, validateWorldSnapshotV1 } from '../../engine/persistence';
beforeEach(resetStore);
const snapshot = () => serializeWorld({ savedAtSimTimeMs: 0, speed: 1, worldSeed: 'metrics' });
test('decisions and failed attempts count once; result and lifecycle events do not duplicate them', () => {
  const metrics = emptyMetrics();
  for (const eventType of ['agent_move', 'agent_moved', 'action_failed', 'agent_sleeping']) accumulateMetrics(metrics, {
    eventType, agentId: 'agent', tick: 0, payload: { action: 'move', processingTimeMs: 30, usedFallback: false, tokens: { input: 3, output: 2 } },
  });
  expect(metrics.totalEvents).toBe(4);
  expect(metrics.totalActions).toBe(2);
  expect(metrics.failedActions).toBe(1);
  expect(metrics.agents[0].totalTokens).toBe(10);
  expect(metrics.agents[0].latencySamples).toBe(2);
  expect(metrics.agents[0].fallbackCount).toBe(0);
  expect(validMetrics(metrics)).toBe(true);
});
test('event totals survive feed eviction, snapshot truncation and repeated hydration', async () => {
  for (let i = 0; i < STORE_EVENT_CAP + 2; i++) await appendEvent({ eventType: 'tick_start', tick: 0, payload: {} });
  expect(store.events.length).toBe(STORE_EVENT_CAP);
  expect(await getEventCount()).toBe(STORE_EVENT_CAP + 2);
  const saved = snapshot();
  expect(saved.store.events.length).toBeLessThan(store.events.length);
  hydrateWorld(saved); hydrateWorld(snapshot());
  expect(store.metrics.totalEvents).toBe(STORE_EVENT_CAP + 2);
  await appendEvent({ eventType: 'tick_start', tick: 0, payload: {} });
  expect(store.metrics.totalEvents).toBe(STORE_EVENT_CAP + 3);
});
test('legacy snapshots get explicitly incomplete counters, without inventing missing history', async () => {
  await appendEvent({ eventType: 'tick_start', tick: 0, payload: {} });
  const saved = snapshot(); delete saved.metrics;
  hydrateWorld(saved);
  expect(store.metrics.complete).toBe(false);
  expect(store.metrics.totalEvents).toBe(1);
  hydrateWorld(snapshot());
  expect(store.metrics.complete).toBe(false);
});
test('malformed metric imports are rejected before current data is replaced', async () => {
  await appendEvent({ eventType: 'tick_start', tick: 0, payload: {} });
  const saved = snapshot(); saved.metrics!.totalActions = 99;
  expect(() => validateWorldSnapshotV1(saved)).toThrow('metrics');
  expect(() => hydrateWorld(saved)).toThrow();
  expect(store.metrics.totalEvents).toBe(1);
});
test('temporal history is bounded while lifetime totals and cause counts persist', () => {
  const metrics = emptyMetrics();
  for (let tick = 0; tick < 150; tick++) accumulateMetrics(metrics, { eventType: 'agent_died', agentId: null, tick, payload: { cause: 'starvation' } });
  expect(metrics.recentTicks).toHaveLength(120);
  expect(metrics.totalEvents).toBe(150);
  expect(metrics.deaths.starvation).toBe(150);
});
test('reported split and coverage survive snapshots while missing/changed pricing context stays explicit', async () => {
  const { createAgent } = await import('../../engine-memory/queries/agents');
  const a = await createAgent({ llmType: 'claude' });
  const context = { providerId: 'claude', modelId: 'claude-haiku-4-5-20251001', endpoint: 'https://api.anthropic.com/v1/messages' };
  await appendEvent({ eventType: 'agent_signal', agentId: a.id, tick: 0, payload: { action: 'signal', tokens: { input: 12, output: 9 }, pricingContext: context, costEligible: true } });
  const saved = snapshot(); hydrateWorld(saved);
  expect(store.metrics.agents[0].tokenUsage).toMatchObject({ inputTokens: 12, outputTokens: 9, completeSamples: 1, costEligibleSamples: 1, mixedContext: false });
  await appendEvent({ eventType: 'action_failed', agentId: a.id, tick: 0, payload: { action: 'signal', tokens: { input: 3 }, pricingContext: { ...context, modelId: 'changed-model' } } });
  expect(store.metrics.agents[0].tokenUsage).toMatchObject({ samples: 2, inputTokens: 15, outputTokens: 9, completeSamples: 1, mixedContext: true });
  expect(validMetrics(store.metrics)).toBe(true);
  const bad = snapshot(); bad.metrics!.agents[0].tokenUsage!.inputSamples = 99;
  expect(() => hydrateWorld(bad)).toThrow(); expect(store.metrics.agents[0].tokenUsage!.samples).toBe(2);
});
