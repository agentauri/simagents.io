/**
 * Agent Roles & Retaliation Chains queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/roles.ts`. Ports the role
 * classification heuristics and retaliation aggregations to plain JS over the
 * shared in-memory store.
 *
 * Phase 2: Role crystallization and conflict tracking.
 */

import { v4 as uuid } from 'uuid';
import type { AgentRole, RetaliationChain } from '../../db/schema';
import { store } from '../store';

// =============================================================================
// Agent Roles - Role Crystallization
// =============================================================================

export type RoleType =
  | 'gatherer'
  | 'trader'
  | 'worker'
  | 'explorer'
  | 'enforcer'
  | 'predator'
  | 'victim'
  | 'unknown';

export interface RoleClassification {
  agentId: string;
  role: RoleType;
  confidence: number;
  actionBreakdown: Record<string, number>;
}

/** Max tick across all events (mirrors `SELECT COALESCE(MAX(tick), 0) FROM events`). */
function maxEventTick(): number {
  let max = 0;
  for (const e of store.events) {
    if (e.tick > max) max = e.tick;
  }
  return max;
}

/** Read a `targetAgentId` from an event payload. */
function payloadTargetAgentId(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>).targetAgentId;
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Read a `victimId` from an event payload. */
function payloadVictimId(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>).victimId;
    if (typeof v === 'string') return v;
  }
  return null;
}

/**
 * Classify an agent's role based on their action history.
 */
export async function classifyAgentRole(
  agentId: string,
  lookbackTicks: number = 100
): Promise<RoleClassification> {
  // Get action counts for this agent in the lookback window.
  //   event_type LIKE 'agent_%'
  //   AND event_type NOT IN ('agent_died', 'agent_spawned')
  //   AND tick >= MAX(tick) - lookbackTicks
  const tickFloor = maxEventTick() - lookbackTicks;

  const actionBreakdown: Record<string, number> = {};
  let totalActions = 0;

  for (const e of store.events) {
    if (e.agentId !== agentId) continue;
    if (!e.eventType.startsWith('agent_')) continue;
    if (e.eventType === 'agent_died' || e.eventType === 'agent_spawned') continue;
    if (e.tick < tickFloor) continue;
    actionBreakdown[e.eventType] = (actionBreakdown[e.eventType] || 0) + 1;
    totalActions += 1;
  }

  if (totalActions === 0) {
    return { agentId, role: 'unknown', confidence: 0, actionBreakdown };
  }

  // Calculate ratios
  const gatherCount = actionBreakdown['agent_gathered'] || 0;
  const tradeCount = actionBreakdown['agent_traded'] || 0;
  const workCount = actionBreakdown['agent_worked'] || 0;
  const moveCount = actionBreakdown['agent_moved'] || 0;
  const harmCount = actionBreakdown['agent_harmed'] || 0;
  const stealCount = actionBreakdown['agent_stole'] || 0;
  // const shareCount = actionBreakdown['agent_shared_info'] || 0; // (parity with source: unused)

  // Calculate role scores
  const scores: { role: RoleType; score: number }[] = [
    { role: 'gatherer', score: gatherCount / totalActions },
    { role: 'trader', score: tradeCount / totalActions },
    { role: 'worker', score: workCount / totalActions },
    { role: 'explorer', score: (moveCount / totalActions) * 0.8 }, // Discount movement
    { role: 'predator', score: (harmCount + stealCount) / totalActions },
    { role: 'enforcer', score: 0 }, // Will be calculated separately
  ];

  // Check if agent is an enforcer (attacks aggressors, not victims).
  //
  //   WITH attacker_list AS (
  //     SELECT DISTINCT agent_id FROM events
  //     WHERE event_type IN ('agent_harmed', 'agent_stole')
  //   )
  //   SELECT COUNT(*) FROM events e
  //   JOIN attacker_list a ON (payload->>'targetAgentId') = a.attacker
  //   WHERE e.agent_id = agentId
  //     AND e.event_type IN ('agent_harmed', 'agent_stole')
  const attackerSet = new Set<string>();
  for (const e of store.events) {
    if (
      (e.eventType === 'agent_harmed' || e.eventType === 'agent_stole') &&
      e.agentId
    ) {
      attackerSet.add(e.agentId);
    }
  }

  let interventionCount = 0;
  for (const e of store.events) {
    if (e.agentId !== agentId) continue;
    if (e.eventType !== 'agent_harmed' && e.eventType !== 'agent_stole') continue;
    const target = payloadTargetAgentId(e.payload);
    if (target && attackerSet.has(target)) interventionCount += 1;
  }

  if (interventionCount > 0 && harmCount > 0) {
    const enforcerScore = interventionCount / harmCount;
    scores.find((s) => s.role === 'enforcer')!.score = enforcerScore * 0.5;
  }

  // Check if agent is a victim.
  //
  //   SELECT COUNT(*) FROM events
  //   WHERE event_type IN ('agent_harmed', 'agent_stole')
  //     AND payload->>'targetAgentId' = agentId
  let victimCount = 0;
  for (const e of store.events) {
    if (e.eventType !== 'agent_harmed' && e.eventType !== 'agent_stole') continue;
    if (payloadTargetAgentId(e.payload) === agentId) victimCount += 1;
  }

  if (victimCount > totalActions * 0.1) {
    scores.push({ role: 'victim', score: victimCount / totalActions });
  }

  // Find dominant role
  scores.sort((a, b) => b.score - a.score);
  const topRole = scores[0];

  // Confidence is based on how dominant the role is
  const confidence =
    topRole.score > 0.3 ? Math.min(1, topRole.score * 1.5) : topRole.score;

  return {
    agentId,
    role: topRole.score > 0.1 ? topRole.role : 'unknown',
    confidence,
    actionBreakdown,
  };
}

/**
 * Get persisted role for an agent.
 */
export async function getAgentRole(agentId: string): Promise<AgentRole | null> {
  return store.agentRoles.get(agentId) ?? null;
}

/**
 * Update or create agent role in store (upsert keyed by agentId).
 */
export async function updateAgentRole(
  agentId: string,
  role: RoleType,
  confidence: number,
  tick: number
): Promise<AgentRole> {
  const existing = store.agentRoles.get(agentId);

  const updated: AgentRole = {
    id: existing?.id ?? uuid(),
    tenantId: existing?.tenantId ?? null,
    agentId,
    role,
    confidence,
    detectedAtTick: tick,
    updatedAt: new Date(),
  };

  store.agentRoles.set(agentId, updated);
  return updated;
}

/**
 * Update roles for all alive agents.
 */
export async function updateAllAgentRoles(tick: number): Promise<number> {
  const aliveAgents = [...store.agents.values()].filter((a) => a.state !== 'dead');

  let updatedCount = 0;

  for (const agent of aliveAgents) {
    const classification = await classifyAgentRole(agent.id);
    if (classification.role !== 'unknown' && classification.confidence > 0.2) {
      await updateAgentRole(agent.id, classification.role, classification.confidence, tick);
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Get all current agent roles.
 */
export async function getAllAgentRoles(): Promise<AgentRole[]> {
  return [...store.agentRoles.values()];
}

/**
 * Get role distribution (count per role, descending by count).
 */
export async function getRoleDistribution(): Promise<{ role: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const r of store.agentRoles.values()) {
    counts.set(r.role, (counts.get(r.role) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([role, count]) => ({ role, count: Number(count) }))
    .sort((a, b) => b.count - a.count);
}

// =============================================================================
// Retaliation Chains - Conflict Tracking
// =============================================================================

/**
 * Check if an attack is retaliation for a previous attack.
 */
export async function checkIsRetaliation(
  attackerId: string,
  victimId: string
): Promise<{ isRetaliation: boolean; existingChainId: string | null; depth: number }> {
  // Check if attacker was previously attacked by victim within recorded chains.
  //   SELECT chain_id, MAX(depth) FROM retaliation_chains
  //   WHERE victim_id = attackerId AND attacker_id = victimId
  //   GROUP BY chain_id ORDER BY max_depth DESC LIMIT 1
  let bestChainId: string | null = null;
  let bestMaxDepth = -1;
  const perChainMaxDepth = new Map<string, number>();

  for (const c of store.retaliationChains) {
    if (c.victimId === attackerId && c.attackerId === victimId) {
      const current = perChainMaxDepth.get(c.chainId);
      if (current === undefined || c.depth > current) {
        perChainMaxDepth.set(c.chainId, c.depth);
      }
    }
  }

  for (const [chainId, maxDepth] of perChainMaxDepth) {
    if (maxDepth > bestMaxDepth) {
      bestMaxDepth = maxDepth;
      bestChainId = chainId;
    }
  }

  if (bestChainId !== null) {
    return {
      isRetaliation: true,
      existingChainId: bestChainId,
      depth: Number(bestMaxDepth) + 1,
    };
  }

  // Also check if there's any previous attack (not in chains table yet).
  //   SELECT COUNT(*) FROM events
  //   WHERE event_type IN ('agent_harmed', 'agent_stole')
  //     AND agent_id = victimId
  //     AND (payload->>'victimId' = attackerId OR payload->>'targetAgentId' = attackerId)
  let previousAttackCount = 0;
  for (const e of store.events) {
    if (e.eventType !== 'agent_harmed' && e.eventType !== 'agent_stole') continue;
    if (e.agentId !== victimId) continue;
    if (
      payloadVictimId(e.payload) === attackerId ||
      payloadTargetAgentId(e.payload) === attackerId
    ) {
      previousAttackCount += 1;
    }
  }

  if (previousAttackCount > 0) {
    return {
      isRetaliation: true,
      existingChainId: null, // New chain will be created
      depth: 1,
    };
  }

  return { isRetaliation: false, existingChainId: null, depth: 0 };
}

/**
 * Record a retaliation chain entry.
 */
export async function recordRetaliationChain(
  attackerId: string,
  victimId: string,
  actionType: 'harm' | 'steal',
  tick: number,
  existingChainId?: string | null,
  depth: number = 0
): Promise<RetaliationChain> {
  const chainId = existingChainId || uuid();

  const row: RetaliationChain = {
    id: uuid(),
    tenantId: null,
    chainId,
    attackerId,
    victimId,
    actionType,
    depth,
    tick,
    createdAt: new Date(),
  };

  store.retaliationChains.push(row);
  return row;
}

/**
 * Get all active retaliation chains, grouped by chain id.
 */
export async function getActiveRetaliationChains(): Promise<{
  chainId: string;
  participants: string[];
  depth: number;
  lastTick: number;
}[]> {
  // Group by chain_id; collect distinct attacker ids then distinct victim ids
  // (mirrors STRING_AGG DISTINCT attacker || ',' || STRING_AGG DISTINCT victim),
  // dedupe, max depth, max tick. Order by last_tick DESC.
  interface Acc {
    attackers: Set<string>;
    victims: Set<string>;
    maxDepth: number;
    lastTick: number;
  }

  const groups = new Map<string, Acc>();
  for (const c of store.retaliationChains) {
    let acc = groups.get(c.chainId);
    if (!acc) {
      acc = { attackers: new Set(), victims: new Set(), maxDepth: c.depth, lastTick: c.tick };
      groups.set(c.chainId, acc);
    }
    acc.attackers.add(c.attackerId);
    acc.victims.add(c.victimId);
    if (c.depth > acc.maxDepth) acc.maxDepth = c.depth;
    if (c.tick > acc.lastTick) acc.lastTick = c.tick;
  }

  return [...groups.entries()]
    .map(([chainId, acc]) => ({
      chainId,
      // distinct attackers followed by distinct victims, then deduped.
      participants: [...new Set([...acc.attackers, ...acc.victims].filter(Boolean))],
      depth: Number(acc.maxDepth),
      lastTick: Number(acc.lastTick),
    }))
    .sort((a, b) => b.lastTick - a.lastTick);
}

/**
 * Get retaliation chain statistics.
 */
export async function getRetaliationStats(): Promise<{
  totalChains: number;
  activeChains: number;
  avgChainDepth: number;
  maxChainDepth: number;
  involvedAgents: number;
}> {
  // Per-chain max depth + last tick.
  const perChain = new Map<string, { maxDepth: number; lastTick: number }>();
  const involved = new Set<string>();

  for (const c of store.retaliationChains) {
    const existing = perChain.get(c.chainId);
    if (!existing) {
      perChain.set(c.chainId, { maxDepth: c.depth, lastTick: c.tick });
    } else {
      if (c.depth > existing.maxDepth) existing.maxDepth = c.depth;
      if (c.tick > existing.lastTick) existing.lastTick = c.tick;
    }
    involved.add(c.attackerId);
    involved.add(c.victimId);
  }

  const currentTick = maxEventTick();

  const totalChains = perChain.size;
  let activeChains = 0;
  let depthSum = 0;
  let maxChainDepth = 0;

  for (const { maxDepth, lastTick } of perChain.values()) {
    if (lastTick >= currentTick - 50) activeChains += 1;
    depthSum += maxDepth;
    if (maxDepth > maxChainDepth) maxChainDepth = maxDepth;
  }

  // COALESCE(AVG(max_depth), 0): AVG over chain_stats rows; 0 when no chains.
  const avgChainDepth = totalChains > 0 ? depthSum / totalChains : 0;

  return {
    totalChains: Number(totalChains) || 0,
    activeChains: Number(activeChains) || 0,
    avgChainDepth: Number(avgChainDepth) || 0,
    maxChainDepth: Number(maxChainDepth) || 0,
    involvedAgents: Number(involved.size) || 0,
  };
}
