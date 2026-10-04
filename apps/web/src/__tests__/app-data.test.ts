import { expect, test } from 'bun:test';
import { indexedDB, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { AppDataStore } from '../services/app-data';
Object.assign(globalThis, { IDBKeyRange, indexedDB });
const database = (budget = 1000) => new AppDataStore(`test-${crypto.randomUUID()}`, budget);
test('atomic replacement preserves world and event ring when budget is exceeded', async () => {
  const store = database(100);
  const original = { snapshot: 'world', events: ['event'] };
  await store.write('world', original);
  await expect(store.write('world', { snapshot: 'x'.repeat(101), events: [] })).rejects.toThrow('budget');
  expect(await store.read<Record<string, unknown>>('world')).toEqual(original);
});
test('concurrent transactions account for all records without eviction', async () => {
  const store = database(100);
  const writes = await Promise.allSettled([store.write('a', 'a'.repeat(60)), store.write('b', 'b'.repeat(60))]);
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect([await store.read('a'), await store.read('b')].filter(Boolean)).toHaveLength(1);
});
test('secondary collection reserves space for primary worlds and resumes after explicit removal', async () => {
  const store = database(100);
  await store.write('trace', 'a'.repeat(85), { secondary: true });
  await expect(store.write('extra', '1234', { secondary: true })).rejects.toThrow('budget');
  await store.write('world', '1234');
  expect(await store.read<string>('trace')).toBe('a'.repeat(85));
  await store.remove('trace');
  await store.write('extra', '1234', { secondary: true });
});
test('migration insert-if-absent never replaces an existing destination', async () => {
  const store = database();
  await Promise.all([store.write('world', { tick: 10 }), store.write('world', { tick: 1 }, { onlyIfAbsent: true })]);
  expect(await store.read<Record<string, unknown>>('world')).toEqual({ tick: 10 });
});
test('committed data survives opening another connection', async () => {
  const name = `test-${crypto.randomUUID()}`;
  await new AppDataStore(name).write('world', { tick: 9, events: [] });
  expect(await new AppDataStore(name).read<Record<string, unknown>>('world')).toEqual({ tick: 9, events: [] });
});
test('version-one migration preserves payloads and recalculates stale byte counts', async () => {
  const name = `test-${crypto.randomUUID()}`;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore('records', { keyPath: 'key' });
      records.put({ key: 'old', json: JSON.stringify('é'.repeat(20)), bytes: 0 });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const store = new AppDataStore(name, 60);
  expect(await store.read<string>('old')).toBe('é'.repeat(20));
  await expect(store.write('new', 'x'.repeat(20))).rejects.toThrow('budget');
  expect(await store.write('new', 'ok')).toBe(46);
  await store.remove('old');
  expect(await new AppDataStore(name, 60).write('new', 'next')).toBe(6);
});
test('failed changes and insert-if-absent preserve accounting across connections', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = new AppDataStore(name, 100);
  const second = new AppDataStore(name, 100);
  expect(await first.write('a', 'abc')).toBe(5);
  await expect(first.update('a', () => { throw new Error('cancel'); })).rejects.toThrow('cancel');
  expect(await second.write('a', 'ignored', { onlyIfAbsent: true })).toBe(5);
  expect(await second.write('b', 'def')).toBe(10);
  expect(await first.read<string>('a')).toBe('abc');
});
test('indexed migration verifies copied records and accounts for their replacement', async () => {
  const store = database(1000);
  const values = [{ id: 'a', tick: 0 }, { id: 'b', tick: 1 }];
  await store.write('frames', values);
  await store.migrateItems<typeof values[number]>('frames', value => value.id, value => ({ world: 'world', tick: value.tick }));
  expect(await store.read<unknown>('frames')).toEqual({ indexedCollection: 1 });
  const first = await store.page<typeof values[number]>('frames', undefined, 1);
  expect(first.map(row => row.value)).toEqual([values[0]]);
  expect((await store.page('frames', first[0].id, 1)).map(row => row.value)).toEqual([values[1]]);
  await store.putItem('frames', 'a', { id: 'a', tick: 2 });
  expect(await store.page('frames')).toHaveLength(2);
  await store.clearItems('frames');
  // Only the migration marker remains; cleared records release their budget.
  expect(await store.write('primary', 'ok')).toBe(27);
});
test('a conflicting destination aborts migration without deleting the legacy source', async () => {
  const store = database();
  await store.write('frames', [{ id: 'a', tick: 0 }]);
  await store.putItem('frames', 'a', { id: 'a', tick: 99 });
  await expect(store.migrateItems<{ id: string }>('frames', value => value.id, () => ({}))).rejects.toThrow();
  expect(await store.read<unknown>('frames')).toEqual([{ id: 'a', tick: 0 }]);
  expect((await store.page('frames'))[0].value).toEqual({ id: 'a', tick: 99 });
});
test('indexed appends from separate connections share the secondary budget', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const a = new AppDataStore(name, 100), b = new AppDataStore(name, 100);
  const results = await Promise.allSettled([a.putItem('traces', 'a', 'x'.repeat(50)), b.putItem('traces', 'b', 'x'.repeat(50))]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await a.page('traces')).toHaveLength(1);
  await expect(b.putItem('traces', 'c', 'x'.repeat(100))).rejects.toThrow('budget');
  expect(await a.page('traces')).toHaveLength(1);
});

test('browser quota denial preserves the previous item and transactional accounting', async () => {
  const store = database();
  await store.putItem('traces', 'one', 'original');
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    if (this.name === 'items') throw new DOMException('Quota denied', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  try {
    await expect(store.putItem('traces', 'one', 'replacement')).rejects.toThrow('Quota denied');
  } finally { IDBObjectStore.prototype.put = originalPut; }
  expect((await store.page('traces'))[0].value).toBe('original');
  expect(await store.write('primary', 'ok')).toBe(14);
});
test('indexed subject queries isolate agents, worlds and ticks without decoding metadata pages', async () => {
  const store = database(10000);
  for (const [id, agent, world, tick] of [['one', 'a', 'w1', 0], ['two', 'a', 'w1', 1], ['three', 'a', 'w2', 1], ['four', 'b', 'w1', 1]] as const) {
    await store.putItem('trace', id, { body: 'payload' }, { agent, world, tick, summary: { id, tick } });
  }
  expect(await store.query('trace', { agent: 'a', world: 'w1' }, 100)).toHaveLength(2);
  expect(await store.query('trace', { world: 'w1', tick: 1 }, 100)).toHaveLength(2);
  expect(await store.query('trace', { agent: 'a', tick: 1 }, 1, true)).toHaveLength(1);
  const metadata = await store.metadataPage('trace');
  expect(metadata).toHaveLength(4);
  expect(JSON.stringify(metadata)).not.toContain('payload');
  expect(await store.item<{ body: string }>('trace', 'one')).toEqual({ body: 'payload' });
});
