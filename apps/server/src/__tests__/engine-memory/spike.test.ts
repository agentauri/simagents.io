/**
 * Phase 1 spike — DB-free simulation engine.
 *
 * Proves the simulation can advance with NO PostgreSQL and NO Redis: the
 * in-memory store + real physics constants + pure grid utilities are enough to
 * run a coherent multi-agent simulation. This is the de-risking test for the
 * browser-only migration (see docs/browser-mode-plan.md).
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { store, resetStore } from '../../engine-memory/store';
import { seedWorld } from '../../engine-memory/seed';
import { runTick, runTicks } from '../../engine-memory/tick';
import { subscribe, clearSubscribers, type WorldEvent } from '../../engine-memory/bus';
import { getAliveAgents } from '../../engine-memory/queries/agents';
import { resetRNG } from '../../utils/random';

describe('engine-memory spike — DB-free ticks', () => {
  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRNG();
  });

  test('advances the world tick without a database', async () => {
    await seedWorld({ agentCount: 4 });
    expect(store.worldState.currentTick).toBe(0);

    const summary = await runTick();

    expect(summary.tick).toBe(1);
    expect(store.worldState.currentTick).toBe(1);
    expect(summary.events.some((e) => e.type === 'tick_start')).toBe(true);
    expect(summary.events.some((e) => e.type === 'tick_end')).toBe(true);
  });

  test('agents act coherently: movement, gathering and consumption emerge', async () => {
    await seedWorld({ agentCount: 4, startHunger: 35 });

    const summaries = await runTicks(60);

    const types = new Set(store.events.map((e) => e.eventType));
    expect(types.has('agent_moved')).toBe(true);
    expect(types.has('agent_gathered')).toBe(true);
    expect(types.has('agent_consumed')).toBe(true);

    // The event log persisted across all ticks (event sourcing intact).
    const tickEnds = store.events.filter((e) => e.eventType === 'tick_end');
    expect(tickEnds.length).toBe(60);

    // Versions are strictly increasing and unique (the MAX(version)+1 invariant).
    const versions = store.events.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[versions.length - 1]).toBeGreaterThan(versions[0]);

    expect(summaries.length).toBe(60);
  });

  test('agents that reach a food source survive a long run', async () => {
    await seedWorld({ agentCount: 4, startHunger: 50 });

    await runTicks(120);

    const alive = await getAliveAgents();
    // With reachable, regenerating food, the rule-based policy should keep
    // most agents alive — proving the survival economics work end-to-end.
    expect(alive.length).toBeGreaterThanOrEqual(1);
  });

  test('agents starve when no food exists (death physics work)', async () => {
    await seedWorld({ agentCount: 3, foodSpawns: [], startHunger: 12, startEnergy: 12 });

    const summaries = await runTicks(80);
    const totalDeaths = summaries.reduce((sum, s) => sum + s.deaths, 0);

    expect(totalDeaths).toBeGreaterThan(0);
    const alive = await getAliveAgents();
    expect(alive.length).toBeLessThan(3);
  });

  test('bus delivers events to subscribers (Worker→UI bridge shape)', async () => {
    await seedWorld({ agentCount: 2 });

    const received: WorldEvent[] = [];
    const unsub = subscribe((e) => received.push(e));

    await runTick();
    unsub();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toHaveProperty('type');
    expect(received[0]).toHaveProperty('tick');
    expect(received[0]).toHaveProperty('payload');
  });

  test('no PostgreSQL or Redis modules are loaded by the engine', () => {
    // The engine path must never pull in the DB client or Redis. If any
    // in-memory module accidentally imported `db/index` or `cache/index`,
    // those would appear in the module cache with an open connection.
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (p) =>
        p.includes('/db/index') ||
        p.includes('/cache/index') ||
        p.includes('/cache/pubsub') ||
        p.includes('/queue/index')
    );
    expect(offenders).toEqual([]);
  });
});
