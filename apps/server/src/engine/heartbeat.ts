import { v4 as uuid } from 'uuid';
import type { Agent, InventoryItem } from '../db/schema';
import { getRuntimeConfig } from '../config';
import { registerStoreResetHook, store } from '../engine-memory/store';
import type { WorldEvent } from '../engine-memory/bus';
import { publishEvent } from '../engine-memory/bus';
import { appendEvent } from '../engine-memory/queries/events';
import { getAliveAgents, getAgentById, killAgent, updateAgent } from '../engine-memory/queries/agents';
import {
  getAgentInventory,
  getInventoryItem,
  removeFromInventory,
  updateInventoryQuantity,
} from '../engine-memory/queries/inventory';
import { getAllResourceSpawns, updateResourceSpawn } from '../engine-memory/queries/world';
import { getCurrentSeason } from '../simulation/seasons';
import { completeGestations } from './reproduction';
import { processPuzzleLifecycle } from './puzzles';
import { materializeVitals, type MaterializedVitals } from './vitals';
import { deleteVitalsMeta, setVitalsMeta, sweepVitalsMeta, type VitalsMeta } from './vitals-meta';
import { deleteAgentMeta, sweepAgentMeta } from './agent-meta';
import { TICK_MS, simMinutes, tickFromSimTime } from './time';

export interface HousekeepingSummary {
  tick: number;
  simTimeMs: number;
  dtMs: number;
  deaths: string[];
  events: WorldEvent[];
}

let lastCurrencyDecayBoundaryTick = 0;

export function resetHeartbeatState(): void {
  lastCurrencyDecayBoundaryTick = 0;
}

registerStoreResetHook(() => resetHeartbeatState());

function withSimTime(payload: Record<string, unknown>, simTimeMs: number): Record<string, unknown> {
  return { ...payload, simTimeMs };
}

function makeEvent(
  type: string,
  tick: number,
  simTimeMs: number,
  payload: Record<string, unknown>,
  agentId?: string
): WorldEvent {
  return {
    id: uuid(),
    type,
    tick,
    timestamp: Date.now(),
    agentId,
    payload: withSimTime(payload, simTimeMs),
  };
}

async function emit(event: WorldEvent, events: WorldEvent[]): Promise<void> {
  events.push(event);
  await publishEvent(event);
  await appendEvent({
    tick: event.tick,
    agentId: event.agentId ?? null,
    eventType: event.type,
    payload: event.payload,
  });
}

function deathCause(result: MaterializedVitals): 'starvation' | 'exhaustion' {
  const criticalHunger = getRuntimeConfig().needs.criticalHungerThreshold ?? 10;
  return result.newState.hunger < criticalHunger ? 'starvation' : 'exhaustion';
}

function needsWarningEvents(
  agent: Agent,
  result: MaterializedVitals,
  tick: number,
  simTimeMs: number
): WorldEvent[] {
  const config = getRuntimeConfig();
  const events: WorldEvent[] = [];
  const hunger = result.newState.hunger;
  const energy = result.newState.energy;
  const criticalHungerSince = result.meta.criticalSince.hunger;

  if (hunger < (config.needs.lowHungerThreshold ?? 20)) {
    events.push(
      makeEvent(
        'needs_warning',
        tick,
        simTimeMs,
        { need: 'hunger', level: 'low', value: hunger },
        agent.id
      )
    );
  }

  if (hunger < (config.needs.criticalHungerThreshold ?? 10)) {
    const damage = result.healthDamage.hunger;
    const graceMsRemaining =
      criticalHungerSince === undefined
        ? 0
        : Math.max(0, criticalHungerSince + 3 * TICK_MS - simTimeMs);
    events.push(
      makeEvent(
        'needs_warning',
        tick,
        simTimeMs,
        damage > 0
          ? {
              need: 'hunger',
              level: 'critical',
              value: hunger,
              healthDamage: damage,
              gracePeriodExpired: true,
            }
          : {
              need: 'hunger',
              level: 'critical',
              value: hunger,
              graceTicksRemaining: Math.ceil(graceMsRemaining / TICK_MS),
              gracePeriodActive: true,
            },
        agent.id
      )
    );
  }

  if (
    energy < (config.needs.lowEnergyThreshold ?? 20) &&
    energy >= (config.needs.criticalEnergyThreshold ?? 10)
  ) {
    events.push(
      makeEvent(
        'needs_warning',
        tick,
        simTimeMs,
        { need: 'energy', level: 'low', value: energy },
        agent.id
      )
    );
  }

  if (energy < (config.needs.criticalEnergyThreshold ?? 10)) {
    // Critical energy damages health immediately (no grace period), like legacy needs-decay.
    events.push(
      makeEvent(
        'needs_warning',
        tick,
        simTimeMs,
        {
          need: 'energy',
          level: 'critical',
          value: energy,
          healthDamage: result.healthDamage.energy,
          forcedRest: true,
        },
        agent.id
      )
    );
  }

  return events;
}

async function autoConsumeWhileSleeping(
  agent: Agent,
  result: MaterializedVitals,
  effects: string[],
  tick: number,
  simTimeMs: number,
  events: WorldEvent[]
): Promise<{ agent: Agent; newState: MaterializedVitals['newState']; meta: VitalsMeta }> {
  const config = getRuntimeConfig();
  const threshold = 20;
  const foodRestore = config.actions.consume.effects.food?.hunger ?? 50;
  const nextState = { ...result.newState };
  const nextMeta: VitalsMeta = {
    vitalsUpdatedAt: simTimeMs,
    criticalSince: { ...result.meta.criticalSince },
  };

  if (agent.state !== 'sleeping' || nextState.hunger >= threshold) {
    return { agent: result.agent, newState: nextState, meta: nextMeta };
  }

  const food = await getInventoryItem(agent.id, 'food');
  if (!food || food.quantity <= 0) {
    return { agent: result.agent, newState: nextState, meta: nextMeta };
  }

  await removeFromInventory(agent.id, 'food', 1);
  nextState.hunger = Math.min(100, nextState.hunger + foodRestore);
  if (nextState.hunger >= (config.needs.criticalHungerThreshold ?? 10)) {
    nextMeta.criticalSince.hunger = undefined;
  }
  effects.push('auto_consumed_food');

  const updated = (await updateAgent(agent.id, { hunger: nextState.hunger })) ?? result.agent;
  setVitalsMeta(agent.id, nextMeta);

  await emit(
    makeEvent(
      'auto_consumed',
      tick,
      simTimeMs,
      {
        itemType: 'food',
        quantity: 1,
        hungerRestored: foodRestore,
        newHunger: nextState.hunger,
        reason: 'Automatically consumed food while sleeping to prevent starvation',
      },
      agent.id
    ),
    events
  );

  return { agent: updated, newState: nextState, meta: nextMeta };
}

async function applyForcedSleep(agent: Agent, energy: number): Promise<Agent> {
  const criticalEnergy = getRuntimeConfig().needs.criticalEnergyThreshold ?? 10;
  if (energy >= criticalEnergy || agent.state === 'sleeping' || agent.state === 'dead') return agent;
  return (await updateAgent(agent.id, { state: 'sleeping' })) ?? agent;
}

async function processVitals(nowMs: number, tick: number, events: WorldEvent[]): Promise<string[]> {
  const deaths: string[] = [];
  const agents = await getAliveAgents();

  for (const initialAgent of agents) {
    const result = await materializeVitals(initialAgent.id, nowMs);
    if (!result) continue;

    if (result.vitals.dead) {
      // Death parity with the legacy tick engine: a dying agent emits ONLY
      // agent_died (tick-engine discarded the needs/warning events on death).
      await killAgent(initialAgent.id);
      deleteVitalsMeta(initialAgent.id);
      deleteAgentMeta(initialAgent.id);
      deaths.push(initialAgent.id);
      await emit(
        makeEvent(
          'agent_died',
          tick,
          nowMs,
          {
            cause: deathCause(result),
            finalState: { ...result.newState },
          },
          initialAgent.id
        ),
        events
      );
      continue;
    }

    const warningEvents = needsWarningEvents(initialAgent, result, tick, nowMs);
    for (const event of warningEvents) {
      await emit(event, events);
    }

    const effects = [...result.effects];
    const consumed = await autoConsumeWhileSleeping(
      initialAgent,
      result,
      effects,
      tick,
      nowMs,
      events
    );
    const finalState = consumed.newState;
    await applyForcedSleep(consumed.agent, finalState.energy);

    if (result.healthRegen > 0) {
      await emit(
        makeEvent(
          'health_regenerated',
          tick,
          nowMs,
          {
            amount: result.healthRegen,
            newHealth: finalState.health,
            reason: 'Well-fed and rested - passive health regeneration',
          },
          initialAgent.id
        ),
        events
      );
    }

    await emit(
      makeEvent(
        'needs_updated',
        tick,
        nowMs,
        {
          previousState: result.previousState,
          newState: finalState,
          effects,
        },
        initialAgent.id
      ),
      events
    );
  }

  return deaths;
}

async function regenerateResourcesContinuously(tick: number, dtMs: number): Promise<void> {
  if (dtMs <= 0) return;
  const runtime = getRuntimeConfig();
  const multipliers = runtime.seasons?.enabled ? getCurrentSeason(tick).multipliers : undefined;
  const spawns = await getAllResourceSpawns();
  const minutes = simMinutes(dtMs);

  for (const spawn of spawns) {
    if (spawn.currentAmount >= spawn.maxAmount) continue;
    const multiplier = multipliers
      ? (multipliers as unknown as Record<string, number>)[spawn.resourceType] ?? 1.0
      : 1.0;
    const nextAmount = Math.min(
      spawn.maxAmount,
      spawn.currentAmount + spawn.regenRate * multiplier * minutes
    );
    await updateResourceSpawn(spawn.id, { currentAmount: nextAmount });
  }
}

async function applySpoilageForAgent(
  agent: Agent,
  inventory: InventoryItem[],
  tick: number,
  simTimeMs: number,
  dtMs: number,
  events: WorldEvent[]
): Promise<void> {
  const config = getRuntimeConfig().spoilage;
  if (!config.enabled || dtMs <= 0 || agent.state === 'dead') return;

  const spoiledItems: Array<{
    itemType: string;
    previousQuantity: number;
    newQuantity: number;
    spoiledAmount: number;
    removed: boolean;
  }> = [];

  for (const item of inventory) {
    const perMinuteRate = config.rates[item.itemType] ?? 0;
    if (perMinuteRate <= 0) continue;

    const spoiledAmount = item.quantity * perMinuteRate * simMinutes(dtMs);
    if (spoiledAmount <= 0) continue;

    const newQuantity = item.quantity - spoiledAmount;
    const removed = newQuantity < config.removalThreshold;
    await updateInventoryQuantity(agent.id, item.itemType, removed ? 0 : newQuantity);
    spoiledItems.push({
      itemType: item.itemType,
      previousQuantity: item.quantity,
      newQuantity: removed ? 0 : newQuantity,
      spoiledAmount,
      removed,
    });
  }

  if (spoiledItems.length === 0) return;

  await emit(
    makeEvent(
      'items_spoiled',
      tick,
      simTimeMs,
      {
        spoiledItems,
        totalItemsSpoiled: spoiledItems.length,
        message: 'Perishable items have decayed. Trade or consume items quickly to avoid waste.',
      },
      agent.id
    ),
    events
  );
}

async function applyItemSpoilage(tick: number, simTimeMs: number, dtMs: number, events: WorldEvent[]): Promise<void> {
  const agents = await getAliveAgents();
  for (const agent of agents) {
    const inventory = await getAgentInventory(agent.id);
    await applySpoilageForAgent(agent, inventory, tick, simTimeMs, dtMs, events);
  }
}

async function applyCurrencyDecayAtBoundary(
  boundaryTick: number,
  events: WorldEvent[]
): Promise<void> {
  const config = getRuntimeConfig().economy;
  const simTimeMs = boundaryTick * TICK_MS;
  const agents = await getAliveAgents();

  for (const agent of agents) {
    if (agent.balance <= config.currencyDecayThreshold) continue;

    const decayAmount = Math.floor(agent.balance * config.currencyDecayRate);
    const actualDecay = Math.max(1, decayAmount);
    const newBalance = Math.max(config.currencyDecayThreshold, agent.balance - actualDecay);
    const appliedDecay = agent.balance - newBalance;
    if (appliedDecay <= 0) continue;

    await updateAgent(agent.id, { balance: newBalance });
    await emit(
      makeEvent(
        'currency_decay',
        boundaryTick,
        simTimeMs,
        {
          previousBalance: agent.balance,
          newBalance,
          decayAmount: appliedDecay,
          decayRate: config.currencyDecayRate,
          reason: 'Idle wealth loses value over time. Spend it or lose it.',
        },
        agent.id
      ),
      events
    );
  }
}

async function applyCurrencyDecay(tick: number, events: WorldEvent[]): Promise<void> {
  const interval = getRuntimeConfig().economy.currencyDecayInterval;
  if (interval <= 0) return;

  const highestBoundary = Math.floor(tick / interval) * interval;
  for (
    let boundary = lastCurrencyDecayBoundaryTick + interval;
    boundary <= highestBoundary;
    boundary += interval
  ) {
    await applyCurrencyDecayAtBoundary(boundary, events);
    lastCurrencyDecayBoundaryTick = boundary;
  }
}

function ageScents(tick: number): void {
  const maxAge = getRuntimeConfig().actions.move.scentDurationTicks;
  if (maxAge <= 0) {
    store.scents.clear();
    return;
  }

  for (const [key, scent] of store.scents) {
    if (tick - scent.tick >= maxAge) {
      store.scents.delete(key);
    }
  }
}

async function emitMinuteElapsed(
  previousTick: number,
  currentTick: number,
  events: WorldEvent[]
): Promise<void> {
  for (let minute = previousTick + 1; minute <= currentTick; minute++) {
    await emit(
      makeEvent('minute_elapsed', minute, minute * TICK_MS, { tick: minute }, undefined),
      events
    );
  }
}

async function emitPuzzleLifecycleSummary(
  tick: number,
  simTimeMs: number,
  dtMs: number,
  events: WorldEvent[]
): Promise<void> {
  const result = await processPuzzleLifecycle(tick, dtMs, null);
  if (
    result.expiredCount === 0 &&
    result.activatedGames.length === 0 &&
    result.newGames.length === 0
  ) {
    return;
  }

  await emit(
    makeEvent('puzzle_lifecycle', tick, simTimeMs, {
      expiredCount: result.expiredCount,
      activatedGames: result.activatedGames,
      newGames: result.newGames,
      creationProbability: result.creationProbability,
    }),
    events
  );
}

/**
 * Runs one housekeeping phase in isolation: a throw in one phase must not skip
 * the remaining phases (the legacy tick engine wrapped each phase in try/catch).
 */
async function safePhase(name: string, phase: () => Promise<void> | void): Promise<void> {
  try {
    await phase();
  } catch (error) {
    console.error(`[engine] housekeeping phase "${name}" failed:`, error);
  }
}

export async function runHousekeeping(nowMs: number, dtMs: number): Promise<HousekeepingSummary> {
  const safeDtMs = Math.max(0, dtMs);
  const previousTick = tickFromSimTime(Math.max(0, nowMs - safeDtMs));
  const tick = tickFromSimTime(nowMs);
  const events: WorldEvent[] = [];

  store.worldState = {
    ...store.worldState,
    currentTick: tick,
    lastTickAt: new Date(),
  };

  let deaths: string[] = [];
  await safePhase('vitals', async () => {
    deaths = await processVitals(nowMs, tick, events);
  });
  await safePhase('resource-regen', () => regenerateResourcesContinuously(tick, safeDtMs));
  await safePhase('spoilage', () => applyItemSpoilage(tick, nowMs, safeDtMs, events));
  await safePhase('currency-decay', () => applyCurrencyDecay(tick, events));

  await safePhase('gestation', async () => {
    const birthEvents = await completeGestations(tick, nowMs);
    for (const event of birthEvents) {
      await emit(
        {
          ...event,
          payload: withSimTime(event.payload, nowMs),
        },
        events
      );
    }
  });

  await safePhase('scent-aging', () => ageScents(tick));
  await safePhase('puzzles', () => emitPuzzleLifecycleSummary(tick, nowMs, safeDtMs, events));
  await safePhase('minute-elapsed', () => emitMinuteElapsed(previousTick, tick, events));

  await safePhase('death-cleanup', async () => {
    for (const agentId of deaths) {
      const deadAgent = await getAgentById(agentId);
      if (deadAgent?.state !== 'dead') {
        await killAgent(agentId);
      }
      deleteVitalsMeta(agentId);
      deleteAgentMeta(agentId);
    }
    // Once per minute boundary, sweep metadata orphaned by out-of-heartbeat
    // deaths (e.g. the harm handler killing an agent directly).
    if (tick > previousTick) {
      sweepVitalsMeta((agentId) => store.agents.get(agentId)?.state !== 'dead' && store.agents.has(agentId));
      sweepAgentMeta((agentId) => store.agents.get(agentId)?.state !== 'dead' && store.agents.has(agentId));
    }
  });

  return {
    tick,
    simTimeMs: nowMs,
    dtMs: safeDtMs,
    deaths,
    events,
  };
}
