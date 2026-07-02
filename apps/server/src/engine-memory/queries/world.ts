/**
 * World state queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/world.ts`.
 */

import { v4 as uuid } from 'uuid';
import type {
  WorldState,
  Shelter,
  NewShelter,
  ResourceSpawn,
  NewResourceSpawn,
} from '../../db/schema';
import { store } from '../store';

// =============================================================================
// WORLD STATE
// =============================================================================

export async function getWorldState(): Promise<WorldState | undefined> {
  return store.worldState;
}

export async function initWorldState(): Promise<WorldState> {
  return store.worldState;
}

export async function incrementTick(): Promise<WorldState> {
  store.worldState = {
    ...store.worldState,
    currentTick: store.worldState.currentTick + 1,
    lastTickAt: new Date(),
  };
  return store.worldState;
}

export async function getCurrentTick(): Promise<number> {
  return store.worldState.currentTick;
}

export async function pauseWorld(): Promise<void> {
  store.worldState = { ...store.worldState, isPaused: true };
}

export async function resumeWorld(): Promise<void> {
  store.worldState = { ...store.worldState, isPaused: false };
}

// =============================================================================
// SHELTERS
// =============================================================================

export async function getAllShelters(): Promise<Shelter[]> {
  return [...store.shelters.values()];
}

export async function getShelterById(id: string): Promise<Shelter | undefined> {
  return store.shelters.get(id);
}

export async function getSheltersAtPosition(x: number, y: number): Promise<Shelter[]> {
  return [...store.shelters.values()].filter((s) => s.x === x && s.y === y);
}

export async function createShelter(shelter: NewShelter): Promise<Shelter> {
  const full: Shelter = {
    id: shelter.id ?? uuid(),
    tenantId: shelter.tenantId ?? null,
    x: shelter.x,
    y: shelter.y,
    canSleep: shelter.canSleep ?? true,
    ownerAgentId: shelter.ownerAgentId ?? null,
    createdAt: shelter.createdAt ?? new Date(),
  };
  store.shelters.set(full.id, full);
  return full;
}

export const getAllLocations = getAllShelters;
export const getLocationById = getShelterById;
export const getLocationsAtPosition = getSheltersAtPosition;
export const createLocation = createShelter;

// =============================================================================
// RESOURCE SPAWNS
// =============================================================================

export async function getAllResourceSpawns(): Promise<ResourceSpawn[]> {
  return [...store.resourceSpawns.values()];
}

export async function getResourceSpawnsAtPosition(x: number, y: number): Promise<ResourceSpawn[]> {
  return [...store.resourceSpawns.values()].filter((s) => s.x === x && s.y === y);
}

export async function getResourceSpawnsByType(resourceType: string): Promise<ResourceSpawn[]> {
  return [...store.resourceSpawns.values()].filter((s) => s.resourceType === resourceType);
}

export async function createResourceSpawn(spawn: NewResourceSpawn): Promise<ResourceSpawn> {
  const full: ResourceSpawn = {
    id: spawn.id ?? uuid(),
    tenantId: spawn.tenantId ?? null,
    x: spawn.x,
    y: spawn.y,
    biome: spawn.biome ?? 'plains',
    resourceType: spawn.resourceType,
    maxAmount: spawn.maxAmount ?? 10,
    currentAmount: spawn.currentAmount ?? 10,
    regenRate: spawn.regenRate ?? 0.5,
    discovered: spawn.discovered ?? true,
    createdAt: spawn.createdAt ?? new Date(),
  };
  store.resourceSpawns.set(full.id, full);
  return full;
}

export async function updateResourceSpawn(
  id: string,
  updates: Partial<Pick<ResourceSpawn, 'currentAmount' | 'maxAmount' | 'regenRate'>>
): Promise<ResourceSpawn | undefined> {
  const spawn = store.resourceSpawns.get(id);
  if (!spawn) return undefined;
  const updated = { ...spawn, ...updates };
  store.resourceSpawns.set(id, updated);
  return updated;
}

export async function harvestResource(spawnId: string, amount: number): Promise<number> {
  const spawn = store.resourceSpawns.get(spawnId);
  if (!spawn || spawn.currentAmount <= 0) return 0;
  const actualAmount = Math.min(amount, spawn.currentAmount);
  store.resourceSpawns.set(spawnId, { ...spawn, currentAmount: spawn.currentAmount - actualAmount });
  return actualAmount;
}

export async function regenerateResources(seasonalMultipliers?: {
  food: number;
  energy: number;
  material: number;
}): Promise<void> {
  for (const [id, spawn] of store.resourceSpawns) {
    if (spawn.currentAmount >= spawn.maxAmount) continue;
    const multiplier = seasonalMultipliers
      ? (seasonalMultipliers as Record<string, number>)[spawn.resourceType] ?? 1.0
      : 1.0;
    const next = Math.min(spawn.maxAmount, spawn.currentAmount + spawn.regenRate * multiplier);
    store.resourceSpawns.set(id, { ...spawn, currentAmount: next });
  }
}

// Resource depletion tracking (in-memory, identical algorithm to the DB version).
const depletionState = new Map<string, { consecutiveZeroTicks: number; originalMaxAmount: number }>();

export async function applyResourceDepletion(config: {
  depletionThresholdTicks: number;
  degradationRate: number;
  minCapacityFraction: number;
  recoveryRatePerTick: number;
}): Promise<void> {
  const spawns = await getAllResourceSpawns();
  for (const spawn of spawns) {
    let state = depletionState.get(spawn.id);
    if (!state) {
      state = { consecutiveZeroTicks: 0, originalMaxAmount: spawn.maxAmount };
      depletionState.set(spawn.id, state);
    }

    if (spawn.currentAmount <= 0) {
      state.consecutiveZeroTicks++;
      if (state.consecutiveZeroTicks >= config.depletionThresholdTicks) {
        const minCapacity = Math.max(1, Math.floor(state.originalMaxAmount * config.minCapacityFraction));
        const newMax = Math.max(minCapacity, Math.floor(spawn.maxAmount * (1 - config.degradationRate)));
        if (newMax < spawn.maxAmount) await updateResourceSpawn(spawn.id, { maxAmount: newMax });
        state.consecutiveZeroTicks = 0;
      }
    } else {
      state.consecutiveZeroTicks = 0;
      if (spawn.maxAmount < state.originalMaxAmount) {
        const recovery = Math.ceil(state.originalMaxAmount * config.recoveryRatePerTick);
        const newMax = Math.min(state.originalMaxAmount, spawn.maxAmount + recovery);
        if (newMax > spawn.maxAmount) await updateResourceSpawn(spawn.id, { maxAmount: newMax });
      }
    }
  }

  const spawnIds = new Set(spawns.map((s) => s.id));
  for (const key of depletionState.keys()) {
    if (!spawnIds.has(key)) depletionState.delete(key);
  }
}

export function resetDepletionState(): void {
  depletionState.clear();
}

// =============================================================================
// RESET
// =============================================================================

export async function deleteAllShelters(): Promise<void> {
  store.shelters.clear();
}

export async function deleteAllResourceSpawns(): Promise<void> {
  store.resourceSpawns.clear();
}

export async function resetTickCounter(): Promise<void> {
  store.worldState = { ...store.worldState, currentTick: 0, startedAt: new Date(), lastTickAt: null };
}
