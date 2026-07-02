/**
 * Reproduction & lineage queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/reproduction.ts`.
 */

import { v4 as uuid } from 'uuid';
import type {
  ReproductionState,
  NewReproductionState,
  AgentLineage,
  NewAgentLineage,
} from '../../db/schema';
import { store } from '../store';

// =============================================================================
// Reproduction States
// =============================================================================

/**
 * Create a reproduction state (start gestation)
 */
export async function createReproductionState(
  state: NewReproductionState
): Promise<ReproductionState> {
  const full: ReproductionState = {
    id: state.id ?? uuid(),
    tenantId: state.tenantId ?? null,
    parentAgentId: state.parentAgentId,
    partnerAgentId: state.partnerAgentId ?? null,
    gestationStartTick: state.gestationStartTick,
    gestationDurationTicks: state.gestationDurationTicks,
    offspringAgentId: state.offspringAgentId ?? null,
    status: state.status,
    failureReason: state.failureReason ?? null,
    createdAt: state.createdAt ?? new Date(),
    completedAt: state.completedAt ?? null,
  };
  store.reproductionStates.set(full.id, full);
  return full;
}

/**
 * Get active reproduction for an agent
 */
export async function getActiveReproduction(
  agentId: string
): Promise<ReproductionState | undefined> {
  return [...store.reproductionStates.values()].find(
    (s) => s.parentAgentId === agentId && s.status === 'gestating'
  );
}

/**
 * Get all gestating reproduction states
 */
export async function getGestatingStates(): Promise<ReproductionState[]> {
  return [...store.reproductionStates.values()].filter((s) => s.status === 'gestating');
}

/**
 * Complete reproduction (when gestation ends)
 */
export async function completeReproduction(
  reproductionId: string,
  offspringAgentId: string
): Promise<void> {
  const state = store.reproductionStates.get(reproductionId);
  if (!state) return;
  store.reproductionStates.set(reproductionId, {
    ...state,
    offspringAgentId,
    status: 'completed',
    completedAt: new Date(),
  });
}

/**
 * Fail reproduction
 */
export async function failReproduction(
  reproductionId: string,
  reason: string
): Promise<void> {
  const state = store.reproductionStates.get(reproductionId);
  if (!state) return;
  store.reproductionStates.set(reproductionId, {
    ...state,
    status: 'failed',
    failureReason: reason,
    completedAt: new Date(),
  });
}

/**
 * Get reproduction history for an agent
 */
export async function getReproductionHistory(
  agentId: string
): Promise<ReproductionState[]> {
  return [...store.reproductionStates.values()]
    .filter((s) => s.parentAgentId === agentId)
    .sort((a, b) => b.gestationStartTick - a.gestationStartTick);
}

// =============================================================================
// Agent Lineages
// =============================================================================

/**
 * Create lineage record for new offspring
 */
export async function createLineage(lineage: NewAgentLineage): Promise<AgentLineage> {
  const full: AgentLineage = {
    id: lineage.id ?? uuid(),
    tenantId: lineage.tenantId ?? null,
    agentId: lineage.agentId,
    generation: lineage.generation ?? 0,
    parentIds: lineage.parentIds ?? [],
    spawnedAtTick: lineage.spawnedAtTick,
    spawnedByParentId: lineage.spawnedByParentId ?? null,
    systemPromptBase: lineage.systemPromptBase ?? null,
    mutations: lineage.mutations ?? [],
    initialBalance: lineage.initialBalance ?? null,
    initialEnergy: lineage.initialEnergy ?? null,
    initialSpawnX: lineage.initialSpawnX ?? null,
    initialSpawnY: lineage.initialSpawnY ?? null,
    inheritedRelationships: lineage.inheritedRelationships ?? [],
    createdAt: lineage.createdAt ?? new Date(),
  };
  store.agentLineages.set(full.id, full);
  return full;
}

/**
 * Get lineage for an agent
 */
export async function getLineage(agentId: string): Promise<AgentLineage | undefined> {
  return [...store.agentLineages.values()].find((l) => l.agentId === agentId);
}

/**
 * Get all offspring of an agent
 */
export async function getOffspring(parentId: string): Promise<AgentLineage[]> {
  return [...store.agentLineages.values()]
    .filter((l) => l.spawnedByParentId === parentId)
    .sort((a, b) => b.spawnedAtTick - a.spawnedAtTick);
}

/**
 * Get generation statistics
 */
export async function getGenerationStats(): Promise<{
  generations: Map<number, number>;
  totalAgents: number;
  maxGeneration: number;
}> {
  const lineages = [...store.agentLineages.values()];

  const generations = new Map<number, number>();
  let maxGeneration = 0;

  for (const lineage of lineages) {
    const gen = lineage.generation;
    generations.set(gen, (generations.get(gen) || 0) + 1);
    if (gen > maxGeneration) maxGeneration = gen;
  }

  return {
    generations,
    totalAgents: lineages.length,
    maxGeneration,
  };
}

/**
 * Get lineage tree for an agent (ancestors + descendants)
 */
export async function getLineageTree(
  agentId: string,
  _depth: number = 3
): Promise<{
  agent: AgentLineage | undefined;
  parents: AgentLineage[];
  children: AgentLineage[];
  siblings: AgentLineage[];
}> {
  const agent = await getLineage(agentId);
  const children = await getOffspring(agentId);

  let parents: AgentLineage[] = [];
  let siblings: AgentLineage[] = [];

  if (agent && agent.parentIds && Array.isArray(agent.parentIds)) {
    const parentIds = agent.parentIds as string[];

    // Get parent lineages
    for (const parentId of parentIds) {
      const parentLineage = await getLineage(parentId);
      if (parentLineage) {
        parents.push(parentLineage);

        // Get siblings (other children of same parents)
        const parentChildren = await getOffspring(parentId);
        siblings = siblings.concat(
          parentChildren.filter((c) => c.agentId !== agentId)
        );
      }
    }

    // Deduplicate siblings
    const seen = new Set<string>();
    siblings = siblings.filter((s) => {
      if (seen.has(s.agentId)) return false;
      seen.add(s.agentId);
      return true;
    });
  }

  return {
    agent,
    parents,
    children,
    siblings,
  };
}

/**
 * Calculate mutation rate across population
 */
export async function getMutationStats(): Promise<{
  avgMutationsPerAgent: number;
  totalMutations: number;
}> {
  const lineages = [...store.agentLineages.values()];

  let totalMutations = 0;

  for (const lineage of lineages) {
    if (Array.isArray(lineage.mutations)) {
      totalMutations += lineage.mutations.length;
    }
  }

  return {
    avgMutationsPerAgent: lineages.length > 0 ? totalMutations / lineages.length : 0,
    totalMutations,
  };
}
