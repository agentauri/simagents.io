/**
 * Experiment DSL Schema
 *
 * Defines YAML/JSON schema for reproducible scientific experiments.
 * Supports validation, parsing, and conversion to internal experiment format.
 *
 * Example YAML:
 * ```yaml
 * name: "resource_scarcity_test"
 * seed: 12345
 * world:
 *   size: [100, 100]
 *   biomes:
 *     forest: 0.25
 *     desert: 0.25
 *     tundra: 0.25
 *     plains: 0.25
 * agents:
 *   - type: claude
 *     count: 3
 *   - type: gemini
 *     count: 3
 * resources:
 *   food:
 *     clusters: 4
 *     maxAmount: 20
 *     regenRate: 1.0
 * duration: 1000
 * metrics: [gini, cooperation, survival_rate]
 * ```
 */

import type { BiomeType, GenesisSpawnConfiguration } from '../agents/spawner';
import type { AgentConfig, ResourceSpawnConfig } from '../agents/spawner';
import type { LLMType } from '../llm/types';
import type { PersonalityTrait } from '../agents/personalities';
import type { GenesisConfig, EvolutionConfig, SelectionCriteria } from '../agents/genesis-types';

// =============================================================================
// Schema Types
// =============================================================================

/**
 * World configuration in experiment DSL
 */
export interface ExperimentWorldConfig {
  /** Grid size [width, height], default [100, 100] */
  size?: [number, number];

  /** Biome distribution (proportions that sum to 1.0) */
  biomes?: Partial<Record<BiomeType, number>>;

  /** Resource scarcity multiplier (0.1 = very scarce, 2.0 = abundant) */
  scarcityMultiplier?: number;
}

/**
 * Agent configuration in experiment DSL
 */
export interface ExperimentAgentConfig {
  /** LLM type */
  type: LLMType | 'random' | 'mixed';

  /** Number of agents of this type */
  count: number;

  /** Optional starting area (defaults to center) */
  startArea?: {
    x: [number, number]; // [min, max]
    y: [number, number]; // [min, max]
  };

  /** Optional color override */
  color?: string;
}

/**
 * Resource configuration in experiment DSL
 */
export interface ExperimentResourceConfig {
  /** Number of resource clusters */
  clusters?: number;

  /** Max amount per spawn */
  maxAmount?: number;

  /** Regeneration rate */
  regenRate?: number;

  /** Biome preference (which biomes have more of this resource) */
  biomePreference?: Partial<Record<BiomeType, number>>;
}

/**
 * Scenario event for injection during experiment
 */
export interface ScenarioEvent {
  /** Tick at which to trigger (or 'random' for random timing) */
  tick: number | 'random';

  /** Event type */
  type: 'shock' | 'disaster' | 'abundance' | 'rule_change';

  /** Event parameters */
  params: Record<string, unknown>;
}

// =============================================================================
// Genesis Configuration for Experiment DSL
// =============================================================================

/**
 * Genesis configuration in experiment DSL.
 * Allows LLM "mothers" to generate child agents before simulation.
 */
export interface ExperimentGenesisConfig {
  /** Enable genesis meta-generation */
  enabled: boolean;

  /** Number of children each mother generates (5-100) */
  childrenPerMother: number;

  /** LLM types to use as mothers */
  mothers: LLMType[];

  /**
   * Generation mode:
   * - 'single': One-shot generation
   * - 'evolutionary': Multi-generation with feedback loop
   */
  mode: 'single' | 'evolutionary';

  /** Minimum diversity threshold (0-1) */
  diversityThreshold?: number;

  /** Required archetype categories */
  requiredArchetypes?: string[];

  /** Temperature for generation (0.5-1.0, higher = more diverse) */
  temperature?: number;

  /** Use cached genesis results (default: true) */
  useCache?: boolean;

  /** Evolution configuration (only for mode: 'evolutionary') */
  evolution?: {
    /** Number of generations (1-10) */
    generations: number;

    /** Selection criteria for successful traits */
    selectionCriteria: SelectionCriteria;

    /** Top percentile to use as feedback (0-1) */
    topPercentile: number;

    /** Ticks per generation */
    ticksPerGeneration?: number;
  };
}

/**
 * Full experiment schema definition
 */
export interface ExperimentSchema {
  /** Experiment name */
  name: string;

  /** Description */
  description?: string;

  /** Scientific hypothesis */
  hypothesis?: string;

  /** Random seed for reproducibility */
  seed?: number;

  /** World configuration */
  world?: ExperimentWorldConfig;

  /** Agent configurations (ignored if genesis is enabled) */
  agents: ExperimentAgentConfig[];

  /** Resource configurations by type */
  resources?: {
    food?: ExperimentResourceConfig;
    energy?: ExperimentResourceConfig;
    material?: ExperimentResourceConfig;
  };

  /** Number of shelters */
  shelters?: number;

  /** Experiment duration in ticks */
  duration: number;

  /** Tick interval in milliseconds (for batch runner) */
  tickIntervalMs?: number;

  /** Metrics to track */
  metrics?: string[];

  /** Scheduled scenario events */
  events?: ScenarioEvent[];

  /** Decision mode override */
  mode?: 'llm' | 'fallback' | 'random_walk';

  /**
   * Genesis configuration for LLM meta-generation.
   * When enabled, agents are generated by LLM "mothers" instead of using
   * the `agents` configuration. This creates unique agent populations
   * with diverse personalities and strategies.
   */
  genesis?: ExperimentGenesisConfig;

  /** Variants for A/B testing */
  variants?: Array<{
    name: string;
    description?: string;
    overrides: Partial<ExperimentSchema>;
  }>;
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_SCHEMA: Required<Omit<ExperimentSchema, 'variants' | 'events' | 'hypothesis' | 'description' | 'genesis'>> = {
  name: 'Unnamed Experiment',
  seed: Date.now(),
  world: {
    size: [100, 100],
    biomes: { forest: 0.25, desert: 0.25, tundra: 0.25, plains: 0.25 },
    scarcityMultiplier: 1.0,
  },
  agents: [
    { type: 'mixed', count: 7 },
  ],
  resources: {
    food: { clusters: 7, maxAmount: 20, regenRate: 1.0 },
    energy: { clusters: 5, maxAmount: 15, regenRate: 0.6 },
    material: { clusters: 3, maxAmount: 25, regenRate: 0.3 },
  },
  shelters: 10,
  duration: 100,
  tickIntervalMs: 1000,
  metrics: ['survivalRate', 'giniCoefficient', 'cooperationIndex', 'tradeCount'],
  mode: 'llm',
};

// =============================================================================
// LLM Type Colors
// =============================================================================

const LLM_COLORS: Record<LLMType, string> = {
  claude: '#ef4444',
  codex: '#3b82f6',
  gemini: '#10b981',
  deepseek: '#f59e0b',
  qwen: '#8b5cf6',
  glm: '#ec4899',
  grok: '#1d4ed8',
  external: '#6b7280',
  // Baseline agents use neutral/gray tones
  baseline_random: '#9ca3af',
  baseline_rule: '#6b7280',
  baseline_sugarscape: '#4b5563',
  baseline_qlearning: '#374151',
};

const ALL_LLM_TYPES: LLMType[] = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'];

// =============================================================================
// Schema Validation
// =============================================================================

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate experiment schema
 */
export function validateSchema(schema: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') {
    errors.push({ path: '', message: 'Schema must be an object' });
    return { valid: false, errors };
  }

  const s = schema as Record<string, unknown>;

  // Required fields
  if (!s.name || typeof s.name !== 'string') {
    errors.push({ path: 'name', message: 'Name is required and must be a string' });
  }

  if (!s.agents || !Array.isArray(s.agents) || s.agents.length === 0) {
    errors.push({ path: 'agents', message: 'At least one agent configuration is required' });
  }

  if (!s.duration || typeof s.duration !== 'number' || s.duration < 1) {
    errors.push({ path: 'duration', message: 'Duration must be a positive number' });
  }

  // Validate agents
  if (Array.isArray(s.agents)) {
    for (let i = 0; i < s.agents.length; i++) {
      const agent = s.agents[i] as Record<string, unknown>;
      if (!agent.type) {
        errors.push({ path: `agents[${i}].type`, message: 'Agent type is required' });
      }
      if (!agent.count || typeof agent.count !== 'number' || agent.count < 1) {
        errors.push({ path: `agents[${i}].count`, message: 'Agent count must be a positive number' });
      }
    }
  }

  // Validate seed
  if (s.seed !== undefined && typeof s.seed !== 'number') {
    errors.push({ path: 'seed', message: 'Seed must be a number' });
  }

  // Validate genesis
  if (s.genesis) {
    const genesis = s.genesis as Record<string, unknown>;

    if (genesis.enabled !== undefined && typeof genesis.enabled !== 'boolean') {
      errors.push({ path: 'genesis.enabled', message: 'Enabled must be a boolean' });
    }

    if (genesis.enabled === true) {
      if (!genesis.childrenPerMother || typeof genesis.childrenPerMother !== 'number') {
        errors.push({ path: 'genesis.childrenPerMother', message: 'Children per mother is required when genesis is enabled' });
      } else if (genesis.childrenPerMother < 5 || genesis.childrenPerMother > 100) {
        errors.push({ path: 'genesis.childrenPerMother', message: 'Children per mother must be between 5 and 100' });
      }

      if (!genesis.mothers || !Array.isArray(genesis.mothers) || genesis.mothers.length === 0) {
        errors.push({ path: 'genesis.mothers', message: 'At least one mother is required when genesis is enabled' });
      }

      if (genesis.mode && genesis.mode !== 'single' && genesis.mode !== 'evolutionary') {
        errors.push({ path: 'genesis.mode', message: 'Mode must be "single" or "evolutionary"' });
      }

      if (genesis.diversityThreshold !== undefined) {
        const threshold = genesis.diversityThreshold as number;
        if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
          errors.push({ path: 'genesis.diversityThreshold', message: 'Diversity threshold must be between 0 and 1' });
        }
      }

      if (genesis.temperature !== undefined) {
        const temp = genesis.temperature as number;
        if (typeof temp !== 'number' || temp < 0.5 || temp > 1.0) {
          errors.push({ path: 'genesis.temperature', message: 'Temperature must be between 0.5 and 1.0' });
        }
      }

      // Validate evolution config if mode is evolutionary
      if (genesis.mode === 'evolutionary' && genesis.evolution) {
        const evolution = genesis.evolution as Record<string, unknown>;

        if (!evolution.generations || typeof evolution.generations !== 'number') {
          errors.push({ path: 'genesis.evolution.generations', message: 'Generations is required for evolutionary mode' });
        } else if (evolution.generations < 1 || evolution.generations > 10) {
          errors.push({ path: 'genesis.evolution.generations', message: 'Generations must be between 1 and 10' });
        }

        if (!evolution.selectionCriteria) {
          errors.push({ path: 'genesis.evolution.selectionCriteria', message: 'Selection criteria is required for evolutionary mode' });
        }

        if (evolution.topPercentile !== undefined) {
          const tp = evolution.topPercentile as number;
          if (typeof tp !== 'number' || tp < 0 || tp > 1) {
            errors.push({ path: 'genesis.evolution.topPercentile', message: 'Top percentile must be between 0 and 1' });
          }
        }
      }
    }
  }

  // Validate world
  if (s.world) {
    const world = s.world as Record<string, unknown>;
    if (world.size) {
      const size = world.size as unknown[];
      if (!Array.isArray(size) || size.length !== 2) {
        errors.push({ path: 'world.size', message: 'Size must be [width, height]' });
      }
    }
    if (world.biomes) {
      const biomes = world.biomes as Record<string, number>;
      const total = Object.values(biomes).reduce((sum, v) => sum + v, 0);
      if (Math.abs(total - 1.0) > 0.01) {
        errors.push({ path: 'world.biomes', message: `Biome proportions must sum to 1.0 (got ${total})` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Schema Conversion
// =============================================================================

/**
 * Seeded random number generator
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Convert experiment schema to internal agent configs
 */
export function schemaToAgentConfigs(schema: ExperimentSchema): AgentConfig[] {
  const random = createSeededRandom(schema.seed ?? Date.now());
  const worldSize = schema.world?.size ?? [100, 100];
  const configs: AgentConfig[] = [];

  for (const agentDef of schema.agents) {
    const types: LLMType[] = agentDef.type === 'mixed'
      ? ALL_LLM_TYPES
      : agentDef.type === 'random'
        ? [ALL_LLM_TYPES[Math.floor(random() * ALL_LLM_TYPES.length)]]
        : [agentDef.type as LLMType];

    for (let i = 0; i < agentDef.count; i++) {
      const llmType = types[i % types.length];
      const startArea = agentDef.startArea ?? {
        x: [worldSize[0] * 0.25, worldSize[0] * 0.75],
        y: [worldSize[1] * 0.25, worldSize[1] * 0.75],
      };

      configs.push({
        llmType,
        name: `${llmType.charAt(0).toUpperCase() + llmType.slice(1)}-${configs.filter(c => c.llmType === llmType).length + 1}`,
        color: agentDef.color ?? LLM_COLORS[llmType],
        startX: Math.floor(startArea.x[0] + random() * (startArea.x[1] - startArea.x[0])),
        startY: Math.floor(startArea.y[0] + random() * (startArea.y[1] - startArea.y[0])),
      });
    }
  }

  return configs;
}

/**
 * Convert experiment schema to internal resource spawn configs
 */
export function schemaToResourceConfigs(schema: ExperimentSchema): ResourceSpawnConfig[] {
  const random = createSeededRandom((schema.seed ?? Date.now()) + 1);
  const worldSize = schema.world?.size ?? [100, 100];
  const scarcity = schema.world?.scarcityMultiplier ?? 1.0;
  const configs: ResourceSpawnConfig[] = [];

  const resourceTypes: Array<'food' | 'energy' | 'material'> = ['food', 'energy', 'material'];

  for (const resourceType of resourceTypes) {
    const defaultRes = DEFAULT_SCHEMA.resources[resourceType];
    const resDef = schema.resources?.[resourceType] ?? defaultRes;
    // Provide safe defaults in case both are undefined
    const clusters = resDef?.clusters ?? defaultRes?.clusters ?? 5;

    for (let i = 0; i < clusters; i++) {
      configs.push({
        resourceType,
        x: Math.floor(random() * worldSize[0]),
        y: Math.floor(random() * worldSize[1]),
        maxAmount: Math.floor((resDef?.maxAmount ?? defaultRes?.maxAmount ?? 15) * scarcity),
        regenRate: (resDef?.regenRate ?? defaultRes?.regenRate ?? 0.5) * scarcity,
      });
    }
  }

  return configs;
}

/**
 * Convert experiment schema to spawn configuration
 */
export function schemaToSpawnConfig(schema: ExperimentSchema) {
  return {
    agents: schemaToAgentConfigs(schema),
    resourceSpawns: schemaToResourceConfigs(schema),
    shelters: generateShelterConfigs(schema),
    startingFood: 1,
  };
}

/**
 * Convert experiment genesis config to internal GenesisConfig format
 */
export function schemaToGenesisConfig(schema: ExperimentSchema): GenesisConfig | null {
  if (!schema.genesis || !schema.genesis.enabled) {
    return null;
  }

  const g = schema.genesis;

  const config: GenesisConfig = {
    enabled: true,
    childrenPerMother: g.childrenPerMother,
    mothers: g.mothers,
    mode: g.mode || 'single',
    diversityThreshold: g.diversityThreshold ?? 0.3,
    requiredArchetypes: g.requiredArchetypes,
    temperature: g.temperature ?? 0.8,
    seed: schema.seed,
  };

  // Add evolution config if mode is evolutionary
  if (g.mode === 'evolutionary' && g.evolution) {
    config.evolutionConfig = {
      generations: g.evolution.generations,
      selectionCriteria: g.evolution.selectionCriteria,
      topPercentile: g.evolution.topPercentile ?? 0.3,
      ticksPerGeneration: g.evolution.ticksPerGeneration ?? 500,
    };
  }

  return config;
}

/**
 * Convert experiment schema to genesis spawn configuration
 */
export function schemaToGenesisSpawnConfig(schema: ExperimentSchema): GenesisSpawnConfiguration {
  const baseConfig = schemaToSpawnConfig(schema);
  const genesisConfig = schemaToGenesisConfig(schema);

  return {
    ...baseConfig,
    genesis: genesisConfig ?? undefined,
    useGenesisCache: schema.genesis?.useCache !== false,
    enablePersonalities: true, // Genesis always uses personalities
  };
}

/**
 * Generate shelter configurations
 */
function generateShelterConfigs(schema: ExperimentSchema) {
  const random = createSeededRandom((schema.seed ?? Date.now()) + 2);
  const worldSize = schema.world?.size ?? [100, 100];
  const count = schema.shelters ?? 10;

  const configs = [];
  for (let i = 0; i < count; i++) {
    configs.push({
      x: Math.floor(random() * worldSize[0]),
      y: Math.floor(random() * worldSize[1]),
      canSleep: true,
    });
  }

  return configs;
}

// =============================================================================
// YAML Parsing
// =============================================================================

/**
 * Parse YAML string to experiment schema
 * Note: Requires 'yaml' package to be installed
 */
export async function parseYAML(yamlString: string): Promise<ExperimentSchema> {
  // Dynamic import to avoid bundling yaml if not used
  const { parse } = await import('yaml');
  const parsed = parse(yamlString);

  const validation = validateSchema(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid experiment schema:\n${validation.errors.map(e => `  - ${e.path}: ${e.message}`).join('\n')}`);
  }

  return parsed as ExperimentSchema;
}

/**
 * Parse JSON string to experiment schema
 */
export function parseJSON(jsonString: string): ExperimentSchema {
  const parsed = JSON.parse(jsonString);

  const validation = validateSchema(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid experiment schema:\n${validation.errors.map(e => `  - ${e.path}: ${e.message}`).join('\n')}`);
  }

  return parsed as ExperimentSchema;
}

/**
 * Serialize schema to YAML
 */
export async function toYAML(schema: ExperimentSchema): Promise<string> {
  const { stringify } = await import('yaml');
  return stringify(schema);
}

/**
 * Serialize schema to JSON
 */
export function toJSON(schema: ExperimentSchema): string {
  return JSON.stringify(schema, null, 2);
}
