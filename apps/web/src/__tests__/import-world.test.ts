import { expect, test } from 'bun:test';
import { importWorld, type ImportEngine } from '../services/import-world';
import { parseWorldExportFile, type SavedWorld } from '../services/persistence';
import { serializeWorld } from '@simagents/engine/engine/persistence';
const file = (): SavedWorld => ({ snapshot: serializeWorld({ worldSeed: 'import-test', savedAtSimTimeMs: 0, speed: 1 }), events: [] });
function engine(validate: () => Promise<void> = async () => {}) {
  const calls: string[] = [];
  const client: ImportEngine = { validateSnapshot: async () => { calls.push('validate'); await validate(); }, isRunning: () => true, isPaused: () => false,
    pause: async () => { calls.push('pause/drain'); }, resetHard: () => { calls.push('terminate'); } };
  return { client, calls };
}
test('invalid snapshot cannot pause, commit or terminate the current session', async () => {
  const { client, calls } = engine(async () => { throw new Error('invalid domain'); });
  await expect(importWorld(file(), client, async saved => { calls.push('commit'); return saved; })).rejects.toThrow('invalid domain');
  expect(calls).toEqual(['validate']);
});
test('a valid import drains old writes before commit and terminates only after commit', async () => {
  const { client, calls } = engine();
  const result = await importWorld(file(), client, async saved => { calls.push('commit'); return saved; });
  expect(result.snapshot.worldSeed).toBe('import-test');
  expect(calls).toEqual(['validate', 'pause/drain', 'commit', 'terminate']);
});
test('a denied commit leaves the previous engine available without an automatic resume', async () => {
  const { client, calls } = engine();
  await expect(importWorld(file(), client, async () => { calls.push('denied'); throw new Error('quota'); })).rejects.toThrow('quota');
  expect(calls).toEqual(['validate', 'pause/drain', 'denied']);
});
test('malformed event ring is rejected before a worker call', async () => {
  for (const event of [
    { id: 'e', type: 'event', tick: -1, timestamp: 0, payload: {} },
    { id: 'e', type: 'event', tick: 0.5, timestamp: 0, payload: {} },
    { id: 'e', type: 'event', tick: 0, timestamp: 0, agentId: 'missing', payload: {} },
    { id: 'e', type: 'event', tick: 0, timestamp: 0, payload: { nested: NaN } },
    { id: 'e', type: 'event', tick: 0, timestamp: 0, payload: JSON.parse('{"__proto__":{"unsafe":true}}') },
  ]) {
    const { client, calls } = engine();
    await expect(importWorld({ ...file(), events: [event] }, client)).rejects.toThrow();
    expect(calls).toEqual([]);
  }
  const duplicate = { id: 'e', type: 'event', tick: 0, timestamp: 0, payload: {} };
  expect(() => parseWorldExportFile({ ...file(), events: [duplicate, duplicate] })).toThrow('duplicated');
});
