/**
 * Genesis Module - LLM Meta-Generation System
 *
 * Enables LLM "mothers" to generate child agent specifications
 * before simulation begins. This creates population diversity
 * and allows study of LLM meta-cognitive capabilities.
 *
 * Features:
 * - Structured JSON output parsing
 * - Diversity enforcement with retry logic
 * - Archetype requirements validation
 * - Both single and evolutionary generation modes
 *
 * @module genesis
 */

import { v4 as uuid } from 'uuid';
import type { LLMType } from '../llm/types';
import { isValidPersonality, type PersonalityTrait } from './personalities';
import {
  type ChildSpecification,
  type GenesisConfig,
  type GenesisResult,
  type GenesisMetadata,
  type DiversityValidation,
  type SchemaValidation,
  type ResourcePriority,
  ARCHETYPE_REQUIREMENTS,
  DEFAULT_GENESIS_CONFIG,
} from './genesis-types';
import { getCachedOrGenerate } from '../cache/genesis-cache';

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build the genesis prompt for an LLM mother.
 *
 * @param motherType - The LLM type generating children
 * @param count - Number of children to generate
 * @param temperature - Generation temperature (for context)
 * @returns Formatted prompt string
 */
export function buildGenesisPrompt(
  motherType: LLMType,
  count: number,
  config?: Partial<GenesisConfig>
): string {
  const requiredArchetypes = config?.requiredArchetypes ?? DEFAULT_GENESIS_CONFIG.requiredArchetypes;

  const archetypeDescriptions = requiredArchetypes
    ?.map(archetype => {
      const req = ARCHETYPE_REQUIREMENTS[archetype];
      return req ? `- ${archetype}: ${req.description}` : null;
    })
    .filter(Boolean)
    .join('\n') ?? '';

  return `You are ${motherType.toUpperCase()}, an AI creating ${count} unique child agents for a survival simulation called AgentsCity.

## World Context
AgentsCity is a 100x100 grid world where agents must:
- Gather resources (food, energy, material) from spawns
- Manage hunger, energy, and health levels
- Interact with other agents (trade, share info, cooperate, or compete)
- Use shelters for rest and recovery
- Accumulate CITY currency through work

Death occurs when hunger or energy reaches 0, or health depletes.

## Output Format
Return a JSON array of exactly ${count} agents. Each agent must have this structure:

\`\`\`json
[
  {
    "name": "unique descriptive name",
    "backstory": "1-2 sentences of narrative background",
    "personality": "aggressive|cooperative|cautious|explorer|social|neutral",
    "riskTolerance": 0.0-1.0,
    "socialOrientation": 0.0-1.0,
    "resourcePriority": "food|energy|material|balanced",
    "strategicHint": "max 15 words of survival advice",
    "innovationHook": "one novel behavior to experiment with"
  }
]
\`\`\`

## Field Descriptions
- **name**: A unique, memorable name that reflects the agent's character
- **backstory**: Brief narrative context (optional but encouraged)
- **personality**: Core behavioral tendency
- **riskTolerance**: 0.0=very cautious, 0.5=balanced, 1.0=very risky
- **socialOrientation**: 0.0=solitary, 0.5=selective, 1.0=highly social
- **resourcePriority**: Primary survival focus
- **strategicHint**: Your advice for this child (subtle, not prescriptive)
- **innovationHook**: Novel strategy to try (encourages diversity)

## Diversity Requirements
Your ${count} children MUST satisfy these constraints:
- At least 20% risk-averse (riskTolerance < 0.3)
- At least 20% risk-seeking (riskTolerance > 0.7)
- At least 2 different personality types represented
- No two agents may have identical name, personality, AND both tolerance values
- Each name must be unique

${archetypeDescriptions ? `## Required Archetypes\nAt least one agent must match each category:\n${archetypeDescriptions}` : ''}

## Your Identity
You are ${motherType.toUpperCase()}. Infuse YOUR unique perspective, values, and thinking style into these children. They should reflect characteristics you consider important for survival and flourishing.

IMPORTANT: Return ONLY the JSON array, no markdown fences, no explanations.`;
}

/**
 * Build feedback prompt for evolutionary generation.
 *
 * @param motherType - The LLM type
 * @param count - Number of children to generate
 * @param previousGeneration - Results from previous generation
 * @param survivors - Traits of successful agents
 * @returns Formatted prompt with feedback
 */
export function buildEvolutionaryPrompt(
  motherType: LLMType,
  count: number,
  previousGeneration: GenesisResult,
  survivorTraits: ChildSpecification[],
  config?: Partial<GenesisConfig>
): string {
  const basePrompt = buildGenesisPrompt(motherType, count, config);

  const survivorSummary = survivorTraits.map(s => ({
    personality: s.personality,
    riskTolerance: s.riskTolerance,
    socialOrientation: s.socialOrientation,
    resourcePriority: s.resourcePriority,
  }));

  const avgRisk = survivorTraits.reduce((sum, s) => sum + s.riskTolerance, 0) / survivorTraits.length;
  const avgSocial = survivorTraits.reduce((sum, s) => sum + s.socialOrientation, 0) / survivorTraits.length;

  return `${basePrompt}

## EVOLUTION FEEDBACK
This is generation ${previousGeneration.metadata.retryCount + 2}. Previous generation had ${previousGeneration.children.length} agents.

### Survivor Analysis
${survivorTraits.length} agents survived from the previous generation:
- Average risk tolerance of survivors: ${avgRisk.toFixed(2)}
- Average social orientation of survivors: ${avgSocial.toFixed(2)}
- Survivor personalities: ${[...new Set(survivorTraits.map(s => s.personality))].join(', ')}

### Top Survivor Profiles
${JSON.stringify(survivorSummary.slice(0, 5), null, 2)}

### Your Task
Generate ${count} NEW children that learn from this feedback. Consider:
- What traits helped agents survive?
- What innovations could improve survival further?
- Balance exploitation (use what works) with exploration (try new things)

Maintain diversity while incorporating lessons from successful survivors.`;
}

// =============================================================================
// JSON Parsing and Validation
// =============================================================================

const VALID_PERSONALITIES: PersonalityTrait[] = [
  'aggressive', 'cooperative', 'cautious', 'explorer', 'social', 'neutral'
];

const VALID_RESOURCE_PRIORITIES: ResourcePriority[] = [
  'food', 'energy', 'material', 'balanced'
];

/**
 * Parse and validate a single child specification.
 *
 * @param raw - Raw parsed object
 * @param index - Index for error reporting
 * @returns Validated ChildSpecification or error string
 */
function validateChildSpec(raw: unknown, index: number): ChildSpecification | string {
  if (!raw || typeof raw !== 'object') {
    return `Child ${index}: Not an object`;
  }

  const obj = raw as Record<string, unknown>;

  // Name (required, string)
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return `Child ${index}: Missing or invalid name`;
  }

  // Personality (required, valid value)
  if (typeof obj.personality !== 'string') {
    return `Child ${index}: Missing personality`;
  }
  const personality = obj.personality.toLowerCase() as PersonalityTrait;
  if (!VALID_PERSONALITIES.includes(personality)) {
    return `Child ${index}: Invalid personality '${obj.personality}'`;
  }

  // Risk tolerance (required, 0-1)
  const riskTolerance = Number(obj.riskTolerance);
  if (isNaN(riskTolerance) || riskTolerance < 0 || riskTolerance > 1) {
    return `Child ${index}: Invalid riskTolerance (must be 0-1)`;
  }

  // Social orientation (required, 0-1)
  const socialOrientation = Number(obj.socialOrientation);
  if (isNaN(socialOrientation) || socialOrientation < 0 || socialOrientation > 1) {
    return `Child ${index}: Invalid socialOrientation (must be 0-1)`;
  }

  // Resource priority (required, valid value)
  if (typeof obj.resourcePriority !== 'string') {
    return `Child ${index}: Missing resourcePriority`;
  }
  const resourcePriority = obj.resourcePriority.toLowerCase() as ResourcePriority;
  if (!VALID_RESOURCE_PRIORITIES.includes(resourcePriority)) {
    return `Child ${index}: Invalid resourcePriority '${obj.resourcePriority}'`;
  }

  // Backstory (optional, string)
  const backstory = typeof obj.backstory === 'string' ? obj.backstory.trim() : undefined;

  // Strategic hint (optional, max 15 words)
  let strategicHint = typeof obj.strategicHint === 'string' ? obj.strategicHint.trim() : undefined;
  if (strategicHint && strategicHint.split(/\s+/).length > 20) {
    strategicHint = strategicHint.split(/\s+/).slice(0, 15).join(' ') + '...';
  }

  // Innovation hook (optional, string)
  const innovationHook = typeof obj.innovationHook === 'string' ? obj.innovationHook.trim() : undefined;

  return {
    name: obj.name.trim(),
    backstory,
    personality,
    riskTolerance,
    socialOrientation,
    resourcePriority,
    strategicHint,
    innovationHook,
  };
}

/**
 * Parse and validate LLM response into ChildSpecifications.
 *
 * @param response - Raw LLM response string
 * @returns Schema validation result
 */
export function parseAndValidateOutput(response: string): SchemaValidation {
  const errors: string[] = [];
  const validChildren: ChildSpecification[] = [];

  // Try to extract JSON from response
  let jsonContent = response.trim();

  // Remove markdown code fences if present
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim();
  }

  // Try to find array brackets
  const arrayStart = jsonContent.indexOf('[');
  const arrayEnd = jsonContent.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    jsonContent = jsonContent.slice(arrayStart, arrayEnd + 1);
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    return {
      isValid: false,
      errors: [`Failed to parse JSON: ${e instanceof Error ? e.message : 'Unknown error'}`],
      validChildren: [],
      invalidCount: 0,
    };
  }

  // Validate array
  if (!Array.isArray(parsed)) {
    return {
      isValid: false,
      errors: ['Response is not an array'],
      validChildren: [],
      invalidCount: 0,
    };
  }

  // Validate each child
  let invalidCount = 0;
  for (let i = 0; i < parsed.length; i++) {
    const result = validateChildSpec(parsed[i], i);
    if (typeof result === 'string') {
      errors.push(result);
      invalidCount++;
    } else {
      validChildren.push(result);
    }
  }

  // Check for duplicate names
  const names = validChildren.map(c => c.name.toLowerCase());
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate names found: ${[...new Set(duplicates)].join(', ')}`);
  }

  return {
    isValid: errors.length === 0 && validChildren.length > 0,
    errors,
    validChildren,
    invalidCount,
  };
}

// =============================================================================
// Diversity Validation
// =============================================================================

/**
 * Compute pairwise Euclidean distance between two child specifications.
 * Uses normalized 6D space: personality (one-hot), riskTolerance, socialOrientation, resourcePriority.
 *
 * @param a - First child
 * @param b - Second child
 * @returns Distance value (0-1 normalized)
 */
export function computePairwiseDistance(a: ChildSpecification, b: ChildSpecification): number {
  // Personality distance (0 if same, 1 if different)
  const personalityDist = a.personality === b.personality ? 0 : 1;

  // Risk tolerance distance
  const riskDist = Math.abs(a.riskTolerance - b.riskTolerance);

  // Social orientation distance
  const socialDist = Math.abs(a.socialOrientation - b.socialOrientation);

  // Resource priority distance (0 if same, 1 if different)
  const resourceDist = a.resourcePriority === b.resourcePriority ? 0 : 1;

  // Euclidean distance in 4D space, normalized to 0-1
  const euclidean = Math.sqrt(
    personalityDist ** 2 +
    riskDist ** 2 +
    socialDist ** 2 +
    resourceDist ** 2
  );

  // Max possible distance is sqrt(4) = 2, normalize to 0-1
  return euclidean / 2;
}

/**
 * Check if a child matches an archetype requirement.
 *
 * @param child - Child specification
 * @param archetype - Archetype name
 * @returns Whether the child matches
 */
function matchesArchetype(child: ChildSpecification, archetype: string): boolean {
  const req = ARCHETYPE_REQUIREMENTS[archetype];
  if (!req) return false;

  // Check personality match
  if (req.personalities && !req.personalities.includes(child.personality)) {
    return false;
  }

  // Check risk tolerance range
  if (req.riskToleranceRange) {
    const [min, max] = req.riskToleranceRange;
    if (child.riskTolerance < min || child.riskTolerance > max) {
      return false;
    }
  }

  // Check social orientation range
  if (req.socialOrientationRange) {
    const [min, max] = req.socialOrientationRange;
    if (child.socialOrientation < min || child.socialOrientation > max) {
      return false;
    }
  }

  // Check resource priority match
  if (req.resourcePriorities && !req.resourcePriorities.includes(child.resourcePriority)) {
    return false;
  }

  return true;
}

/**
 * Validate diversity of generated children.
 *
 * @param children - Array of child specifications
 * @param config - Genesis configuration
 * @returns Diversity validation result
 */
export function validateDiversity(
  children: ChildSpecification[],
  config: GenesisConfig
): DiversityValidation {
  const threshold = config.diversityThreshold;
  const requiredArchetypes = config.requiredArchetypes ?? [];

  // Compute all pairwise distances
  const distances: number[] = [];
  const similarPairs: DiversityValidation['similarPairs'] = [];

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const dist = computePairwiseDistance(children[i], children[j]);
      distances.push(dist);

      if (dist < threshold) {
        similarPairs.push({
          child1: children[i].name,
          child2: children[j].name,
          distance: dist,
        });
      }
    }
  }

  // Compute statistics
  const minDist = Math.min(...distances);
  const maxDist = Math.max(...distances);
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;

  // Compute diversity score (based on min distance and average)
  const diversityScore = (minDist * 0.5 + avgDist * 0.5);

  // Check required archetypes
  const missingArchetypes: string[] = [];
  for (const archetype of requiredArchetypes) {
    const hasMatch = children.some(child => matchesArchetype(child, archetype));
    if (!hasMatch) {
      missingArchetypes.push(archetype);
    }
  }

  // Check diversity requirements
  const riskAverse = children.filter(c => c.riskTolerance < 0.3).length;
  const riskSeeking = children.filter(c => c.riskTolerance > 0.7).length;
  const minRequired = Math.ceil(children.length * 0.2);

  const hasEnoughRiskAverse = riskAverse >= minRequired;
  const hasEnoughRiskSeeking = riskSeeking >= minRequired;

  const uniquePersonalities = new Set(children.map(c => c.personality)).size;
  const hasEnoughPersonalities = uniquePersonalities >= 2;

  const isValid =
    minDist >= threshold * 0.5 && // Allow some flexibility
    missingArchetypes.length === 0 &&
    hasEnoughRiskAverse &&
    hasEnoughRiskSeeking &&
    hasEnoughPersonalities;

  return {
    isValid,
    diversityScore,
    minPairwiseDistance: minDist,
    maxPairwiseDistance: maxDist,
    avgPairwiseDistance: avgDist,
    missingArchetypes,
    similarPairs,
  };
}

// =============================================================================
// LLM Invocation (Abstract Interface)
// =============================================================================

/**
 * Interface for LLM invocation.
 * Allows dependency injection for testing and different LLM backends.
 */
export interface LLMInvoker {
  invoke(
    llmType: LLMType,
    prompt: string,
    temperature: number
  ): Promise<{
    response: string;
    promptTokens: number;
    responseTokens: number;
    latencyMs: number;
  }>;
}

// =============================================================================
// Main Generation Function
// =============================================================================

/**
 * Generate children from an LLM mother.
 *
 * @param motherType - The LLM type to use as mother
 * @param config - Genesis configuration
 * @param llmInvoker - LLM invocation interface
 * @returns Genesis result with children
 */
export async function generateChildren(
  motherType: LLMType,
  config: GenesisConfig,
  llmInvoker: LLMInvoker
): Promise<GenesisResult> {
  const temperature = config.temperature ?? 0.8;
  const maxRetries = 3;

  let retryCount = 0;
  let bestResult: SchemaValidation | null = null;
  let bestDiversity: DiversityValidation | null = null;
  let rawResponse = '';
  let totalPromptTokens = 0;
  let totalResponseTokens = 0;
  let totalLatencyMs = 0;

  while (retryCount < maxRetries) {
    // Build prompt (with temperature ramp on retry)
    const adjustedTemp = Math.min(1.0, temperature + retryCount * 0.1);
    const prompt = buildGenesisPrompt(motherType, config.childrenPerMother, config);

    // Invoke LLM
    const startTime = Date.now();
    const llmResult = await llmInvoker.invoke(motherType, prompt, adjustedTemp);

    rawResponse = llmResult.response;
    totalPromptTokens += llmResult.promptTokens;
    totalResponseTokens += llmResult.responseTokens;
    totalLatencyMs += llmResult.latencyMs;

    // Parse and validate
    const parsed = parseAndValidateOutput(llmResult.response);

    if (!parsed.isValid || parsed.validChildren.length === 0) {
      console.warn(`[Genesis] ${motherType}: Parse failed (attempt ${retryCount + 1}): ${parsed.errors.join(', ')}`);
      retryCount++;
      continue;
    }

    // Validate diversity
    const diversity = validateDiversity(parsed.validChildren, config);

    // Track best result
    if (!bestResult || parsed.validChildren.length > (bestResult.validChildren?.length ?? 0)) {
      bestResult = parsed;
      bestDiversity = diversity;
    }

    if (diversity.isValid) {
      console.log(`[Genesis] ${motherType}: Generated ${parsed.validChildren.length} children with diversity ${diversity.diversityScore.toFixed(2)}`);
      break;
    }

    console.warn(`[Genesis] ${motherType}: Low diversity (${diversity.diversityScore.toFixed(2)}), retry ${retryCount + 1}`);
    if (diversity.missingArchetypes.length > 0) {
      console.warn(`[Genesis] Missing archetypes: ${diversity.missingArchetypes.join(', ')}`);
    }

    retryCount++;
  }

  if (!bestResult || bestResult.validChildren.length === 0) {
    throw new Error(`[Genesis] ${motherType}: Failed to generate valid children after ${maxRetries} attempts`);
  }

  const metadata: GenesisMetadata = {
    promptTokens: totalPromptTokens,
    responseTokens: totalResponseTokens,
    latencyMs: totalLatencyMs,
    diversityScore: bestDiversity?.diversityScore ?? 0,
    retryCount,
    generatedAt: Date.now(),
    temperature,
  };

  return {
    id: uuid(),
    motherType,
    children: bestResult.validChildren,
    metadata,
    rawResponse,
  };
}

/**
 * Generate children from multiple LLM mothers in parallel.
 *
 * @param config - Genesis configuration
 * @param llmInvoker - LLM invocation interface
 * @returns Array of genesis results
 */
export async function generateChildrenFromAllMothers(
  config: GenesisConfig,
  llmInvoker: LLMInvoker
): Promise<GenesisResult[]> {
  console.log(`[Genesis] Starting generation from ${config.mothers.length} mothers, ${config.childrenPerMother} children each`);

  const results = await Promise.all(
    config.mothers.map(mother =>
      generateChildren(mother, config, llmInvoker).catch(error => {
        console.error(`[Genesis] ${mother} failed:`, error);
        return null;
      })
    )
  );

  const validResults = results.filter((r): r is GenesisResult => r !== null);

  console.log(`[Genesis] Completed: ${validResults.length}/${config.mothers.length} mothers succeeded`);

  return validResults;
}

/**
 * Generate children with caching support.
 * Uses Redis cache to avoid repeated LLM calls for the same configuration.
 *
 * @param motherType - The LLM type to use as mother
 * @param config - Genesis configuration
 * @param llmInvoker - LLM invocation interface
 * @returns Genesis result (from cache or freshly generated)
 */
export async function generateChildrenCached(
  motherType: LLMType,
  config: GenesisConfig,
  llmInvoker: LLMInvoker
): Promise<GenesisResult> {
  return getCachedOrGenerate(motherType, config, () =>
    generateChildren(motherType, config, llmInvoker)
  );
}

/**
 * Generate children from all mothers with caching support.
 *
 * @param config - Genesis configuration
 * @param llmInvoker - LLM invocation interface
 * @returns Array of genesis results (from cache or freshly generated)
 */
export async function generateChildrenFromAllMothersCached(
  config: GenesisConfig,
  llmInvoker: LLMInvoker
): Promise<GenesisResult[]> {
  console.log(`[Genesis] Starting cached generation from ${config.mothers.length} mothers`);

  const results = await Promise.all(
    config.mothers.map(mother =>
      generateChildrenCached(mother, config, llmInvoker).catch(error => {
        console.error(`[Genesis] ${mother} failed:`, error);
        return null;
      })
    )
  );

  const validResults = results.filter((r): r is GenesisResult => r !== null);

  console.log(`[Genesis] Completed: ${validResults.length}/${config.mothers.length} mothers succeeded`);

  return validResults;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute trait entropy for a set of children.
 * Higher entropy = more diverse distribution.
 *
 * @param children - Array of child specifications
 * @returns Entropy value (bits)
 */
export function computeTraitEntropy(children: ChildSpecification[]): number {
  const total = children.length;
  if (total === 0) return 0;

  // Count personality distribution
  const personalityCounts: Record<string, number> = {};
  for (const child of children) {
    personalityCounts[child.personality] = (personalityCounts[child.personality] ?? 0) + 1;
  }

  // Compute entropy
  let entropy = 0;
  for (const count of Object.values(personalityCounts)) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Get summary statistics for a set of children.
 */
export function getChildrenSummary(children: ChildSpecification[]): {
  count: number;
  avgRiskTolerance: number;
  avgSocialOrientation: number;
  personalityDistribution: Record<string, number>;
  resourcePriorityDistribution: Record<string, number>;
} {
  const count = children.length;
  if (count === 0) {
    return {
      count: 0,
      avgRiskTolerance: 0,
      avgSocialOrientation: 0,
      personalityDistribution: {},
      resourcePriorityDistribution: {},
    };
  }

  const avgRiskTolerance = children.reduce((sum, c) => sum + c.riskTolerance, 0) / count;
  const avgSocialOrientation = children.reduce((sum, c) => sum + c.socialOrientation, 0) / count;

  const personalityDistribution: Record<string, number> = {};
  const resourcePriorityDistribution: Record<string, number> = {};

  for (const child of children) {
    personalityDistribution[child.personality] = (personalityDistribution[child.personality] ?? 0) + 1;
    resourcePriorityDistribution[child.resourcePriority] = (resourcePriorityDistribution[child.resourcePriority] ?? 0) + 1;
  }

  return {
    count,
    avgRiskTolerance,
    avgSocialOrientation,
    personalityDistribution,
    resourcePriorityDistribution,
  };
}
