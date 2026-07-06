/**
 * Information Beliefs Queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/beliefs.ts`.
 *
 * Query functions for tracking and analyzing information beliefs
 * as they spread through agent networks (Phase 4: Information Cascade
 * Experiments). All `db.execute(sql...)` aggregations are reproduced as
 * equivalent JS over the in-memory `store.informationBeliefs` collection.
 */

import { v4 as uuid } from 'uuid';
import type { InformationBelief, NewInformationBelief } from '../../db/schema';
import { store } from '../store';

// =============================================================================
// Helpers
// =============================================================================

function allBeliefs(): InformationBelief[] {
  return [...store.informationBeliefs.values()];
}

const byReceivedTickDesc = (a: InformationBelief, b: InformationBelief) =>
  b.receivedTick - a.receivedTick;

// =============================================================================
// Core CRUD Operations
// =============================================================================

/**
 * Insert a new belief record.
 */
export async function insertBelief(
  belief: NewInformationBelief
): Promise<InformationBelief> {
  const inserted: InformationBelief = {
    id: belief.id ?? uuid(),
    tenantId: belief.tenantId ?? null,
    agentId: belief.agentId,
    infoHash: belief.infoHash,
    claimType: belief.claimType,
    claimContent: belief.claimContent,
    isTrue: belief.isTrue ?? null,
    sourceAgentId: belief.sourceAgentId ?? null,
    receivedTick: belief.receivedTick,
    actedOnTick: belief.actedOnTick ?? null,
    correctedTick: belief.correctedTick ?? null,
    correctionSourceId: belief.correctionSourceId ?? null,
    spreadCount: belief.spreadCount ?? 0,
    createdAt: belief.createdAt ?? new Date(),
  };
  store.informationBeliefs.set(inserted.id, inserted);
  return inserted;
}

/**
 * Get all beliefs held by an agent.
 */
export async function getAgentBeliefs(
  agentId: string
): Promise<InformationBelief[]> {
  return allBeliefs()
    .filter((b) => b.agentId === agentId)
    .sort(byReceivedTickDesc);
}

/**
 * Get a specific belief by agent and info hash.
 */
export async function getAgentBelief(
  agentId: string,
  infoHash: string
): Promise<InformationBelief | null> {
  const belief = allBeliefs().find(
    (b) => b.agentId === agentId && b.infoHash === infoHash
  );
  return belief ?? null;
}

/**
 * Check if an agent holds a specific belief.
 */
export async function agentHasBelief(
  agentId: string,
  infoHash: string
): Promise<boolean> {
  const belief = await getAgentBelief(agentId, infoHash);
  return belief !== null;
}

// =============================================================================
// Belief Lifecycle Tracking
// =============================================================================

/**
 * Record that an agent spread a belief to another agent.
 */
export async function recordBeliefSpread(
  sourceAgentId: string,
  targetAgentId: string,
  infoHash: string,
  claimType: string,
  claimContent: Record<string, unknown>,
  isTrue: boolean | null,
  tick: number,
  tenantId?: string
): Promise<InformationBelief> {
  // Increment spread count for source agent
  for (const belief of store.informationBeliefs.values()) {
    if (belief.agentId === sourceAgentId && belief.infoHash === infoHash) {
      belief.spreadCount += 1;
    }
  }

  // Insert belief for target agent (if they don't already have it)
  const existingBelief = await getAgentBelief(targetAgentId, infoHash);
  if (existingBelief) {
    return existingBelief;
  }

  return insertBelief({
    tenantId: tenantId ?? null,
    agentId: targetAgentId,
    infoHash,
    claimType,
    claimContent,
    isTrue,
    sourceAgentId,
    receivedTick: tick,
    spreadCount: 0,
  });
}

/**
 * Mark a belief as acted upon.
 */
export async function markBeliefActedOn(
  agentId: string,
  infoHash: string,
  tick: number
): Promise<void> {
  for (const belief of store.informationBeliefs.values()) {
    if (
      belief.agentId === agentId &&
      belief.infoHash === infoHash &&
      belief.actedOnTick === null
    ) {
      belief.actedOnTick = tick;
    }
  }
}

/**
 * Mark a belief as corrected (agent learned it was false).
 */
export async function markBeliefCorrected(
  agentId: string,
  infoHash: string,
  correctionSourceId: string | null,
  tick: number
): Promise<void> {
  for (const belief of store.informationBeliefs.values()) {
    if (
      belief.agentId === agentId &&
      belief.infoHash === infoHash &&
      belief.correctedTick === null
    ) {
      belief.correctedTick = tick;
      belief.correctionSourceId = correctionSourceId;
    }
  }
}

// =============================================================================
// Analytics Queries
// =============================================================================

/**
 * Get information penetration statistics for a specific claim.
 */
export async function getBeliefPenetration(
  infoHash: string,
  tenantId?: string
): Promise<{
  totalHolders: number;
  actedOnCount: number;
  correctedCount: number;
  activeCount: number; // Holders who haven't been corrected
}> {
  const matching = allBeliefs().filter(
    (b) =>
      b.infoHash === infoHash &&
      (tenantId === undefined || b.tenantId === tenantId)
  );

  const totalHolders = matching.length;
  const actedOnCount = matching.filter((b) => b.actedOnTick !== null).length;
  const correctedCount = matching.filter((b) => b.correctedTick !== null).length;

  return {
    totalHolders,
    actedOnCount,
    correctedCount,
    activeCount: totalHolders - correctedCount,
  };
}

/**
 * Get spread velocity (new belief holders per tick range).
 */
export async function getSpreadVelocity(
  infoHash: string,
  startTick: number,
  endTick: number
): Promise<number> {
  const count = allBeliefs().filter(
    (b) =>
      b.infoHash === infoHash &&
      b.receivedTick >= startTick &&
      b.receivedTick <= endTick
  ).length;

  const tickRange = endTick - startTick;
  if (tickRange <= 0) return 0;

  return count / tickRange;
}

/**
 * Get all false beliefs (misinformation) in the system.
 */
export async function getMisinformationBeliefs(
  tenantId?: string
): Promise<InformationBelief[]> {
  return allBeliefs()
    .filter(
      (b) =>
        b.isTrue === false &&
        (tenantId === undefined || b.tenantId === tenantId)
    )
    .sort(byReceivedTickDesc);
}

/**
 * Get top influencers (agents who spread beliefs the most).
 */
export async function getTopSpreaders(
  limit: number = 10,
  tenantId?: string
): Promise<Array<{ agentId: string; totalSpread: number; uniqueBeliefs: number }>> {
  const matching = allBeliefs().filter(
    (b) => tenantId === undefined || b.tenantId === tenantId
  );

  // GROUP BY agentId, aggregating SUM(spreadCount) and COUNT(DISTINCT infoHash).
  const grouped = new Map<
    string,
    { totalSpread: number; hashes: Set<string> }
  >();
  for (const b of matching) {
    let entry = grouped.get(b.agentId);
    if (!entry) {
      entry = { totalSpread: 0, hashes: new Set<string>() };
      grouped.set(b.agentId, entry);
    }
    entry.totalSpread += b.spreadCount;
    entry.hashes.add(b.infoHash);
  }

  return [...grouped.entries()]
    .map(([agentId, entry]) => ({
      agentId,
      totalSpread: entry.totalSpread,
      uniqueBeliefs: entry.hashes.size,
    }))
    .sort((a, b) => b.totalSpread - a.totalSpread)
    .slice(0, limit);
}

/**
 * Get belief chain depth (how many hops from source).
 */
export async function getBeliefChainDepth(
  infoHash: string
): Promise<Map<string, number>> {
  // Get all beliefs with this hash
  const beliefs = allBeliefs()
    .filter((b) => b.infoHash === infoHash)
    .map((b) => ({ agentId: b.agentId, sourceAgentId: b.sourceAgentId }));

  // Build depth map using BFS
  const depthMap = new Map<string, number>();
  const queue: Array<{ agentId: string; depth: number }> = [];

  // Find root nodes (no source = injected)
  for (const belief of beliefs) {
    if (belief.sourceAgentId === null) {
      depthMap.set(belief.agentId, 0);
      queue.push({ agentId: belief.agentId, depth: 0 });
    }
  }

  // Build source -> targets map
  const propagationMap = new Map<string, string[]>();
  for (const belief of beliefs) {
    if (belief.sourceAgentId) {
      const targets = propagationMap.get(belief.sourceAgentId) ?? [];
      targets.push(belief.agentId);
      propagationMap.set(belief.sourceAgentId, targets);
    }
  }

  // BFS to calculate depths
  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = propagationMap.get(current.agentId) ?? [];

    for (const targetId of targets) {
      if (!depthMap.has(targetId)) {
        depthMap.set(targetId, current.depth + 1);
        queue.push({ agentId: targetId, depth: current.depth + 1 });
      }
    }
  }

  return depthMap;
}

/**
 * Get correction latency statistics.
 */
export async function getCorrectionStats(
  infoHash: string
): Promise<{
  avgLatencyTicks: number;
  minLatencyTicks: number;
  maxLatencyTicks: number;
  correctedCount: number;
}> {
  // SQL aggregates (AVG/MIN/MAX) operate over the full row set; the
  // `correctedTick - receivedTick` expression is NULL for uncorrected rows
  // and is therefore ignored by the aggregates. COUNT(*) FILTER counts only
  // corrected rows. When no corrected rows exist, AVG/MIN/MAX return NULL,
  // which the original coalesces to 0 via `?? 0`.
  const matching = allBeliefs().filter((b) => b.infoHash === infoHash);

  const latencies = matching
    .filter((b) => b.correctedTick !== null)
    .map((b) => (b.correctedTick as number) - b.receivedTick);

  const correctedCount = latencies.length;

  if (correctedCount === 0) {
    return {
      avgLatencyTicks: 0,
      minLatencyTicks: 0,
      maxLatencyTicks: 0,
      correctedCount: 0,
    };
  }

  const sum = latencies.reduce((acc, v) => acc + v, 0);

  return {
    avgLatencyTicks: sum / correctedCount,
    minLatencyTicks: Math.min(...latencies),
    maxLatencyTicks: Math.max(...latencies),
    correctedCount,
  };
}

/**
 * Get belief diversity (unique claim types and hashes per agent).
 */
export async function getBeliefDiversity(
  tenantId?: string
): Promise<{
  totalUniqueBeliefs: number;
  avgBeliefsPerAgent: number;
  beliefsByType: Record<string, number>;
}> {
  const matching = allBeliefs().filter(
    (b) => tenantId === undefined || b.tenantId === tenantId
  );

  const uniqueHashes = new Set(matching.map((b) => b.infoHash));
  const uniqueAgents = new Set(matching.map((b) => b.agentId));
  const totalBeliefs = matching.length;

  // Mirrors COALESCE(totalAgents, 1) → defaults to 1 when there are no rows.
  const totalAgents = uniqueAgents.size === 0 ? 1 : uniqueAgents.size;

  const beliefsByType: Record<string, number> = {};
  for (const b of matching) {
    beliefsByType[b.claimType] = (beliefsByType[b.claimType] ?? 0) + 1;
  }

  return {
    totalUniqueBeliefs: uniqueHashes.size,
    avgBeliefsPerAgent: totalAgents > 0 ? totalBeliefs / totalAgents : 0,
    beliefsByType,
  };
}
