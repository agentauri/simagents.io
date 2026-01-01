/**
 * Novelty Detection System
 *
 * Detects novel/unusual agent behaviors by analyzing event patterns.
 * Uses a multi-level approach:
 * 1. Event Enrichment - Create rich text descriptions of actions
 * 2. Action Fingerprinting - Hash action sequences for pattern matching
 * 3. Statistical Outlier Detection - Identify unusual patterns
 * 4. Semantic Labeling - Categorize detected novelties
 *
 * Architecture follows recommendations from scientific consultants:
 * - Event -> Enrichment -> Fingerprint -> Clustering -> Labeling
 */

import { mean, stdDev, entropy } from './experiment-analysis';

// =============================================================================
// Types
// =============================================================================

export interface EnrichedEvent {
  /** Original event ID */
  eventId: string;
  /** Event type (e.g., 'agent_trade', 'agent_harm') */
  type: string;
  /** Tick when event occurred */
  tick: number;
  /** Agent that performed the action */
  agentId: string;
  /** Rich text description for embedding */
  description: string;
  /** Structured metadata */
  metadata: {
    agentWealth?: number;
    agentHealth?: number;
    agentHunger?: number;
    agentEnergy?: number;
    targetAgentId?: string;
    targetWealth?: number;
    resourceType?: string;
    quantity?: number;
    success?: boolean;
    witnesses?: number;
  };
  /** Action fingerprint (hash of action pattern) */
  fingerprint: string;
}

export interface ActionSequence {
  agentId: string;
  actions: string[];
  fingerprint: string;
  frequency: number;
}

export interface NoveltyScore {
  eventId: string;
  agentId: string;
  tick: number;
  type: string;
  description: string;
  /** Novelty score 0-1 (1 = completely novel) */
  score: number;
  /** Reason for novelty classification */
  reason: string;
  /** Category of novelty */
  category: 'action' | 'sequence' | 'outcome' | 'social';
  /** Confidence in the classification */
  confidence: number;
}

export interface NoveltyReport {
  experimentId?: string;
  tickRange: { start: number; end: number };
  totalEvents: number;
  novelEvents: number;
  noveltyRate: number;
  topNovelties: NoveltyScore[];
  actionDistribution: Record<string, number>;
  sequencePatterns: ActionSequence[];
  emergentBehaviors: {
    label: string;
    description: string;
    frequency: number;
    examples: string[];
  }[];
}

// =============================================================================
// Event Enrichment
// =============================================================================

/**
 * Enrich a raw event with context and create a text description
 */
export function enrichEvent(
  event: {
    id: string;
    eventType: string;
    tick: number;
    agentId: string | null;
    payload: Record<string, unknown>;
  },
  agentState?: {
    balance?: number;
    health?: number;
    hunger?: number;
    energy?: number;
    llmType?: string;
  }
): EnrichedEvent {
  const payload = event.payload || {};
  const type = event.eventType;

  // Build rich description based on event type
  let description = '';
  const metadata: EnrichedEvent['metadata'] = {
    agentWealth: agentState?.balance,
    agentHealth: agentState?.health,
    agentHunger: agentState?.hunger,
    agentEnergy: agentState?.energy,
  };

  switch (type) {
    case 'agent_move':
      description = `Agent moved from (${payload.fromX}, ${payload.fromY}) to (${payload.toX}, ${payload.toY})`;
      break;

    case 'agent_gather':
      description = `Agent gathered ${payload.quantity || 1} ${payload.resourceType || 'resources'}`;
      metadata.resourceType = payload.resourceType as string;
      metadata.quantity = payload.quantity as number;
      break;

    case 'agent_trade':
      description = `Agent traded ${payload.offeringQuantity} ${payload.offeringItemType} for ${payload.requestingQuantity} ${payload.requestingItemType} with another agent`;
      metadata.targetAgentId = payload.targetAgentId as string;
      metadata.quantity = payload.offeringQuantity as number;
      break;

    case 'agent_harm':
    case 'agent_harmed':
      description = `Agent attacked another agent with ${payload.intensity || 'unknown'} intensity, dealing ${payload.damage || 0} damage`;
      if (payload.victimDied) {
        description += ' (fatal attack)';
      }
      metadata.targetAgentId = payload.victimId as string;
      metadata.witnesses = (payload.witnessIds as string[])?.length || 0;
      break;

    case 'agent_steal':
    case 'agent_stole':
      description = `Agent stole ${payload.quantity || 1} ${payload.itemType || 'items'} from another agent`;
      metadata.targetAgentId = payload.victimId as string;
      metadata.success = true;
      metadata.witnesses = (payload.witnessIds as string[])?.length || 0;
      break;

    case 'agent_steal_failed':
      description = `Agent attempted to steal from another agent but failed`;
      metadata.targetAgentId = payload.victimId as string;
      metadata.success = false;
      break;

    case 'agent_deceive':
      description = `Agent spread ${payload.claimType || 'false'} information: "${(payload.claim as string)?.slice(0, 100)}"`;
      metadata.targetAgentId = payload.targetAgentId as string;
      break;

    case 'agent_share_info':
      description = `Agent shared ${payload.infoType || 'information'} about another agent with sentiment ${payload.sentiment || 0}`;
      metadata.targetAgentId = payload.targetAgentId as string;
      break;

    case 'agent_work':
      description = `Agent worked for ${payload.duration || 1} ticks, earning ${payload.earned || 0} CITY`;
      break;

    case 'agent_consume':
      description = `Agent consumed ${payload.itemType || 'item'}`;
      break;

    case 'agent_sleep':
      description = `Agent rested for ${payload.duration || 1} ticks`;
      break;

    case 'agent_died':
      description = `Agent died from ${payload.cause || 'unknown causes'}`;
      break;

    case 'agent_born':
      description = `New agent born (generation ${payload.generation || 1}) at (${payload.x}, ${payload.y})`;
      break;

    default:
      description = `Agent performed ${type.replace('agent_', '')} action`;
  }

  // Add agent context to description
  if (agentState) {
    const statusParts: string[] = [];
    if (agentState.health !== undefined && agentState.health < 30) {
      statusParts.push('critically injured');
    }
    if (agentState.hunger !== undefined && agentState.hunger < 30) {
      statusParts.push('starving');
    }
    if (agentState.energy !== undefined && agentState.energy < 30) {
      statusParts.push('exhausted');
    }
    if (agentState.balance !== undefined && agentState.balance > 500) {
      statusParts.push('wealthy');
    } else if (agentState.balance !== undefined && agentState.balance < 10) {
      statusParts.push('poor');
    }

    if (statusParts.length > 0) {
      description += ` (agent was ${statusParts.join(', ')})`;
    }
  }

  // Generate fingerprint
  const fingerprint = generateFingerprint(type, payload);

  return {
    eventId: event.id,
    type,
    tick: event.tick,
    agentId: event.agentId || 'unknown',
    description,
    metadata,
    fingerprint,
  };
}

/**
 * Generate a fingerprint hash for an action pattern
 */
function generateFingerprint(type: string, payload: Record<string, unknown>): string {
  // Create a normalized representation of the action
  const parts: string[] = [type];

  // Add key parameters that define the action pattern
  if (payload.resourceType) parts.push(`res:${payload.resourceType}`);
  if (payload.intensity) parts.push(`int:${payload.intensity}`);
  if (payload.itemType) parts.push(`item:${payload.itemType}`);
  if (payload.claimType) parts.push(`claim:${payload.claimType}`);
  if (payload.infoType) parts.push(`info:${payload.infoType}`);
  if (payload.victimDied) parts.push('fatal');
  if (payload.success === false) parts.push('failed');

  // Simple hash function
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// =============================================================================
// Action Sequence Analysis
// =============================================================================

/**
 * Extract action sequences from enriched events
 */
export function extractActionSequences(
  events: EnrichedEvent[],
  windowSize = 5
): ActionSequence[] {
  // Group events by agent
  const agentEvents = new Map<string, EnrichedEvent[]>();
  for (const event of events) {
    if (!agentEvents.has(event.agentId)) {
      agentEvents.set(event.agentId, []);
    }
    agentEvents.get(event.agentId)!.push(event);
  }

  // Extract sequences per agent
  const sequences: ActionSequence[] = [];
  const sequenceCounts = new Map<string, number>();

  for (const [agentId, agentEventsList] of agentEvents) {
    // Sort by tick
    agentEventsList.sort((a, b) => a.tick - b.tick);

    // Extract sliding window sequences
    for (let i = 0; i <= agentEventsList.length - windowSize; i++) {
      const window = agentEventsList.slice(i, i + windowSize);
      const actions = window.map((e) => e.type);
      const fingerprint = actions.join('->');

      const count = (sequenceCounts.get(fingerprint) || 0) + 1;
      sequenceCounts.set(fingerprint, count);

      // Only add unique sequences per agent
      if (i === 0 || !sequences.find((s) => s.agentId === agentId && s.fingerprint === fingerprint)) {
        sequences.push({
          agentId,
          actions,
          fingerprint,
          frequency: 1,
        });
      }
    }
  }

  // Update frequencies
  for (const seq of sequences) {
    seq.frequency = sequenceCounts.get(seq.fingerprint) || 1;
  }

  return sequences;
}

// =============================================================================
// Novelty Scoring
// =============================================================================

/**
 * Calculate novelty scores for events
 */
export function calculateNoveltyScores(
  events: EnrichedEvent[],
  baselineDistribution?: Record<string, number>
): NoveltyScore[] {
  const scores: NoveltyScore[] = [];

  // Calculate action type distribution
  const actionCounts = new Map<string, number>();
  for (const event of events) {
    actionCounts.set(event.type, (actionCounts.get(event.type) || 0) + 1);
  }
  const totalEvents = events.length;

  // Calculate fingerprint frequencies
  const fingerprintCounts = new Map<string, number>();
  for (const event of events) {
    fingerprintCounts.set(event.fingerprint, (fingerprintCounts.get(event.fingerprint) || 0) + 1);
  }

  // Extract sequences for sequence-based novelty
  const sequences = extractActionSequences(events);
  const sequenceFreqs = new Map<string, number>();
  for (const seq of sequences) {
    sequenceFreqs.set(seq.fingerprint, seq.frequency);
  }

  // Score each event
  for (const event of events) {
    const actionFreq = (actionCounts.get(event.type) || 0) / totalEvents;
    const fingerprintFreq = (fingerprintCounts.get(event.fingerprint) || 0) / totalEvents;

    // Calculate novelty score based on multiple factors
    let score = 0;
    let reason = '';
    let category: NoveltyScore['category'] = 'action';
    let confidence = 0.5;

    // 1. Rare action type
    if (actionFreq < 0.01) {
      score += 0.4;
      reason = `Rare action type (${(actionFreq * 100).toFixed(2)}% of events)`;
      confidence = 0.8;
    } else if (actionFreq < 0.05) {
      score += 0.2;
      reason = `Uncommon action type (${(actionFreq * 100).toFixed(2)}% of events)`;
      confidence = 0.6;
    }

    // 2. Rare fingerprint (specific action pattern)
    if (fingerprintFreq < 0.005) {
      score += 0.3;
      reason = reason ? `${reason}; unique action pattern` : 'Unique action pattern';
      category = 'action';
      confidence = Math.max(confidence, 0.7);
    }

    // 3. Baseline deviation (if baseline provided)
    if (baselineDistribution) {
      const baselineFreq = baselineDistribution[event.type] || 0;
      const deviation = Math.abs(actionFreq - baselineFreq);
      if (deviation > 0.1) {
        score += 0.2;
        reason = reason ? `${reason}; deviates from baseline` : 'Deviates from baseline behavior';
        confidence = Math.max(confidence, 0.75);
      }
    }

    // 4. Social complexity (interactions with witnesses)
    if (event.metadata.witnesses && event.metadata.witnesses > 3) {
      score += 0.1;
      reason = reason ? `${reason}; high social visibility` : 'Highly visible social action';
      category = 'social';
    }

    // 5. Context-dependent novelty (unusual state-action combinations)
    if (event.metadata.agentWealth !== undefined && event.metadata.agentWealth < 10) {
      // Poor agent doing non-survival actions
      if (!['agent_gather', 'agent_work', 'agent_consume', 'agent_sleep'].includes(event.type)) {
        score += 0.15;
        reason = reason ? `${reason}; poor agent not prioritizing survival` : 'Non-survival behavior while poor';
        category = 'outcome';
      }
    }

    if (event.metadata.agentHealth !== undefined && event.metadata.agentHealth < 20) {
      // Injured agent being aggressive
      if (['agent_harm', 'agent_steal'].includes(event.type)) {
        score += 0.2;
        reason = reason ? `${reason}; injured agent being aggressive` : 'Aggressive behavior while injured';
        category = 'outcome';
        confidence = Math.max(confidence, 0.8);
      }
    }

    // Normalize score
    score = Math.min(score, 1);

    // Only record events above threshold
    if (score > 0.1) {
      scores.push({
        eventId: event.eventId,
        agentId: event.agentId,
        tick: event.tick,
        type: event.type,
        description: event.description,
        score,
        reason: reason || 'Standard action',
        category,
        confidence,
      });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

// =============================================================================
// Emergent Behavior Detection
// =============================================================================

/**
 * Detect emergent behavioral patterns
 */
export function detectEmergentBehaviors(
  events: EnrichedEvent[],
  sequences: ActionSequence[]
): NoveltyReport['emergentBehaviors'] {
  const behaviors: NoveltyReport['emergentBehaviors'] = [];

  // Group events by type
  const eventsByType = new Map<string, EnrichedEvent[]>();
  for (const event of events) {
    if (!eventsByType.has(event.type)) {
      eventsByType.set(event.type, []);
    }
    eventsByType.get(event.type)!.push(event);
  }

  // 1. Detect Altruism (giving without receiving)
  const trades = eventsByType.get('agent_trade') || [];
  const shareInfos = eventsByType.get('agent_share_info') || [];
  if (shareInfos.length > trades.length * 0.5 && shareInfos.length > 10) {
    behaviors.push({
      label: 'Information Sharing',
      description: 'Agents frequently share information without direct material benefit',
      frequency: shareInfos.length,
      examples: shareInfos.slice(0, 3).map((e) => e.description),
    });
  }

  // 2. Detect Revenge Patterns (harm following harm)
  const harms = eventsByType.get('agent_harm') || eventsByType.get('agent_harmed') || [];
  const revengePatterns = sequences.filter((s) =>
    s.fingerprint.includes('agent_harm') &&
    s.fingerprint.split('->').filter((a) => a.includes('harm')).length >= 2
  );
  if (revengePatterns.length > 5) {
    behaviors.push({
      label: 'Retaliatory Behavior',
      description: 'Agents engage in tit-for-tat violence patterns',
      frequency: revengePatterns.length,
      examples: revengePatterns.slice(0, 3).map((s) => s.fingerprint),
    });
  }

  // 3. Detect Resource Hoarding
  const gathers = eventsByType.get('agent_gather') || [];
  const consumes = eventsByType.get('agent_consume') || [];
  if (gathers.length > consumes.length * 3 && gathers.length > 50) {
    behaviors.push({
      label: 'Resource Hoarding',
      description: 'Agents accumulate resources significantly more than they consume',
      frequency: gathers.length - consumes.length,
      examples: [`Gather/Consume ratio: ${(gathers.length / Math.max(consumes.length, 1)).toFixed(1)}`],
    });
  }

  // 4. Detect Specialization (agents focusing on specific actions)
  const agentActionCounts = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (!agentActionCounts.has(event.agentId)) {
      agentActionCounts.set(event.agentId, new Map());
    }
    const counts = agentActionCounts.get(event.agentId)!;
    counts.set(event.type, (counts.get(event.type) || 0) + 1);
  }

  let specialists = 0;
  for (const [, counts] of agentActionCounts) {
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const max = Math.max(...Array.from(counts.values()));
    if (max / total > 0.5 && total > 10) {
      specialists++;
    }
  }

  if (specialists > agentActionCounts.size * 0.3) {
    behaviors.push({
      label: 'Role Specialization',
      description: 'Agents develop specialized behavioral patterns',
      frequency: specialists,
      examples: [`${specialists}/${agentActionCounts.size} agents show specialization`],
    });
  }

  // 5. Detect Cooperation Clusters (repeated positive interactions between same agents)
  const positiveInteractions = new Map<string, number>();
  for (const event of [...trades, ...shareInfos]) {
    if (event.metadata.targetAgentId) {
      const pair = [event.agentId, event.metadata.targetAgentId].sort().join('-');
      positiveInteractions.set(pair, (positiveInteractions.get(pair) || 0) + 1);
    }
  }

  const cooperationPairs = Array.from(positiveInteractions.entries())
    .filter(([, count]) => count >= 5);

  if (cooperationPairs.length > 3) {
    behaviors.push({
      label: 'Cooperation Networks',
      description: 'Stable cooperation relationships between specific agent pairs',
      frequency: cooperationPairs.length,
      examples: cooperationPairs.slice(0, 3).map(([pair, count]) => `${pair}: ${count} interactions`),
    });
  }

  return behaviors;
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generate a comprehensive novelty detection report
 */
export function generateNoveltyReport(
  events: EnrichedEvent[],
  options?: {
    experimentId?: string;
    baselineDistribution?: Record<string, number>;
    topN?: number;
  }
): NoveltyReport {
  const { experimentId, baselineDistribution, topN = 20 } = options || {};

  // Calculate tick range
  const ticks = events.map((e) => e.tick);
  const tickRange = {
    start: Math.min(...ticks),
    end: Math.max(...ticks),
  };

  // Calculate action distribution
  const actionDistribution: Record<string, number> = {};
  for (const event of events) {
    actionDistribution[event.type] = (actionDistribution[event.type] || 0) + 1;
  }

  // Normalize to percentages
  const total = events.length;
  for (const type of Object.keys(actionDistribution)) {
    actionDistribution[type] = actionDistribution[type] / total;
  }

  // Calculate novelty scores
  const noveltyScores = calculateNoveltyScores(events, baselineDistribution);

  // Extract sequences
  const sequences = extractActionSequences(events);

  // Detect emergent behaviors
  const emergentBehaviors = detectEmergentBehaviors(events, sequences);

  // Filter to top novel events
  const topNovelties = noveltyScores.slice(0, topN);
  const novelEvents = noveltyScores.filter((s) => s.score > 0.3).length;

  return {
    experimentId,
    tickRange,
    totalEvents: events.length,
    novelEvents,
    noveltyRate: novelEvents / events.length,
    topNovelties,
    actionDistribution,
    sequencePatterns: sequences.slice(0, 20), // Top 20 most frequent
    emergentBehaviors,
  };
}
