import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { clearSubscribers } from '../../engine-memory/bus';
import { createAgent } from '../../engine-memory/queries/agents';
import { resetStore, store } from '../../engine-memory/store';
import { resetAgentMeta } from '../../engine/agent-meta';
import { resetVitalsMeta } from '../../engine/vitals-meta';
import { setSeed } from '../../utils/random';

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

let SimEngine: typeof import('../../engine/engine').SimEngine;
let ScriptedDecisionProvider: typeof import('../../engine/decision').ScriptedDecisionProvider;

beforeAll(async () => {
  ({ SimEngine } = await import('../../engine/engine'));
  ({ ScriptedDecisionProvider } = await import('../../engine/decision'));
});

const signalDecision = {
  type: 'signal' as const,
  params: { message: 'pulse', intensity: 1 },
};

const signaledCount = (agentId: string) =>
  store.events.filter((event) => event.agentId === agentId && event.eventType === 'agent_signaled')
    .length;

describe('SimEngine', () => {
  let engine: InstanceType<typeof SimEngine> | undefined;

  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRuntimeConfig();
    resetAgentMeta();
    resetVitalsMeta();
    setSeed('engine-facade');
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 60_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 0,
      },
      durations: { signalMs: 0 },
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
    });
  });

  afterEach(async () => {
    await engine?.reset();
    engine = undefined;
  });

  test('speed is life: lower decision latency produces strictly more actions', async () => {
    const fast = await createAgent({
      id: '00000000-0000-4000-8000-0000000000f1',
      llmType: 'baseline_rule',
      x: 1,
      y: 1,
      hunger: 100,
      energy: 1000,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#ff0000',
    });
    const slow = await createAgent({
      id: '00000000-0000-4000-8000-0000000000f2',
      llmType: 'baseline_rule',
      x: 2,
      y: 2,
      hunger: 100,
      energy: 1000,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#0000ff',
    });

    engine = new SimEngine({
      speed: 1,
      providerFactory: (agent, tools) =>
        new ScriptedDecisionProvider([], {
          latencyMs: agent.id === fast.id ? 100 : 2_000,
          sleep: tools.sleepWall,
          fallbackWhenEmpty: signalDecision,
        }),
    });

    await engine.tickWall(0);
    for (let i = 0; i < 50; i++) {
      await engine.tickWall(100);
    }

    const fastActions = signaledCount(fast.id);
    const slowActions = signaledCount(slow.id);

    expect(fastActions).toBeGreaterThan(slowActions);
    expect(slowActions).toBeGreaterThan(0);

    for (const agentId of [fast.id, slow.id]) {
      const simTimes = store.events
        .filter((event) => event.agentId === agentId && event.eventType === 'agent_signaled')
        .map((event) => (event.payload as Record<string, unknown>).simTimeMs as number);

      expect(simTimes.length).toBeGreaterThan(0);
      expect(simTimes.every((time, index) => index === 0 || time >= simTimes[index - 1])).toBe(true);
    }
  });

  test('pause halts decisions and busy countdowns', async () => {
    const agent = await createAgent({
      id: '00000000-0000-4000-8000-0000000000aa',
      llmType: 'baseline_rule',
      x: 1,
      y: 1,
      hunger: 100,
      energy: 1000,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#888888',
    });
    setRuntimeConfig({ durations: { signalMs: 1_000 } });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([], {
          latencyMs: 0,
          sleep: tools.sleepWall,
          fallbackWhenEmpty: signalDecision,
        }),
    });

    await engine.tickWall(0);
    expect(signaledCount(agent.id)).toBe(1);

    engine.pause();
    await engine.tickWall(10_000);
    expect(engine.getState().simTimeMs).toBe(0);
    expect(signaledCount(agent.id)).toBe(1);

    engine.resume();
    await engine.tickWall(999);
    expect(signaledCount(agent.id)).toBe(1);

    await engine.tickWall(1);
    expect(signaledCount(agent.id)).toBe(2);
  });

  test('pause freezes in-flight decision timeouts: no fallback fires during a pause', async () => {
    const agent = await createAgent({
      id: '00000000-0000-4000-8000-0000000000ac',
      llmType: 'baseline_rule',
      x: 1,
      y: 1,
      hunger: 100,
      energy: 1000,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#888888',
    });
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 6_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 0,
      },
      durations: { signalMs: 0 },
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
    });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([], {
          latencyMs: 5_000,
          sleep: tools.sleepWall,
          fallbackWhenEmpty: signalDecision,
        }),
    });

    // Decision starts and is pending (needs 5000ms wall, timeout at 6000ms).
    await engine.tickWall(0);
    engine.pause();
    // Without the pause gate this would advance wall waiters and fire the
    // 6000ms decision timeout mid-pause, replacing the decision with a fallback.
    await engine.tickWall(10_000);
    expect(signaledCount(agent.id)).toBe(0);
    engine.resume();
    await engine.tickWall(5_000);

    const decisionEvents = store.events.filter((event) => event.eventType === 'agent_signal');
    expect(decisionEvents.length).toBeGreaterThan(0);
    expect(
      store.events
        .filter((event) => event.agentId === agent.id)
        .every((event) => (event.payload as Record<string, unknown>).usedFallback !== true)
    ).toBe(true);
  });

  test('setSpeed changes the simulated-time-per-wall-time ratio', async () => {
    engine = new SimEngine({ speed: 1 });

    await engine.tickWall(100);
    expect(engine.getState().simTimeMs).toBe(100);

    engine.pause();
    await engine.tickWall(1_000);
    expect(engine.getState().simTimeMs).toBe(100);

    engine.resume();
    engine.setSpeed(10);
    await engine.tickWall(100);
    expect(engine.getState().simTimeMs).toBe(1_100);
  });

  test('engine path does not load server-only database or Redis modules', async () => {
    await createAgent({
      id: '00000000-0000-4000-8000-0000000000bb',
      llmType: 'baseline_rule',
      x: 1,
      y: 1,
      hunger: 100,
      energy: 1000,
      health: 100,
      balance: 100,
      state: 'idle',
      color: '#888888',
    });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([signalDecision], {
          latencyMs: 0,
          sleep: tools.sleepWall,
        }),
    });

    await engine.tickWall(0);

    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (path) =>
        path.includes('/db/index') ||
        /node_modules\/postgres\//.test(path) ||
        path.includes('node_modules/ioredis') ||
        path.includes('/cache/pubsub')
    );

    expect(offenders).toEqual([]);
  });
});
