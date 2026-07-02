/**
 * Stigmergy (scent) system — in-memory implementation.
 *
 * Signature-compatible with `world/scent.ts`, but the Redis TTL keys are
 * replaced by an in-memory Map. Real-time TTL does not map to a single-threaded
 * deterministic sim, so scents are stored with the tick they were placed and
 * expire lazily by tick age (the caller gauges freshness via
 * `calculateScentStrength`). A scent older than `scentDurationTicks` is dropped.
 */

import { CONFIG } from '../config';
import { store } from './store';

interface ScentData {
  agentId: string;
  tick: number;
  strength: number;
}

const key = (x: number, y: number) => `${x}:${y}`;

export async function leaveScent(x: number, y: number, agentId: string, currentTick: number): Promise<void> {
  const scentDuration = CONFIG.actions.move.scentDurationTicks;
  if (scentDuration <= 0) return;
  store.scents.set(key(x, y), { agentId, tick: currentTick, strength: 100 });
}

export async function getScentsAt(
  locations: { x: number; y: number }[]
): Promise<Array<ScentData & { x: number; y: number }>> {
  if (locations.length === 0) return [];
  const maxAge = CONFIG.actions.move.scentDurationTicks;
  const currentTick = store.worldState.currentTick;
  const results: Array<ScentData & { x: number; y: number }> = [];

  for (const loc of locations) {
    const k = key(loc.x, loc.y);
    const data = store.scents.get(k);
    if (!data) continue;
    // Lazy expiry: drop scents older than their duration.
    if (maxAge > 0 && currentTick - data.tick >= maxAge) {
      store.scents.delete(k);
      continue;
    }
    results.push({ ...data, x: loc.x, y: loc.y });
  }

  return results;
}

export async function clearAllScents(): Promise<void> {
  store.scents.clear();
}

/** Pure — identical to the Redis-backed version. */
export function calculateScentStrength(
  scentTick: number,
  currentTick: number
): 'strong' | 'weak' | 'faint' {
  const age = currentTick - scentTick;
  const maxAge = CONFIG.actions.move.scentDurationTicks;
  if (maxAge <= 0) return 'faint';
  if (age < 0) return 'faint';
  if (age < maxAge * 0.3) return 'strong';
  if (age < maxAge * 0.7) return 'weak';
  return 'faint';
}
