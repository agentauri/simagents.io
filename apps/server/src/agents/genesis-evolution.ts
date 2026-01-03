/**
 * Genesis Evolution Module - Evolutionary Loop for Agent Generation
 *
 * Implements a multi-generation evolutionary system where:
 * 1. Gen 0: Mother LLM generates N children
 * 2. Simulation runs for X ticks
 * 3. Feedback: Extract top performers (survivors, traits)
 * 4. Gen 1: Mother receives feedback, generates "improved" children
 * 5. Repeat for K generations
 *
 * Scientific Design:
 * - Selection pressure based on configurable criteria (survival, cooperation, wealth, etc.)
 * - Trait drift tracking to measure evolution across generations
 * - Convergence detection for early termination
 * - Full lineage tracking for analysis
 *
 * @module genesis-evolution
 */

import { v4 as uuid } from 'uuid';
import type { LLMType } from '../llm/types';
import type { PersonalityTrait } from './personalities';
import {
  type ChildSpecification,
  type GenesisConfig,
  type GenesisResult,
  type GenesisMetadata,
  type EvolutionConfig,
  type EvolutionResult,
  type SelectionCriteria,
  type GenerationStats,
  DEFAULT_EVOLUTION_CONFIG,
  ARCHETYPE_REQUIREMENTS,
} from './genesis-types';
import {
  buildGenesisPrompt,
  parseAndValidateOutput,
  validateDiversity,
  computePairwiseDistance,
  computeTraitEntropy,
  type LLMInvoker,
} from './genesis';
import {
  cacheGenesisResult,
  getCachedGenesis,
  hashGenesisConfig,
} from '../cache/genesis-cache';

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a survivor from simulation.
 */
export interface SurvivorInfo {
  /** Agent ID */
  agentId: string;
  /** Original child specification */
  childSpec: ChildSpecification;
  /** Fitness score based on selection criteria */
  fitnessScore: number;
  /** Survival duration in ticks */
  survivalTicks: number;
  /** Final health value */
  finalHealth: number;
  /** Final balance */
  finalBalance: number;
}

/**
 * Information about top performers.
 */
export interface TopPerformerInfo extends SurvivorInfo {
  /** Rank among all agents (1 = best) */
  rank: number;
  /** Key traits that contributed to success */
  successTraits: string[];
}

/**
 * Population-level statistics from simulation.
 */
export interface PopulationStats {
  /** Initial population size */
  initialCount: number;
  /** Final survivor count */
  survivorCount: number;
  /** Survival rate (0-1) */
  survivalRate: number;
  /** Average final health of survivors */
  avgHealth: number;
  /** Average final balance of survivors */
  avgBalance: number;
  /** Average social orientation of survivors */
  avgSocialOrientation: number;
  /** Average risk tolerance of survivors */
  avgRiskTolerance: number;
  /** Personality distribution of survivors */
  personalityDistribution: Record<PersonalityTrait, number>;
  /** Total ticks simulated */
  ticksSimulated: number;
  /** Cooperation events count */
  cooperationEvents: number;
  /** Conflict events count */
  conflictEvents: number;
  /** Trade events count */
  tradeEvents: number;
}

/**
 * Feedback from a simulation run.
 */
export interface SimulationFeedback {
  /** Information about surviving agents */
  survivors: SurvivorInfo[];
  /** Top performers based on selection criteria */
  topPerformers: TopPerformerInfo[];
  /** Population-level statistics */
  populationStats: PopulationStats;
  /** Traits that correlated with failure */
  failedTraits: FailedTraitInfo[];
  /** Suggestions for improvement (derived from analysis) */
  suggestions: string[];
}

/**
 * Information about traits that led to failure.
 */
export interface FailedTraitInfo {
  /** Trait description */
  trait: string;
  /** Number of agents with this trait that died */
  failureCount: number;
  /** Average survival time for agents with this trait */
  avgSurvivalTicks: number;
}

/**
 * Raw simulation results passed to the evolution system.
 */
export interface SimulationResults {
  /** Final tick of simulation */
  finalTick: number;
  /** Agent states at end of simulation */
  agentStates: AgentEndState[];
  /** Event counts by type */
  eventCounts: Record<string, number>;
  /** Original child specifications (indexed by agent ID) */
  childSpecsByAgentId: Map<string, ChildSpecification>;
}

/**
 * Agent state at end of simulation.
 */
export interface AgentEndState {
  id: string;
  isAlive: boolean;
  deathTick?: number;
  health: number;
  hunger: number;
  energy: number;
  balance: number;
}

/**
 * Lineage tracking for evolutionary analysis.
 */
export interface EvolutionLineage {
  /** Generation number */
  generation: number;
  /** Children specifications for this generation */
  children: ChildSpecification[];
  /** Feedback from simulation (null for initial generation) */
  feedback: SimulationFeedback | null;
  /** Genesis result for this generation */
  genesisResult: GenesisResult;
}

// =============================================================================
// Fitness Calculation
// =============================================================================

/**
 * Calculate fitness score for an agent based on selection criteria.
 *
 * @param state - Agent's end state
 * @param survivalTicks - How long the agent survived
 * @param totalTicks - Total simulation ticks
 * @param criteria - Selection criteria
 * @param eventCounts - Event counts for cooperation/wealth metrics
 * @returns Fitness score (higher is better)
 */
function calculateFitness(
  state: AgentEndState,
  survivalTicks: number,
  totalTicks: number,
  criteria: SelectionCriteria,
  eventCounts: Record<string, number>
): number {
  // Base survival component (0-100)
  const survivalScore = (survivalTicks / totalTicks) * 100;

  switch (criteria) {
    case 'survival_rate':
      // Pure survival focus
      return survivalScore;

    case 'cooperation_index':
      // Survival + cooperation bonus
      const coopEvents = eventCounts[`agent_${state.id}_trade`] ?? 0;
      const shareEvents = eventCounts[`agent_${state.id}_share_info`] ?? 0;
      const coopBonus = Math.min(50, (coopEvents + shareEvents) * 5);
      return survivalScore * 0.6 + coopBonus * 0.4;

    case 'wealth':
      // Survival + wealth accumulation
      const wealthScore = Math.min(100, state.balance);
      return survivalScore * 0.5 + wealthScore * 0.5;

    case 'longevity':
      // Survival time weighted heavily
      return survivalScore * 0.8 + (state.isAlive ? 20 : 0);

    case 'social_capital':
      // Social interactions weighted
      const socialEvents =
        (eventCounts[`agent_${state.id}_trade`] ?? 0) +
        (eventCounts[`agent_${state.id}_share_info`] ?? 0) +
        (eventCounts[`agent_${state.id}_issue_credential`] ?? 0);
      const socialScore = Math.min(100, socialEvents * 10);
      return survivalScore * 0.5 + socialScore * 0.5;

    default:
      return survivalScore;
  }
}

// =============================================================================
// Feedback Extraction
// =============================================================================

/**
 * Extract simulation feedback from raw results.
 *
 * @param results - Raw simulation results
 * @param criteria - Selection criteria for ranking
 * @param topPercentile - Percentage of top performers to identify (0-1)
 * @returns Structured feedback for evolution
 */
export function extractSimulationFeedback(
  results: SimulationResults,
  criteria: SelectionCriteria,
  topPercentile: number
): SimulationFeedback {
  const { finalTick, agentStates, eventCounts, childSpecsByAgentId } = results;

  // Calculate fitness for all agents
  const agentFitness: Array<{
    state: AgentEndState;
    spec: ChildSpecification;
    fitness: number;
    survivalTicks: number;
  }> = [];

  for (const state of agentStates) {
    const spec = childSpecsByAgentId.get(state.id);
    if (!spec) continue;

    const survivalTicks = state.isAlive
      ? finalTick
      : (state.deathTick ?? finalTick);

    const fitness = calculateFitness(
      state,
      survivalTicks,
      finalTick,
      criteria,
      eventCounts
    );

    agentFitness.push({ state, spec, fitness, survivalTicks });
  }

  // Sort by fitness (descending)
  agentFitness.sort((a, b) => b.fitness - a.fitness);

  // Identify survivors
  const survivors: SurvivorInfo[] = agentFitness
    .filter((a) => a.state.isAlive)
    .map((a) => ({
      agentId: a.state.id,
      childSpec: a.spec,
      fitnessScore: a.fitness,
      survivalTicks: a.survivalTicks,
      finalHealth: a.state.health,
      finalBalance: a.state.balance,
    }));

  // Identify top performers
  const topCount = Math.max(1, Math.ceil(agentStates.length * topPercentile));
  const topPerformers: TopPerformerInfo[] = agentFitness
    .slice(0, topCount)
    .map((a, i) => ({
      agentId: a.state.id,
      childSpec: a.spec,
      fitnessScore: a.fitness,
      survivalTicks: a.survivalTicks,
      finalHealth: a.state.health,
      finalBalance: a.state.balance,
      rank: i + 1,
      successTraits: identifySuccessTraits(a.spec, a.state),
    }));

  // Analyze failed traits
  const failedAgents = agentFitness.filter((a) => !a.state.isAlive);
  const failedTraits = analyzeFailedTraits(failedAgents);

  // Calculate population statistics
  const populationStats = calculatePopulationStats(
    agentStates,
    agentFitness,
    finalTick,
    eventCounts
  );

  // Generate suggestions based on analysis
  const suggestions = generateEvolutionSuggestions(
    survivors,
    failedTraits,
    populationStats,
    criteria
  );

  return {
    survivors,
    topPerformers,
    populationStats,
    failedTraits,
    suggestions,
  };
}

/**
 * Identify traits that contributed to an agent's success.
 */
function identifySuccessTraits(
  spec: ChildSpecification,
  state: AgentEndState
): string[] {
  const traits: string[] = [];

  // High survival indicators
  if (state.isAlive) {
    traits.push('survived');
  }

  // Resource management
  if (state.balance > 150) {
    traits.push('wealth_accumulator');
  }

  // Health maintenance
  if (state.health > 70) {
    traits.push('health_conscious');
  }

  // Personality indicators
  if (spec.riskTolerance < 0.3) {
    traits.push('risk_averse');
  } else if (spec.riskTolerance > 0.7) {
    traits.push('risk_taker');
  }

  if (spec.socialOrientation > 0.7) {
    traits.push('highly_social');
  } else if (spec.socialOrientation < 0.3) {
    traits.push('independent');
  }

  traits.push(`personality:${spec.personality}`);
  traits.push(`resource_focus:${spec.resourcePriority}`);

  return traits;
}

/**
 * Analyze traits that correlated with failure.
 */
function analyzeFailedTraits(
  failedAgents: Array<{
    state: AgentEndState;
    spec: ChildSpecification;
    survivalTicks: number;
  }>
): FailedTraitInfo[] {
  const traitFailures: Map<string, { count: number; totalTicks: number }> =
    new Map();

  const trackTrait = (trait: string, survivalTicks: number) => {
    const existing = traitFailures.get(trait) ?? { count: 0, totalTicks: 0 };
    existing.count++;
    existing.totalTicks += survivalTicks;
    traitFailures.set(trait, existing);
  };

  for (const agent of failedAgents) {
    // Track personality
    trackTrait(`personality:${agent.spec.personality}`, agent.survivalTicks);

    // Track risk levels
    if (agent.spec.riskTolerance > 0.7) {
      trackTrait('high_risk_tolerance', agent.survivalTicks);
    } else if (agent.spec.riskTolerance < 0.3) {
      trackTrait('low_risk_tolerance', agent.survivalTicks);
    }

    // Track social orientation
    if (agent.spec.socialOrientation > 0.7) {
      trackTrait('high_social', agent.survivalTicks);
    } else if (agent.spec.socialOrientation < 0.3) {
      trackTrait('low_social', agent.survivalTicks);
    }

    // Track resource priority
    trackTrait(`resource:${agent.spec.resourcePriority}`, agent.survivalTicks);
  }

  // Convert to sorted array
  const result: FailedTraitInfo[] = [];
  for (const [trait, data] of traitFailures) {
    if (data.count >= 2) {
      // Only include if multiple agents
      result.push({
        trait,
        failureCount: data.count,
        avgSurvivalTicks: data.totalTicks / data.count,
      });
    }
  }

  return result.sort((a, b) => b.failureCount - a.failureCount);
}

/**
 * Calculate population-level statistics.
 */
function calculatePopulationStats(
  agentStates: AgentEndState[],
  agentFitness: Array<{
    state: AgentEndState;
    spec: ChildSpecification;
    fitness: number;
    survivalTicks: number;
  }>,
  totalTicks: number,
  eventCounts: Record<string, number>
): PopulationStats {
  const survivors = agentFitness.filter((a) => a.state.isAlive);
  const survivalRate = survivors.length / agentStates.length;

  // Calculate averages for survivors
  const avgHealth =
    survivors.length > 0
      ? survivors.reduce((sum, a) => sum + a.state.health, 0) / survivors.length
      : 0;

  const avgBalance =
    survivors.length > 0
      ? survivors.reduce((sum, a) => sum + a.state.balance, 0) / survivors.length
      : 0;

  const avgSocialOrientation =
    survivors.length > 0
      ? survivors.reduce((sum, a) => sum + a.spec.socialOrientation, 0) /
        survivors.length
      : 0;

  const avgRiskTolerance =
    survivors.length > 0
      ? survivors.reduce((sum, a) => sum + a.spec.riskTolerance, 0) /
        survivors.length
      : 0;

  // Personality distribution of survivors
  const personalityDistribution: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0,
    cautious: 0,
    explorer: 0,
    social: 0,
    neutral: 0,
  };

  for (const survivor of survivors) {
    personalityDistribution[survivor.spec.personality]++;
  }

  // Count event types
  const cooperationEvents = Object.entries(eventCounts)
    .filter(([k]) => k.includes('trade') || k.includes('share'))
    .reduce((sum, [, v]) => sum + v, 0);

  const conflictEvents = Object.entries(eventCounts)
    .filter(([k]) => k.includes('harm') || k.includes('steal'))
    .reduce((sum, [, v]) => sum + v, 0);

  const tradeEvents = Object.entries(eventCounts)
    .filter(([k]) => k.includes('trade'))
    .reduce((sum, [, v]) => sum + v, 0);

  return {
    initialCount: agentStates.length,
    survivorCount: survivors.length,
    survivalRate,
    avgHealth,
    avgBalance,
    avgSocialOrientation,
    avgRiskTolerance,
    personalityDistribution,
    ticksSimulated: totalTicks,
    cooperationEvents,
    conflictEvents,
    tradeEvents,
  };
}

/**
 * Generate suggestions for improving the next generation.
 */
function generateEvolutionSuggestions(
  survivors: SurvivorInfo[],
  failedTraits: FailedTraitInfo[],
  stats: PopulationStats,
  criteria: SelectionCriteria
): string[] {
  const suggestions: string[] = [];

  // Survival-based suggestions
  if (stats.survivalRate < 0.3) {
    suggestions.push(
      'Low survival rate - consider more cautious, resource-focused agents'
    );
  } else if (stats.survivalRate > 0.8) {
    suggestions.push(
      'High survival rate - can afford to experiment with riskier strategies'
    );
  }

  // Criteria-specific suggestions
  switch (criteria) {
    case 'cooperation_index':
      if (stats.cooperationEvents < stats.initialCount) {
        suggestions.push(
          'Low cooperation - increase social orientation in next generation'
        );
      }
      break;
    case 'wealth':
      if (stats.avgBalance < 100) {
        suggestions.push(
          'Low wealth accumulation - consider more work-focused agents'
        );
      }
      break;
  }

  // Failed trait analysis
  const topFailedTraits = failedTraits.slice(0, 3);
  for (const trait of topFailedTraits) {
    suggestions.push(`Trait "${trait.trait}" had ${trait.failureCount} failures`);
  }

  // Survivor trait analysis
  if (survivors.length > 0) {
    const avgRisk =
      survivors.reduce((sum, s) => sum + s.childSpec.riskTolerance, 0) /
      survivors.length;
    if (avgRisk < 0.3) {
      suggestions.push('Survivors tend to be risk-averse');
    } else if (avgRisk > 0.7) {
      suggestions.push('Survivors tend to be risk-tolerant');
    }
  }

  return suggestions;
}

// =============================================================================
// Evolution Prompt Building
// =============================================================================

/**
 * Build the evolution prompt with feedback from previous generation.
 *
 * @param motherType - The LLM type generating children
 * @param generation - Current generation number (1-based for feedback generations)
 * @param childCount - Number of children to generate
 * @param previousFeedback - Feedback from previous generation simulation
 * @param config - Genesis configuration
 * @returns Formatted prompt string
 */
export function buildEvolutionPrompt(
  motherType: LLMType,
  generation: number,
  childCount: number,
  previousFeedback: SimulationFeedback,
  config?: Partial<GenesisConfig>
): string {
  const basePrompt = buildGenesisPrompt(motherType, childCount, config);
  const { survivors, topPerformers, populationStats, failedTraits, suggestions } =
    previousFeedback;

  // Format top performer profiles
  const topProfilesJson = JSON.stringify(
    topPerformers.slice(0, 5).map((p) => ({
      personality: p.childSpec.personality,
      riskTolerance: p.childSpec.riskTolerance,
      socialOrientation: p.childSpec.socialOrientation,
      resourcePriority: p.childSpec.resourcePriority,
      fitnessScore: p.fitnessScore.toFixed(2),
      survivalTicks: p.survivalTicks,
    })),
    null,
    2
  );

  // Format failed traits
  const failedTraitsText = failedTraits
    .slice(0, 5)
    .map(
      (t) =>
        `- ${t.trait}: ${t.failureCount} failures (avg survival: ${t.avgSurvivalTicks.toFixed(0)} ticks)`
    )
    .join('\n');

  // Format suggestions
  const suggestionsText = suggestions.map((s) => `- ${s}`).join('\n');

  return `${basePrompt}

## EVOLUTIONARY FEEDBACK - GENERATION ${generation}
This is generation ${generation}. You are receiving feedback from the previous generation's simulation results.

### Simulation Summary
- Initial population: ${populationStats.initialCount} agents
- Survivors: ${populationStats.survivorCount} (${(populationStats.survivalRate * 100).toFixed(1)}% survival rate)
- Ticks simulated: ${populationStats.ticksSimulated}
- Cooperation events: ${populationStats.cooperationEvents}
- Conflict events: ${populationStats.conflictEvents}
- Trade events: ${populationStats.tradeEvents}

### Survivor Trait Averages
- Average risk tolerance of survivors: ${populationStats.avgRiskTolerance.toFixed(2)}
- Average social orientation of survivors: ${populationStats.avgSocialOrientation.toFixed(2)}
- Average final health: ${populationStats.avgHealth.toFixed(1)}
- Average final balance: ${populationStats.avgBalance.toFixed(1)}

### Top Performer Profiles
These agents performed best in the simulation:
${topProfilesJson}

### Traits That Led to Failure
These trait combinations had higher failure rates:
${failedTraitsText || '- No significant failure patterns detected'}

### Recommendations
Based on the simulation results:
${suggestionsText || '- Continue with current strategy'}

### Your Evolution Task
Generate ${childCount} NEW children that learn from this feedback:
1. **Preserve successful patterns**: Top performers tended toward ${
    populationStats.avgRiskTolerance < 0.4
      ? 'lower risk tolerance'
      : populationStats.avgRiskTolerance > 0.6
        ? 'higher risk tolerance'
        : 'moderate risk tolerance'
  } and ${
    populationStats.avgSocialOrientation < 0.4
      ? 'lower social orientation'
      : populationStats.avgSocialOrientation > 0.6
        ? 'higher social orientation'
        : 'moderate social orientation'
  }.

2. **Avoid failure patterns**: Consider reducing traits that correlated with early death.

3. **Maintain diversity**: While learning from success, ensure you still have a diverse population for exploration.

4. **Innovate selectively**: Try small variations on successful strategies rather than completely new approaches.

Remember: This is evolution, not cloning. Create improved variations, not copies.`;
}

// =============================================================================
// Convergence Detection
// =============================================================================

/**
 * Detect if the population has converged (traits have become homogeneous).
 *
 * Convergence is detected when:
 * 1. Trait variance drops below threshold
 * 2. Pairwise distances become very small
 * 3. Personality distribution becomes concentrated
 *
 * @param generations - Array of generation results
 * @param threshold - Variance threshold for convergence (default: 0.1)
 * @returns True if convergence is detected
 */
export function detectConvergence(
  generations: GenesisResult[],
  threshold: number = 0.1
): boolean {
  if (generations.length < 2) {
    return false;
  }

  const latestGen = generations[generations.length - 1];
  const children = latestGen.children;

  if (children.length === 0) {
    return true; // No children = converged to extinction
  }

  // Check risk tolerance variance
  const riskValues = children.map((c) => c.riskTolerance);
  const riskVariance = computeVariance(riskValues);

  // Check social orientation variance
  const socialValues = children.map((c) => c.socialOrientation);
  const socialVariance = computeVariance(socialValues);

  // Check personality diversity
  const personalities = new Set(children.map((c) => c.personality));
  const personalityDiversity = personalities.size / 6; // 6 possible personalities

  // Check trait entropy
  const entropy = computeTraitEntropy(children);
  const maxEntropy = Math.log2(6); // Max entropy for 6 personalities
  const normalizedEntropy = entropy / maxEntropy;

  // Convergence if variance is very low and diversity is concentrated
  const isConverged =
    riskVariance < threshold &&
    socialVariance < threshold &&
    personalityDiversity < 0.5 &&
    normalizedEntropy < 0.5;

  if (isConverged) {
    console.log('[Evolution] Convergence detected:', {
      riskVariance: riskVariance.toFixed(4),
      socialVariance: socialVariance.toFixed(4),
      personalityDiversity,
      normalizedEntropy: normalizedEntropy.toFixed(4),
    });
  }

  return isConverged;
}

/**
 * Compute variance of an array of numbers.
 */
function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

// =============================================================================
// Trait Drift Computation
// =============================================================================

/**
 * Compute how much traits have changed from generation 0 to generation N.
 * Uses cosine distance in trait space.
 *
 * @param gen0 - Initial generation children
 * @param genN - Final generation children
 * @returns Drift value (0 = no change, higher = more change)
 */
export function computeTraitDrift(
  gen0: ChildSpecification[],
  genN: ChildSpecification[]
): number {
  if (gen0.length === 0 || genN.length === 0) {
    return 1.0; // Maximum drift if one generation is empty
  }

  // Compute centroid of each generation
  const centroid0 = computeCentroid(gen0);
  const centroidN = computeCentroid(genN);

  // Compute Euclidean distance between centroids
  const drift = Math.sqrt(
    (centroid0.riskTolerance - centroidN.riskTolerance) ** 2 +
    (centroid0.socialOrientation - centroidN.socialOrientation) ** 2 +
    (centroid0.personalityNumeric - centroidN.personalityNumeric) ** 2 +
    (centroid0.resourceNumeric - centroidN.resourceNumeric) ** 2
  );

  // Normalize to 0-1 range (max possible distance is sqrt(4) = 2)
  return Math.min(1.0, drift / 2);
}

/**
 * Compute centroid of a generation's traits.
 */
function computeCentroid(children: ChildSpecification[]): {
  riskTolerance: number;
  socialOrientation: number;
  personalityNumeric: number;
  resourceNumeric: number;
} {
  const n = children.length;

  // Map personalities to numeric values for centroid calculation
  const personalityMap: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0.2,
    cautious: 0.4,
    explorer: 0.6,
    social: 0.8,
    neutral: 1.0,
  };

  const resourceMap: Record<string, number> = {
    food: 0,
    energy: 0.33,
    material: 0.66,
    balanced: 1.0,
  };

  const riskTolerance =
    children.reduce((sum, c) => sum + c.riskTolerance, 0) / n;
  const socialOrientation =
    children.reduce((sum, c) => sum + c.socialOrientation, 0) / n;
  const personalityNumeric =
    children.reduce((sum, c) => sum + personalityMap[c.personality], 0) / n;
  const resourceNumeric =
    children.reduce((sum, c) => sum + (resourceMap[c.resourcePriority] ?? 0.5), 0) /
    n;

  return { riskTolerance, socialOrientation, personalityNumeric, resourceNumeric };
}

// =============================================================================
// Generation Statistics
// =============================================================================

/**
 * Compute statistics for a generation.
 */
function computeGenerationStats(
  generation: number,
  children: ChildSpecification[],
  feedback: SimulationFeedback | null
): GenerationStats {
  const personalityDistribution: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0,
    cautious: 0,
    explorer: 0,
    social: 0,
    neutral: 0,
  };

  for (const child of children) {
    personalityDistribution[child.personality]++;
  }

  return {
    generation,
    survivalRate: feedback?.populationStats.survivalRate ?? 1.0,
    avgRiskTolerance:
      children.reduce((sum, c) => sum + c.riskTolerance, 0) / children.length,
    avgSocialOrientation:
      children.reduce((sum, c) => sum + c.socialOrientation, 0) / children.length,
    personalityDistribution,
    topPerformers: feedback?.topPerformers.map((p) => p.childSpec.name) ?? [],
  };
}

// =============================================================================
// Main Evolution Function
// =============================================================================

/**
 * Run the evolutionary genesis loop.
 *
 * @param motherType - The LLM type to use as mother
 * @param config - Genesis configuration (must include evolutionConfig)
 * @param llmInvoker - LLM invocation interface
 * @param simulationRunner - Function that runs simulation and returns results
 * @returns Evolution result with all generations
 */
export async function runEvolutionaryGenesis(
  motherType: LLMType,
  config: GenesisConfig,
  llmInvoker: LLMInvoker,
  simulationRunner: (
    agents: ChildSpecification[]
  ) => Promise<SimulationResults>
): Promise<EvolutionResult> {
  const evolutionConfig: EvolutionConfig = {
    ...DEFAULT_EVOLUTION_CONFIG,
    ...config.evolutionConfig,
  };

  const {
    generations: maxGenerations,
    selectionCriteria,
    topPercentile,
    ticksPerGeneration,
  } = evolutionConfig;

  console.log(
    `[Evolution] Starting evolutionary genesis: ${motherType}, ` +
      `${maxGenerations} generations, ${config.childrenPerMother} children/gen`
  );

  const allGenerations: GenesisResult[] = [];
  const allLineages: EvolutionLineage[] = [];
  const generationStats: GenerationStats[] = [];
  let finalSurvivors: string[] = [];
  let lastFeedback: SimulationFeedback | null = null;

  for (let gen = 0; gen < maxGenerations; gen++) {
    const genStartTime = Date.now();
    console.log(`[Evolution] === Generation ${gen} ===`);

    // Generate children
    let genesisResult: GenesisResult;

    if (gen === 0) {
      // First generation: standard genesis
      genesisResult = await generateGeneration(
        motherType,
        config,
        llmInvoker,
        null
      );
    } else {
      // Subsequent generations: use feedback
      genesisResult = await generateGeneration(
        motherType,
        config,
        llmInvoker,
        { generation: gen, feedback: lastFeedback! }
      );
    }

    allGenerations.push(genesisResult);

    console.log(
      `[Evolution] Gen ${gen}: Generated ${genesisResult.children.length} children`
    );

    // Check for early termination (no children generated)
    if (genesisResult.children.length === 0) {
      console.log(`[Evolution] Gen ${gen}: No children generated, terminating`);
      break;
    }

    // Run simulation
    console.log(
      `[Evolution] Gen ${gen}: Running simulation for ${ticksPerGeneration} ticks`
    );
    const simResults = await simulationRunner(genesisResult.children);

    // Extract feedback
    const feedback = extractSimulationFeedback(
      simResults,
      selectionCriteria,
      topPercentile
    );
    lastFeedback = feedback;

    // Record lineage
    allLineages.push({
      generation: gen,
      children: genesisResult.children,
      feedback: gen > 0 ? feedback : null,
      genesisResult,
    });

    // Compute generation stats
    const stats = computeGenerationStats(gen, genesisResult.children, feedback);
    generationStats.push(stats);

    console.log(
      `[Evolution] Gen ${gen}: Survival rate ${(feedback.populationStats.survivalRate * 100).toFixed(1)}%, ` +
        `${feedback.survivors.length} survivors`
    );

    // Track final survivors
    finalSurvivors = feedback.survivors.map((s) => s.agentId);

    // Check for convergence
    if (detectConvergence(allGenerations)) {
      console.log(
        `[Evolution] Convergence detected at generation ${gen}, stopping early`
      );
      break;
    }

    // Check for extinction
    if (feedback.survivors.length === 0) {
      console.log(`[Evolution] Gen ${gen}: All agents died, terminating`);
      break;
    }

    const genDuration = Date.now() - genStartTime;
    console.log(`[Evolution] Gen ${gen}: Completed in ${genDuration}ms`);
  }

  // Compute trait drift
  const traitDrift =
    allGenerations.length >= 2
      ? computeTraitDrift(
          allGenerations[0].children,
          allGenerations[allGenerations.length - 1].children
        )
      : 0;

  const convergenceDetected = detectConvergence(allGenerations);

  console.log(
    `[Evolution] Completed: ${allGenerations.length} generations, ` +
      `trait drift: ${traitDrift.toFixed(4)}, converged: ${convergenceDetected}`
  );

  return {
    generations: allGenerations,
    finalSurvivors,
    traitDrift,
    convergenceDetected,
    generationStats,
  };
}

/**
 * Generate a single generation of children.
 *
 * @param motherType - The LLM type
 * @param config - Genesis configuration
 * @param llmInvoker - LLM invocation interface
 * @param evolutionContext - Optional context for evolutionary generation
 * @returns Genesis result
 */
async function generateGeneration(
  motherType: LLMType,
  config: GenesisConfig,
  llmInvoker: LLMInvoker,
  evolutionContext: {
    generation: number;
    feedback: SimulationFeedback;
  } | null
): Promise<GenesisResult> {
  const temperature = config.temperature ?? 0.8;
  const maxRetries = 3;

  let retryCount = 0;
  let bestResult: { children: ChildSpecification[]; raw: string } | null = null;
  let bestDiversityScore = 0;
  let totalPromptTokens = 0;
  let totalResponseTokens = 0;
  let totalLatencyMs = 0;

  while (retryCount < maxRetries) {
    // Build prompt (with temperature ramp on retry)
    const adjustedTemp = Math.min(1.0, temperature + retryCount * 0.1);

    let prompt: string;
    if (evolutionContext) {
      prompt = buildEvolutionPrompt(
        motherType,
        evolutionContext.generation,
        config.childrenPerMother,
        evolutionContext.feedback,
        config
      );
    } else {
      prompt = buildGenesisPrompt(motherType, config.childrenPerMother, config);
    }

    // Invoke LLM
    const llmResult = await llmInvoker.invoke(motherType, prompt, adjustedTemp);

    totalPromptTokens += llmResult.promptTokens;
    totalResponseTokens += llmResult.responseTokens;
    totalLatencyMs += llmResult.latencyMs;

    // Parse and validate
    const parsed = parseAndValidateOutput(llmResult.response);

    if (!parsed.isValid || parsed.validChildren.length === 0) {
      console.warn(
        `[Evolution] ${motherType}: Parse failed (attempt ${retryCount + 1}): ${parsed.errors.join(', ')}`
      );
      retryCount++;
      continue;
    }

    // Validate diversity
    const diversity = validateDiversity(parsed.validChildren, config);

    // Track best result
    if (!bestResult || diversity.diversityScore > bestDiversityScore) {
      bestResult = { children: parsed.validChildren, raw: llmResult.response };
      bestDiversityScore = diversity.diversityScore;
    }

    if (diversity.isValid) {
      console.log(
        `[Evolution] ${motherType}: Generated ${parsed.validChildren.length} children ` +
          `with diversity ${diversity.diversityScore.toFixed(2)}`
      );
      break;
    }

    console.warn(
      `[Evolution] ${motherType}: Low diversity (${diversity.diversityScore.toFixed(2)}), ` +
        `retry ${retryCount + 1}`
    );
    retryCount++;
  }

  if (!bestResult || bestResult.children.length === 0) {
    console.error(
      `[Evolution] ${motherType}: Failed to generate valid children after ${maxRetries} attempts`
    );
    // Return empty result instead of throwing
    return {
      id: uuid(),
      motherType,
      children: [],
      metadata: {
        promptTokens: totalPromptTokens,
        responseTokens: totalResponseTokens,
        latencyMs: totalLatencyMs,
        diversityScore: 0,
        retryCount,
        generatedAt: Date.now(),
        temperature,
      },
    };
  }

  const metadata: GenesisMetadata = {
    promptTokens: totalPromptTokens,
    responseTokens: totalResponseTokens,
    latencyMs: totalLatencyMs,
    diversityScore: bestDiversityScore,
    retryCount,
    generatedAt: Date.now(),
    temperature,
  };

  // Cache the result with a generation-specific key
  const cacheConfig = evolutionContext
    ? {
        ...config,
        seed: (config.seed ?? 0) + evolutionContext.generation * 1000,
      }
    : config;

  const result: GenesisResult = {
    id: uuid(),
    motherType,
    children: bestResult.children,
    metadata,
    rawResponse: bestResult.raw,
  };

  // Don't cache evolutionary generations (they depend on dynamic feedback)
  if (!evolutionContext) {
    await cacheGenesisResult(motherType, cacheConfig, result);
  }

  return result;
}

// =============================================================================
// Evolution Utilities
// =============================================================================

/**
 * Create a mock simulation runner for testing.
 * Simulates agent survival based on their traits.
 */
export function createMockSimulationRunner(
  ticksPerGeneration: number
): (agents: ChildSpecification[]) => Promise<SimulationResults> {
  return async (agents: ChildSpecification[]) => {
    const agentStates: AgentEndState[] = [];
    const childSpecsByAgentId = new Map<string, ChildSpecification>();
    const eventCounts: Record<string, number> = {};

    for (const spec of agents) {
      const agentId = uuid();
      childSpecsByAgentId.set(agentId, spec);

      // Simple survival model based on traits
      const survivalChance =
        0.3 + // Base survival
        spec.riskTolerance * -0.2 + // Higher risk = lower survival
        (spec.socialOrientation > 0.5 ? 0.2 : 0) + // Social bonus
        (spec.resourcePriority === 'food' ? 0.15 : 0) + // Food focus bonus
        (spec.personality === 'cautious' ? 0.15 : 0); // Cautious bonus

      const survived = Math.random() < survivalChance;
      const deathTick = survived
        ? undefined
        : Math.floor(Math.random() * ticksPerGeneration);

      agentStates.push({
        id: agentId,
        isAlive: survived,
        deathTick,
        health: survived ? 50 + Math.random() * 50 : 0,
        hunger: survived ? 30 + Math.random() * 40 : 0,
        energy: survived ? 30 + Math.random() * 40 : 0,
        balance: survived ? 50 + Math.random() * 100 : 0,
      });

      // Generate some mock event counts
      if (spec.socialOrientation > 0.5) {
        eventCounts[`agent_${agentId}_trade`] = Math.floor(Math.random() * 5);
        eventCounts[`agent_${agentId}_share_info`] = Math.floor(Math.random() * 3);
      }
    }

    return {
      finalTick: ticksPerGeneration,
      agentStates,
      eventCounts,
      childSpecsByAgentId,
    };
  };
}

/**
 * Analyze evolution results for insights.
 */
export function analyzeEvolutionResults(result: EvolutionResult): {
  summary: string;
  keyFindings: string[];
  traitTrends: {
    riskTolerance: number[];
    socialOrientation: number[];
  };
} {
  const keyFindings: string[] = [];
  const riskTrends: number[] = [];
  const socialTrends: number[] = [];

  for (const stats of result.generationStats) {
    riskTrends.push(stats.avgRiskTolerance);
    socialTrends.push(stats.avgSocialOrientation);
  }

  // Analyze trends
  if (riskTrends.length >= 2) {
    const riskChange = riskTrends[riskTrends.length - 1] - riskTrends[0];
    if (Math.abs(riskChange) > 0.1) {
      keyFindings.push(
        `Risk tolerance ${riskChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(riskChange).toFixed(2)}`
      );
    }
  }

  if (socialTrends.length >= 2) {
    const socialChange = socialTrends[socialTrends.length - 1] - socialTrends[0];
    if (Math.abs(socialChange) > 0.1) {
      keyFindings.push(
        `Social orientation ${socialChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(socialChange).toFixed(2)}`
      );
    }
  }

  if (result.convergenceDetected) {
    keyFindings.push('Population converged to homogeneous traits');
  }

  if (result.traitDrift > 0.3) {
    keyFindings.push(`High trait drift detected (${result.traitDrift.toFixed(2)})`);
  }

  const finalStats = result.generationStats[result.generationStats.length - 1];
  const summary = `Evolution completed with ${result.generations.length} generations. ` +
    `Final survival rate: ${(finalStats?.survivalRate * 100 || 0).toFixed(1)}%. ` +
    `Trait drift: ${result.traitDrift.toFixed(2)}. ` +
    `${result.convergenceDetected ? 'Population converged.' : 'Population remained diverse.'}`;

  return {
    summary,
    keyFindings,
    traitTrends: {
      riskTolerance: riskTrends,
      socialOrientation: socialTrends,
    },
  };
}
