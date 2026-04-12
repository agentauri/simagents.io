/**
 * Per-Agent Evolution Types
 *
 * Each LLM agent type evolves its own strategy genome independently.
 * The genome parameterizes a rule-based decision function used for
 * fast fitness evaluation (no LLM calls). The winning genome then
 * informs the agent's personality/strategic context in live runs.
 */

import type { LLMType } from '../llm/types';

// =============================================================================
// Genome
// =============================================================================

export interface AgentGenome {
  id: string;
  agentType: LLMType;
  generation: number;
  parentIds: string[];

  params: StrategyParams;
  fitness?: FitnessResult;
}

export interface StrategyParams {
  /** Below this hunger level, prioritize eating (0-100) */
  hungerThreshold: number;
  /** Below this energy level, prioritize resting (0-100) */
  energyThreshold: number;
  /** Preference for gather vs forage when hungry (0=forage, 1=gather) */
  gatherBias: number;
  /** How many ticks to stay at a resource before exploring (1-20) */
  exploitDuration: number;
  /** How far to move when exploring (1-15) */
  exploreRadius: number;
  /** Willingness to trade with nearby agents (0-1) */
  socialBias: number;
  /** Willingness to take aggressive actions (0-1) */
  riskBias: number;
  /** Whether to prefer food, energy, or material (0=food, 0.5=energy, 1=material) */
  resourceFocus: number;
}

export const PARAM_BOUNDS: Record<keyof StrategyParams, [min: number, max: number]> = {
  hungerThreshold: [10, 80],
  energyThreshold: [10, 60],
  gatherBias: [0, 1],
  exploitDuration: [1, 20],
  exploreRadius: [1, 15],
  socialBias: [0, 1],
  riskBias: [0, 1],
  resourceFocus: [0, 1],
};

// =============================================================================
// Fitness
// =============================================================================

export interface FitnessResult {
  /** How many ticks the agent survived (0 to maxTicks) */
  survivalTicks: number;
  /** Average health over the run */
  avgHealth: number;
  /** Average hunger over the run */
  avgHunger: number;
  /** Average energy over the run */
  avgEnergy: number;
  /** Final balance */
  finalBalance: number;
  /** Total food consumed */
  foodConsumed: number;
  /** Composite fitness score (0-1, higher=better) */
  composite: number;
}

// =============================================================================
// Evolution State (persisted to disk)
// =============================================================================

export interface EvolutionState {
  agentType: LLMType;
  generation: number;
  population: AgentGenome[];
  incumbent: AgentGenome | null;
  hallOfFame: AgentGenome[];
  fitnessHistory: number[];
}

// =============================================================================
// Survival Status
// =============================================================================

export interface SurvivalStatus {
  agentType: LLMType;
  alive: boolean;
  generation: number;
  incumbentFitness: number;
  baselineFitness: number;
  significancePass: boolean;
  reason: string;
}

// =============================================================================
// Config
// =============================================================================

export interface EvolutionConfig {
  populationSize: number;
  mutationRate: number;
  crossoverRate: number;
  eliteCount: number;
  ticksPerEvaluation: number;
  minFitnessThreshold: number;
  minGenerations: number;
}

// =============================================================================
// Operators
// =============================================================================

// Type-safe param access helpers
type ParamKey = keyof StrategyParams;
const PARAM_KEYS = Object.keys(PARAM_BOUNDS) as ParamKey[];

function getParam(params: StrategyParams, key: ParamKey): number {
  return params[key];
}

function setParam(params: StrategyParams, key: ParamKey, value: number): void {
  (params as Record<ParamKey, number>)[key] = value;
}

export function randomGenome(agentType: LLMType, rng: () => number): AgentGenome {
  const params = {} as StrategyParams;
  for (const key of PARAM_KEYS) {
    const [min, max] = PARAM_BOUNDS[key];
    setParam(params, key, min + rng() * (max - min));
  }
  return { id: crypto.randomUUID(), agentType, generation: 0, parentIds: [], params };
}

export function mutate(genome: AgentGenome, rate: number, rng: () => number): AgentGenome {
  const params = { ...genome.params };
  for (const key of PARAM_KEYS) {
    if (rng() < rate) {
      const [min, max] = PARAM_BOUNDS[key];
      const delta = (rng() - 0.5) * (max - min) * 0.3;
      setParam(params, key, Math.max(min, Math.min(max, getParam(params, key) + delta)));
    }
  }
  return {
    id: crypto.randomUUID(),
    agentType: genome.agentType,
    generation: genome.generation + 1,
    parentIds: [genome.id],
    params,
  };
}

export function crossover(a: AgentGenome, b: AgentGenome, rng: () => number): AgentGenome {
  const params = {} as StrategyParams;
  for (const key of PARAM_KEYS) {
    const w = 0.3 + rng() * 0.4;
    setParam(params, key, getParam(a.params, key) * w + getParam(b.params, key) * (1 - w));
  }
  return {
    id: crypto.randomUUID(),
    agentType: a.agentType,
    generation: Math.max(a.generation, b.generation) + 1,
    parentIds: [a.id, b.id],
    params,
  };
}
