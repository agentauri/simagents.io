import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { DEFAULT_AGENT_ROSTER, type AgentRosterEntry } from '@simagents/shared';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { set as setForageCooldown } from '../../actions/state/forage-cooldowns';
import { set as setPublicWorkSession } from '../../actions/state/public-work-sessions';
import { clearSubscribers } from '../../engine-memory/bus';
import { createEmployment, createJobOffer } from '../../engine-memory/queries/employment';
import { appendEvent } from '../../engine-memory/queries/events';
import { getInventoryItem } from '../../engine-memory/queries/inventory';
import { transfer } from '../../engine-memory/ledger';
import { resetStore, store, STORE_EVENT_CAP } from '../../engine-memory/store';
import {
  getAgentBusyUntil,
  resetAgentMeta,
  setAgentBusyUntil,
} from '../../engine/agent-meta';
import {
  getLastCurrencyDecayBoundaryTick,
  resetHeartbeatState,
} from '../../engine/heartbeat';
import {
  hydrateWorld,
  serializeWorld,
  validateWorldSnapshotV1,
  WorldSnapshotError,
  type WorldSnapshotV1,
} from '../../engine/persistence';
import { TICK_MS } from '../../engine/time';
import {
  getVitalsMeta,
  resetVitalsMeta,
  setVitalsMeta,
} from '../../engine/vitals-meta';
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

const signalDecision = {
  type: 'signal' as const,
  params: { message: 'persistence pulse', intensity: 1 },
};

const roster: AgentRosterEntry[] = DEFAULT_AGENT_ROSTER.slice(0, 3);

describe('world persistence', () => {
  let engine: InstanceType<typeof SimEngine> | undefined;

  beforeAll(async () => {
    ({ SimEngine } = await import('../../engine/engine'));
    ({ ScriptedDecisionProvider } = await import('../../engine/decision'));
  });

  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRuntimeConfig();
    resetAgentMeta();
    resetVitalsMeta();
    resetHeartbeatState();
    setSeed('engine-persistence');
    setRuntimeConfig({
      engine: {
        decisionTimeoutMs: 60_000,
        heartbeatIntervalMs: 60_000,
        minDecisionIntervalMs: 60_000,
      },
      durations: { signalMs: 120_000 },
      economy: {
        currencyDecayRate: 0.05,
        currencyDecayInterval: 10,
        currencyDecayThreshold: 20,
      },
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
      cooperation: { enabled: false },
    });
  });

  afterEach(async () => {
    await engine?.reset();
    engine = undefined;
    resetStore();
    clearSubscribers();
    resetAgentMeta();
    resetVitalsMeta();
    resetHeartbeatState();
    resetRuntimeConfig();
  });

  test('round-trips a running roster world and continues from saved sim time', async () => {
    engine = newEngine('persist-world', 1);
    await engine.seed({ roster, worldSeed: 'persist-world' });

    const agents = [...store.agents.values()].sort((a, b) => a.id.localeCompare(b.id));
    const [employer, worker] = agents;
    const offer = await createJobOffer({
      id: '00000000-0000-4000-8000-000000000101',
      employerId: employer.id,
      salary: 30,
      duration: 3,
      paymentType: 'per_tick',
      escrowAmount: 0,
      status: 'accepted',
      x: employer.x,
      y: employer.y,
      createdAtTick: 0,
    });
    await createEmployment({
      id: '00000000-0000-4000-8000-000000000102',
      jobOfferId: offer.id,
      employerId: employer.id,
      workerId: worker.id,
      salary: 30,
      paymentType: 'per_tick',
      escrowAmount: 0,
      ticksRequired: 3,
      ticksWorked: 1,
      amountPaid: 10,
      status: 'active',
      startedAtTick: 1,
    });
    await transfer(employer.id, worker.id, 7, 'transfer', 'round-trip fixture', 1);

    for (let minute = 0; minute < 50; minute++) {
      await engine.tickWall(TICK_MS);
    }

    const savedAt = engine.nowMs();
    setAgentBusyUntil(employer.id, savedAt + 5 * TICK_MS);
    setVitalsMeta(employer.id, {
      vitalsUpdatedAt: savedAt,
      criticalSince: { hunger: savedAt - TICK_MS },
    });
    setForageCooldown(`${employer.id}:${employer.x}:${employer.y}`, 49);
    setPublicWorkSession(worker.id, {
      startTick: 48,
      taskType: 'road',
      ticksWorked: 2,
    });

    const preState = normalizeEngineState(engine.getState());
    const preAggregates = aggregateStore();
    const preBusyUntil = getAgentBusyUntil(employer.id);
    const preVitalsMeta = getVitalsMeta(employer.id);
    const preBoundary = getLastCurrencyDecayBoundaryTick();
    const preCurrencyEvents = currencyDecayEventCount();
    const preHunger = store.agents.get(employer.id)?.hunger ?? 0;
    const snapshot = engine.snapshot();
    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    console.log(`[persistence] 3-agent 50-minute snapshot bytes: ${snapshotBytes}`);
    // Snapshots embed only a small event tail (hydration needs the observer's
    // last-10-per-agent lookback, not the 10k in-memory cap): LLM decision
    // events carry full reasoning strings and would blow the localStorage quota.
    expect(snapshot.store.events.length).toBeLessThanOrEqual(500);

    await engine.reset();
    engine = newEngine('persist-world', 999);
    await engine.hydrate(snapshot);

    expect(normalizeEngineState(engine.getState())).toEqual(preState);
    expect(aggregateStore()).toEqual(preAggregates);
    expect(getAgentBusyUntil(employer.id)).toBe(preBusyUntil);
    expect(getVitalsMeta(employer.id)).toEqual(preVitalsMeta);
    expect(getLastCurrencyDecayBoundaryTick()).toBe(preBoundary);
    expect((await getInventoryItem(worker.id, 'food'))?.quantity).toBe(5);
    expect(engine.getState().simTimeMs).toBe(snapshot.savedAtSimTimeMs);

    await engine.tickWall(TICK_MS);
    expect(engine.getState().simTimeMs).toBe(snapshot.savedAtSimTimeMs + TICK_MS);
    expect(getAgentBusyUntil(employer.id)).toBe(preBusyUntil);
    expect(currencyDecayEventCount()).toBe(preCurrencyEvents);
    expect(store.agents.get(employer.id)?.hunger ?? 0).toBeLessThan(preHunger);
    expect(store.agents.get(employer.id)?.hunger ?? 0).toBeGreaterThan(preHunger - 2);

    await engine.tickWall(9 * TICK_MS);
    expect(currencyDecayEventCount()).toBeGreaterThan(preCurrencyEvents);
  });

  test('rejects wrong versions and malformed snapshots without touching the store', () => {
    const snapshot = serializeWorld({
      savedAtSimTimeMs: 0,
      worldSeed: 'invalid-test',
      speed: 1,
    });
    const before = aggregateStore();

    const wrongVersion = { ...snapshot, schemaVersion: 2 };
    expectSnapshotError(() => hydrateWorld(wrongVersion), 'VERSION_MISMATCH');
    expect(aggregateStore()).toEqual(before);

    const malformed = {
      schemaVersion: 1,
      savedAtSimTimeMs: 0,
      worldSeed: 'invalid-test',
      speed: 1,
      store: {},
      engine: {},
    };
    expectSnapshotError(() => validateWorldSnapshotV1(malformed), 'INVALID_SNAPSHOT');
    expectSnapshotError(() => hydrateWorld(malformed), 'INVALID_SNAPSHOT');
    expect(aggregateStore()).toEqual(before);
  });

  test('caps stored events while preserving monotonic event versions', async () => {
    for (let index = 0; index < STORE_EVENT_CAP + 5; index++) {
      await appendEvent({
        tick: index,
        agentId: null,
        eventType: 'agent_signaled',
        payload: { index },
      });
    }

    expect(store.events).toHaveLength(STORE_EVENT_CAP);
    expect(store.events[0].version).toBe(6);
    expect(store.nextEventId).toBe(STORE_EVENT_CAP + 6);
    expect(store.nextEventVersion).toBe(STORE_EVENT_CAP + 6);

    await appendEvent({
      tick: STORE_EVENT_CAP + 5,
      agentId: null,
      eventType: 'agent_signaled',
      payload: { index: STORE_EVENT_CAP + 5 },
    });

    expect(store.events).toHaveLength(STORE_EVENT_CAP);
    expect(store.events.at(-1)?.version).toBe(STORE_EVENT_CAP + 6);
    expect(store.nextEventVersion).toBe(STORE_EVENT_CAP + 7);
  });
});

function newEngine(worldSeed: string, speed: number): InstanceType<typeof SimEngine> {
  return new SimEngine({
    speed,
    worldSeed,
    providerFactory: (_agent, tools) =>
      new ScriptedDecisionProvider([], {
        latencyMs: 0,
        sleep: tools.sleepWall,
        fallbackWhenEmpty: signalDecision,
      }),
  });
}

function expectSnapshotError(
  fn: () => void,
  code: InstanceType<typeof WorldSnapshotError>['code']
): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(WorldSnapshotError);
    expect((error as WorldSnapshotError).code).toBe(code);
    return;
  }
  throw new Error(`Expected WorldSnapshotError ${code}`);
}

function currencyDecayEventCount(): number {
  return store.events.filter((event) => event.eventType === 'currency_decay').length;
}

function aggregateStore() {
  return {
    tick: store.worldState.currentTick,
    agentCount: store.agents.size,
    agentVitals: [...store.agents.values()]
      .map((agent) => ({
        id: agent.id,
        hunger: round(agent.hunger),
        energy: round(agent.energy),
        health: round(agent.health),
        balance: round(agent.balance),
        state: agent.state,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    inventory: [...store.inventory.values()]
      .map((item) => ({
        agentId: item.agentId,
        itemType: item.itemType,
        quantity: round(item.quantity),
      }))
      .sort((a, b) => `${a.agentId}:${a.itemType}`.localeCompare(`${b.agentId}:${b.itemType}`)),
    employments: [...store.employments.values()]
      .map((employment) => ({
        id: employment.id,
        employerId: employment.employerId,
        workerId: employment.workerId,
        ticksWorked: employment.ticksWorked,
        amountPaid: round(employment.amountPaid),
        status: employment.status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ledgerCount: store.ledgerEntries.length,
    ledgerTotal: round(store.ledgerEntries.reduce((sum, entry) => sum + entry.amount, 0)),
    forageCooldowns: [...store.forageCooldowns.entries()].sort(),
    publicWorkSessions: [...store.publicWorkSessions.entries()].sort(),
    nextEventVersion: store.nextEventVersion,
  };
}

function normalizeEngineState(state: ReturnType<InstanceType<typeof SimEngine>['getState']>) {
  return {
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    agents: state.agents
      .map((agent) => ({
        id: agent.id,
        llmType: agent.llmType,
        x: agent.x,
        y: agent.y,
        hunger: round(agent.hunger),
        energy: round(agent.energy),
        health: round(agent.health),
        balance: round(agent.balance),
        state: agent.state,
        color: agent.color,
        personality: agent.personality,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    resources: state.resources
      .map((resource) => ({
        id: resource.id,
        x: resource.x,
        y: resource.y,
        resourceType: resource.resourceType,
        currentAmount: round(resource.currentAmount),
        maxAmount: resource.maxAmount,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    shelters: state.shelters
      .map((shelter) => ({
        id: shelter.id,
        x: shelter.x,
        y: shelter.y,
        canSleep: shelter.canSleep,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
