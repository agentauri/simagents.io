import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { clearSubscribers } from '../../engine-memory/bus';
import { createAgent, getAgentById } from '../../engine-memory/queries/agents';
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
  params: { message: 'ping', intensity: 1 },
};

const mkAgent = (overrides: Partial<Parameters<typeof createAgent>[0]> = {}) =>
  createAgent({
    id: uuid(),
    llmType: 'baseline_rule',
    x: 5,
    y: 5,
    hunger: 100,
    energy: 1000,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#888888',
    ...overrides,
  });

const signaledCount = (agentId: string) =>
  store.events.filter((event) => event.agentId === agentId && event.eventType === 'agent_signaled')
    .length;

describe('AgentRunner', () => {
  let engine: InstanceType<typeof SimEngine> | undefined;

  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRuntimeConfig();
    resetAgentMeta();
    resetVitalsMeta();
    setSeed('engine-agent-runner');
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 60_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 0,
      },
      durations: { signalMs: 5_000 },
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
    });
  });

  afterEach(async () => {
    await engine?.reset();
    engine = undefined;
  });

  test('does not start another decision while the agent is busy', async () => {
    const agent = await mkAgent();
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([signalDecision, signalDecision], {
          latencyMs: 0,
          sleep: tools.sleepWall,
          fallbackWhenEmpty: signalDecision,
        }),
    });

    await engine.tickWall(0);
    expect(signaledCount(agent.id)).toBe(1);

    await engine.tickWall(4_999);
    expect(signaledCount(agent.id)).toBe(1);

    await engine.tickWall(1);
    expect(signaledCount(agent.id)).toBe(2);
  });

  test('enforces the minimum simulated interval between decision starts', async () => {
    const agent = await mkAgent();
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 60_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 2_000,
      },
      durations: { signalMs: 0 },
    });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([signalDecision, signalDecision], {
          latencyMs: 0,
          sleep: tools.sleepWall,
          fallbackWhenEmpty: signalDecision,
        }),
    });

    await engine.tickWall(0);
    expect(signaledCount(agent.id)).toBe(1);

    await engine.tickWall(1_999);
    expect(signaledCount(agent.id)).toBe(1);

    await engine.tickWall(1);
    expect(signaledCount(agent.id)).toBe(2);
  });

  test('replaces a timed-out decision with the heuristic fallback, flagged usedFallback', async () => {
    const agent = await mkAgent();
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 2_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 0,
      },
      durations: { signalMs: 0 },
    });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        // Latency far beyond the timeout: the provider never answers in time.
        new ScriptedDecisionProvider([signalDecision], {
          latencyMs: 60_000,
          sleep: tools.sleepWall,
        }),
    });

    await engine.tickWall(0);
    expect(engine.getRunner(agent.id)?.isThinking).toBe(true);

    await engine.tickWall(2_000);
    await engine.tickWall(0);

    const fallbackDecisionEvents = store.events.filter(
      (event) =>
        event.agentId === agent.id &&
        (event.payload as Record<string, unknown>).usedFallback === true
    );
    expect(fallbackDecisionEvents.length).toBeGreaterThan(0);
    expect(fallbackDecisionEvents[0].eventType.startsWith('agent_')).toBe(true);
  });

  test('drops a decision when the agent dies while thinking and then terminates', async () => {
    const agent = await mkAgent({ hunger: 0, health: 0 });
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 60_000,
        heartbeatIntervalMs: 100,
        minDecisionIntervalMs: 0,
      },
      durations: { signalMs: 0 },
    });
    engine = new SimEngine({
      speed: 1,
      providerFactory: (_agent, tools) =>
        new ScriptedDecisionProvider([signalDecision], {
          latencyMs: 1_000,
          sleep: tools.sleepWall,
        }),
    });

    await engine.tickWall(0);
    expect(engine.getRunner(agent.id)?.isThinking).toBe(true);

    await engine.tickWall(1_000);
    await engine.tickWall(0);

    const updated = await getAgentById(agent.id);
    const failure = store.events.find(
      (event) => event.agentId === agent.id && event.eventType === 'action_failed'
    );

    expect(updated?.state).toBe('dead');
    expect(updated?.x).toBe(5);
    expect(failure?.payload).toMatchObject({
      action: 'signal',
      reason: 'agent_dead',
    });
    expect(engine.getRunner(agent.id)?.isStopped ?? true).toBe(true);
  });
});
