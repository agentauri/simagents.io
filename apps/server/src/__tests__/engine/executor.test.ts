import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { clearSubscribers } from '../../engine-memory/bus';
import { createAgent, getAgentById } from '../../engine-memory/queries/agents';
import { getInventoryItem } from '../../engine-memory/queries/inventory';
import { createResourceSpawn } from '../../engine-memory/queries/world';
import { resetStore, store } from '../../engine-memory/store';
import { resetAgentMeta, getAgentBusyUntil } from '../../engine/agent-meta';
import { resetVitalsMeta } from '../../engine/vitals-meta';
import { setSeed } from '../../utils/random';
import type { ActionType } from '../../actions/types';

mock.module('../../db/queries/world', () => import('../../engine-memory/queries/world'));
mock.module('../../db/queries/agents', () => import('../../engine-memory/queries/agents'));
mock.module('../../db/queries/inventory', () => import('../../engine-memory/queries/inventory'));
mock.module('../../db/queries/events', () => import('../../engine-memory/queries/events'));
mock.module('../../db/queries/memories', () => import('../../engine-memory/queries/memories'));
mock.module('../../db/queries/employment', () => import('../../engine-memory/queries/employment'));
mock.module('../../db/queries/reproduction', () => import('../../engine-memory/queries/reproduction'));
mock.module('../../db/queries/gossip', () => import('../../engine-memory/queries/gossip'));
mock.module('../../db/queries/credentials', () => import('../../engine-memory/queries/credentials'));
mock.module('../../db/queries/beliefs', () => import('../../engine-memory/queries/beliefs'));
mock.module('../../db/queries/roles', () => import('../../engine-memory/queries/roles'));
mock.module('../../db/queries/claims', () => import('../../engine-memory/queries/claims'));
mock.module('../../db/queries/knowledge', () => import('../../engine-memory/queries/knowledge'));
mock.module('../../db/queries/naming', () => import('../../engine-memory/queries/naming'));
mock.module('../../db/queries/puzzles', () => import('../../engine-memory/queries/puzzles'));
mock.module('../../ledger', () => import('../../engine-memory/ledger'));
mock.module('../../ledger/index', () => import('../../engine-memory/ledger'));
mock.module('../../cache/projections', () => import('../../engine-memory/projections'));
mock.module('../../cache', () => ({ redis: {} }));
mock.module('../../cache/index', () => ({ redis: {} }));
mock.module('../../world/scent', () => import('../../engine-memory/scent'));
mock.module('../../simulation/shocks', () => ({ isBlackoutActive: () => false }));

let ActionExecutor: typeof import('../../engine/executor').ActionExecutor;

beforeAll(async () => {
  ({ ActionExecutor } = await import('../../engine/executor'));
});

const intent = <T>(agentId: string, type: ActionType, params: T, tick = 0) => ({
  agentId,
  type,
  params,
  tick,
  timestamp: Date.now(),
});

const mkAgent = (overrides: Partial<Parameters<typeof createAgent>[0]> = {}) =>
  createAgent({
    id: uuid(),
    llmType: 'baseline_rule',
    x: 5,
    y: 5,
    hunger: 100,
    energy: 100,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#888888',
    ...overrides,
  });

describe('ActionExecutor', () => {
  let nowMs: number;
  let executor: InstanceType<typeof ActionExecutor>;

  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRuntimeConfig();
    resetAgentMeta();
    resetVitalsMeta();
    setSeed('engine-executor');
    setRuntimeConfig({
      cooperation: { enabled: false },
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
    });
    nowMs = 10_000;
    executor = new ActionExecutor({ nowMs: () => nowMs });
  });

  test('successful move stamps busyUntil from actual Chebyshev distance', async () => {
    const agent = await mkAgent({ x: 1, y: 1 });

    const execution = await executor.submit(intent(agent.id, 'move', { toX: 3, toY: 1 }));

    expect(execution.result.success).toBe(true);
    expect((await getAgentById(agent.id))?.x).toBe(2);
    expect(getAgentBusyUntil(agent.id)).toBe(nowMs + 15_000);
    expect(execution.events[0].payload.simTimeMs).toBe(nowMs);
  });

  test('successful actions emit the legacy decision event with reasoning before handler events', async () => {
    const agent = await mkAgent({ x: 1, y: 1 });

    const execution = await executor.submit(intent(agent.id, 'move', { toX: 2, toY: 1 }), {
      reasoning: 'Heading to the food spawn',
      usedFallback: false,
      processingTimeMs: 123,
    });

    expect(execution.result.success).toBe(true);
    // Present-tense decision event first (UI heatmap/filters consume this shape)...
    expect(execution.events[0]).toMatchObject({
      type: 'agent_move',
      agentId: agent.id,
      payload: {
        action: 'move',
        params: { toX: 2, toY: 1 },
        reasoning: 'Heading to the food spawn',
        usedFallback: false,
        processingTimeMs: 123,
        simTimeMs: nowMs,
      },
    });
    // ...followed by the handler's past-tense result event.
    expect(execution.events.slice(1).some((event) => event.type === 'agent_moved')).toBe(true);
    expect(store.events.some((event) => event.eventType === 'agent_move')).toBe(true);
  });

  test('failed actions emit legacy-shaped action_failed and apply the penalty duration', async () => {
    const agent = await mkAgent({ x: 1, y: 1 });

    const execution = await executor.submit(intent(agent.id, 'move', { toX: 1, toY: 1 }));

    expect(execution.result.success).toBe(false);
    expect(getAgentBusyUntil(agent.id)).toBe(nowMs + 1_000);
    expect(execution.events[0]).toMatchObject({
      type: 'action_failed',
      agentId: agent.id,
      payload: {
        action: 'move',
        params: { toX: 1, toY: 1 },
        simTimeMs: nowMs,
      },
    });
    expect(store.events.at(-1)?.eventType).toBe('action_failed');
  });

  test('serializes contending gathers against the same nearly empty spawn', async () => {
    const first = await mkAgent({ x: 7, y: 7 });
    const second = await mkAgent({ x: 7, y: 7 });
    await createResourceSpawn({
      id: 'spawn-1',
      x: 7,
      y: 7,
      resourceType: 'food',
      currentAmount: 1,
      maxAmount: 1,
      regenRate: 0,
    });

    const [a, b] = await Promise.all([
      executor.submit(intent(first.id, 'gather', { resourceType: 'food', quantity: 1 })),
      executor.submit(intent(second.id, 'gather', { resourceType: 'food', quantity: 1 })),
    ]);

    const successes = [a, b].filter((result) => result.result.success);
    const failures = [a, b].filter((result) => !result.result.success);
    const firstFood = (await getInventoryItem(first.id, 'food'))?.quantity ?? 0;
    const secondFood = (await getInventoryItem(second.id, 'food'))?.quantity ?? 0;

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(firstFood + secondFood).toBe(1);
    expect(store.resourceSpawns.get('spawn-1')?.currentAmount).toBe(0);
    expect(store.events.some((event) => event.eventType === 'action_failed')).toBe(true);
  });
});
