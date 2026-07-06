/**
 * Gossip queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/gossip.ts`. The `id` column is a bigint
 * identity in the DB; here it is replaced by a monotonic counter on the store
 * (single-threaded, so no race).
 */

import type { GossipEvent, NewGossipEvent } from '../../db/schema';
import { store } from '../store';

/**
 * Record a gossip event
 */
export async function recordGossipEvent(gossip: NewGossipEvent): Promise<GossipEvent> {
  const row: GossipEvent = {
    id: store.nextGossipId++,
    tenantId: gossip.tenantId ?? null,
    tick: gossip.tick,
    sourceAgentId: gossip.sourceAgentId,
    targetAgentId: gossip.targetAgentId,
    subjectAgentId: gossip.subjectAgentId,
    topic: gossip.topic,
    claim: gossip.claim,
    sentiment: gossip.sentiment,
    evidenceEventId: gossip.evidenceEventId ?? null,
    createdAt: new Date(),
  };
  store.gossipEvents.push(row);
  return row;
}

/**
 * Get gossip about a specific agent
 */
export async function getGossipAbout(subjectAgentId: string): Promise<GossipEvent[]> {
  return store.gossipEvents
    .filter((g) => g.subjectAgentId === subjectAgentId)
    .sort((a, b) => b.tick - a.tick);
}

/**
 * Get gossip spread by an agent
 */
export async function getGossipSpreadBy(sourceAgentId: string): Promise<GossipEvent[]> {
  return store.gossipEvents
    .filter((g) => g.sourceAgentId === sourceAgentId)
    .sort((a, b) => b.tick - a.tick);
}

/**
 * Get gossip received by an agent
 */
export async function getGossipReceivedBy(targetAgentId: string): Promise<GossipEvent[]> {
  return store.gossipEvents
    .filter((g) => g.targetAgentId === targetAgentId)
    .sort((a, b) => b.tick - a.tick);
}

/**
 * Get gossip in a tick range
 */
export async function getGossipInRange(
  startTick: number,
  endTick: number
): Promise<GossipEvent[]> {
  return store.gossipEvents
    .filter((g) => g.tick >= startTick && g.tick <= endTick)
    .sort((a, b) => b.tick - a.tick);
}

/**
 * Get reputation summary for an agent based on gossip
 */
export async function getReputationSummary(subjectAgentId: string): Promise<{
  averageSentiment: number;
  gossipCount: number;
  topicBreakdown: Record<string, number>;
}> {
  const gossip = await getGossipAbout(subjectAgentId);

  if (gossip.length === 0) {
    return {
      averageSentiment: 0,
      gossipCount: 0,
      topicBreakdown: {},
    };
  }

  const totalSentiment = gossip.reduce((sum, g) => sum + g.sentiment, 0);
  const topicBreakdown: Record<string, number> = {};

  for (const g of gossip) {
    topicBreakdown[g.topic] = (topicBreakdown[g.topic] || 0) + 1;
  }

  return {
    averageSentiment: totalSentiment / gossip.length,
    gossipCount: gossip.length,
    topicBreakdown,
  };
}

/**
 * Get gossip network statistics
 */
export async function getGossipNetworkStats(tick: number): Promise<{
  totalGossipEvents: number;
  uniqueSpreaders: number;
  uniqueSubjects: number;
  averageSentiment: number;
}> {
  const allGossip = store.gossipEvents.filter((g) => g.tick <= tick);

  const spreaders = new Set(allGossip.map((g) => g.sourceAgentId));
  const subjects = new Set(allGossip.map((g) => g.subjectAgentId));
  const totalSentiment = allGossip.reduce((sum, g) => sum + g.sentiment, 0);

  return {
    totalGossipEvents: allGossip.length,
    uniqueSpreaders: spreaders.size,
    uniqueSubjects: subjects.size,
    averageSentiment: allGossip.length > 0 ? totalSentiment / allGossip.length : 0,
  };
}

/**
 * Calculate polarization index (how split opinions are)
 */
export async function getPolarizationIndex(subjectAgentId: string): Promise<number> {
  const gossip = await getGossipAbout(subjectAgentId);

  if (gossip.length < 2) return 0;

  const sentiments = gossip.map((g) => g.sentiment);
  const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const variance =
    sentiments.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sentiments.length;

  // Normalize to 0-1 scale (max variance is 10000 for -100 to 100 range)
  return Math.sqrt(variance) / 100;
}
