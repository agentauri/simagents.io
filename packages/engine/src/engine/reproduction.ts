import { v4 as uuid } from 'uuid';
import type { Agent, NewAgent, ReproductionState } from '../db/schema';
import { store } from '../engine-memory/store';
import { CONFIG } from '../config';
import { createAgent, getAgentById } from '../engine-memory/queries/agents';
import {
  completeReproduction,
  failReproduction,
  createLineage,
  getGestatingStates,
  getLineage,
} from '../engine-memory/queries/reproduction';
import type { WorldEvent } from '../engine-memory/bus';
import { randomBelow } from '../utils/random';
import { setVitalsMeta } from './vitals-meta';

interface BornOffspring {
  id: string;
  generation: number;
  x: number;
  y: number;
}



function clampGrid(value: number): number {
  return Math.max(0, Math.min(CONFIG.simulation.gridSize - 1, value));
}

function mutateColor(hexColor: string, intensity: number): string {
  const valid = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor : '#888888';
  const r = parseInt(valid.slice(1, 3), 16);
  const g = parseInt(valid.slice(3, 5), 16);
  const b = parseInt(valid.slice(5, 7), 16);

  const spread = Math.round(100 * intensity);
  const mutate = (value: number) => Math.max(0, Math.min(255, value + randomBelow(2 * spread + 1) - spread));

  return `#${mutate(r).toString(16).padStart(2, '0')}${mutate(g)
    .toString(16)
    .padStart(2, '0')}${mutate(b).toString(16).padStart(2, '0')}`;
}

async function spawnOffspring(
  reproductionState: Pick<ReproductionState, 'id' | 'parentAgentId' | 'partnerAgentId' | 'mutationIntensity'>,
  tick: number,
  simTimeMs: number
): Promise<BornOffspring | null> {
  const parentAgent = await getAgentById(reproductionState.parentAgentId);
  if (!parentAgent || parentAgent.state === 'dead') return null;

  const parentLineage = await getLineage(reproductionState.parentAgentId);
  const parentGeneration = parentLineage?.generation ?? 0;
  const offspringGeneration = parentGeneration + 1;
  const offspringLLMType = parentAgent.llmType;

  const offspringId = uuid();
  const offspring: NewAgent = {
    id: offspringId,
    tenantId: parentAgent.tenantId,
    llmType: offspringLLMType,
    connectionId: parentAgent.connectionId,
    rosterEntryId: parentAgent.rosterEntryId,
    x: clampGrid(parentAgent.x + randomBelow(3) - 1),
    y: clampGrid(parentAgent.y + randomBelow(3) - 1),
    hunger: CONFIG.actions.spawnOffspring.offspringStartEnergy,
    energy: CONFIG.actions.spawnOffspring.offspringStartEnergy,
    health: 100,
    balance: CONFIG.actions.spawnOffspring.offspringStartBalance,
    state: 'idle',
    color: mutateColor(parentAgent.color || '#888888', reproductionState.mutationIntensity ?? 0.1),
  };

  const created = await createAgent(offspring);
  setVitalsMeta(created.id, { vitalsUpdatedAt: simTimeMs, criticalSince: {} });

  const parentIds = reproductionState.partnerAgentId
    ? [reproductionState.parentAgentId, reproductionState.partnerAgentId]
    : [reproductionState.parentAgentId];

  await createLineage({
    tenantId: parentAgent.tenantId,
    agentId: offspringId,
    generation: offspringGeneration,
    parentIds,
    spawnedAtTick: tick,
    spawnedByParentId: reproductionState.parentAgentId,
    initialBalance: CONFIG.actions.spawnOffspring.offspringStartBalance,
    initialEnergy: CONFIG.actions.spawnOffspring.offspringStartEnergy,
    initialSpawnX: created.x,
    initialSpawnY: created.y,
    mutations: created.color === parentAgent.color ? [] : [{ type: 'color', from: parentAgent.color, to: created.color }],
    inheritedRelationships: [],
  });

  return {
    id: offspringId,
    generation: offspringGeneration,
    x: created.x,
    y: created.y,
  };
}

export async function completeGestations(
  tick: number,
  simTimeMs: number
): Promise<WorldEvent[]> {
  const events: WorldEvent[] = [];
  const gestatingStates = await getGestatingStates();

  for (const state of gestatingStates) {
    const parent = store.agents.get(state.parentAgentId);
    if (!parent || parent.state === 'dead') {
      await failReproduction(state.id, 'Parent is no longer alive');
      continue;
    }
    if ([...store.agents.values()].filter((a) => a.state !== 'dead').length >= CONFIG.actions.spawnOffspring.maxPopulation) {
      await failReproduction(state.id, 'Population limit reached');
      continue;
    }
    const gestationEndTick = state.gestationStartTick + state.gestationDurationTicks;
    if (tick < gestationEndTick) continue;

    // One failed birth must not block the others (legacy tick-engine guarded
    // each spawnOffspring call individually).
    try {
      const offspring = await spawnOffspring(state, tick, simTimeMs);
      if (!offspring) {
        await failReproduction(state.id, 'Parent is no longer alive');
        continue;
      }

      await completeReproduction(state.id, offspring.id);
      events.push({
        id: uuid(),
        type: 'agent_born',
        tick,
        timestamp: Date.now(),
        agentId: offspring.id,
        payload: {
          parentId: state.parentAgentId,
          partnerId: state.partnerAgentId,
          generation: offspring.generation,
          x: offspring.x,
          y: offspring.y,
          simTimeMs,
        },
      });
    } catch (error) {
      console.error(`[engine] gestation completion failed for state ${state.id}:`, error);
    }
  }

  return events;
}
