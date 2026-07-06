/**
 * Minimal tick loop — Phase 1 spike.
 *
 * Purpose: prove the simulation can advance with only the in-memory store, the
 * real physics constants (CONFIG) and the real pure grid utilities. Agents use
 * a simple rule-based policy (no LLM) so the spike has zero external
 * dependencies.
 *
 * This is intentionally a slim subset of `simulation/tick-engine.ts`
 * (COLLECT → APPLY → DECAY → REGEN → EMIT). The full engine port in Phase 1
 * proper reuses the real action handlers and orchestrator once their
 * `db/queries/*` imports resolve to these in-memory modules.
 */

import { v4 as uuid } from 'uuid';
import { CONFIG } from '../config';
import { getDistance, getPath, type Position } from '../world/grid';
import { shuffle } from '../utils/random';
import type { Agent } from '../db/schema';
import { getAliveAgents, updateAgent } from './queries/agents';
import {
  getAllResourceSpawns,
  getResourceSpawnsAtPosition,
  harvestResource,
  regenerateResources,
  incrementTick,
  getWorldState,
} from './queries/world';
import { getInventoryItem, addToInventory, removeFromInventory } from './queries/inventory';
import { appendEvent } from './queries/events';
import { publishEvent, type WorldEvent } from './bus';

const HUNGER_SEEK_THRESHOLD = 40;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

type Decision =
  | { action: 'consume'; itemType: 'food' }
  | { action: 'gather'; spawnId: string }
  | { action: 'move'; to: Position }
  | { action: 'idle' };

/** Find the nearest food spawn with stock to the given position. */
function nearestFoodSpawn(pos: Position, spawns: Awaited<ReturnType<typeof getAllResourceSpawns>>) {
  let best: { x: number; y: number; id: string } | null = null;
  let bestDist = Infinity;
  for (const s of spawns) {
    if (s.resourceType !== 'food' || s.currentAmount <= 0) continue;
    const d = getDistance(pos, { x: s.x, y: s.y });
    if (d < bestDist) {
      bestDist = d;
      best = { x: s.x, y: s.y, id: s.id };
    }
  }
  return best;
}

/** Rule-based survival policy (stand-in for an LLM/baseline decision). */
async function decide(
  agent: Agent,
  spawns: Awaited<ReturnType<typeof getAllResourceSpawns>>
): Promise<Decision> {
  const pos = { x: agent.x, y: agent.y };

  // 1. Eat if hungry and carrying food.
  if (agent.hunger < HUNGER_SEEK_THRESHOLD) {
    const food = await getInventoryItem(agent.id, 'food');
    if (food && food.quantity > 0) return { action: 'consume', itemType: 'food' };
  }

  // 2. Gather if standing on a stocked food spawn.
  const here = await getResourceSpawnsAtPosition(agent.x, agent.y);
  const stocked = here.find((s) => s.resourceType === 'food' && s.currentAmount > 0);
  if (stocked) return { action: 'gather', spawnId: stocked.id };

  // 3. Step toward the nearest food spawn.
  const target = nearestFoodSpawn(pos, spawns);
  if (target) {
    const path = getPath(pos, { x: target.x, y: target.y });
    if (path.length > 0) return { action: 'move', to: path[0] };
  }

  return { action: 'idle' };
}

/** Apply a decision, returning the result events (does not apply decay). */
async function applyDecision(agent: Agent, decision: Decision, tick: number): Promise<WorldEvent[]> {
  const events: WorldEvent[] = [];
  const emit = (type: string, payload: Record<string, unknown>) =>
    events.push({ id: uuid(), type, tick, timestamp: Date.now(), agentId: agent.id, payload });

  switch (decision.action) {
    case 'consume': {
      const remaining = await removeFromInventory(agent.id, 'food', 1);
      if (remaining < 0) break;
      const gain = CONFIG.actions.consume.effects.food.hunger ?? 50;
      await updateAgent(agent.id, { hunger: clamp(agent.hunger + gain), state: 'idle' });
      emit('agent_consumed', { itemType: 'food', hungerGain: gain });
      break;
    }
    case 'gather': {
      const qty = Math.min(CONFIG.actions.gather.maxPerAction, 3);
      const got = await harvestResource(decision.spawnId, qty);
      if (got <= 0) break;
      await addToInventory(agent.id, 'food', got);
      const energyCost = CONFIG.actions.gather.energyCostPerUnit * got;
      await updateAgent(agent.id, { energy: clamp(agent.energy - energyCost), state: 'working' });
      emit('agent_gathered', { resourceType: 'food', quantity: got, energyCost });
      break;
    }
    case 'move': {
      const energyCost = getDistance({ x: agent.x, y: agent.y }, decision.to); // 1 per tile
      await updateAgent(agent.id, {
        x: decision.to.x,
        y: decision.to.y,
        energy: clamp(agent.energy - energyCost),
        state: 'walking',
      });
      emit('agent_moved', { toX: decision.to.x, toY: decision.to.y, energyCost });
      break;
    }
    case 'idle':
      await updateAgent(agent.id, { state: 'idle' });
      break;
  }

  return events;
}

/** Apply needs decay to one agent, mirroring the real physics. Returns death flag + events. */
async function applyDecay(agent: Agent, tick: number): Promise<{ died: boolean; events: WorldEvent[] }> {
  const events: WorldEvent[] = [];
  // Re-read latest state (the action phase may have mutated it).
  const fresh = (await updateAgent(agent.id, {})) ?? agent;

  const hunger = clamp(fresh.hunger - CONFIG.needs.hungerDecay);
  const energy = clamp(fresh.energy - CONFIG.needs.energyDecay);
  let health = fresh.health;
  if (hunger < CONFIG.needs.criticalHungerThreshold) health -= CONFIG.needs.criticalHungerHealthDamage;
  if (energy < CONFIG.needs.criticalEnergyThreshold) health -= CONFIG.needs.criticalEnergyHealthDamage;
  health = clamp(health);

  if (health <= 0) {
    await updateAgent(agent.id, { hunger, energy, health: 0, state: 'dead', diedAt: new Date() });
    events.push({
      id: uuid(),
      type: 'agent_died',
      tick,
      timestamp: Date.now(),
      agentId: agent.id,
      payload: { cause: hunger <= 0 ? 'starvation' : 'exhaustion' },
    });
    return { died: true, events };
  }

  await updateAgent(agent.id, { hunger, energy, health });
  return { died: false, events };
}

export interface TickSummary {
  tick: number;
  agentCount: number;
  actionsApplied: number;
  deaths: number;
  events: WorldEvent[];
}

/** Run a single tick against the in-memory store. */
export async function runTick(): Promise<TickSummary> {
  const ws = await getWorldState();
  if (ws?.isPaused) {
    return { tick: ws.currentTick, agentCount: 0, actionsApplied: 0, deaths: 0, events: [] };
  }

  const newState = await incrementTick();
  const tick = newState.currentTick;
  const allEvents: WorldEvent[] = [];

  const tickStart: WorldEvent = { id: uuid(), type: 'tick_start', tick, timestamp: Date.now(), payload: {} };
  allEvents.push(tickStart);
  await publishEvent(tickStart);

  // COLLECT + APPLY
  const agents = await getAliveAgents();
  shuffle(agents); // deterministic order (seeded RNG) to avoid insertion-order bias
  const spawns = await getAllResourceSpawns();

  let actionsApplied = 0;
  for (const agent of agents) {
    const decision = await decide(agent, spawns);
    const resultEvents = await applyDecision(agent, decision, tick);
    if (decision.action !== 'idle') actionsApplied++;
    for (const e of resultEvents) {
      allEvents.push(e);
      await publishEvent(e);
    }
  }

  // DECAY
  let deaths = 0;
  for (const agent of agents) {
    const { died, events } = await applyDecay(agent, tick);
    if (died) deaths++;
    for (const e of events) {
      allEvents.push(e);
      await publishEvent(e);
    }
  }

  // REGEN
  await regenerateResources();

  const tickEnd: WorldEvent = {
    id: uuid(),
    type: 'tick_end',
    tick,
    timestamp: Date.now(),
    payload: { agentCount: agents.length - deaths, actionsApplied, deaths },
  };
  allEvents.push(tickEnd);
  await publishEvent(tickEnd);

  // EMIT (persist to the event log)
  for (const e of allEvents) {
    await appendEvent({ tick: e.tick, agentId: e.agentId ?? null, eventType: e.type, payload: e.payload });
  }

  return { tick, agentCount: agents.length - deaths, actionsApplied, deaths, events: allEvents };
}

/** Run N ticks sequentially. */
export async function runTicks(n: number): Promise<TickSummary[]> {
  const summaries: TickSummary[] = [];
  for (let i = 0; i < n; i++) summaries.push(await runTick());
  return summaries;
}
