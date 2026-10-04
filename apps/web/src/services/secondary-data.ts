import { formatIssue } from '../i18n/errors';
import type { AppIssue } from '@simagents/shared';
import { appData, type AppDataStore, type ItemMetadata, type ItemDescriptor } from './app-data';

let warning: AppIssue | undefined;
const flushers = new Set<() => Promise<unknown>>();
const pendingChecks = new Set<() => boolean>();
export const flushSecondaryData = () => Promise.all([...flushers].map(flush => flush()));
export const hasPendingSecondaryWrites = () => [...pendingChecks].some(check => check());
const listeners = new Set<() => void>();
export const getSecondaryWarning = () => warning ? formatIssue(warning) : '';
export const subscribeSecondaryWarning = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function reportSecondaryFailure(error: unknown): void {
  warning = { code: 'COLLECTION_PAUSED' };
  for (const listener of listeners) listener();
}
export function resumeSecondaryCollection(): void {
  warning = undefined;
  for (const listener of listeners) listener();
}

/** Queue lifecycle operations as well as writes; reset cannot race an older append. */
export class StoredCollection<T> {
  private pending = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly key: string, private readonly decodeLegacy: (value: unknown) => T[], private readonly storage: AppDataStore = appData) {
    flushers.add(() => this.queue);
    pendingChecks.add(() => this.pending > 0);
  }
  private serial<R>(operation: () => Promise<R>): Promise<R> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async migrate(): Promise<void> {
    const source = localStorage.getItem(this.key);
    if (source === null) return;
    if (await this.storage.read(this.key) !== undefined) return;
    const values = this.decodeLegacy(JSON.parse(source));
    // Failed validation/write leaves the source untouched. Concurrent writers win.
    await this.storage.write(this.key, values, { onlyIfAbsent: true, secondary: true });
    if (JSON.stringify(await this.storage.read(this.key)) === JSON.stringify(values) && localStorage.getItem(this.key) === source) localStorage.removeItem(this.key);
  }
  load(): Promise<T[]> {
    return this.serial(async () => { await this.migrate(); return await this.storage.read<T[]>(this.key) ?? []; });
  }
  update(change: (values: T[]) => T[], collect = true): Promise<void> {
    if (collect && warning) return Promise.resolve();
    if (collect && this.pending >= 64) {
      reportSecondaryFailure(new Error('Storage cannot keep up with collection.'));
      return Promise.resolve();
    }
    this.pending++;
    return this.serial(async () => {
      if (collect && warning) { this.pending--; return; }
      try {
        await this.migrate();
        await this.storage.update<T[]>(this.key, values => change(values ?? []), true);
      } catch (error) { reportSecondaryFailure(error); throw error; }
      finally { this.pending--; }
    });
  }
  clear(): Promise<void> {
    return this.serial(async () => {
      await this.storage.remove(this.key);
      localStorage.removeItem(this.key);
      resumeSecondaryCollection();
    });
  }
}
export function legacyArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  if (!Array.isArray(value) || !value.every(guard)) throw new Error('Invalid legacy data; migration was cancelled.');
  return value;
}

/** Secondary records append independently; legacy arrays are copied once. */
export class IndexedCollection<T> {
  private readonly legacy: StoredCollection<T>;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private prepared: Promise<void> | undefined;
  private preparedFactory: IDBFactory | undefined;
  constructor(readonly key: string, decodeLegacy: (value: unknown) => T[],
    private readonly identify: (value: T, index: number) => string,
    private readonly metadata: (value: T) => ItemMetadata = () => ({}),
    private readonly storage: AppDataStore = appData) {
    this.legacy = new StoredCollection(key, decodeLegacy, storage);
    flushers.add(() => this.queue);
    pendingChecks.add(() => this.pending > 0);
  }
  private serial<R>(operation: () => Promise<R>): Promise<R> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private migrate(): Promise<void> {
    if (this.preparedFactory !== indexedDB) { this.prepared = undefined; this.preparedFactory = indexedDB; }
    if (!this.prepared) {
      this.prepared = (async () => {
        await this.legacy.load();
        await this.storage.migrateItems(this.key, this.identify, this.metadata);
        await this.storage.reindexItems(this.key, this.metadata);
      })().catch(error => { this.prepared = undefined; throw error; });
    }
    return this.prepared;
  }
  item(id: string): Promise<T | undefined> {
    return this.serial(async () => { await this.migrate(); return this.storage.item<T>(this.key, id); });
  }
  query(filter: { world?: string; agent?: string; tick?: number }, limit = 100, reverse = false): Promise<T[]> {
    return this.serial(async () => { await this.migrate(); return this.storage.query<T>(this.key, filter, limit, reverse); });
  }
  queryDescriptors(filter: { world?: string; agent?: string; tick?: number }, limit = 100, reverse = false): Promise<ItemDescriptor[]> {
    return this.serial(async () => { await this.migrate(); return this.storage.query<ItemDescriptor>(this.key, filter, limit, reverse, true); });
  }
  descriptors(): Promise<ItemDescriptor[]> {
    return this.serial(async () => {
      await this.migrate();
      const values: ItemDescriptor[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await this.storage.metadataPage(this.key, after);
        values.push(...page);
        if (page.length < 100) return values;
        after = page[page.length - 1].id;
      }
    });
  }
  page(after?: string, limit = 100): Promise<Array<{ id: string; value: T }>> {
    return this.serial(async () => { await this.migrate(); return this.storage.page<T>(this.key, after, limit); });
  }
  load(): Promise<T[]> {
    return this.serial(async () => {
      await this.migrate();
      const values: T[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await this.storage.page<T>(this.key, after);
        values.push(...page.map(row => row.value));
        if (page.length < 100) return values;
        after = page[page.length - 1].id;
      }
    });
  }
  put(value: T, collect = true): Promise<void> {
    if (collect && warning) return Promise.resolve();
    if (collect && this.pending >= 64) {
      reportSecondaryFailure(new Error('Storage cannot keep up with collection.'));
      return Promise.resolve();
    }
    this.pending++;
    return this.serial(async () => {
      try {
        if (collect && warning) return;
        await this.migrate();
        await this.storage.putItem(this.key, this.identify(value, 0), value, this.metadata(value));
      } catch (error) { reportSecondaryFailure(error); throw error; }
      finally { this.pending--; }
    });
  }
  clear(): Promise<void> {
    return this.serial(async () => {
      await this.storage.clearItems(this.key);
      await this.legacy.clear();
      this.prepared = undefined;
    });
  }
}
