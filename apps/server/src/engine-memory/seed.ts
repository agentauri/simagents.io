/**
 * World seeding helpers — Phase 1 spike.
 */

import { v4 as uuid } from 'uuid';
import type { AgentRosterEntry } from '@simagents/shared';
import { getRuntimeConfig } from '../config';
import type { NewAgent, NewResourceSpawn, NewShelter } from '../db/schema';
import { getBiomeForPosition, type BiomeType } from '../world/biomes';
import { resetStore } from './store';
import { createAgent } from './queries/agents';
import { addToInventory } from './queries/inventory';
import { createResourceSpawn, createShelter } from './queries/world';

export interface SeedOptions {
  agentCount?: number;
  /** Food spawns to scatter, each starting full. */
  foodSpawns?: Array<{ x: number; y: number; max?: number; regen?: number }>;
  /** Starting needs for all agents. */
  startHunger?: number;
  startEnergy?: number;
  /** Browser local mode: roster entries become the spawned agents. */
  roster?: AgentRosterEntry[];
  /** Stable run id for deterministic per-agent IDs. */
  worldSeed?: string;
}

type ResourceType = 'food' | 'energy' | 'material';

interface ResourceSpawnConfig {
  resourceType: ResourceType;
  x: number;
  y: number;
  maxAmount: number;
  regenRate: number;
  biome?: BiomeType;
}

interface ShelterConfig {
  x: number;
  y: number;
  canSleep: boolean;
}

const BIOME_CONFIGS: Record<BiomeType, { regenMultipliers: Record<ResourceType, number> }> = {
  forest: { regenMultipliers: { food: 1.5, energy: 1.0, material: 0.5 } },
  desert: { regenMultipliers: { food: 0.3, energy: 0.5, material: 1.5 } },
  tundra: { regenMultipliers: { food: 0.5, energy: 1.5, material: 0.8 } },
  plains: { regenMultipliers: { food: 1.0, energy: 1.0, material: 1.0 } },
};

const BIOME_CONFIGS_EXCLUSIVE: Record<BiomeType, { regenMultipliers: Record<ResourceType, number> }> = {
  forest: { regenMultipliers: { food: 1.5, energy: 0.3, material: 0.0 } },
  desert: { regenMultipliers: { food: 0.0, energy: 0.3, material: 1.5 } },
  tundra: { regenMultipliers: { food: 0.0, energy: 1.5, material: 0.5 } },
  plains: { regenMultipliers: { food: 0.5, energy: 0.5, material: 0.3 } },
};

const LEGACY_AGENT_POSITIONS = [
  { x: 28, y: 20 },
  { x: 30, y: 20 },
  { x: 32, y: 20 },
  { x: 28, y: 22 },
  { x: 30, y: 22 },
  { x: 32, y: 22 },
  { x: 30, y: 24 },
  { x: 40, y: 20 },
  { x: 40, y: 22 },
  { x: 40, y: 24 },
];

const RESOURCE_SPAWN_CONFIGS: ResourceSpawnConfig[] = [
  ...LEGACY_AGENT_POSITIONS.slice(0, 7).map((position) => ({
    resourceType: 'food' as const,
    x: position.x,
    y: position.y,
    maxAmount: 20,
    regenRate: 1.5,
  })),
  { resourceType: 'food', x: 26, y: 20, maxAmount: 15, regenRate: 1.0 },
  { resourceType: 'food', x: 34, y: 20, maxAmount: 15, regenRate: 1.0 },
  { resourceType: 'food', x: 20, y: 15, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 22, y: 16, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 18, y: 18, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 24, y: 14, maxAmount: 10, regenRate: 0.5 },
  { resourceType: 'food', x: 45, y: 40, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 47, y: 42, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 43, y: 38, maxAmount: 10, regenRate: 0.5 },
  { resourceType: 'energy', x: 30, y: 16, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'energy', x: 32, y: 22, maxAmount: 12, regenRate: 0.6 },
  { resourceType: 'energy', x: 26, y: 18, maxAmount: 12, regenRate: 0.6 },
  { resourceType: 'energy', x: 50, y: 10, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 52, y: 12, maxAmount: 12, regenRate: 0.5 },
  { resourceType: 'energy', x: 48, y: 8, maxAmount: 10, regenRate: 0.4 },
  { resourceType: 'energy', x: 10, y: 45, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 12, y: 47, maxAmount: 12, regenRate: 0.5 },
  { resourceType: 'material', x: 28, y: 24, maxAmount: 20, regenRate: 0.4 },
  { resourceType: 'material', x: 34, y: 22, maxAmount: 15, regenRate: 0.3 },
  { resourceType: 'material', x: 30, y: 30, maxAmount: 25, regenRate: 0.3 },
  { resourceType: 'material', x: 32, y: 32, maxAmount: 20, regenRate: 0.3 },
  { resourceType: 'material', x: 28, y: 28, maxAmount: 15, regenRate: 0.2 },
];

const RESOURCE_SPAWN_CONFIGS_EXCLUSIVE: ResourceSpawnConfig[] = [
  { resourceType: 'food', x: 20, y: 15, maxAmount: 20, regenRate: 1.2 },
  { resourceType: 'food', x: 25, y: 20, maxAmount: 18, regenRate: 1.0 },
  { resourceType: 'food', x: 15, y: 25, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 30, y: 10, maxAmount: 12, regenRate: 0.8 },
  { resourceType: 'food', x: 10, y: 30, maxAmount: 12, regenRate: 0.6 },
  { resourceType: 'energy', x: 65, y: 15, maxAmount: 20, regenRate: 1.2 },
  { resourceType: 'energy', x: 70, y: 25, maxAmount: 18, regenRate: 1.0 },
  { resourceType: 'energy', x: 55, y: 20, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'energy', x: 75, y: 10, maxAmount: 12, regenRate: 0.8 },
  { resourceType: 'material', x: 60, y: 30, maxAmount: 10, regenRate: 0.4 },
  { resourceType: 'material', x: 20, y: 65, maxAmount: 25, regenRate: 1.0 },
  { resourceType: 'material', x: 25, y: 70, maxAmount: 20, regenRate: 0.8 },
  { resourceType: 'material', x: 15, y: 75, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'material', x: 30, y: 60, maxAmount: 12, regenRate: 0.5 },
  { resourceType: 'food', x: 60, y: 60, maxAmount: 8, regenRate: 0.5 },
  { resourceType: 'energy', x: 65, y: 65, maxAmount: 8, regenRate: 0.5 },
  { resourceType: 'material', x: 70, y: 60, maxAmount: 8, regenRate: 0.3 },
  { resourceType: 'food', x: 55, y: 70, maxAmount: 6, regenRate: 0.4 },
  { resourceType: 'energy', x: 75, y: 70, maxAmount: 6, regenRate: 0.4 },
  { resourceType: 'food', x: 48, y: 25, maxAmount: 6, regenRate: 0.3 },
  { resourceType: 'energy', x: 48, y: 55, maxAmount: 6, regenRate: 0.3 },
  { resourceType: 'material', x: 25, y: 48, maxAmount: 6, regenRate: 0.3 },
];

const SHELTER_CONFIGS: ShelterConfig[] = [
  { x: 30, y: 20, canSleep: true },
  { x: 32, y: 20, canSleep: true },
  { x: 28, y: 22, canSleep: true },
  { x: 20, y: 18, canSleep: true },
  { x: 22, y: 20, canSleep: true },
  { x: 45, y: 38, canSleep: true },
  { x: 47, y: 40, canSleep: true },
  { x: 50, y: 15, canSleep: true },
  { x: 15, y: 45, canSleep: true },
  { x: 35, y: 35, canSleep: true },
];

const SHELTER_CONFIGS_DISTRIBUTED: ShelterConfig[] = [
  { x: 20, y: 20, canSleep: true },
  { x: 30, y: 15, canSleep: true },
  { x: 65, y: 20, canSleep: true },
  { x: 70, y: 30, canSleep: true },
  { x: 20, y: 65, canSleep: true },
  { x: 30, y: 70, canSleep: true },
  { x: 65, y: 65, canSleep: true },
  { x: 60, y: 55, canSleep: true },
  { x: 48, y: 25, canSleep: true },
  { x: 25, y: 48, canSleep: true },
];

/** Build a small deterministic world for the spike. */
export async function seedWorld(opts: SeedOptions = {}): Promise<void> {
  resetStore();

  if (opts.roster) {
    await seedRosterWorld(opts);
    return;
  }

  const agentCount = opts.agentCount ?? 4;
  const foodSpawns = opts.foodSpawns ?? [
    { x: 50, y: 50 },
    { x: 52, y: 50 },
    { x: 50, y: 52 },
  ];

  for (const spawn of foodSpawns) {
    await createResourceSpawn({
      id: uuid(),
      x: spawn.x,
      y: spawn.y,
      resourceType: 'food',
      maxAmount: spawn.max ?? 20,
      currentAmount: spawn.max ?? 20,
      regenRate: spawn.regen ?? 1,
    });
  }

  const llmTypes = ['claude', 'gemini', 'codex', 'deepseek'];
  for (let i = 0; i < agentCount; i++) {
    await createAgent({
      id: uuid(),
      llmType: llmTypes[i % llmTypes.length],
      x: 45 + i,
      y: 45 + i,
      hunger: opts.startHunger ?? 60,
      energy: opts.startEnergy ?? 100,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#888888',
    });
  }
}

async function seedRosterWorld(opts: SeedOptions): Promise<void> {
  const runtime = getRuntimeConfig();
  const biomeExclusivityEnabled = runtime.biomeExclusivity?.enabled ?? false;
  const resourceConfigs = biomeExclusivityEnabled ? RESOURCE_SPAWN_CONFIGS_EXCLUSIVE : RESOURCE_SPAWN_CONFIGS;
  const shelterConfigs = biomeExclusivityEnabled ? SHELTER_CONFIGS_DISTRIBUTED : SHELTER_CONFIGS;
  const biomeConfigs = biomeExclusivityEnabled ? BIOME_CONFIGS_EXCLUSIVE : BIOME_CONFIGS;

  for (const config of resourceConfigs) {
    const biome = config.biome ?? getBiomeForPosition(config.x, config.y);
    const multiplier = biomeConfigs[biome].regenMultipliers[config.resourceType] ?? 1.0;
    if (biomeExclusivityEnabled && multiplier === 0) continue;

    const spawn: NewResourceSpawn = {
      id: uuid(),
      x: config.x,
      y: config.y,
      resourceType: config.resourceType,
      maxAmount: config.maxAmount,
      currentAmount: config.maxAmount,
      regenRate: config.regenRate * multiplier,
      biome,
    };
    await createResourceSpawn(spawn);
  }

  for (const config of shelterConfigs) {
    const shelter: NewShelter = {
      id: uuid(),
      x: config.x,
      y: config.y,
      canSleep: config.canSleep,
    };
    await createShelter(shelter);
  }

  const roster = opts.roster ?? [];
  for (let index = 0; index < roster.length; index++) {
    const entry = roster[index];
    const position = spawnPosition(index);
    const agent: NewAgent & { name?: string } = {
      id: uuid(),
      name: entry.name,
      llmType: entry.provider,
      x: position.x,
      y: position.y,
      hunger: opts.startHunger ?? runtime.agent.startingHunger,
      energy: opts.startEnergy ?? runtime.agent.startingEnergy,
      health: runtime.agent.startingHealth,
      balance: runtime.agent.startingBalance,
      state: 'idle',
      color: entry.color,
      personality: entry.personality ?? null,
    };

    const created = await createAgent(agent);
    await addToInventory(created.id, 'food', 5);
  }
}

function spawnPosition(index: number): { x: number; y: number } {
  const legacy = LEGACY_AGENT_POSITIONS[index];
  if (legacy) return legacy;

  const ringIndex = index - LEGACY_AGENT_POSITIONS.length;
  const column = ringIndex % 8;
  const row = Math.floor(ringIndex / 8);
  return {
    x: 24 + column * 3,
    y: 28 + row * 3,
  };
}
