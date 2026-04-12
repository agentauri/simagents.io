/**
 * Per-Agent Evolution Runner
 *
 * Like Karpathy's autoresearch: each agent type independently evolves its own
 * strategy genome through fast mini-simulations. No LLM calls — fitness is
 * measured by running a parameterized rule-based agent against the world physics.
 *
 * Cycle: mutate genome → simulate N ticks → evaluate fitness → keep/discard
 */

import { CONFIG } from '../config';
import type { LLMType } from '../llm/types';
import {
  type AgentGenome,
  type FitnessResult,
  type EvolutionState,
  type EvolutionConfig,
  type SurvivalStatus,
  type StrategyParams,
  randomGenome,
  mutate,
  crossover,
} from './types';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import seedrandom from 'seedrandom';

// =============================================================================
// Mini-Simulation (pure in-memory, no DB, no LLM)
// =============================================================================

// Mini-sim constants (approximate real world for fast evaluation)
const RESOURCE_SPAWN_PROBABILITY = 0.6;
const RESOURCE_MIN_AMOUNT = 15;
const RESOURCE_AMOUNT_VARIANCE = 10;
const RESOURCE_MAX_AMOUNT = 20;
const RESOURCE_REGEN_PER_TICK = 1.5;
const SIGNIFICANCE_THRESHOLD = 1.05; // incumbent must be 5% better than baseline

const FITNESS_WEIGHTS = {
  survival: 0.40,
  health: 0.25,
  hunger: 0.20,
  energy: 0.15,
} as const;

interface SimState {
  tick: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  x: number;
  y: number;
  inventory: { food: number; energy: number; material: number };
  resourceAtPos: number;
  forageCooldown: number;
  totalFoodConsumed: number;
  healthSum: number;
  hungerSum: number;
  energySum: number;
}

function initSimState(): SimState {
  return {
    tick: 0,
    hunger: 80,
    energy: 80,
    health: 100,
    balance: 50,
    x: 30,
    y: 20,
    inventory: { food: 0, energy: 0, material: 0 },
    resourceAtPos: RESOURCE_MAX_AMOUNT,
    forageCooldown: 0,
    totalFoodConsumed: 0,
    healthSum: 0,
    hungerSum: 0,
    energySum: 0,
  };
}

/** Decide and apply one tick based on genome params */
function simTick(s: SimState, p: StrategyParams, rng: () => number): void {
  s.tick++;
  const c = CONFIG.actions;

  // --- DECISION (genome-parameterized rule-based) ---
  let action: 'gather' | 'forage' | 'consume' | 'move' | 'sleep' | 'idle' = 'idle';

  if (s.hunger < p.hungerThreshold) {
    // Hungry — prioritize food
    if (s.inventory.food > 0) {
      action = 'consume';
    } else if (s.resourceAtPos > 0 && rng() < p.gatherBias) {
      action = 'gather';
    } else if (s.forageCooldown <= 0) {
      action = 'forage';
    } else {
      action = 'move';
    }
  } else if (s.energy < p.energyThreshold) {
    action = 'sleep';
  } else if (s.resourceAtPos > 0 && s.inventory.food < 3) {
    action = 'gather';
  } else if (s.tick % Math.max(1, Math.round(p.exploitDuration)) === 0) {
    action = 'move';
  } else if (s.forageCooldown <= 0 && rng() > p.gatherBias) {
    action = 'forage';
  } else {
    action = 'idle';
  }

  // --- APPLY ACTION ---
  switch (action) {
    case 'gather': {
      const qty = Math.min(c.gather.maxPerAction, s.resourceAtPos);
      if (qty > 0) {
        s.inventory.food += qty;
        s.resourceAtPos -= qty;
        s.energy -= c.gather.energyCostPerUnit * qty;
      }
      break;
    }
    case 'forage': {
      s.energy -= c.forage.energyCost;
      if (rng() < c.forage.baseSuccessRate) {
        s.inventory.food += c.forage.foodYield;
      }
      s.forageCooldown = c.forage.cooldownTicks;
      break;
    }
    case 'consume': {
      if (s.inventory.food > 0) {
        s.inventory.food--;
        s.hunger = Math.min(100, s.hunger + (c.consume.effects.food.hunger ?? 0));
        s.totalFoodConsumed++;
      }
      break;
    }
    case 'move': {
      s.energy -= c.move.energyCost;
      s.hunger -= c.move.hungerCost;
      s.resourceAtPos = rng() < RESOURCE_SPAWN_PROBABILITY
        ? Math.round(RESOURCE_MIN_AMOUNT + rng() * RESOURCE_AMOUNT_VARIANCE) : 0;
      s.forageCooldown = 0;
      break;
    }
    case 'sleep': {
      s.energy = Math.min(100, s.energy + c.sleep.energyRestoredPerTick);
      break;
    }
    case 'idle':
      break;
  }

  // --- DECAY (same physics as real simulation) ---
  s.hunger -= CONFIG.needs.hungerDecay;
  s.energy -= CONFIG.needs.energyDecay;
  if (s.forageCooldown > 0) s.forageCooldown--;

  if (s.resourceAtPos < RESOURCE_MAX_AMOUNT) {
    s.resourceAtPos = Math.min(RESOURCE_MAX_AMOUNT, s.resourceAtPos + RESOURCE_REGEN_PER_TICK);
  }

  // --- HEALTH DAMAGE ---
  if (s.hunger <= CONFIG.needs.criticalHungerThreshold) {
    s.health -= 2;
  }
  if (s.energy <= 0) {
    s.health -= 1;
    s.energy = 0;
  }
  s.hunger = Math.max(0, s.hunger);
  s.energy = Math.max(0, s.energy);
  s.health = Math.max(0, s.health);

  // --- ACCUMULATE STATS ---
  s.healthSum += s.health;
  s.hungerSum += s.hunger;
  s.energySum += s.energy;
}

/** Run a full mini-simulation and return fitness */
function evaluate(genome: AgentGenome, ticks: number, seed: number): FitnessResult {
  const rng = seedrandom(String(seed + genome.id));
  const s = initSimState();

  let survivalTicks = ticks;
  for (let t = 0; t < ticks; t++) {
    simTick(s, genome.params, rng as unknown as () => number);
    if (s.health <= 0) {
      survivalTicks = t + 1;
      break;
    }
  }

  const avgHealth = s.healthSum / survivalTicks;
  const avgHunger = s.hungerSum / survivalTicks;
  const avgEnergy = s.energySum / survivalTicks;

  const composite =
    (survivalTicks / ticks) * FITNESS_WEIGHTS.survival +
    (avgHealth / 100) * FITNESS_WEIGHTS.health +
    (avgHunger / 100) * FITNESS_WEIGHTS.hunger +
    (avgEnergy / 100) * FITNESS_WEIGHTS.energy;

  return {
    survivalTicks,
    avgHealth,
    avgHunger,
    avgEnergy,
    finalBalance: s.balance,
    foodConsumed: s.totalFoodConsumed,
    composite,
  };
}

// =============================================================================
// Evolution Runner (one per agent type)
// =============================================================================

export class AgentEvolutionRunner {
  readonly agentType: LLMType;
  private stateDir: string;
  private config: EvolutionConfig;
  private state: EvolutionState;
  private rng: () => number;

  constructor(agentType: LLMType, dataDir: string, config: EvolutionConfig, seed?: number) {
    this.agentType = agentType;
    this.config = config;
    this.stateDir = join(dataDir, 'evolution', agentType);
    mkdirSync(this.stateDir, { recursive: true });

    const seedVal = seed ?? Date.now();
    this.rng = seedrandom(String(seedVal) + agentType) as unknown as () => number;

    // Load persisted state or initialize fresh population
    try {
      this.state = JSON.parse(readFileSync(join(this.stateDir, 'state.json'), 'utf-8'));
      console.log(`[Evolution:${agentType}] Loaded state: gen ${this.state.generation}, incumbent fitness ${this.state.incumbent?.fitness?.composite.toFixed(3) ?? 'none'}`);
    } catch {
      this.state = {
        agentType,
        generation: 0,
        population: Array.from({ length: config.populationSize }, () =>
          randomGenome(agentType, this.rng)
        ),
        incumbent: null,
        hallOfFame: [],
        fitnessHistory: [],
      };
      console.log(`[Evolution:${agentType}] Initialized population of ${config.populationSize}`);
    }
  }

  /** Run one generation: evaluate → select → reproduce */
  runGeneration(): { best: AgentGenome; avgFitness: number; improved: boolean } {
    this.state.generation++;
    const gen = this.state.generation;
    const seed = Math.round(this.rng() * 1e9);

    // 1. EVALUATE all genomes
    for (const genome of this.state.population) {
      genome.fitness = evaluate(genome, this.config.ticksPerEvaluation, seed);
      genome.generation = gen;
    }

    // 2. SORT by composite fitness
    this.state.population.sort((a, b) =>
      (b.fitness?.composite ?? 0) - (a.fitness?.composite ?? 0)
    );

    const best = this.state.population[0];
    const avgFitness = this.state.population.reduce(
      (sum, g) => sum + (g.fitness?.composite ?? 0), 0
    ) / this.state.population.length;

    // 3. CHECK if best beats incumbent (keep/discard)
    let improved = false;
    if (!this.state.incumbent || (best.fitness?.composite ?? 0) > (this.state.incumbent.fitness?.composite ?? 0)) {
      this.state.incumbent = { ...best };
      this.state.hallOfFame.push({ ...best });
      // Keep hall of fame bounded
      if (this.state.hallOfFame.length > 20) {
        this.state.hallOfFame = this.state.hallOfFame.slice(-20);
      }
      improved = true;
    }

    this.state.fitnessHistory.push(best.fitness?.composite ?? 0);

    // 4. REPRODUCE: elitism + crossover + mutation
    const elites = this.state.population.slice(0, this.config.eliteCount);
    const offspring: AgentGenome[] = [...elites];

    while (offspring.length < this.config.populationSize) {
      if (this.rng() < this.config.crossoverRate && elites.length >= 2) {
        // Crossover between two elites
        const a = elites[Math.floor(this.rng() * elites.length)];
        const b = elites[Math.floor(this.rng() * elites.length)];
        offspring.push(mutate(crossover(a, b, this.rng), this.config.mutationRate, this.rng));
      } else {
        // Mutate a random elite
        const parent = elites[Math.floor(this.rng() * elites.length)];
        offspring.push(mutate(parent, this.config.mutationRate, this.rng));
      }
    }

    this.state.population = offspring.slice(0, this.config.populationSize);

    // 5. PERSIST state
    this.saveState();

    const statusIcon = improved ? '↑' : '→';
    console.log(
      `[Evolution:${this.agentType}] Gen ${gen} ${statusIcon} ` +
      `best=${best.fitness?.composite.toFixed(3)} avg=${avgFitness.toFixed(3)} ` +
      `incumbent=${this.state.incumbent?.fitness?.composite.toFixed(3)} ` +
      `survived=${best.fitness?.survivalTicks}/${this.config.ticksPerEvaluation}`
    );

    return { best, avgFitness, improved };
  }

  /** Check if this agent "earns survival" */
  getSurvivalStatus(): SurvivalStatus {
    const incumbent = this.state.incumbent;
    const gen = this.state.generation;
    const minGens = this.config.minGenerations;
    const threshold = this.config.minFitnessThreshold;

    // Random baseline fitness (evaluate a random genome)
    const baselineGenome = randomGenome(this.agentType, this.rng);
    baselineGenome.fitness = evaluate(baselineGenome, this.config.ticksPerEvaluation, 42);
    const baselineFitness = baselineGenome.fitness.composite;

    const incumbentFitness = incumbent?.fitness?.composite ?? 0;
    const significancePass = incumbentFitness > baselineFitness * SIGNIFICANCE_THRESHOLD;

    const alive = gen >= minGens && incumbentFitness >= threshold && significancePass;

    let reason: string;
    if (gen < minGens) reason = `Needs ${minGens - gen} more generations`;
    else if (incumbentFitness < threshold) reason = `Fitness ${incumbentFitness.toFixed(3)} < ${threshold}`;
    else if (!significancePass) reason = `Not significantly better than random (${baselineFitness.toFixed(3)})`;
    else reason = 'Survival earned';

    return {
      agentType: this.agentType,
      alive,
      generation: gen,
      incumbentFitness,
      baselineFitness,
      significancePass,
      reason,
    };
  }

  getState(): EvolutionState {
    return this.state;
  }

  private saveState(): void {
    writeFileSync(
      join(this.stateDir, 'state.json'),
      JSON.stringify(this.state, null, 2),
    );
  }
}
