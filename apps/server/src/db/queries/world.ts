/**
 * World state queries
 */

import { eq, and, sql } from 'drizzle-orm';
import {
  db,
  worldState,
  shelters,
  resourceSpawns,
  agents,
  events,
  inventory,
  ledger,
  type WorldState,
  type Shelter,
  type NewShelter,
  type ResourceSpawn,
  type NewResourceSpawn,
} from '../index';
import { clearAllPuzzles } from './puzzles';

const WORLD_STATE_ID = 1;

export async function getWorldState(): Promise<WorldState | undefined> {
  const result = await db.select().from(worldState).where(eq(worldState.id, WORLD_STATE_ID)).limit(1);
  return result[0];
}

export async function initWorldState(): Promise<WorldState> {
  const existing = await getWorldState();
  if (existing) return existing;

  const result = await db
    .insert(worldState)
    .values({ id: WORLD_STATE_ID, currentTick: 0 })
    .returning();
  return result[0];
}

export async function incrementTick(): Promise<WorldState> {
  const result = await db
    .update(worldState)
    .set({
      currentTick: sql`${worldState.currentTick} + 1`,
      lastTickAt: new Date(),
    })
    .where(eq(worldState.id, WORLD_STATE_ID))
    .returning();
  return result[0];
}

export async function getCurrentTick(): Promise<number> {
  const state = await getWorldState();
  return state?.currentTick ?? 0;
}

export async function pauseWorld(): Promise<void> {
  await db.update(worldState).set({ isPaused: true }).where(eq(worldState.id, WORLD_STATE_ID));
}

export async function resumeWorld(): Promise<void> {
  await db.update(worldState).set({ isPaused: false }).where(eq(worldState.id, WORLD_STATE_ID));
}

// =============================================================================
// SHELTERS (Generic structures)
// =============================================================================

export async function getAllShelters(): Promise<Shelter[]> {
  return db.select().from(shelters);
}

export async function getShelterById(id: string): Promise<Shelter | undefined> {
  const result = await db.select().from(shelters).where(eq(shelters.id, id)).limit(1);
  return result[0];
}

export async function getSheltersAtPosition(x: number, y: number): Promise<Shelter[]> {
  return db.select().from(shelters).where(and(eq(shelters.x, x), eq(shelters.y, y)));
}

export async function createShelter(shelter: NewShelter): Promise<Shelter> {
  const result = await db.insert(shelters).values(shelter).returning();
  return result[0];
}

// Backwards compatibility aliases
export const getAllLocations = getAllShelters;
export const getLocationById = getShelterById;
export const getLocationsAtPosition = getSheltersAtPosition;
export const createLocation = createShelter;

// =============================================================================
// RESOURCE SPAWNS (Sugarscape-style resources)
// =============================================================================

export async function getAllResourceSpawns(): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns);
}

export async function getResourceSpawnsAtPosition(x: number, y: number): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns).where(and(eq(resourceSpawns.x, x), eq(resourceSpawns.y, y)));
}

export async function getResourceSpawnsByType(resourceType: string): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns).where(eq(resourceSpawns.resourceType, resourceType));
}

export async function createResourceSpawn(spawn: NewResourceSpawn): Promise<ResourceSpawn> {
  const result = await db.insert(resourceSpawns).values(spawn).returning();
  return result[0];
}

/**
 * Update a resource spawn (for shocks and other modifications)
 */
export async function updateResourceSpawn(
  id: string,
  updates: Partial<Pick<ResourceSpawn, 'currentAmount' | 'maxAmount' | 'regenRate'>>
): Promise<ResourceSpawn | undefined> {
  const result = await db
    .update(resourceSpawns)
    .set(updates)
    .where(eq(resourceSpawns.id, id))
    .returning();
  return result[0];
}

/**
 * Harvest resource from spawn point
 * Returns the amount actually harvested (may be less if not enough available)
 */
export async function harvestResource(spawnId: string, amount: number): Promise<number> {
  const spawn = await db.select().from(resourceSpawns).where(eq(resourceSpawns.id, spawnId)).limit(1);
  if (!spawn[0] || spawn[0].currentAmount <= 0) return 0;

  const actualAmount = Math.min(amount, spawn[0].currentAmount);
  await db
    .update(resourceSpawns)
    .set({ currentAmount: spawn[0].currentAmount - actualAmount })
    .where(eq(resourceSpawns.id, spawnId));

  return actualAmount;
}

/**
 * Regenerate resources at all spawn points (called each tick)
 */
export async function regenerateResources(seasonalMultipliers?: {
  food: number;
  energy: number;
  material: number;
}): Promise<void> {
  if (seasonalMultipliers) {
    // Apply per-resource-type seasonal multipliers to regen rate
    await db.execute(sql`
      UPDATE resource_spawns
      SET current_amount = LEAST(
        current_amount + regen_rate * CASE resource_type
          WHEN 'food' THEN ${seasonalMultipliers.food}
          WHEN 'energy' THEN ${seasonalMultipliers.energy}
          WHEN 'material' THEN ${seasonalMultipliers.material}
          ELSE 1.0
        END,
        max_amount
      )
      WHERE current_amount < max_amount
    `);
  } else {
    await db.execute(sql`
      UPDATE resource_spawns
      SET current_amount = LEAST(current_amount + regen_rate, max_amount)
      WHERE current_amount < max_amount
    `);
  }
}

/**
 * Resource depletion tracking (in-memory).
 * Tracks consecutive ticks at zero for over-harvest degradation.
 */
const depletionState = new Map<string, {
  consecutiveZeroTicks: number;
  originalMaxAmount: number;
}>();

/**
 * Apply resource depletion: spawns at zero for too long lose max capacity.
 * Also applies slow recovery when spawn is not being actively harvested.
 */
export async function applyResourceDepletion(config: {
  depletionThresholdTicks: number;
  degradationRate: number;
  minCapacityFraction: number;
  recoveryRatePerTick: number;
}): Promise<void> {
  const spawns = await getAllResourceSpawns();
  const pendingUpdates: Array<{ id: string; newMax: number }> = [];

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
        if (newMax < spawn.maxAmount) pendingUpdates.push({ id: spawn.id, newMax });
        state.consecutiveZeroTicks = 0;
      }
    } else {
      state.consecutiveZeroTicks = 0;

      if (spawn.maxAmount < state.originalMaxAmount) {
        const recovery = Math.ceil(state.originalMaxAmount * config.recoveryRatePerTick);
        const newMax = Math.min(state.originalMaxAmount, spawn.maxAmount + recovery);
        if (newMax > spawn.maxAmount) pendingUpdates.push({ id: spawn.id, newMax });
      }
    }
  }

  // Prune entries for spawns that no longer exist
  const spawnIds = new Set(spawns.map(s => s.id));
  for (const key of depletionState.keys()) {
    if (!spawnIds.has(key)) depletionState.delete(key);
  }

  // Batch updates
  for (const { id, newMax } of pendingUpdates) {
    await db.update(resourceSpawns)
      .set({ maxAmount: newMax })
      .where(eq(resourceSpawns.id, id));
  }
}

/**
 * Reset depletion tracking state (for experiments/tests).
 */
export function resetDepletionState(): void {
  depletionState.clear();
}

// =============================================================================
// RESET
// =============================================================================

/**
 * Delete all shelters
 */
export async function deleteAllShelters(): Promise<void> {
  await db.delete(shelters);
}

/**
 * Delete all resource spawns
 */
export async function deleteAllResourceSpawns(): Promise<void> {
  await db.delete(resourceSpawns);
}

/**
 * Reset tick counter to 0
 */
export async function resetTickCounter(): Promise<void> {
  await db
    .update(worldState)
    .set({ currentTick: 0, startedAt: new Date(), lastTickAt: null })
    .where(eq(worldState.id, WORLD_STATE_ID));
}

/**
 * Reset all world data (for full simulation reset)
 */
export async function resetWorldData(): Promise<void> {
  // Delete in order to respect foreign key constraints
  // Clear puzzles first (references agents)
  await clearAllPuzzles();
  await db.delete(inventory);
  await db.delete(events);
  await db.delete(ledger);
  await db.delete(agents);
  await db.delete(shelters);
  await db.delete(resourceSpawns);
  await db.delete(worldState);
}
