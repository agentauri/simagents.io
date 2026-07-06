/**
 * Memory & relationship queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/memories.ts`.
 */

import { v4 as uuid } from 'uuid';
import type { AgentMemory, NewAgentMemory, AgentRelationship } from '../../db/schema';
import { CONFIG } from '../../config';
import { store, relationshipKey } from '../store';

export type MemoryType = 'observation' | 'action' | 'interaction' | 'reflection';

export interface CreateMemoryInput {
  agentId: string;
  type: MemoryType;
  content: string;
  importance?: number;
  emotionalValence?: number;
  involvedAgentIds?: string[];
  x?: number;
  y?: number;
  tick: number;
}

// =============================================================================
// Memory Operations
// =============================================================================

export async function storeMemory(input: CreateMemoryInput): Promise<AgentMemory> {
  const memory: AgentMemory = {
    id: uuid(),
    tenantId: null,
    agentId: input.agentId,
    type: input.type,
    content: input.content,
    importance: input.importance ?? 5,
    emotionalValence: input.emotionalValence ?? 0,
    involvedAgentIds: input.involvedAgentIds ?? [],
    x: input.x ?? null,
    y: input.y ?? null,
    tick: input.tick,
    createdAt: new Date(),
  };
  store.memories.set(memory.id, memory);
  return memory;
}

function memoriesFor(agentId: string): AgentMemory[] {
  return [...store.memories.values()].filter((m) => m.agentId === agentId);
}

const byTickThenImportance = (a: AgentMemory, b: AgentMemory) =>
  b.tick - a.tick || b.importance - a.importance;
const byImportanceThenTick = (a: AgentMemory, b: AgentMemory) =>
  b.importance - a.importance || b.tick - a.tick;

export async function getRecentMemories(
  agentId: string,
  limit: number = CONFIG.memory.recentCount
): Promise<AgentMemory[]> {
  return memoriesFor(agentId).sort(byTickThenImportance).slice(0, limit);
}

export async function getMemoriesInvolving(
  agentId: string,
  otherAgentId: string,
  limit: number = 10
): Promise<AgentMemory[]> {
  return memoriesFor(agentId)
    .filter((m) => (m.involvedAgentIds as string[]).includes(otherAgentId))
    .sort((a, b) => b.tick - a.tick)
    .slice(0, limit);
}

export async function getMemoriesByType(
  agentId: string,
  type: MemoryType,
  limit: number = 10
): Promise<AgentMemory[]> {
  return memoriesFor(agentId)
    .filter((m) => m.type === type)
    .sort((a, b) => b.tick - a.tick)
    .slice(0, limit);
}

export async function pruneOldMemories(
  agentId: string,
  maxMemories: number = CONFIG.memory.maxPerAgent
): Promise<number> {
  const mems = memoriesFor(agentId);
  if (mems.length <= maxMemories) return 0;
  const toDelete = mems.length - maxMemories;
  // Oldest + lowest importance first.
  const ordered = [...mems].sort((a, b) => a.importance - b.importance || a.tick - b.tick);
  for (const m of ordered.slice(0, toDelete)) store.memories.delete(m.id);
  return toDelete;
}

export async function getMemoriesAboutAgent(
  agentId: string,
  aboutAgentId: string,
  limit: number = 5
): Promise<AgentMemory[]> {
  return memoriesFor(agentId)
    .filter((m) => (m.involvedAgentIds as string[]).includes(aboutAgentId))
    .sort(byImportanceThenTick)
    .slice(0, limit);
}

export async function getMemoriesAtLocation(
  agentId: string,
  x: number,
  y: number,
  radius: number = 3,
  limit: number = 5
): Promise<AgentMemory[]> {
  return memoriesFor(agentId)
    .filter(
      (m) =>
        m.x !== null &&
        m.y !== null &&
        m.x >= x - radius &&
        m.x <= x + radius &&
        m.y >= y - radius &&
        m.y <= y + radius
    )
    .sort(byImportanceThenTick)
    .slice(0, limit);
}

export async function getMostImportantMemories(
  agentId: string,
  limit: number = 5
): Promise<AgentMemory[]> {
  return memoriesFor(agentId).sort(byImportanceThenTick).slice(0, limit);
}

export async function getEmotionalMemories(
  agentId: string,
  valenceThreshold: number,
  limit: number = 5
): Promise<AgentMemory[]> {
  const positive = valenceThreshold >= 0;
  return memoriesFor(agentId)
    .filter((m) =>
      positive ? m.emotionalValence >= valenceThreshold : m.emotionalValence <= valenceThreshold
    )
    .sort((a, b) =>
      positive
        ? b.emotionalValence - a.emotionalValence || b.tick - a.tick
        : a.emotionalValence - b.emotionalValence || b.tick - a.tick
    )
    .slice(0, limit);
}

export async function getMemoriesAboutAgents(
  agentId: string,
  aboutAgentIds: string[],
  limitPerAgent: number = 3
): Promise<Map<string, AgentMemory[]>> {
  const result = new Map<string, AgentMemory[]>();
  if (aboutAgentIds.length === 0) return result;
  for (const id of aboutAgentIds) result.set(id, []);

  const ordered = memoriesFor(agentId).sort(byImportanceThenTick);
  for (const memory of ordered) {
    const involved = memory.involvedAgentIds as string[];
    for (const targetId of aboutAgentIds) {
      if (involved.includes(targetId)) {
        const existing = result.get(targetId)!;
        if (existing.length < limitPerAgent) existing.push(memory);
      }
    }
  }
  return result;
}

// =============================================================================
// Relationship Operations
// =============================================================================

export async function getOrCreateRelationship(
  agentId: string,
  otherAgentId: string
): Promise<AgentRelationship> {
  const key = relationshipKey(agentId, otherAgentId);
  const existing = store.relationships.get(key);
  if (existing) return existing;

  const now = new Date();
  const created: AgentRelationship = {
    id: uuid(),
    tenantId: null,
    agentId,
    otherAgentId,
    trustScore: 0,
    interactionCount: 0,
    lastInteractionTick: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
  store.relationships.set(key, created);
  return created;
}

export async function getRelationship(
  agentId: string,
  otherAgentId: string
): Promise<AgentRelationship | null> {
  return store.relationships.get(relationshipKey(agentId, otherAgentId)) ?? null;
}

export async function getAgentRelationships(agentId: string): Promise<AgentRelationship[]> {
  return [...store.relationships.values()]
    .filter((r) => r.agentId === agentId)
    .sort((a, b) => b.trustScore - a.trustScore);
}

export async function updateRelationshipTrust(
  agentId: string,
  otherAgentId: string,
  trustDelta: number,
  tick: number,
  notes?: string
): Promise<AgentRelationship> {
  const relationship = await getOrCreateRelationship(agentId, otherAgentId);
  const newTrustScore = Math.max(-100, Math.min(100, relationship.trustScore + trustDelta));
  const updated: AgentRelationship = {
    ...relationship,
    trustScore: newTrustScore,
    interactionCount: relationship.interactionCount + 1,
    lastInteractionTick: tick,
    notes: notes ?? relationship.notes,
    updatedAt: new Date(),
  };
  store.relationships.set(relationshipKey(agentId, otherAgentId), updated);
  return updated;
}

export async function decayStaleRelationships(
  currentTick: number,
  ticksSinceLastInteraction: number = 100
): Promise<number> {
  const decayRate = CONFIG.memory.trustDecayPerTick;
  const staleThreshold = currentTick - ticksSinceLastInteraction;
  let decayed = 0;
  for (const [key, r] of store.relationships) {
    if (
      r.lastInteractionTick !== null &&
      r.lastInteractionTick < staleThreshold &&
      Math.abs(r.trustScore) > 1
    ) {
      const newScore = Math.max(-100, Math.min(100, r.trustScore - decayRate));
      store.relationships.set(key, { ...r, trustScore: newScore, updatedAt: new Date() });
      decayed++;
    }
  }
  return decayed;
}

export async function getRelationshipSummary(
  agentId: string
): Promise<{ positive: number; negative: number; neutral: number; totalInteractions: number }> {
  const relationships = await getAgentRelationships(agentId);
  return {
    positive: relationships.filter((r) => r.trustScore > 10).length,
    negative: relationships.filter((r) => r.trustScore < -10).length,
    neutral: relationships.filter((r) => r.trustScore >= -10 && r.trustScore <= 10).length,
    totalInteractions: relationships.reduce((sum, r) => sum + r.interactionCount, 0),
  };
}
