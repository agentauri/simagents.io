/**
 * Naming queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/naming.ts`. Backed by
 * `store.locationNames` (Map keyed by id). Mirrors the consensus-by-usage logic.
 */

import { v4 as uuid } from 'uuid';
import type { LocationName } from '../../db/schema';
import { store } from '../store';

export interface CreateNameInput {
  x: number;
  y: number;
  name: string;
  namedByAgentId: string;
  tick: number;
}

export interface LocationNameInfo {
  name: string;
  namedBy: string;
  usageCount: number;
  namedAtTick: number;
  isConsensus: boolean;
}

export async function proposeLocationName(input: CreateNameInput): Promise<LocationName> {
  const existing = await getNameAtPosition(input.x, input.y, input.name);
  if (existing) {
    const updated: LocationName = {
      ...existing,
      usageCount: existing.usageCount + 1,
      updatedAt: new Date(),
    };
    store.locationNames.set(existing.id, updated);
    return updated;
  }

  const created: LocationName = {
    id: uuid(),
    tenantId: null,
    x: input.x,
    y: input.y,
    name: input.name,
    namedByAgentId: input.namedByAgentId,
    usageCount: 1,
    namedAtTick: input.tick,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.locationNames.set(created.id, created);
  return created;
}

export async function getNameAtPosition(
  x: number,
  y: number,
  name: string
): Promise<LocationName | null> {
  for (const n of store.locationNames.values()) {
    if (n.x === x && n.y === y && n.name === name) return n;
  }
  return null;
}

export async function getNamesForLocation(x: number, y: number): Promise<LocationName[]> {
  return [...store.locationNames.values()]
    .filter((n) => n.x === x && n.y === y)
    .sort((a, b) => b.usageCount - a.usageCount);
}

export async function getConsensusName(x: number, y: number): Promise<LocationName | null> {
  const [name] = await getNamesForLocation(x, y);
  return name ?? null;
}

export async function getNamesProposedBy(agentId: string): Promise<LocationName[]> {
  return [...store.locationNames.values()]
    .filter((n) => n.namedByAgentId === agentId)
    .sort((a, b) => b.usageCount - a.usageCount);
}

export async function incrementNameUsage(nameId: string): Promise<LocationName> {
  const existing = store.locationNames.get(nameId)!;
  const updated: LocationName = { ...existing, usageCount: existing.usageCount + 1, updatedAt: new Date() };
  store.locationNames.set(nameId, updated);
  return updated;
}

export async function recordNameUsage(
  x: number,
  y: number,
  name: string,
  usedByAgentId: string,
  tick: number
): Promise<LocationName> {
  const existing = await getNameAtPosition(x, y, name);
  if (existing) return incrementNameUsage(existing.id);
  return proposeLocationName({ x, y, name, namedByAgentId: usedByAgentId, tick });
}

export async function getAllNamedLocations(): Promise<
  { x: number; y: number; consensusName: string; usageCount: number }[]
> {
  const ordered = [...store.locationNames.values()].sort((a, b) => b.usageCount - a.usageCount);
  const byPosition = new Map<string, { x: number; y: number; consensusName: string; usageCount: number }>();
  for (const row of ordered) {
    const key = `${row.x},${row.y}`;
    if (!byPosition.has(key)) {
      byPosition.set(key, { x: row.x, y: row.y, consensusName: row.name, usageCount: row.usageCount });
    }
  }
  return [...byPosition.values()];
}

export async function getLocationNamesForObserver(x: number, y: number): Promise<LocationNameInfo[]> {
  const names = await getNamesForLocation(x, y);
  if (names.length === 0) return [];
  const maxUsage = names[0].usageCount;
  return names.map((n) => ({
    name: n.name,
    namedBy: n.namedByAgentId,
    usageCount: n.usageCount,
    namedAtTick: n.namedAtTick,
    isConsensus: n.usageCount === maxUsage,
  }));
}

export async function getNearbyNamedLocations(
  x: number,
  y: number,
  radius: number = 5
): Promise<{ x: number; y: number; name: string; usageCount: number }[]> {
  const ordered = [...store.locationNames.values()]
    .filter((n) => n.x >= x - radius && n.x <= x + radius && n.y >= y - radius && n.y <= y + radius)
    .sort((a, b) => b.usageCount - a.usageCount);
  const byPosition = new Map<string, { x: number; y: number; name: string; usageCount: number }>();
  for (const row of ordered) {
    const key = `${row.x},${row.y}`;
    if (!byPosition.has(key)) {
      byPosition.set(key, { x: row.x, y: row.y, name: row.name, usageCount: row.usageCount });
    }
  }
  return [...byPosition.values()];
}

export async function getNamingSummary(): Promise<{
  totalNamedLocations: number;
  totalNames: number;
  avgNamesPerLocation: number;
  topNamingAgents: { agentId: string; count: number }[];
}> {
  const all = [...store.locationNames.values()];
  const uniquePositions = new Set(all.map((n) => `${n.x},${n.y}`));
  const totalNamedLocations = uniquePositions.size;
  const totalNames = all.length;

  const counts = new Map<string, number>();
  for (const n of all) counts.set(n.namedByAgentId, (counts.get(n.namedByAgentId) ?? 0) + 1);
  const topNamingAgents = [...counts.entries()]
    .map(([agentId, count]) => ({ agentId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalNamedLocations,
    totalNames,
    avgNamesPerLocation: totalNamedLocations > 0 ? totalNames / totalNamedLocations : 0,
    topNamingAgents,
  };
}
