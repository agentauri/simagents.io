import type {
  EngineClientStatus,
  EngineSnapshotPayload,
} from '../engine-host/engine-client';
import type { getEngineClient } from '../engine-host/engine-client';
import type { WorldEvent } from '../stores/world';
import type { WorldSnapshotV1 } from '@simagents/engine/engine/persistence';

export const WORLD_SNAPSHOT_KEY = 'simagents_world_snapshot';
export const EVENT_RING_KEY = 'simagents_event_ring';

const EVENT_RING_LIMIT = 1000;
const APPROX_LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

type EngineClient = ReturnType<typeof getEngineClient>;

export interface SavedWorld {
  snapshot: WorldSnapshotV1;
  events: WorldEvent[];
}

export interface WorldExportFile {
  snapshot: WorldSnapshotV1;
  events: WorldEvent[];
}

export interface PersistenceInfo {
  snapshotBytes: number;
  ringBytes: number;
  quotaFraction: number;
  lastSavedSimTimeMs?: number;
  lastSavedTick?: number;
  lastSavedAt?: number;
  warning?: string;
  disabled: boolean;
}

type PersistenceListener = (info: PersistenceInfo) => void;

let latestPayload: EngineSnapshotPayload | undefined;
let latestSnapshotJson: string | undefined;
let latestRingJson: string | undefined;
let persistenceDisabled = false;
let activeCleanup: (() => void) | undefined;
let activeClient: EngineClient | undefined;
const listeners = new Set<PersistenceListener>();

let info: PersistenceInfo = readInitialInfo();

export function startPersistenceSync(client: EngineClient): () => void {
  if (activeCleanup) return activeCleanup;
  activeClient = client;

  const unsubscribeSnapshot = client.onSnapshot((payload) => {
    persistSnapshotPayload(payload);
  });
  const unsubscribeWarning = client.onWarning((message) => {
    setPersistenceWarning(message);
  });
  const unsubscribeStatus = client.onStatus((status: EngineClientStatus) => {
    activeClient = status === 'disconnected' ? undefined : client;
  });
  const handleBeforeUnload = () => {
    // An async worker round-trip cannot complete during teardown, so the real
    // save is the synchronous persist of the latest cached snapshot (at most
    // ~10s stale; pause always forces a fresh one).
    persistLatestCachedSnapshot();
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  activeCleanup = () => {
    unsubscribeSnapshot();
    unsubscribeWarning();
    unsubscribeStatus();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    activeCleanup = undefined;
    activeClient = undefined;
  };
  return activeCleanup;
}

export function loadSavedWorld(): SavedWorld | undefined {
  const snapshotJson = localStorage.getItem(WORLD_SNAPSHOT_KEY);
  if (!snapshotJson) return undefined;

  try {
    const snapshot = JSON.parse(snapshotJson) as unknown;
    if (!isWorldSnapshotV1(snapshot)) {
      clearSavedWorld();
      setPersistenceWarning('Saved world could not be loaded and was cleared.');
      return undefined;
    }

    const eventsJson = localStorage.getItem(EVENT_RING_KEY);
    const events = eventsJson ? parseEventRing(eventsJson) : [];
    latestPayload = { snapshot, recentEvents: events };
    latestSnapshotJson = snapshotJson;
    latestRingJson = eventsJson ?? JSON.stringify([]);
    updateInfoFromJson(snapshot, latestSnapshotJson, latestRingJson);
    return { snapshot, events };
  } catch {
    clearSavedWorld();
    setPersistenceWarning('Saved world data was corrupt and was cleared.');
    return undefined;
  }
}

export function saveImportedWorld(file: WorldExportFile): SavedWorld {
  if (!isWorldSnapshotV1(file.snapshot)) {
    throw new Error('Imported file does not contain a supported world snapshot.');
  }
  if (!Array.isArray(file.events) || !file.events.every(isWorldEvent)) {
    throw new Error('Imported file does not contain a valid event log.');
  }

  persistenceDisabled = false;
  const ring = normalizeEventRing(file.events);
  const payload = { snapshot: file.snapshot, recentEvents: ring };
  persistSnapshotPayload(payload, { force: true });
  return { snapshot: file.snapshot, events: ring };
}

export function clearSavedWorld(): void {
  localStorage.removeItem(WORLD_SNAPSHOT_KEY);
  localStorage.removeItem(EVENT_RING_KEY);
  latestPayload = undefined;
  latestSnapshotJson = undefined;
  latestRingJson = undefined;
  persistenceDisabled = false;
  info = {
    snapshotBytes: 0,
    ringBytes: 0,
    quotaFraction: 0,
    disabled: false,
  };
  emitInfo();
}

export function persistSnapshotPayload(
  payload: EngineSnapshotPayload,
  options: { force?: boolean } = {}
): void {
  if (persistenceDisabled && !options.force) return;

  latestPayload = {
    snapshot: payload.snapshot,
    recentEvents: normalizeEventRing(payload.recentEvents),
  };
  latestSnapshotJson = JSON.stringify(latestPayload.snapshot);
  latestRingJson = JSON.stringify(latestPayload.recentEvents);
  persistLatestCachedSnapshot();
}

export function persistLatestCachedSnapshot(): void {
  if (!latestPayload || !latestSnapshotJson || persistenceDisabled) return;

  try {
    // Snapshot first: it is the essential artifact. Writing the (larger) ring
    // afterwards means quota pressure hits the expendable key, not the world.
    localStorage.setItem(WORLD_SNAPSHOT_KEY, latestSnapshotJson);
    if (latestRingJson) localStorage.setItem(EVENT_RING_KEY, latestRingJson);
    updateInfoFromJson(latestPayload.snapshot, latestSnapshotJson, latestRingJson ?? '');
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
    localStorage.removeItem(EVENT_RING_KEY);
    try {
      localStorage.setItem(WORLD_SNAPSHOT_KEY, latestSnapshotJson);
      updateInfoFromJson(latestPayload.snapshot, latestSnapshotJson, '');
      setPersistenceWarning('Event ring dropped because localStorage is near its quota.');
    } catch (retryError) {
      if (!isQuotaExceeded(retryError)) throw retryError;
      persistenceDisabled = true;
      info = {
        ...info,
        snapshotBytes: byteLength(latestSnapshotJson),
        ringBytes: 0,
        quotaFraction: Math.min(1, byteLength(latestSnapshotJson) / APPROX_LOCAL_STORAGE_QUOTA_BYTES),
        warning: 'World snapshot is too large for localStorage; persistence is paused.',
        disabled: true,
      };
      emitInfo();
    }
  }
}

export function getPersistenceInfo(): PersistenceInfo {
  return info;
}

export function subscribePersistenceInfo(listener: PersistenceListener): () => void {
  listeners.add(listener);
  listener(info);
  return () => listeners.delete(listener);
}

export function parseWorldExportFile(input: unknown): WorldExportFile {
  if (!input || typeof input !== 'object') {
    throw new Error('Imported file must be a JSON object.');
  }
  const candidate = input as Partial<WorldExportFile>;
  if (!isWorldSnapshotV1(candidate.snapshot)) {
    throw new Error('Imported file has an unsupported snapshot schema.');
  }
  if (!Array.isArray(candidate.events) || !candidate.events.every(isWorldEvent)) {
    throw new Error('Imported file events are invalid.');
  }
  return {
    snapshot: candidate.snapshot,
    events: candidate.events,
  };
}

export function downloadWorldExport(file: WorldExportFile): void {
  const tick = file.snapshot.store.worldState.currentTick;
  const suffix = typeof tick === 'number' ? tick : file.snapshot.savedAtSimTimeMs;
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `simagents-world-${suffix}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function readInitialInfo(): PersistenceInfo {
  const snapshotJson = localStorage.getItem(WORLD_SNAPSHOT_KEY) ?? '';
  const ringJson = localStorage.getItem(EVENT_RING_KEY) ?? '';
  return {
    snapshotBytes: byteLength(snapshotJson),
    ringBytes: byteLength(ringJson),
    quotaFraction: Math.min(
      1,
      (byteLength(snapshotJson) + byteLength(ringJson)) / APPROX_LOCAL_STORAGE_QUOTA_BYTES
    ),
    disabled: false,
  };
}

function updateInfoFromJson(snapshot: WorldSnapshotV1, snapshotJson: string, ringJson: string): void {
  const snapshotBytes = byteLength(snapshotJson);
  const ringBytes = byteLength(ringJson);
  info = {
    snapshotBytes,
    ringBytes,
    quotaFraction: Math.min(
      1,
      (snapshotBytes + ringBytes) / APPROX_LOCAL_STORAGE_QUOTA_BYTES
    ),
    lastSavedSimTimeMs: snapshot.savedAtSimTimeMs,
    lastSavedTick: snapshot.store.worldState.currentTick as number | undefined,
    lastSavedAt: Date.now(),
    warning: undefined,
    disabled: false,
  };
  emitInfo();
}

function setPersistenceWarning(warning: string): void {
  info = { ...info, warning };
  emitInfo();
}

function emitInfo(): void {
  for (const listener of listeners) listener(info);
}

function parseEventRing(json: string): WorldEvent[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return [];
  return normalizeEventRing(parsed.filter(isWorldEvent));
}

function normalizeEventRing(events: WorldEvent[]): WorldEvent[] {
  return [...events]
    .sort((a, b) => b.timestamp - a.timestamp || b.tick - a.tick)
    .slice(0, EVENT_RING_LIMIT);
}

function isWorldSnapshotV1(value: unknown): value is WorldSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<WorldSnapshotV1>;
  return (
    snapshot.schemaVersion === 1 &&
    typeof snapshot.savedAtSimTimeMs === 'number' &&
    Number.isFinite(snapshot.savedAtSimTimeMs) &&
    typeof snapshot.worldSeed === 'string' &&
    typeof snapshot.speed === 'number' &&
    Number.isFinite(snapshot.speed) &&
    !!snapshot.store &&
    typeof snapshot.store === 'object' &&
    !!snapshot.engine &&
    typeof snapshot.engine === 'object'
  );
}

function isWorldEvent(value: unknown): value is WorldEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<WorldEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.type === 'string' &&
    typeof event.tick === 'number' &&
    Number.isFinite(event.tick) &&
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) &&
    (!('agentId' in event) || event.agentId === undefined || typeof event.agentId === 'string') &&
    !!event.payload &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}
