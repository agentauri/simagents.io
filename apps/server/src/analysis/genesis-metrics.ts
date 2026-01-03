/**
 * Genesis Metrics - LLM Mother-Child Generation Quality Analysis
 *
 * Provides specialized metrics for analyzing:
 * - LLM mother generation quality and diversity
 * - Population dynamics and trait distributions
 * - Lineage survival and cooperation patterns
 * - Multi-generational evolutionary drift
 *
 * @module genesis-metrics
 */

import type { PersonalityTrait } from '../agents/personalities';
import type { LLMType } from '../llm/types';
import type {
  ChildSpecification,
  GenesisResult,
  ResourcePriority,
} from '../agents/genesis-types';
import type { Agent, Event } from '../db/schema';
import { mean, variance, entropy } from './experiment-analysis';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Result of a single genesis metrics computation.
 */
export interface GenesisMetricsResult {
  motherId: string;
  motherType: LLMType;
  childCount: number;
  traitEntropy: number;
  diversityScore: number;
  qualityScore: GenesisQualityScore;
  archetypeDistribution: Record<PersonalityTrait, number>;
  populationBalance: PopulationBalanceResult;
}

/**
 * Population balance metrics.
 */
export interface PopulationBalanceResult {
  avgRiskTolerance: number;
  avgSocialOrientation: number;
  riskVariance: number;
  socialVariance: number;
  balanceScore: number;
}

/**
 * Genesis quality score breakdown.
 */
export interface GenesisQualityScore {
  diversityScore: number;
  balanceScore: number;
  archetypeCoverage: number;
  overallQuality: number;
}

/**
 * Intra-family cooperation metrics.
 */
export interface IntraFamilyCooperationResult {
  intraFamilyTradeRate: number;
  interFamilyTradeRate: number;
  cooperationBias: number;
}

/**
 * Mother comparison report.
 */
export interface MotherComparisonReport {
  byMother: Record<LLMType, MotherPerformance>;
  rankings: {
    byQuality: LLMType[];
    bySurvival: LLMType[];
    byDiversity: LLMType[];
  };
  bestMother: LLMType;
  worstMother: LLMType;
}

/**
 * Individual mother performance metrics.
 */
export interface MotherPerformance {
  childCount: number;
  survivalRate: number;
  avgDiversity: number;
  traitEntropy: number;
  qualityScore: number;
  avgLifespan: number;
}

/**
 * Aggregated metrics across multiple runs.
 */
export interface AggregatedGenesisMetrics {
  totalRuns: number;
  avgChildrenPerMother: number;
  avgDiversity: number;
  avgQualityScore: number;
  byMother: Record<LLMType, {
    runs: number;
    avgChildCount: number;
    avgSurvivalRate: number;
    avgDiversity: number;
    avgQuality: number;
    stdDevQuality: number;
  }>;
  overallTrends: {
    diversityTrend: 'improving' | 'stable' | 'declining';
    qualityTrend: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Complete genesis metrics report.
 */
export interface GenesisMetricsReport {
  byMother: Record<LLMType, {
    childCount: number;
    survivalRate: number;
    avgDiversity: number;
    traitEntropy: number;
    qualityScore: number;
  }>;
  population: {
    totalChildren: number;
    overallDiversity: number;
    archetypeDistribution: Record<string, number>;
    cooperationBias: number;
  };
  comparison: {
    jsDivergenceMatrix: Record<string, Record<string, number>>;
    bestMother: LLMType;
    worstMother: LLMType;
  };
}

/**
 * Simulation result for analysis (simplified).
 */
export interface SimulationResult {
  agentId: string;
  motherType: LLMType;
  survived: boolean;
  ticksAlive: number;
  finalWealth: number;
  tradeCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const ALL_PERSONALITIES: PersonalityTrait[] = [
  'aggressive', 'cooperative', 'cautious', 'explorer', 'social', 'neutral'
];

const ALL_RESOURCE_PRIORITIES: ResourcePriority[] = [
  'food', 'energy', 'material', 'balanced'
];

// =============================================================================
// 1. Lineage Survival Rate
// =============================================================================

/**
 * Compute survival rate by LLM mother type.
 *
 * @param agents - Array of all agents (with state indicating dead/alive)
 * @param genesisResults - Genesis results mapping agents to mothers
 * @returns Record mapping each LLM type to its survival rate (0-1)
 */
export function computeLineageSurvivalRate(
  agents: Agent[],
  genesisResults: GenesisResult[]
): Record<LLMType, number> {
  // Build mapping from child name to mother type
  const childToMother = new Map<string, LLMType>();
  for (const result of genesisResults) {
    for (const child of result.children) {
      childToMother.set(child.name.toLowerCase(), result.motherType);
    }
  }

  // Count alive and total by mother
  const motherCounts: Record<string, { alive: number; total: number }> = {};

  for (const agent of agents) {
    // Try to find mother by agent name or LLM type
    const motherType = childToMother.get(agent.id.toLowerCase()) ||
                       (agent.llmType as LLMType);

    if (!motherCounts[motherType]) {
      motherCounts[motherType] = { alive: 0, total: 0 };
    }

    motherCounts[motherType].total++;
    if (agent.state !== 'dead') {
      motherCounts[motherType].alive++;
    }
  }

  // Compute survival rates
  const result: Record<string, number> = {};
  for (const [mother, counts] of Object.entries(motherCounts)) {
    result[mother] = counts.total > 0 ? counts.alive / counts.total : 0;
  }

  return result as Record<LLMType, number>;
}

// =============================================================================
// 2. Trait Entropy
// =============================================================================

/**
 * Compute Shannon entropy of trait distribution.
 * Higher entropy indicates more diverse trait distribution.
 *
 * @param children - Array of child specifications
 * @returns Shannon entropy in bits (0 = uniform, higher = more diverse)
 */
export function computeTraitEntropy(children: ChildSpecification[]): number {
  if (children.length === 0) return 0;

  // Compute entropy for each trait dimension
  const personalityEntropy = computeCategoricalEntropy(
    children.map(c => c.personality),
    ALL_PERSONALITIES
  );

  const resourceEntropy = computeCategoricalEntropy(
    children.map(c => c.resourcePriority),
    ALL_RESOURCE_PRIORITIES
  );

  // Discretize continuous traits into bins
  const riskBins = discretize(children.map(c => c.riskTolerance), 5);
  const socialBins = discretize(children.map(c => c.socialOrientation), 5);

  const riskEntropy = computeDiscreteEntropy(riskBins, 5);
  const socialEntropy = computeDiscreteEntropy(socialBins, 5);

  // Combined entropy (weighted average)
  const totalEntropy = (
    personalityEntropy * 0.3 +
    resourceEntropy * 0.2 +
    riskEntropy * 0.25 +
    socialEntropy * 0.25
  );

  return totalEntropy;
}

/**
 * Compute entropy for categorical variables.
 */
function computeCategoricalEntropy<T extends string>(
  values: T[],
  allCategories: T[]
): number {
  if (values.length === 0) return 0;

  const counts: Record<string, number> = {};
  for (const cat of allCategories) {
    counts[cat] = 0;
  }
  for (const val of values) {
    counts[val] = (counts[val] || 0) + 1;
  }

  const total = values.length;
  const probabilities = Object.values(counts).map(c => c / total).filter(p => p > 0);

  return entropy(probabilities);
}

/**
 * Compute entropy for discrete bins.
 */
function computeDiscreteEntropy(bins: number[], numBins: number): number {
  const counts = new Array(numBins).fill(0);
  for (const bin of bins) {
    if (bin >= 0 && bin < numBins) {
      counts[bin]++;
    }
  }

  const total = bins.length;
  if (total === 0) return 0;

  const probabilities = counts.map(c => c / total).filter(p => p > 0);
  return entropy(probabilities);
}

/**
 * Discretize continuous values into bins.
 */
function discretize(values: number[], numBins: number): number[] {
  return values.map(v => {
    const bin = Math.floor(v * numBins);
    return Math.min(bin, numBins - 1);
  });
}

// =============================================================================
// 3. Mother JS-Divergence
// =============================================================================

/**
 * Compute Jensen-Shannon divergence between two mothers' child populations.
 *
 * @param mother1Children - Children from first mother
 * @param mother2Children - Children from second mother
 * @returns JS divergence (0 = identical, 1 = completely different)
 */
export function computeMotherJSDivergence(
  mother1Children: ChildSpecification[],
  mother2Children: ChildSpecification[]
): number {
  if (mother1Children.length === 0 || mother2Children.length === 0) {
    return 1; // Maximum divergence if one is empty
  }

  // Compute personality distributions
  const dist1 = computePersonalityDistribution(mother1Children);
  const dist2 = computePersonalityDistribution(mother2Children);

  // Compute JS divergence for personality
  const personalityJS = computeJSDivergenceFromDistributions(dist1, dist2);

  // Compute distributions for other traits
  const riskDist1 = computeNumericDistribution(mother1Children.map(c => c.riskTolerance), 5);
  const riskDist2 = computeNumericDistribution(mother2Children.map(c => c.riskTolerance), 5);
  const riskJS = computeJSDivergenceFromArrays(riskDist1, riskDist2);

  const socialDist1 = computeNumericDistribution(mother1Children.map(c => c.socialOrientation), 5);
  const socialDist2 = computeNumericDistribution(mother2Children.map(c => c.socialOrientation), 5);
  const socialJS = computeJSDivergenceFromArrays(socialDist1, socialDist2);

  // Combined divergence (weighted average)
  return personalityJS * 0.4 + riskJS * 0.3 + socialJS * 0.3;
}

/**
 * Compute personality distribution for a set of children.
 */
function computePersonalityDistribution(
  children: ChildSpecification[]
): Record<PersonalityTrait, number> {
  const dist: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0,
    cautious: 0,
    explorer: 0,
    social: 0,
    neutral: 0,
  };

  for (const child of children) {
    dist[child.personality]++;
  }

  // Normalize
  const total = children.length;
  if (total > 0) {
    for (const key of Object.keys(dist) as PersonalityTrait[]) {
      dist[key] /= total;
    }
  }

  return dist;
}

/**
 * Compute numeric distribution (histogram).
 */
function computeNumericDistribution(values: number[], bins: number): number[] {
  const dist = new Array(bins).fill(0);
  const total = values.length;

  if (total === 0) return dist;

  for (const val of values) {
    const bin = Math.min(Math.floor(val * bins), bins - 1);
    dist[bin]++;
  }

  // Normalize
  for (let i = 0; i < bins; i++) {
    dist[i] /= total;
  }

  return dist;
}

/**
 * Compute JS divergence from personality distributions.
 */
function computeJSDivergenceFromDistributions(
  dist1: Record<PersonalityTrait, number>,
  dist2: Record<PersonalityTrait, number>
): number {
  const p1: number[] = ALL_PERSONALITIES.map(p => dist1[p] ?? 0);
  const p2: number[] = ALL_PERSONALITIES.map(p => dist2[p] ?? 0);

  return computeJSDivergenceFromArrays(p1, p2);
}

/**
 * Compute JS divergence from probability arrays.
 */
function computeJSDivergenceFromArrays(p1: number[], p2: number[]): number {
  if (p1.length !== p2.length) return 1;

  // Add small epsilon to avoid log(0)
  const epsilon = 1e-10;
  const p1Smooth = p1.map(p => p + epsilon);
  const p2Smooth = p2.map(p => p + epsilon);

  // Normalize
  const sum1 = p1Smooth.reduce((a, b) => a + b, 0);
  const sum2 = p2Smooth.reduce((a, b) => a + b, 0);
  const p1Norm = p1Smooth.map(p => p / sum1);
  const p2Norm = p2Smooth.map(p => p / sum2);

  // Compute M = (P + Q) / 2
  const m = p1Norm.map((_, i) => (p1Norm[i] + p2Norm[i]) / 2);

  // Compute KL divergences
  const klP = p1Norm.reduce((sum, p, i) => {
    if (p === 0 || m[i] === 0) return sum;
    return sum + p * Math.log2(p / m[i]);
  }, 0);

  const klQ = p2Norm.reduce((sum, q, i) => {
    if (q === 0 || m[i] === 0) return sum;
    return sum + q * Math.log2(q / m[i]);
  }, 0);

  // JS = (KL(P||M) + KL(Q||M)) / 2
  return Math.min(1, Math.max(0, (klP + klQ) / 2));
}

// =============================================================================
// 4. Intra-Family Cooperation
// =============================================================================

/**
 * Compute intra-family vs inter-family cooperation metrics.
 *
 * @param events - Array of simulation events
 * @param agentLineages - Map from agent ID to mother LLM type
 * @returns Cooperation metrics
 */
export function computeIntraFamilyCooperation(
  events: Event[],
  agentLineages: Map<string, LLMType>
): IntraFamilyCooperationResult {
  let intraFamilyTrades = 0;
  let interFamilyTrades = 0;
  let totalTrades = 0;

  // Count cooperative events (trade, share_info)
  const cooperativeEventTypes = ['trade', 'share_info'];

  for (const event of events) {
    if (!cooperativeEventTypes.includes(event.eventType)) continue;

    const payload = event.payload as { targetId?: string };
    const sourceId = event.agentId;
    const targetId = payload?.targetId;

    if (!sourceId || !targetId) continue;

    totalTrades++;

    const sourceMother = agentLineages.get(sourceId);
    const targetMother = agentLineages.get(targetId);

    if (sourceMother && targetMother) {
      if (sourceMother === targetMother) {
        intraFamilyTrades++;
      } else {
        interFamilyTrades++;
      }
    }
  }

  // Calculate rates
  const intraFamilyTradeRate = totalTrades > 0 ? intraFamilyTrades / totalTrades : 0;
  const interFamilyTradeRate = totalTrades > 0 ? interFamilyTrades / totalTrades : 0;

  // Cooperation bias: ratio of intra to inter family cooperation
  // > 1 means siblings cooperate more, < 1 means they cooperate less
  const cooperationBias = interFamilyTrades > 0
    ? intraFamilyTrades / interFamilyTrades
    : intraFamilyTrades > 0 ? Infinity : 1;

  return {
    intraFamilyTradeRate,
    interFamilyTradeRate,
    cooperationBias: isFinite(cooperationBias) ? cooperationBias : 10, // Cap infinity
  };
}

// =============================================================================
// 5. Generation Drift
// =============================================================================

/**
 * Compute trait drift between two generations.
 * Uses cosine distance between average trait vectors.
 *
 * @param gen0 - Original generation (parents)
 * @param genN - Current generation (offspring)
 * @returns Cosine distance (0 = no drift, 1 = maximum drift)
 */
export function computeGenerationDrift(
  gen0: ChildSpecification[],
  genN: ChildSpecification[]
): number {
  if (gen0.length === 0 || genN.length === 0) {
    return 1; // Maximum drift if one is empty
  }

  // Compute average trait vectors
  const vec0 = computeAverageTraitVector(gen0);
  const vecN = computeAverageTraitVector(genN);

  // Compute cosine similarity
  const cosineSim = computeCosineSimilarity(vec0, vecN);

  // Convert to distance (0 = identical, 1 = orthogonal/opposite)
  return 1 - cosineSim;
}

/**
 * Compute average trait vector for a population.
 */
function computeAverageTraitVector(children: ChildSpecification[]): number[] {
  if (children.length === 0) return [0, 0, 0, 0, 0, 0];

  const n = children.length;

  // Personality one-hot encoding (averaged)
  const personalityVec = ALL_PERSONALITIES.map(p =>
    children.filter(c => c.personality === p).length / n
  );

  // Average numeric traits
  const avgRisk = children.reduce((s, c) => s + c.riskTolerance, 0) / n;
  const avgSocial = children.reduce((s, c) => s + c.socialOrientation, 0) / n;

  return [...personalityVec, avgRisk, avgSocial];
}

/**
 * Compute cosine similarity between two vectors.
 */
function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

// =============================================================================
// 6. Archetype Distribution
// =============================================================================

/**
 * Compute distribution of personality archetypes.
 *
 * @param children - Array of child specifications
 * @returns Record mapping each personality trait to count
 */
export function computeArchetypeDistribution(
  children: ChildSpecification[]
): Record<PersonalityTrait, number> {
  const distribution: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0,
    cautious: 0,
    explorer: 0,
    social: 0,
    neutral: 0,
  };

  for (const child of children) {
    distribution[child.personality]++;
  }

  return distribution;
}

// =============================================================================
// 7. Population Balance
// =============================================================================

/**
 * Compute population-level trait balance metrics.
 *
 * @param children - Array of child specifications
 * @returns Population balance metrics
 */
export function computePopulationBalance(
  children: ChildSpecification[]
): PopulationBalanceResult {
  if (children.length === 0) {
    return {
      avgRiskTolerance: 0,
      avgSocialOrientation: 0,
      riskVariance: 0,
      socialVariance: 0,
      balanceScore: 0,
    };
  }

  const riskValues = children.map(c => c.riskTolerance);
  const socialValues = children.map(c => c.socialOrientation);

  const avgRiskTolerance = mean(riskValues);
  const avgSocialOrientation = mean(socialValues);
  const riskVariance = variance(riskValues);
  const socialVariance = variance(socialValues);

  // Balance score: rewards moderate averages and high variance (diversity)
  // Perfect balance: avg = 0.5, variance = 0.083 (uniform distribution)
  const riskBalance = 1 - Math.abs(avgRiskTolerance - 0.5) * 2;
  const socialBalance = 1 - Math.abs(avgSocialOrientation - 0.5) * 2;

  // Variance bonus (normalized by max variance of 0.25)
  const varianceBonus = Math.min(1, (riskVariance + socialVariance) / 0.25);

  // Combined balance score
  const balanceScore = (riskBalance + socialBalance) / 2 * 0.6 + varianceBonus * 0.4;

  return {
    avgRiskTolerance,
    avgSocialOrientation,
    riskVariance,
    socialVariance,
    balanceScore: Math.max(0, Math.min(1, balanceScore)),
  };
}

// =============================================================================
// 8. Genesis Quality Score
// =============================================================================

/**
 * Compute overall quality score for a genesis result.
 *
 * @param result - Genesis result to evaluate
 * @returns Quality score breakdown
 */
export function computeGenesisQualityScore(
  result: GenesisResult
): GenesisQualityScore {
  const children = result.children;

  if (children.length === 0) {
    return {
      diversityScore: 0,
      balanceScore: 0,
      archetypeCoverage: 0,
      overallQuality: 0,
    };
  }

  // Diversity score based on trait entropy
  const traitEntropy = computeTraitEntropy(children);
  const maxEntropy = Math.log2(6); // Max entropy for 6 personalities
  const diversityScore = Math.min(1, traitEntropy / maxEntropy);

  // Balance score
  const balance = computePopulationBalance(children);
  const balanceScore = balance.balanceScore;

  // Archetype coverage
  const archetypeDist = computeArchetypeDistribution(children);
  const representedArchetypes = Object.values(archetypeDist).filter(v => v > 0).length;
  const archetypeCoverage = representedArchetypes / ALL_PERSONALITIES.length;

  // Overall quality (weighted combination)
  const overallQuality = (
    diversityScore * 0.35 +
    balanceScore * 0.30 +
    archetypeCoverage * 0.25 +
    (result.metadata.diversityScore ?? 0) * 0.10
  );

  return {
    diversityScore,
    balanceScore,
    archetypeCoverage,
    overallQuality: Math.max(0, Math.min(1, overallQuality)),
  };
}

// =============================================================================
// 9. Aggregate Metrics Across Runs
// =============================================================================

/**
 * Aggregate genesis metrics across multiple experiment runs.
 *
 * @param runs - Array of genesis metrics results
 * @returns Aggregated metrics summary
 */
export function aggregateGenesisMetrics(
  runs: GenesisMetricsResult[]
): AggregatedGenesisMetrics {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      avgChildrenPerMother: 0,
      avgDiversity: 0,
      avgQualityScore: 0,
      byMother: {} as Record<LLMType, {
        runs: number;
        avgChildCount: number;
        avgSurvivalRate: number;
        avgDiversity: number;
        avgQuality: number;
        stdDevQuality: number;
      }>,
      overallTrends: {
        diversityTrend: 'stable',
        qualityTrend: 'stable',
      },
    };
  }

  // Group by mother
  const byMother: Record<string, GenesisMetricsResult[]> = {};
  for (const run of runs) {
    const mother = run.motherType;
    if (!byMother[mother]) {
      byMother[mother] = [];
    }
    byMother[mother].push(run);
  }

  // Compute per-mother aggregates
  const motherAggregates: Record<string, {
    runs: number;
    avgChildCount: number;
    avgSurvivalRate: number;
    avgDiversity: number;
    avgQuality: number;
    stdDevQuality: number;
  }> = {};

  for (const [mother, motherRuns] of Object.entries(byMother)) {
    const qualities = motherRuns.map(r => r.qualityScore.overallQuality);
    const diversities = motherRuns.map(r => r.diversityScore);
    const childCounts = motherRuns.map(r => r.childCount);

    motherAggregates[mother] = {
      runs: motherRuns.length,
      avgChildCount: mean(childCounts),
      avgSurvivalRate: 0, // Would need simulation results
      avgDiversity: mean(diversities),
      avgQuality: mean(qualities),
      stdDevQuality: Math.sqrt(variance(qualities)),
    };
  }

  // Compute overall aggregates
  const allQualities = runs.map(r => r.qualityScore.overallQuality);
  const allDiversities = runs.map(r => r.diversityScore);
  const allChildCounts = runs.map(r => r.childCount);

  // Detect trends (compare first half to second half)
  const midpoint = Math.floor(runs.length / 2);
  const firstHalfDiversity = mean(allDiversities.slice(0, midpoint));
  const secondHalfDiversity = mean(allDiversities.slice(midpoint));
  const firstHalfQuality = mean(allQualities.slice(0, midpoint));
  const secondHalfQuality = mean(allQualities.slice(midpoint));

  const diversityTrend: 'improving' | 'stable' | 'declining' =
    secondHalfDiversity > firstHalfDiversity * 1.1 ? 'improving' :
    secondHalfDiversity < firstHalfDiversity * 0.9 ? 'declining' : 'stable';

  const qualityTrend: 'improving' | 'stable' | 'declining' =
    secondHalfQuality > firstHalfQuality * 1.1 ? 'improving' :
    secondHalfQuality < firstHalfQuality * 0.9 ? 'declining' : 'stable';

  return {
    totalRuns: runs.length,
    avgChildrenPerMother: mean(allChildCounts),
    avgDiversity: mean(allDiversities),
    avgQualityScore: mean(allQualities),
    byMother: motherAggregates as Record<LLMType, typeof motherAggregates[string]>,
    overallTrends: {
      diversityTrend,
      qualityTrend,
    },
  };
}

// =============================================================================
// 10. Compare Mother Performance
// =============================================================================

/**
 * Compare performance of different LLM mothers.
 *
 * @param results - Genesis results from multiple mothers
 * @param simulationResults - Simulation outcomes for spawned agents
 * @returns Mother comparison report
 */
export function compareMotherPerformance(
  results: GenesisResult[],
  simulationResults: SimulationResult[]
): MotherComparisonReport {
  // Group simulation results by mother
  const byMother = new Map<LLMType, SimulationResult[]>();
  for (const sim of simulationResults) {
    const existing = byMother.get(sim.motherType) || [];
    existing.push(sim);
    byMother.set(sim.motherType, existing);
  }

  // Compute per-mother metrics
  const motherMetrics: Record<string, MotherPerformance> = {};

  for (const result of results) {
    const motherType = result.motherType;
    const sims = byMother.get(motherType) || [];

    const survivalRate = sims.length > 0
      ? sims.filter(s => s.survived).length / sims.length
      : 0;

    const avgLifespan = sims.length > 0
      ? mean(sims.map(s => s.ticksAlive))
      : 0;

    const quality = computeGenesisQualityScore(result);
    const traitEntropy = computeTraitEntropy(result.children);

    motherMetrics[motherType] = {
      childCount: result.children.length,
      survivalRate,
      avgDiversity: result.metadata.diversityScore,
      traitEntropy,
      qualityScore: quality.overallQuality,
      avgLifespan,
    };
  }

  // Create rankings
  const mothers = Object.keys(motherMetrics) as LLMType[];

  const byQuality = [...mothers].sort((a, b) =>
    motherMetrics[b].qualityScore - motherMetrics[a].qualityScore
  );

  const bySurvival = [...mothers].sort((a, b) =>
    motherMetrics[b].survivalRate - motherMetrics[a].survivalRate
  );

  const byDiversity = [...mothers].sort((a, b) =>
    motherMetrics[b].avgDiversity - motherMetrics[a].avgDiversity
  );

  // Determine best and worst (by combined score)
  const combinedScores = mothers.map(m => ({
    mother: m,
    score: motherMetrics[m].qualityScore * 0.4 +
           motherMetrics[m].survivalRate * 0.4 +
           motherMetrics[m].avgDiversity * 0.2,
  })).sort((a, b) => b.score - a.score);

  return {
    byMother: motherMetrics as Record<LLMType, MotherPerformance>,
    rankings: {
      byQuality,
      bySurvival,
      byDiversity,
    },
    bestMother: combinedScores[0]?.mother || 'claude' as LLMType,
    worstMother: combinedScores[combinedScores.length - 1]?.mother || 'claude' as LLMType,
  };
}

// =============================================================================
// Complete Report Generation
// =============================================================================

/**
 * Generate a complete genesis metrics report.
 *
 * @param genesisResults - All genesis results
 * @param agents - Current agent states
 * @param events - Simulation events
 * @param agentLineages - Map from agent ID to mother type
 * @returns Complete genesis metrics report
 */
export function generateGenesisMetricsReport(
  genesisResults: GenesisResult[],
  agents: Agent[],
  events: Event[],
  agentLineages: Map<string, LLMType>
): GenesisMetricsReport {
  // Compute per-mother metrics
  const byMother: Record<string, {
    childCount: number;
    survivalRate: number;
    avgDiversity: number;
    traitEntropy: number;
    qualityScore: number;
  }> = {};

  const survivalRates = computeLineageSurvivalRate(agents, genesisResults);

  for (const result of genesisResults) {
    const mother = result.motherType;
    const quality = computeGenesisQualityScore(result);

    byMother[mother] = {
      childCount: result.children.length,
      survivalRate: survivalRates[mother] || 0,
      avgDiversity: result.metadata.diversityScore,
      traitEntropy: computeTraitEntropy(result.children),
      qualityScore: quality.overallQuality,
    };
  }

  // Compute population metrics
  const allChildren = genesisResults.flatMap(r => r.children);
  const archetypeDist = computeArchetypeDistribution(allChildren);
  const cooperation = computeIntraFamilyCooperation(events, agentLineages);

  // Compute diversity across all children
  let overallDiversity = 0;
  if (allChildren.length > 0) {
    const balance = computePopulationBalance(allChildren);
    const entropy = computeTraitEntropy(allChildren);
    overallDiversity = (balance.balanceScore + entropy / Math.log2(6)) / 2;
  }

  // Compute JS divergence matrix
  const motherTypes = genesisResults.map(r => r.motherType);
  const jsDivergenceMatrix: Record<string, Record<string, number>> = {};

  for (const m1 of motherTypes) {
    jsDivergenceMatrix[m1] = {};
    const children1 = genesisResults.find(r => r.motherType === m1)?.children || [];

    for (const m2 of motherTypes) {
      if (m1 === m2) {
        jsDivergenceMatrix[m1][m2] = 0;
        continue;
      }

      const children2 = genesisResults.find(r => r.motherType === m2)?.children || [];
      jsDivergenceMatrix[m1][m2] = computeMotherJSDivergence(children1, children2);
    }
  }

  // Determine best and worst mothers
  const motherScores = Object.entries(byMother)
    .map(([m, metrics]) => ({
      mother: m as LLMType,
      score: metrics.qualityScore * 0.5 + metrics.survivalRate * 0.5,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    byMother: byMother as Record<LLMType, typeof byMother[string]>,
    population: {
      totalChildren: allChildren.length,
      overallDiversity,
      archetypeDistribution: archetypeDist as Record<string, number>,
      cooperationBias: cooperation.cooperationBias,
    },
    comparison: {
      jsDivergenceMatrix,
      bestMother: motherScores[0]?.mother || 'claude' as LLMType,
      worstMother: motherScores[motherScores.length - 1]?.mother || 'claude' as LLMType,
    },
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Compute metrics result for a single genesis result.
 *
 * @param result - Genesis result
 * @returns Metrics result
 */
export function computeGenesisMetrics(result: GenesisResult): GenesisMetricsResult {
  const quality = computeGenesisQualityScore(result);
  const balance = computePopulationBalance(result.children);

  return {
    motherId: result.id,
    motherType: result.motherType,
    childCount: result.children.length,
    traitEntropy: computeTraitEntropy(result.children),
    diversityScore: result.metadata.diversityScore,
    qualityScore: quality,
    archetypeDistribution: computeArchetypeDistribution(result.children),
    populationBalance: balance,
  };
}
