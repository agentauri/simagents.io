import { afterEach, beforeEach, expect, test } from 'bun:test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { appData } from '../services/app-data';
import { StoredCollection, legacyArray, resumeSecondaryCollection, getSecondaryWarning } from '../services/secondary-data';
import { appendReplayFrame, clearReplayFrames } from '../services/replayFrames';
import { fetchTickRange, fetchWorldSnapshot } from '../stores/replay';
import { recordPromptEvent, loadPromptLogs, clearPromptLogs } from '../services/promptLogs';
const originalStorage = globalThis.localStorage;
const originalIndexedDB = globalThis.indexedDB;
let legacy: Map<string, string>;
beforeEach(() => {
  legacy = new Map();
  Object.assign(globalThis, { IDBKeyRange, indexedDB: new IDBFactory(), localStorage: {
    getItem: (key: string) => legacy.get(key) ?? null,
    setItem: (key: string, value: string) => legacy.set(key, value),
    removeItem: (key: string) => legacy.delete(key),
  } });
  resumeSecondaryCollection();
});
afterEach(() => { Object.assign(globalThis, { localStorage: originalStorage, indexedDB: originalIndexedDB }); });
const collection = (key = 'fixture') => new StoredCollection<number>(key, value => legacyArray(value, (v): v is number => typeof v === 'number'));
test('legacy data migrates only after commit; malformed source is retained', async () => {
  legacy.set('fixture', '[1,2]');
  expect(await collection().load()).toEqual([1, 2]);
  expect(legacy.has('fixture')).toBe(false);
  legacy.set('broken', '[1,"bad"]');
  await expect(collection('broken').load()).rejects.toThrow('Invalid legacy');
  expect(legacy.get('broken')).toBe('[1,"bad"]');
});
test('migration preserves a conflicting legacy source and a newer destination', async () => {
  await appData.write('fixture', [9]);
  legacy.set('fixture', '[1]');
  expect(await collection().load()).toEqual([9]);
  expect(legacy.get('fixture')).toBe('[1]');
});
test('concurrent collection instances do not lose appends; clear follows pending writes', async () => {
  const first = collection(), second = collection();
  await Promise.all([first.update(items => [...items, 1]), second.update(items => [...items, 2])]);
  expect((await first.load()).sort()).toEqual([1, 2]);
  const append = first.update(items => [...items, 3]);
  const clear = first.clear();
  await Promise.all([append, clear]);
  expect(await first.load()).toEqual([]);
});
test('failed collection update preserves data, reports pause and requires explicit retry', async () => {
  const store = collection();
  await store.update(() => [1]);
  await expect(store.update(() => { throw new Error('fixture failure'); })).rejects.toThrow('fixture failure');
  expect(getSecondaryWarning()).toContain('paused');
  await store.update(() => [2]);
  expect(await store.load()).toEqual([1]);
  resumeSecondaryCollection();
  await store.update(() => [2]);
  expect(await store.load()).toEqual([2]);
});
test('saved replay restores tick zero, reports gaps, and never substitutes a missing frame', async () => {
  await clearReplayFrames();
  for (const tick of [0, 3]) await appendReplayFrame({ schemaVersion: 1, worldSeed: 'fixture', tick, capturedAt: tick, simTimeMs: tick,
    snapshot: { tick, agents: [], events: [], shelters: [], resourceSpawns: [] } });
  expect((await fetchTickRange()).missingTicks).toBe(2);
  expect((await fetchWorldSnapshot(0)).tick).toBe(0);
  await expect(fetchWorldSnapshot(1)).rejects.toThrow('missing');
});
test('prompt summaries deduplicate decision events and do not count action failures as fallback', async () => {
  await clearPromptLogs();
  const event = { id: 'event', type: 'agent_move', agentId: 'agent', tick: 0, timestamp: 1, payload: { action: 'move' } };
  await recordPromptEvent(event);
  await recordPromptEvent(event);
  await recordPromptEvent({ ...event, id: 'failed', type: 'action_failed' });
  const logs = await loadPromptLogs();
  expect(logs).toHaveLength(1);
  expect(logs[0].source).toBe('reconstructed');
  expect(logs[0].usedFallback).toBe(false);
  expect(logs[0].rawResponse).toBeNull();
});

test('failed migration preserves the original source under storage pressure', async () => {
  const { AppDataStore } = await import('../services/app-data');
  const source = JSON.stringify(Array(100).fill(1));
  legacy.set('large', source);
  const store = new StoredCollection<number>('large', value => legacyArray(value, (v): v is number => typeof v === 'number'), new AppDataStore('small', 100));
  await expect(store.load()).rejects.toThrow('budget');
  expect(legacy.get('large')).toBe(source);
});

test('experiment export after reload uses stored data without creating a Worker', async () => {
  const { saveExperimentRun } = await import('../services/experiments');
  const { EngineClient } = await import('../engine-host/engine-client');
  await saveExperimentRun({ schemaVersion: 1, id: 'saved-run', definition: {}, status: 'completed', startedAt: 1, targetTicks: 1, ticksCompleted: 1, snapshots: [] });
  const client = new EngineClient();
  expect((await client.exportExperiment('saved-run')).run.id).toBe('saved-run');
});

test('captured requests at the same agent/tick remain individually selectable', async () => {
  const { recordRequestTrace } = await import('../services/promptLogs');
  const { usePromptInspectorStore } = await import('../stores/promptInspectorStore');
  for (const requestId of ['first', 'second']) await recordRequestTrace({ requestId, agentId: 'agent', tick: 1, protocol: 'messages', requestedModel: 'fixture',
    startedAt: 1, durationMs: 2, outcome: 'success', requestBody: requestId, responseBody: '{}', truncated: false, redacted: false });
  expect((await loadPromptLogs()).filter(log => log.source === 'captured')).toHaveLength(2);
  await usePromptInspectorStore.getState().fetchLogDetail('agent', 1, 'request:second');
  expect(usePromptInspectorStore.getState().currentLog?.fullPrompt).toBe('second');
  await usePromptInspectorStore.getState().fetchLogDetail('agent', 1, 'request:first');
  expect(usePromptInspectorStore.getState().currentLog?.fullPrompt).toBe('first');
});

test('replay and inspector use descriptors and single-item reads without loading collection bodies', async () => {
  const { AppDataStore } = await import('../services/app-data');
  const { usePromptInspectorStore } = await import('../stores/promptInspectorStore');
  await clearReplayFrames(); await clearPromptLogs();
  for (const tick of [0, 1]) {
    await appendReplayFrame({ schemaVersion: 1, worldSeed: 'fixture', tick, capturedAt: tick, simTimeMs: tick,
      snapshot: { tick, agents: [], shelters: [], resourceSpawns: [], events: [{ id: tick + 1, eventType: 'agent_signal', tick, agentId: 'a', payload: {}, createdAt: new Date().toISOString() }] } });
    await recordPromptEvent({ id: `event-${tick}`, type: 'agent_signal', agentId: 'a', tick, timestamp: tick, payload: { action: 'signal' } });
  }
  const originalPage = AppDataStore.prototype.page;
  AppDataStore.prototype.page = () => { throw new Error('Whole-body collection page is forbidden on this UI path'); };
  try {
    expect((await fetchTickRange()).totalEvents).toBe(2);
    expect((await fetchWorldSnapshot(1)).tick).toBe(1);
    await usePromptInspectorStore.getState().fetchStatus();
    expect(usePromptInspectorStore.getState().status?.hasData).toBe(true);
    await usePromptInspectorStore.getState().fetchLogDetail('a', 1, 'event-1');
    expect(usePromptInspectorStore.getState().currentLog?.tick).toBe(1);
    await usePromptInspectorStore.getState().fetchTimeline('a');
    expect(usePromptInspectorStore.getState().timeline.map(value => value.tick)).toEqual([1, 0]);
  } finally { AppDataStore.prototype.page = originalPage; }
});
test('replay selects the latest world and de-duplicates repeated events in its timeline', async () => {
  const { fetchAgentTimeline } = await import('../stores/replay');
  await clearReplayFrames();
  const event = { id: 1, eventType: 'agent_signal', tick: 0, agentId: 'a', payload: {}, createdAt: new Date().toISOString() };
  for (const [worldSeed, tick, capturedAt] of [['old', 50, 1], ['new', 0, 2], ['new', 1, 3]] as const) {
    await appendReplayFrame({ schemaVersion: 1, worldSeed, tick, capturedAt, simTimeMs: tick,
      snapshot: { tick, agents: [], shelters: [], resourceSpawns: [], events: [event] } });
  }
  expect((await fetchTickRange()).availableTicks).toEqual([0, 1]);
  expect(await fetchAgentTimeline('a')).toHaveLength(1);
  await expect(fetchWorldSnapshot(50)).rejects.toThrow('missing');
});
test('a saved world beyond the last collected replay frame reports the missing tail', async () => {
  await clearReplayFrames();
  for (const tick of [0, 1]) await appendReplayFrame({ schemaVersion: 1, worldSeed: 'fixture', tick, capturedAt: tick, simTimeMs: tick,
    snapshot: { tick, agents: [], events: [], shelters: [], resourceSpawns: [] } });
  await appData.write('world:current', { snapshot: { worldSeed: 'fixture', store: { worldState: { currentTick: 5 } } }, events: [] });
  const range = await fetchTickRange();
  expect(range.maxTick).toBe(1);
  expect(range.missingTicks).toBe(4);
  await expect(fetchWorldSnapshot(5)).rejects.toThrow('missing');
});
test('replay SDK reads history beyond the resident window without creating a Worker', async () => {
  const { EngineClient } = await import('../engine-host/engine-client');
  await clearReplayFrames();
  for (let tick = 0; tick < 40; tick++) await appendReplayFrame({ schemaVersion: 1, worldSeed: 'fixture', tick, capturedAt: tick, simTimeMs: tick,
    snapshot: { tick, agents: [], events: [], shelters: [], resourceSpawns: [] } });
  const client = new EngineClient();
  expect((await client.getReplayRange()).availableTicks).toHaveLength(40);
  expect((await client.getReplayFrame(0)).tick).toBe(0);
  await expect(client.getReplayFrame(41)).rejects.toThrow('missing');
});
