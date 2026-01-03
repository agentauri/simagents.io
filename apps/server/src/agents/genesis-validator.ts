/**
 * Genesis Validator - Advanced Diversity Enforcement
 *
 * Provides sophisticated validation and regeneration logic
 * to ensure generated child populations meet scientific requirements.
 *
 * Features:
 * - Multi-dimensional diversity scoring
 * - Archetype fulfillment checking
 * - Smart regeneration with targeted fixes
 * - Population balance validation
 *
 * @module genesis-validator
 */

import type { PersonalityTrait } from './personalities';
import type {
  ChildSpecification,
  GenesisConfig,
  DiversityValidation,
  ResourcePriority,
} from './genesis-types';
import { ARCHETYPE_REQUIREMENTS } from './genesis-types';
import { computePairwiseDistance, validateDiversity } from './genesis';

// =============================================================================
// Advanced Diversity Metrics
// =============================================================================

/**
 * Compute Jensen-Shannon divergence between two personality distributions.
 * Used to measure how different two LLM mothers' outputs are.
 *
 * @param dist1 - First distribution (personality -> probability)
 * @param dist2 - Second distribution
 * @returns JS divergence (0 = identical, 1 = maximally different)
 */
export function computeJSDivergence(
  dist1: Record<PersonalityTrait, number>,
  dist2: Record<PersonalityTrait, number>
): number {
  const allPersonalities: PersonalityTrait[] = [
    'aggressive', 'cooperative', 'cautious', 'explorer', 'social', 'neutral'
  ];

  // Normalize distributions
  const total1 = Object.values(dist1).reduce((a, b) => a + b, 0);
  const total2 = Object.values(dist2).reduce((a, b) => a + b, 0);

  if (total1 === 0 || total2 === 0) return 1;

  const p1: number[] = allPersonalities.map(p => (dist1[p] ?? 0) / total1);
  const p2: number[] = allPersonalities.map(p => (dist2[p] ?? 0) / total2);

  // Compute M = (P + Q) / 2
  const m: number[] = p1.map((_, i) => (p1[i] + p2[i]) / 2);

  // Compute KL divergences
  const klP = p1.reduce((sum, p, i) => {
    if (p === 0 || m[i] === 0) return sum;
    return sum + p * Math.log2(p / m[i]);
  }, 0);

  const klQ = p2.reduce((sum, q, i) => {
    if (q === 0 || m[i] === 0) return sum;
    return sum + q * Math.log2(q / m[i]);
  }, 0);

  // JS = (KL(P||M) + KL(Q||M)) / 2
  return (klP + klQ) / 2;
}

/**
 * Compute cosine similarity between two trait vectors.
 * Used for generation drift analysis.
 *
 * @param a - First child
 * @param b - Second child
 * @returns Cosine similarity (0-1)
 */
export function computeCosineSimilarity(
  a: ChildSpecification,
  b: ChildSpecification
): number {
  // Convert to 4D vector: [riskTolerance, socialOrientation, personalityIndex, resourceIndex]
  const personalityMap: Record<PersonalityTrait, number> = {
    aggressive: 0,
    cooperative: 0.2,
    cautious: 0.4,
    explorer: 0.6,
    social: 0.8,
    neutral: 1.0,
  };

  const resourceMap: Record<ResourcePriority, number> = {
    food: 0,
    energy: 0.33,
    material: 0.67,
    balanced: 1.0,
  };

  const vecA = [
    a.riskTolerance,
    a.socialOrientation,
    personalityMap[a.personality],
    resourceMap[a.resourcePriority],
  ];

  const vecB = [
    b.riskTolerance,
    b.socialOrientation,
    personalityMap[b.personality],
    resourceMap[b.resourcePriority],
  ];

  // Compute dot product
  const dot = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);

  // Compute magnitudes
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

/**
 * Compute generation drift between two populations.
 * Measures how much trait distribution has changed.
 *
 * @param gen0 - Original population
 * @param genN - Current population
 * @returns Drift score (0 = no change, 1 = maximum drift)
 */
export function computeGenerationDrift(
  gen0: ChildSpecification[],
  genN: ChildSpecification[]
): number {
  if (gen0.length === 0 || genN.length === 0) return 1;

  // Compute average trait vectors
  const avgGen0 = {
    riskTolerance: gen0.reduce((s, c) => s + c.riskTolerance, 0) / gen0.length,
    socialOrientation: gen0.reduce((s, c) => s + c.socialOrientation, 0) / gen0.length,
  };

  const avgGenN = {
    riskTolerance: genN.reduce((s, c) => s + c.riskTolerance, 0) / genN.length,
    socialOrientation: genN.reduce((s, c) => s + c.socialOrientation, 0) / genN.length,
  };

  // Euclidean distance in 2D trait space
  const drift = Math.sqrt(
    (avgGen0.riskTolerance - avgGenN.riskTolerance) ** 2 +
    (avgGen0.socialOrientation - avgGenN.socialOrientation) ** 2
  );

  // Normalize to 0-1 (max possible drift is sqrt(2))
  return drift / Math.sqrt(2);
}

// =============================================================================
// Population Balance Validation
// =============================================================================

/**
 * Detailed population balance report.
 */
export interface PopulationBalance {
  /** Overall balance score (0-1, higher = more balanced) */
  balanceScore: number;

  /** Risk tolerance distribution */
  riskDistribution: {
    lowRisk: number;    // < 0.3
    mediumRisk: number; // 0.3-0.7
    highRisk: number;   // > 0.7
  };

  /** Social orientation distribution */
  socialDistribution: {
    solitary: number;   // < 0.3
    moderate: number;   // 0.3-0.7
    social: number;     // > 0.7
  };

  /** Personality type counts */
  personalityDistribution: Record<PersonalityTrait, number>;

  /** Resource priority counts */
  resourceDistribution: Record<ResourcePriority, number>;

  /** Balance warnings */
  warnings: string[];
}

/**
 * Analyze population balance for a set of children.
 *
 * @param children - Array of child specifications
 * @returns Population balance report
 */
export function analyzePopulationBalance(
  children: ChildSpecification[]
): PopulationBalance {
  const warnings: string[] = [];
  const count = children.length;

  if (count === 0) {
    return {
      balanceScore: 0,
      riskDistribution: { lowRisk: 0, mediumRisk: 0, highRisk: 0 },
      socialDistribution: { solitary: 0, moderate: 0, social: 0 },
      personalityDistribution: {
        aggressive: 0, cooperative: 0, cautious: 0,
        explorer: 0, social: 0, neutral: 0,
      },
      resourceDistribution: { food: 0, energy: 0, material: 0, balanced: 0 },
      warnings: ['No children to analyze'],
    };
  }

  // Risk distribution
  const lowRisk = children.filter(c => c.riskTolerance < 0.3).length;
  const mediumRisk = children.filter(c => c.riskTolerance >= 0.3 && c.riskTolerance <= 0.7).length;
  const highRisk = children.filter(c => c.riskTolerance > 0.7).length;

  // Social distribution
  const solitary = children.filter(c => c.socialOrientation < 0.3).length;
  const moderate = children.filter(c => c.socialOrientation >= 0.3 && c.socialOrientation <= 0.7).length;
  const social = children.filter(c => c.socialOrientation > 0.7).length;

  // Personality distribution
  const personalityDistribution: Record<PersonalityTrait, number> = {
    aggressive: 0, cooperative: 0, cautious: 0,
    explorer: 0, social: 0, neutral: 0,
  };
  for (const child of children) {
    personalityDistribution[child.personality]++;
  }

  // Resource distribution
  const resourceDistribution: Record<ResourcePriority, number> = {
    food: 0, energy: 0, material: 0, balanced: 0,
  };
  for (const child of children) {
    resourceDistribution[child.resourcePriority]++;
  }

  // Check for imbalances
  const minThreshold = Math.ceil(count * 0.1); // At least 10% in each category

  if (lowRisk < minThreshold) {
    warnings.push(`Low risk-averse representation: ${lowRisk}/${count}`);
  }
  if (highRisk < minThreshold) {
    warnings.push(`Low risk-seeking representation: ${highRisk}/${count}`);
  }
  if (solitary < minThreshold) {
    warnings.push(`Low solitary representation: ${solitary}/${count}`);
  }
  if (social < minThreshold) {
    warnings.push(`Low social representation: ${social}/${count}`);
  }

  // Check personality diversity
  const usedPersonalities = Object.values(personalityDistribution).filter(v => v > 0).length;
  if (usedPersonalities < 3) {
    warnings.push(`Limited personality diversity: only ${usedPersonalities} types used`);
  }

  // Check for personality dominance
  const maxPersonality = Math.max(...Object.values(personalityDistribution));
  if (maxPersonality > count * 0.5) {
    const dominant = Object.entries(personalityDistribution).find(([_, v]) => v === maxPersonality)?.[0];
    warnings.push(`Personality dominance: ${dominant} at ${((maxPersonality / count) * 100).toFixed(0)}%`);
  }

  // Compute overall balance score
  // Based on entropy of distributions (higher = more balanced)
  const riskEntropy = computeDistributionEntropy([lowRisk, mediumRisk, highRisk]);
  const socialEntropy = computeDistributionEntropy([solitary, moderate, social]);
  const personalityEntropy = computeDistributionEntropy(Object.values(personalityDistribution));
  const resourceEntropy = computeDistributionEntropy(Object.values(resourceDistribution));

  const maxRiskEntropy = Math.log2(3);
  const maxSocialEntropy = Math.log2(3);
  const maxPersonalityEntropy = Math.log2(6);
  const maxResourceEntropy = Math.log2(4);

  const balanceScore = (
    (riskEntropy / maxRiskEntropy) * 0.25 +
    (socialEntropy / maxSocialEntropy) * 0.25 +
    (personalityEntropy / maxPersonalityEntropy) * 0.3 +
    (resourceEntropy / maxResourceEntropy) * 0.2
  );

  return {
    balanceScore,
    riskDistribution: { lowRisk, mediumRisk, highRisk },
    socialDistribution: { solitary, moderate, social },
    personalityDistribution,
    resourceDistribution,
    warnings,
  };
}

/**
 * Compute entropy for a count distribution.
 */
function computeDistributionEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  return counts.reduce((entropy, count) => {
    if (count === 0) return entropy;
    const p = count / total;
    return entropy - p * Math.log2(p);
  }, 0);
}

// =============================================================================
// Validation Pipeline
// =============================================================================

/**
 * Comprehensive validation result.
 */
export interface ComprehensiveValidation {
  /** Whether all validations passed */
  isValid: boolean;

  /** Diversity validation result */
  diversity: DiversityValidation;

  /** Population balance result */
  balance: PopulationBalance;

  /** Combined score (0-1) */
  overallScore: number;

  /** All issues found */
  issues: string[];

  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Perform comprehensive validation on generated children.
 *
 * @param children - Array of child specifications
 * @param config - Genesis configuration
 * @returns Comprehensive validation result
 */
export function performComprehensiveValidation(
  children: ChildSpecification[],
  config: GenesisConfig
): ComprehensiveValidation {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Run diversity validation
  const diversity = validateDiversity(children, config);

  // Run balance analysis
  const balance = analyzePopulationBalance(children);

  // Collect issues
  if (!diversity.isValid) {
    issues.push('Diversity validation failed');
    if (diversity.similarPairs.length > 0) {
      issues.push(`${diversity.similarPairs.length} pairs are too similar`);
      suggestions.push('Increase temperature or add more specific archetype requirements');
    }
    if (diversity.missingArchetypes.length > 0) {
      issues.push(`Missing archetypes: ${diversity.missingArchetypes.join(', ')}`);
      suggestions.push('Explicitly request missing archetypes in the prompt');
    }
  }

  issues.push(...balance.warnings);

  if (balance.balanceScore < 0.5) {
    suggestions.push('Population is unbalanced - consider adding distribution requirements');
  }

  // Compute overall score
  const overallScore = (diversity.diversityScore * 0.5 + balance.balanceScore * 0.5);

  const isValid = diversity.isValid && balance.warnings.length === 0;

  return {
    isValid,
    diversity,
    balance,
    overallScore,
    issues,
    suggestions,
  };
}

// =============================================================================
// Targeted Regeneration
// =============================================================================

/**
 * Generate targeted fix suggestions based on validation results.
 *
 * @param validation - Comprehensive validation result
 * @param config - Genesis configuration
 * @returns Suggestions for the next generation attempt
 */
export function generateFixSuggestions(
  validation: ComprehensiveValidation,
  config: GenesisConfig
): string[] {
  const suggestions: string[] = [];

  // Diversity fixes
  if (validation.diversity.similarPairs.length > 0) {
    suggestions.push(`Make agents more distinct - ${validation.diversity.similarPairs.length} pairs are too similar`);
  }

  for (const archetype of validation.diversity.missingArchetypes) {
    const req = ARCHETYPE_REQUIREMENTS[archetype];
    if (req) {
      suggestions.push(`Include at least one ${req.name}: ${req.description}`);
    }
  }

  // Balance fixes
  const balance = validation.balance;

  if (balance.riskDistribution.lowRisk < balance.riskDistribution.highRisk * 0.5) {
    suggestions.push('Include more risk-averse agents (riskTolerance < 0.3)');
  }

  if (balance.riskDistribution.highRisk < balance.riskDistribution.lowRisk * 0.5) {
    suggestions.push('Include more risk-seeking agents (riskTolerance > 0.7)');
  }

  if (balance.socialDistribution.solitary < config.childrenPerMother * 0.1) {
    suggestions.push('Include more solitary agents (socialOrientation < 0.3)');
  }

  if (balance.socialDistribution.social < config.childrenPerMother * 0.1) {
    suggestions.push('Include more social agents (socialOrientation > 0.7)');
  }

  // Check for missing personalities
  const usedPersonalities = Object.entries(balance.personalityDistribution)
    .filter(([_, count]) => count > 0)
    .map(([p]) => p);

  const allPersonalities = ['aggressive', 'cooperative', 'cautious', 'explorer', 'social', 'neutral'];
  const missingPersonalities = allPersonalities.filter(p => !usedPersonalities.includes(p));

  if (missingPersonalities.length > 3) {
    suggestions.push(`Add agents with personalities: ${missingPersonalities.slice(0, 2).join(', ')}`);
  }

  return suggestions;
}

// =============================================================================
// Export Summary
// =============================================================================

export { validateDiversity } from './genesis';
