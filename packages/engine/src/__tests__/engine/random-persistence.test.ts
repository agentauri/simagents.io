import { beforeEach, expect, test } from 'bun:test';
import { initializeRNG, random, agentRng, snapshotRNG, restoreRNG, withRng, validRandomSnapshot } from '../../utils/random';
import { createAgent } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { serializeWorld, hydrateWorld } from '../../engine/persistence';
import { SimEngine } from '../../engine/engine';
beforeEach(resetStore);
const save = () => serializeWorld({ worldSeed: 'fixture', savedAtSimTimeMs: 0, speed: 1 });
test('world and independent agent streams continue exactly after JSON round-trip', async () => {
  await createAgent({ id: 'first', llmType: 'fixture' });
  await createAgent({ id: 'second', llmType: 'fixture' });
  initializeRNG('fixture');
  const first = agentRng('first', 'fixture:first'), second = agentRng('second', 'fixture:second');
  random(); first(); first(); second();
  const saved = JSON.parse(JSON.stringify(save()));
  const expected = [random(), first(), second(), random(), second(), first()];
  hydrateWorld(saved);
  const a = agentRng('first', 'ignored'), b = agentRng('second', 'ignored');
  expect([random(), a(), b(), random(), b(), a()]).toEqual(expected);
});
test('recreating an agent runner stream does not rewind on pause or failure', () => {
  initializeRNG('fixture');
  const stream = agentRng('agent', 'seed'); stream();
  const saved = snapshotRNG();
  const expected = stream();
  restoreRNG(saved);
  expect(agentRng('agent', 'seed')()).toBe(expected);
  expect(agentRng('agent', 'seed')).toBe(agentRng('agent', 'seed'));
});
test('temporary baseline scope leaves the world stream and exception handling intact', () => {
  initializeRNG('fixture'); const saved = snapshotRNG(); const expected = random(); restoreRNG(saved);
  expect(() => withRng(agentRng('agent', 'seed'), () => { random(); throw new Error('fixture'); })).toThrow();
  expect(random()).toBe(expected);
});
test('malformed permutations and duplicate stream identities fail before hydration mutates state', () => {
  initializeRNG('fixture'); agentRng('agent', 'seed')();
  const saved = save(); const original = snapshotRNG();
  saved.random!.world!.S[0] = saved.random!.world!.S[1];
  expect(() => hydrateWorld(saved)).toThrow('random');
  expect(snapshotRNG()).toEqual(original);
  const duplicate = snapshotRNG(); duplicate.agents.push(duplicate.agents[0]);
  expect(validRandomSnapshot(duplicate)).toBe(false);
});
test('old snapshots explicitly retain an incomplete random history flag', () => {
  const old = save(); delete old.random;
  hydrateWorld(old);
  expect(snapshotRNG().complete).toBe(false);
  hydrateWorld(save());
  expect(snapshotRNG().complete).toBe(false);
});
test('engine seed uses its effective world seed and reset clears all streams', async () => {
  const engine = new SimEngine({ worldSeed: 'engine-seed' });
  await engine.seed({ agentCount: 0 });
  expect(engine.snapshot().random?.seed).toBe('engine-seed');
  expect(engine.snapshot().random?.complete).toBe(true);
  agentRng('agent', 'seed')();
  await engine.reset();
  expect(snapshotRNG().agents).toHaveLength(0);
});

test('stopped runners cannot advance a stream reused after resuming', async () => {
  const { AgentRunner } = await import('../../engine/agent-runner');
  initializeRNG('fixture');
  const engine = new SimEngine();
  const runner = new AgentRunner({ agentId: 'agent', worldSeed: 'fixture', host: engine, executor: engine.getExecutor(), provider: { kind: 'fixture', decide: async () => ({ type: 'sleep', params: { duration: 1 } }) } });
  runner.rng(); runner.stop();
  const before = snapshotRNG();
  expect(() => runner.rng()).toThrow('aborted');
  expect(snapshotRNG()).toEqual(before);
});
