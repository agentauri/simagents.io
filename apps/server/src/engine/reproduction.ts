import { v4 as uuid } from 'uuid';
import type { Agent, NewAgent, ReproductionState } from '../db/schema';
import { CONFIG } from '../config';
import { createAgent, getAgentById } from '../engine-memory/queries/agents';
import {
  completeReproduction,
  createLineage,
  getGestatingStates,
  getLineage,
} from '../engine-memory/queries/reproduction';
import type { WorldEvent } from '../engine-memory/bus';
import { random, randomBelow, randomChoice } from '../utils/random';
import { setVitalsMeta } from './vitals-meta';

interface BornOffspring {
  id: string;
  generation: number;
  x: number;
  y: number;
}

const LLM_TYPES = ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'grok'] as const;

function clampGrid(value: number): number {
  return Math.max(0, Math.min(CONFIG.simulation.gridSize - 1, value));
}

function mutateColor(hexColor: string): string {
  const valid = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor : '#888888';
  const r = parseInt(valid.slice(1, 3), 16);
  const g = parseInt(valid.slice(3, 5), 16);
  const b = parseInt(valid.slice(5, 7), 16);

  const mutate = (value: number) => Math.max(0, Math.min(255, value + randomBelow(41) - 20));

  return `#${mutate(r).toString(16).padStart(2, '0')}${mutate(g)
    .toString(16)
    .padStart(2, '0')}${mutate(b).toString(16).padStart(2, '0')}`;
}

async function spawnOffspring(
  reproductionState: Pick<ReproductionState, 'id' | 'parentAgentId' | 'partnerAgentId'>,
  tick: number,
  simTimeMs: number
): Promise<BornOffspring | null> {
  const parentAgent = await getAgentById(reproductionState.parentAgentId);
  if (!parentAgent || parentAgent.state === 'dead') return null;

  const parentLineage = await getLineage(reproductionState.parentAgentId);
  const parentGeneration = parentLineage?.generation ?? 0;
  const offspringGeneration = parentGeneration + 1;
  const offspringLLMType =
    random() < 0.8 ? (parentAgent.llmType as Agent['llmType']) : randomChoice([...LLM_TYPES]) ?? 'claude';

  const offspringId = uuid();
  const offspring: NewAgent = {
    id: offspringId,
    tenantId: parentAgent.tenantId,
    llmType: offspringLLMType,
    x: clampGrid(parentAgent.x + randomBelow(3) - 1),
    y: clampGrid(parentAgent.y + randomBelow(3) - 1),
    hunger: CONFIG.actions.spawnOffspring.offspringStartEnergy,
    energy: CONFIG.actions.spawnOffspring.offspringStartEnergy,
    health: 100,
    balance: CONFIG.actions.spawnOffspring.offspringStartBalance,
    state: 'idle',
    color: mutateColor(parentAgent.color || '#888888'),
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
    mutations:
      offspringLLMType !== parentAgent.llmType
        ? [{ type: 'llm_type', from: parentAgent.llmType, to: offspringLLMType }]
        : [],
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
    const gestationEndTick = state.gestationStartTick + state.gestationDurationTicks;
    if (tick < gestationEndTick) continue;

    // One failed birth must not block the others (legacy tick-engine guarded
    // each spawnOffspring call individually).
    try {
      const offspring = await spawnOffspring(state, tick, simTimeMs);
      if (!offspring) continue;

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
