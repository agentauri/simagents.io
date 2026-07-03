import { beforeEach, describe, expect, test } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { runHousekeeping, resetHeartbeatState } from '../../engine/heartbeat';
import { perMinuteHazardProbability } from '../../engine/puzzles';
import { TICK_MS } from '../../engine/time';
import { getVitalsMeta, resetVitalsMeta, setVitalsMeta } from '../../engine/vitals-meta';
import { createReproductionState } from '../../engine-memory/queries/reproduction';
import { clearSubscribers, subscribe, type WorldEvent } from '../../engine-memory/bus';
import { createAgent, getAgentById } from '../../engine-memory/queries/agents';
import { addToInventory, getInventoryItem } from '../../engine-memory/queries/inventory';
import { createResourceSpawn, getAllResourceSpawns } from '../../engine-memory/queries/world';
import { resetStore, store } from '../../engine-memory/store';
import { initializeRNG } from '../../utils/random';

const mkAgent = (overrides: Partial<Parameters<typeof createAgent>[0]> = {}) =>
  createAgent({
    id: uuid(),
    llmType: 'claude',
    x: 0,
    y: 0,
    hunger: 100,
    energy: 100,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#888888',
    ...overrides,
  });

describe('runHousekeeping', () => {
  beforeEach(() => {
    resetStore();
    clearSubscribers();
    resetRuntimeConfig();
    resetVitalsMeta();
    resetHeartbeatState();
    initializeRNG('engine-phase-1a');
    setRuntimeConfig({
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      seasons: { enabled: false },
    });
  });

  test('kills an agent after critical hunger remains past the grace window', async () => {
    const agent = await mkAgent({ hunger: 0, energy: 100, health: 2 });
    setVitalsMeta(agent.id, { vitalsUpdatedAt: 0, criticalSince: { hunger: 0 } });

    await runHousekeeping(3 * TICK_MS, 3 * TICK_MS);
    expect((await getAgentById(agent.id))?.state).toBe('idle');

    const summary = await runHousekeeping(4 * TICK_MS, TICK_MS);
    const dead = await getAgentById(agent.id);
    const deathEvent = summary.events.find((event) => event.type === 'agent_died');

    expect(dead?.state).toBe('dead');
    expect(summary.deaths).toEqual([agent.id]);
    expect(deathEvent?.payload).toMatchObject({
      cause: 'starvation',
      finalState: { health: 0 },
      simTimeMs: 4 * TICK_MS,
    });
  });

  test('resource regeneration accrues fractionally and respects maxAmount', async () => {
    await createResourceSpawn({
      id: 'spawn-1',
      x: 1,
      y: 1,
      resourceType: 'food',
      currentAmount: 0,
      maxAmount: 1,
      regenRate: 1,
    });

    await runHousekeeping(30_000, 30_000);
    expect((await getAllResourceSpawns())[0].currentAmount).toBeCloseTo(0.5, 5);

    await runHousekeeping(60_000, 30_000);
    expect((await getAllResourceSpawns())[0].currentAmount).toBeCloseTo(1, 5);

    await runHousekeeping(90_000, 30_000);
    expect((await getAllResourceSpawns())[0].currentAmount).toBe(1);
  });

  test('currency decay applies once per crossed 10-minute boundary', async () => {
    const agent = await mkAgent({ balance: 100 });
    setRuntimeConfig({
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      economy: {
        currencyDecayRate: 0.05,
        currencyDecayInterval: 10,
        currencyDecayThreshold: 20,
      },
    });

    await runHousekeeping(9 * TICK_MS, 9 * TICK_MS);
    expect((await getAgentById(agent.id))?.balance).toBe(100);

    const atBoundary = await runHousekeeping(10 * TICK_MS, TICK_MS);
    expect((await getAgentById(agent.id))?.balance).toBe(95);
    expect(atBoundary.events.filter((event) => event.type === 'currency_decay')).toHaveLength(1);

    await runHousekeeping(10 * TICK_MS + 30_000, 30_000);
    expect((await getAgentById(agent.id))?.balance).toBe(95);

    const secondBoundary = await runHousekeeping(20 * TICK_MS, 9 * TICK_MS + 30_000);
    expect((await getAgentById(agent.id))?.balance).toBe(91);
    expect(secondBoundary.events.filter((event) => event.type === 'currency_decay')).toHaveLength(1);
  });

  test('item spoilage removes fractional amounts', async () => {
    const agent = await mkAgent();
    await addToInventory(agent.id, 'food', 10);
    setRuntimeConfig({
      puzzle: { enabled: false },
      spoilage: {
        enabled: true,
        rates: { food: 0.1 },
        removalThreshold: 0.5,
      },
    });

    const summary = await runHousekeeping(30_000, 30_000);
    const food = await getInventoryItem(agent.id, 'food');
    const spoilageEvent = summary.events.find((event) => event.type === 'items_spoiled');

    expect(food?.quantity).toBeCloseTo(9.5, 5);
    expect(spoilageEvent?.payload).toMatchObject({ totalItemsSpoiled: 1, simTimeMs: 30_000 });
  });

  test('emits one minute_elapsed event per crossed minute boundary', async () => {
    const summary = await runHousekeeping(2.5 * TICK_MS, 2.5 * TICK_MS);
    const minuteEvents = summary.events.filter((event) => event.type === 'minute_elapsed');

    expect(minuteEvents.map((event) => event.tick)).toEqual([1, 2]);
    expect(minuteEvents.map((event) => event.payload)).toEqual([
      { tick: 1, simTimeMs: TICK_MS },
      { tick: 2, simTimeMs: 2 * TICK_MS },
    ]);
  });

  test('uses per-minute hazard conversion for sub-minute puzzle creation checks', () => {
    const expected = 1 - Math.pow(0.9, 1 / 60);
    expect(perMinuteHazardProbability(0.1, 1_000)).toBeCloseTo(expected, 10);
  });

  test('auto-consumes food while sleeping and forces sleep on critical energy', async () => {
    const sleeper = await mkAgent({ state: 'sleeping', hunger: 19 });
    await addToInventory(sleeper.id, 'food', 1);
    const exhausted = await mkAgent({ energy: 9 });

    const summary = await runHousekeeping(0, 0);
    const updatedSleeper = await getAgentById(sleeper.id);
    const updatedExhausted = await getAgentById(exhausted.id);

    expect(updatedSleeper?.hunger).toBe(69);
    expect(await getInventoryItem(sleeper.id, 'food')).toBeUndefined();
    expect(updatedExhausted?.state).toBe('sleeping');
    expect(summary.events.some((event) => event.type === 'auto_consumed')).toBe(true);
  });

  test('needs_updated events preserve legacy payload fields and add simTimeMs', async () => {
    const agent = await mkAgent();
    const received: WorldEvent[] = [];
    const unsubscribe = subscribe((event) => received.push(event));

    const summary = await runHousekeeping(TICK_MS, TICK_MS);
    unsubscribe();

    const event = summary.events.find((candidate) => candidate.type === 'needs_updated');
    expect(event?.agentId).toBe(agent.id);
    expect(event?.payload).toHaveProperty('previousState');
    expect(event?.payload).toHaveProperty('newState');
    expect(event?.payload).toHaveProperty('effects');
    expect(event?.payload.simTimeMs).toBe(TICK_MS);
    expect(received.some((candidate) => candidate.type === 'needs_updated')).toBe(true);
  });

  test('persists emitted events in the in-memory event log', async () => {
    await mkAgent();

    await runHousekeeping(TICK_MS, TICK_MS);

    expect(store.events.some((event) => event.eventType === 'needs_updated')).toBe(true);
    expect(store.worldState.currentTick).toBe(1);
  });

  test('a dying agent emits ONLY agent_died, matching legacy death parity', async () => {
    const dying = await mkAgent({ hunger: 0, energy: 100, health: 1 });
    setVitalsMeta(dying.id, { vitalsUpdatedAt: 0, criticalSince: { hunger: 0 } });
    const survivor = await mkAgent();

    const summary = await runHousekeeping(5 * TICK_MS, 5 * TICK_MS);

    const dyingEvents = summary.events.filter((event) => event.agentId === dying.id);
    expect(dyingEvents.map((event) => event.type)).toEqual(['agent_died']);
    expect(
      summary.events.some(
        (event) => event.agentId === survivor.id && event.type === 'needs_updated'
      )
    ).toBe(true);
  });

  test('death cleans up vitals metadata; sweep drops metadata of externally killed agents', async () => {
    const dying = await mkAgent({ hunger: 0, energy: 100, health: 1 });
    setVitalsMeta(dying.id, { vitalsUpdatedAt: 0, criticalSince: { hunger: 0 } });

    await runHousekeeping(5 * TICK_MS, 5 * TICK_MS);
    expect(getVitalsMeta(dying.id)).toBeUndefined();

    // Killed outside the heartbeat (e.g. harm handler): the per-minute sweep reclaims it.
    const victim = await mkAgent();
    await runHousekeeping(5 * TICK_MS + 1_000, 1_000);
    expect(getVitalsMeta(victim.id)).toBeDefined();
    store.agents.set(victim.id, { ...store.agents.get(victim.id)!, state: 'dead' });
    await runHousekeeping(6 * TICK_MS, TICK_MS - 1_000);
    expect(getVitalsMeta(victim.id)).toBeUndefined();
  });

  test('resetStore resets engine state so a restarted run decays currency again', async () => {
    setRuntimeConfig({
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      economy: {
        currencyDecayRate: 0.05,
        currencyDecayInterval: 10,
        currencyDecayThreshold: 20,
      },
    });
    const first = await mkAgent({ balance: 100 });
    await runHousekeeping(10 * TICK_MS, 10 * TICK_MS);
    expect((await getAgentById(first.id))?.balance).toBe(95);
    expect(getVitalsMeta(first.id)).toBeDefined();

    // Simulated "restart simulation": without the reset hooks the stale
    // boundary (10) would silently disable decay for the whole new run.
    resetStore();
    expect(getVitalsMeta(first.id)).toBeUndefined();

    setRuntimeConfig({
      puzzle: { enabled: false },
      spoilage: { enabled: false },
      economy: {
        currencyDecayRate: 0.05,
        currencyDecayInterval: 10,
        currencyDecayThreshold: 20,
      },
    });
    const second = await mkAgent({ balance: 100 });
    await runHousekeeping(10 * TICK_MS, 10 * TICK_MS);
    expect((await getAgentById(second.id))?.balance).toBe(95);
  });

  test('completes gestation at the due tick and spawns the offspring', async () => {
    const parent = await mkAgent({ balance: 600 });
    const partner = await mkAgent();
    await createReproductionState({
      parentAgentId: parent.id,
      partnerAgentId: partner.id,
      gestationStartTick: 0,
      gestationDurationTicks: 2,
      status: 'gestating',
    });

    const early = await runHousekeeping(TICK_MS, TICK_MS);
    expect(early.events.some((event) => event.type === 'agent_born')).toBe(false);

    const due = await runHousekeeping(2 * TICK_MS, TICK_MS);
    const birth = due.events.find((event) => event.type === 'agent_born');

    expect(birth).toBeDefined();
    expect(birth?.payload).toMatchObject({ parentId: parent.id, partnerId: partner.id });
    const offspring = await getAgentById(birth!.agentId!);
    expect(offspring?.state).not.toBe('dead');
  });

  test('does not load PostgreSQL or Redis modules', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (path) =>
        path.includes('/db/index') ||
        path.includes('/cache/index') ||
        path.includes('/cache/pubsub') ||
        path.includes('/queue/index') ||
        /node_modules\/postgres\//.test(path) ||
        /node_modules\/ioredis\//.test(path)
    );
    expect(offenders).toEqual([]);
  });
});
