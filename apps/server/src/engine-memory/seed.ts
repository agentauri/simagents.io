/**
 * World seeding helpers — Phase 1 spike.
 */

import { v4 as uuid } from 'uuid';
import { resetStore } from './store';
import { createAgent } from './queries/agents';
import { createResourceSpawn } from './queries/world';

export interface SeedOptions {
  agentCount?: number;
  /** Food spawns to scatter, each starting full. */
  foodSpawns?: Array<{ x: number; y: number; max?: number; regen?: number }>;
  /** Starting needs for all agents. */
  startHunger?: number;
  startEnergy?: number;
}

/** Build a small deterministic world for the spike. */
export async function seedWorld(opts: SeedOptions = {}): Promise<void> {
  resetStore();

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
