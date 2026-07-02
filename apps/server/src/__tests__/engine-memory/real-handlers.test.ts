/**
 * Phase 1 — Real engine code on the in-memory store.
 *
 * This is the load-bearing proof for the browser-only pivot: the ACTUAL action
 * handlers (`src/actions/handlers/*`) — unchanged — run against the in-memory
 * store instead of PostgreSQL. The redirection from `db/queries/*` to the
 * in-memory modules is done here with `mock.module`; the browser build will
 * achieve the same with a Vite `resolve.alias` (and the retired server keeps
 * the Drizzle implementation).
 *
 * Crucially, with the redirection in place the handlers never import
 * `db/index.ts`, so the Node-only `postgres` driver is never loaded — exactly
 * the property the browser bundle needs.
 */

import { describe, expect, test, beforeEach, beforeAll, mock } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetStore, store } from '../../engine-memory/store';
import { seedWorld } from '../../engine-memory/seed';
import { createAgent } from '../../engine-memory/queries/agents';
import { addToInventory, getInventoryItem } from '../../engine-memory/queries/inventory';
import { getResourceSpawnsAtPosition } from '../../engine-memory/queries/world';

// Redirect the engine's data layer to the in-memory store. These specifiers
// resolve to the SAME absolute modules the handlers import (this test lives at
// the same `../../` depth as `src/actions/handlers/*`).
mock.module('../../db/queries/world', () => import('../../engine-memory/queries/world'));
mock.module('../../db/queries/agents', () => import('../../engine-memory/queries/agents'));
mock.module('../../db/queries/inventory', () => import('../../engine-memory/queries/inventory'));
mock.module('../../db/queries/memories', () => import('../../engine-memory/queries/memories'));
// move.ts pulls in stigmergy, which is Redis-backed in the server — swap it too.
mock.module('../../world/scent', () => import('../../engine-memory/scent'));

// Real handlers — imported AFTER the mocks are registered.
let handleGather: typeof import('../../actions/handlers/gather').handleGather;
let handleConsume: typeof import('../../actions/handlers/consume').handleConsume;
let handleMove: typeof import('../../actions/handlers/move').handleMove;

beforeAll(async () => {
  ({ handleGather } = await import('../../actions/handlers/gather'));
  ({ handleConsume } = await import('../../actions/handlers/consume'));
  ({ handleMove } = await import('../../actions/handlers/move'));
});

describe('real action handlers on in-memory store', () => {
  beforeEach(() => resetStore());

  test('handleGather harvests a real spawn and writes inventory + memory', async () => {
    await seedWorld({ agentCount: 0, foodSpawns: [{ x: 10, y: 10, max: 20 }] });
    const agent = await createAgent({ id: uuid(), llmType: 'claude', x: 10, y: 10, energy: 100, hunger: 80 });

    const result = await handleGather(
      { agentId: agent.id, type: 'gather', params: { resourceType: 'food', quantity: 3 }, tick: 1, timestamp: Date.now() },
      agent
    );

    expect(result.success).toBe(true);
    expect(result.events?.[0]?.type).toBe('agent_gathered');

    // The real handler called the real addToInventory + harvestResource against memory.
    const food = await getInventoryItem(agent.id, 'food');
    expect(food?.quantity).toBeGreaterThan(0);

    const [spawn] = await getResourceSpawnsAtPosition(10, 10);
    expect(spawn.currentAmount).toBeLessThan(20);

    // storeMemory wrote to the in-memory memories map.
    expect([...store.memories.values()].some((m) => m.agentId === agent.id)).toBe(true);
  });

  test('handleConsume removes food and restores hunger via real handler logic', async () => {
    await seedWorld({ agentCount: 0, foodSpawns: [] });
    const agent = await createAgent({ id: uuid(), llmType: 'gemini', x: 5, y: 5, hunger: 30 });
    await addToInventory(agent.id, 'food', 2);

    const result = await handleConsume(
      { agentId: agent.id, type: 'consume', params: { itemType: 'food' }, tick: 2, timestamp: Date.now() },
      agent
    );

    expect(result.success).toBe(true);
    expect(result.changes?.hunger).toBe(80); // 30 + 50 (CONFIG food effect)
    const food = await getInventoryItem(agent.id, 'food');
    expect(food?.quantity).toBe(1);
  });

  test('handleMove validates and returns position changes', async () => {
    await seedWorld({ agentCount: 0, foodSpawns: [] });
    const agent = await createAgent({ id: uuid(), llmType: 'codex', x: 5, y: 5, energy: 100 });

    const result = await handleMove(
      { agentId: agent.id, type: 'move', params: { toX: 6, toY: 5 }, tick: 3, timestamp: Date.now() },
      agent
    );

    expect(result.success).toBe(true);
    expect(result.changes?.x).toBe(6);
    expect(result.changes?.y).toBe(5);
  });

  test('the Node-only postgres driver is never loaded by the handler path', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter((p) => p.includes('/db/index') || /node_modules\/postgres\//.test(p));
    expect(offenders).toEqual([]);
  });
});
