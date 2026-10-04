/** Atomic, budgeted application data. Failed writes never evict existing records. */
export const APP_DATA_DB = 'simagents-app-data';
export const APP_DATA_BUDGET = 50 * 1024 * 1024;
const SECONDARY_RESERVE = 5 * 1024 * 1024;
const INDEXED_MARKER_JSON = JSON.stringify({ indexedCollection: 1 });
const INDEXED_MARKER_BYTES = new TextEncoder().encode(INDEXED_MARKER_JSON).byteLength;
export interface ItemMetadata {
  metadataVersion?: number;
  world?: string;
  agent?: string;
  tick?: number;
  eventCount?: number;
  capturedAt?: number;
  summary?: Record<string, unknown>;
}
export interface ItemDescriptor extends ItemMetadata { id: string }
interface ItemRow extends ItemDescriptor { collection: string; json: string; bytes: number }
interface DataRow { key: string; json: string; bytes: number }
export class AppDataStore {
  constructor(private readonly name = APP_DATA_DB, private readonly budget = APP_DATA_BUDGET) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const records = db.objectStoreNames.contains('records')
          ? request.transaction!.objectStore('records')
          : db.createObjectStore('records', { keyPath: 'key' });
        const accounting = db.createObjectStore('accounting');
        const items = db.createObjectStore('items', { keyPath: ['collection', 'id'] });
        items.createIndex('collection', 'collection');
        items.createIndex('worldTick', ['collection', 'world', 'tick', 'id']);
        items.createIndex('agentTick', ['collection', 'agent', 'tick', 'id']);
        // Scan once during the atomic schema upgrade, never on append.
        let total = 0;
        const cursor = records.openCursor();
        cursor.onsuccess = () => {
          if (cursor.result) {
            const row = cursor.result.value as DataRow;
            const bytes = new TextEncoder().encode(row.json).byteLength;
            total += bytes;
            if (row.bytes !== bytes) cursor.result.update({ ...row, bytes });
            cursor.result.continue();
          } else accounting.put(total, 'bytes');
        };
      };
      let blocked = false;
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('Close other SimAgents tabs to upgrade local storage.')); };
    });
  }
  /** Read at most one page; metadata reads never parse stored request/response bodies. */
  async page<T>(collection: string, after?: string, limit = 100): Promise<Array<{ id: string; value: T }>> {
    return this.readItemCursor(collection, after, limit, row => ({ id: row.id, value: JSON.parse(row.json) as T }));
  }
  async metadataPage(collection: string, after?: string, limit = 100): Promise<ItemDescriptor[]> {
    return this.readItemCursor(collection, after, limit, row => {
      const { collection: _collection, json: _json, bytes: _bytes, ...metadata } = row;
      return metadata;
    });
  }
  async item<T>(collection: string, id: string): Promise<T | undefined> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readonly');
        const request = tx.objectStore('items').get([collection, id]);
        let value: T | undefined;
        request.onsuccess = () => {
          try { value = request.result ? JSON.parse(request.result.json) as T : undefined; }
          catch { tx.abort(); }
        };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error ?? new Error('Invalid item data.'));
      });
    } finally { db.close(); }
  }
  /** Indexed range queries bound both disk reads and resident decoded records. */
  async query<T>(collection: string, filter: { world?: string; agent?: string; tick?: number }, limit = 100, reverse = false, metadataOnly = false): Promise<T[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid page size.');
    const indexName = filter.agent !== undefined ? 'agentTick' : 'worldTick';
    const subject = filter.agent ?? filter.world;
    if (subject === undefined) throw new Error('An indexed subject is required.');
    const low = filter.tick ?? 0, high = filter.tick ?? Number.MAX_SAFE_INTEGER;
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readonly');
        const range = IDBKeyRange.bound([collection, subject, low, ''], [collection, subject, high, []], false, true);
        const cursor = tx.objectStore('items').index(indexName).openCursor(range, reverse ? 'prev' : 'next');
        const values: T[] = [];
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          try {
            const row = cursor.result.value as ItemRow;
            if (filter.world === undefined || row.world === filter.world) {
              const { collection: _collection, json: _json, bytes: _bytes, ...descriptor } = row;
              values.push(metadataOnly ? descriptor as T : JSON.parse(row.json) as T);
            }
            if (values.length < limit) cursor.result.continue();
          } catch { tx.abort(); }
        };
        tx.oncomplete = () => resolve(values);
        tx.onabort = () => reject(tx.error ?? new Error('Invalid indexed data.'));
      });
    } finally { db.close(); }
  }
  private async readItemCursor<R>(collection: string, after: string | undefined, limit: number, select: (row: ItemRow) => R): Promise<R[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid page size.');
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readonly');
        const range = IDBKeyRange.bound([collection, after ?? ''], [collection, []], after !== undefined, true);
        const cursor = tx.objectStore('items').openCursor(range);
        const values: R[] = [];
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          try {
            values.push(select(cursor.result.value as ItemRow));
            if (values.length < limit) cursor.result.continue();
          } catch { tx.abort(); }
        };
        tx.oncomplete = () => resolve(values);
        tx.onabort = () => reject(tx.error ?? new Error('Invalid collection data.'));
      });
    } finally { db.close(); }
  }
  async putItem(collection: string, id: string, value: unknown, metadata: ItemMetadata = {}): Promise<void> {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error('Application data must be JSON.');
    const bytes = new TextEncoder().encode(json).byteLength;
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['items', 'accounting'], 'readwrite');
        const items = tx.objectStore('items'), accounting = tx.objectStore('accounting');
        const usage = accounting.get('bytes');
        const previous = items.get([collection, id]);
        let failure: Error | undefined;
        previous.onsuccess = () => {
          try {
            const next = usage.result - (previous.result?.bytes ?? 0) + bytes;
            const limit = this.budget - Math.min(SECONDARY_RESERVE, this.budget / 10);
            if (!Number.isSafeInteger(next) || next < 0 || next > limit) {
              failure = new Error('Local data budget reached or accounting invalid. Existing data was preserved.');
              tx.abort(); return;
            }
            items.put({ collection, id, json, bytes, ...metadata, metadataVersion: 1 });
            accounting.put(next, 'bytes');
          } catch (error) { failure = error instanceof Error ? error : new Error('Collection write failed.'); tx.abort(); }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Collection write failed.'));
      });
    } finally { db.close(); }
  }
  /** Copy legacy arrays atomically; verify every copied payload before deleting the source. */
  async migrateItems<T>(collection: string, identify: (value: T, index: number) => string, metadata: (value: T) => ItemMetadata): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['records', 'items', 'accounting'], 'readwrite');
        const records = tx.objectStore('records'), items = tx.objectStore('items');
        const source = records.get(collection);
        let failure: Error | undefined;
        source.onsuccess = () => {
          try {
            const decoded = source.result ? JSON.parse(source.result.json) : [];
            if (decoded?.indexedCollection === 1) return;
            const values = decoded as T[];
            if (!Array.isArray(values)) throw new Error('Invalid legacy collection.');
            const ids = new Set<string>();
            let copiedBytes = 0;
            for (const [index, value] of values.entries()) {
              const id = identify(value, index);
              if (ids.has(id)) throw new Error('Duplicate legacy collection identity.');
              ids.add(id);
              const json = JSON.stringify(value), bytes = new TextEncoder().encode(json).byteLength;
              copiedBytes += bytes;
              // add refuses conflicting destinations; abort preserves the source.
              items.add({ collection, id, json, bytes, ...metadata(value), metadataVersion: 1 });
              const verify = items.get([collection, id]);
              verify.onsuccess = () => { if (verify.result?.json !== json) tx.abort(); };
            }
            const accounting = tx.objectStore('accounting');
            const usage = accounting.get('bytes');
            usage.onsuccess = () => {
              const next = usage.result - (source.result?.bytes ?? 0) + copiedBytes + INDEXED_MARKER_BYTES;
              if (!Number.isSafeInteger(next) || next < 0 || next > this.budget) { tx.abort(); return; }
              accounting.put(next, 'bytes');
              records.put({ key: collection, json: INDEXED_MARKER_JSON, bytes: INDEXED_MARKER_BYTES });
            };
          } catch (error) { failure = error instanceof Error ? error : new Error('Migration failed.'); tx.abort(); }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Migration failed; source preserved.'));
      });
    } finally { db.close(); }
  }
  /** Backfill lightweight descriptors from older v2 records once per collection. */
  async reindexItems<T>(collection: string, metadata: (value: T) => ItemMetadata): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['items', 'accounting'], 'readwrite');
        const accounting = tx.objectStore('accounting');
        const marker = `metadata:${collection}:1`;
        const ready = accounting.get(marker);
        let failure: Error | undefined;
        ready.onsuccess = () => {
          if (ready.result === true) return;
          const cursor = tx.objectStore('items').index('collection').openCursor(IDBKeyRange.only(collection));
          cursor.onsuccess = () => {
            if (!cursor.result) { accounting.put(true, marker); return; }
            const value = cursor.result.value as ItemRow;
            try {
              if (value.metadataVersion !== 1) cursor.result.update({ ...value, ...metadata(JSON.parse(value.json) as T), metadataVersion: 1 });
              cursor.result.continue();
            } catch (error) { failure = error instanceof Error ? error : new Error('Index upgrade failed.'); tx.abort(); }
          };
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Index upgrade failed; records preserved.'));
      });
    } finally { db.close(); }
  }
  async clearItems(collection: string): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['items', 'accounting'], 'readwrite');
        const accounting = tx.objectStore('accounting');
        const usage = accounting.get('bytes');
        const cursor = tx.objectStore('items').index('collection').openCursor(IDBKeyRange.only(collection));
        let removed = 0;
        cursor.onsuccess = () => {
          if (cursor.result) { removed += cursor.result.value.bytes; cursor.result.delete(); cursor.result.continue(); }
          else accounting.put(usage.result - removed, 'bytes');
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Collection removal failed.'));
      });
    } finally { db.close(); }
  }
  async read<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const request = tx.objectStore('records').get(key);
        let result: T | undefined;
        request.onsuccess = () => {
          try { result = request.result ? JSON.parse((request.result as DataRow).json) as T : undefined; }
          catch { tx.abort(); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? new Error('Stored application data is invalid.'));
      });
    } finally { db.close(); }
  }
  async write(key: string, value: unknown, options: { secondary?: boolean; onlyIfAbsent?: boolean } = {}): Promise<number> {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error('Application data must be JSON.');
    const bytes = new TextEncoder().encode(json).byteLength;
    return this.mutate(key, { key, json, bytes }, options);
  }
  async update<T>(key: string, change: (current: T | undefined) => T, secondary = false): Promise<number> {
    return this.mutate(key, undefined, { secondary }, current => change(current as T | undefined));
  }
  async remove(key: string): Promise<void> { await this.mutate(key); }
  private async mutate(key: string, row?: DataRow, options: { secondary?: boolean; onlyIfAbsent?: boolean } = {}, change?: (current: unknown) => unknown): Promise<number> {
    const db = await this.open();
    try {
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(['records', 'accounting'], 'readwrite');
        const store = tx.objectStore('records');
        const accounting = tx.objectStore('accounting');
        let total = 0;
        let failure: Error | undefined;
        const usage = accounting.get('bytes');
        const existing = store.get(key);
        existing.onsuccess = () => {
          const current = existing.result as DataRow | undefined;
          const previous = current?.bytes ?? 0;
          const exists = current !== undefined;
          const previousJson = current?.json;
          total = usage.result;
          if (!Number.isSafeInteger(total) || total < 0) {
            failure = new Error('Local storage accounting is invalid. Existing data was preserved.');
            tx.abort(); return;
          }
          if (options.onlyIfAbsent && exists) return;
          if (change) {
            try {
              const json = JSON.stringify(change(previousJson === undefined ? undefined : JSON.parse(previousJson)));
              if (json === undefined) throw new Error('Application data must be JSON.');
              row = { key, json, bytes: new TextEncoder().encode(json).byteLength };
            } catch (error) { failure = error instanceof Error ? error : new Error('Invalid data'); tx.abort(); return; }
          }
          const next = total - previous + (row?.bytes ?? 0);
          const limit = options.secondary ? Math.max(0, this.budget - Math.min(SECONDARY_RESERVE, this.budget / 10)) : this.budget;
          if (row && next > limit) {
            failure = new Error('Local data budget reached. Existing data was preserved; export or remove data before saving more.');
            tx.abort(); return;
          }
          try {
            if (row) store.put(row); else store.delete(key);
            accounting.put(next, 'bytes');
            total = next;
          } catch (error) { failure = error instanceof Error ? error : new Error('Local write failed.'); tx.abort(); }
        };
        tx.oncomplete = () => resolve(total);
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Local storage write failed. Existing data was preserved.'));
      });
    } finally { db.close(); }
  }
}
export const appData = new AppDataStore();
