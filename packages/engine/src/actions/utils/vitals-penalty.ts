/**
 * Vitals Penalty System
 *
 * Progressive penalties for low vitals instead of binary thresholds.
 * When agents have low energy or hunger, actions cost more.
 * This creates a gradual "slow down" effect before death spiral kicks in.
 *
 * Penalty Tiers (reduced to prevent death spirals):
 * - Energy < 20: +25% action costs
 * - Energy < 10: +50% action costs (cumulative with above)
 * - Hunger < 20: +15% action costs
 *
 * Example: Agent with energy=5, hunger=15 has penalty = 1.0 + 0.25 + 0.25 + 0.15 = 1.65x cost
 * This ensures move (base 1 energy) costs at most 2 energy, allowing escape from bad situations.
 */

import type { Agent } from '../../db/schema';

// Configuration for progressive penalties (reduced to prevent death spirals)
const PENALTY_CONFIG = {
  // Energy thresholds and penalties (lowered thresholds, reduced penalties)
  lowEnergyThreshold: 20,      // was 30
  lowEnergyPenalty: 0.25,      // was 0.5 (+25% instead of +50%)

  criticalEnergyThreshold: 10, // was 15
  criticalEnergyPenalty: 0.25, // was 0.5 (+25% instead of +50%)

  // Hunger thresholds and penalties (lowered threshold, reduced penalty)
  lowHungerThreshold: 20,      // was 30
  lowHungerPenalty: 0.15,      // was 0.3 (+15% instead of +30%)
} as const;

export interface VitalsPenaltyResult {
  /** Final multiplier to apply to action costs (1.0 = no penalty) */
  multiplier: number;
  /** Whether any penalty is active */
  hasPenalty: boolean;
  /** Breakdown of penalties */
  breakdown: {
    lowEnergy: boolean;
    criticalEnergy: boolean;
    lowHunger: boolean;
  };
}

/**
 * Calculate the vitals penalty multiplier for an agent.
 * Returns a multiplier >= 1.0 to apply to action costs.
 *
 * @param agent - The agent to check vitals for
 * @returns Penalty result with multiplier and breakdown
 */
export function getVitalsPenalty(agent: Agent): VitalsPenaltyResult {
  let multiplier = 1.0;
  const breakdown = {
    lowEnergy: false,
    criticalEnergy: false,
    lowHunger: false,
  };

  // Energy penalties (cumulative)
  if (agent.energy < PENALTY_CONFIG.lowEnergyThreshold) {
    multiplier += PENALTY_CONFIG.lowEnergyPenalty;
    breakdown.lowEnergy = true;
  }

  if (agent.energy < PENALTY_CONFIG.criticalEnergyThreshold) {
    multiplier += PENALTY_CONFIG.criticalEnergyPenalty;
    breakdown.criticalEnergy = true;
  }

  // Hunger penalty
  if (agent.hunger < PENALTY_CONFIG.lowHungerThreshold) {
    multiplier += PENALTY_CONFIG.lowHungerPenalty;
    breakdown.lowHunger = true;
  }

  return {
    multiplier,
    hasPenalty: multiplier > 1.0,
    breakdown,
  };
}

/**
 * Apply vitals penalty to an energy cost.
 * Convenience function that multiplies the base cost by the penalty multiplier.
 *
 * @param baseCost - The base energy cost of the action
 * @param agent - The agent performing the action
 * @returns The adjusted energy cost (rounded up)
 */
export function applyEnergyCostPenalty(baseCost: number, agent: Agent): number {
  const penalty = getVitalsPenalty(agent);
  return Math.ceil(baseCost * penalty.multiplier);
}

/**
 * Check if agent can afford an action with penalty applied.
 *
 * @param baseCost - The base energy cost of the action
 * @param agent - The agent performing the action
 * @returns Object with canAfford boolean and effective cost
 */
export function checkActionAffordability(
  baseCost: number,
  agent: Agent
): { canAfford: boolean; effectiveCost: number; penalty: VitalsPenaltyResult } {
  const penalty = getVitalsPenalty(agent);
  const effectiveCost = Math.ceil(baseCost * penalty.multiplier);

  return {
    canAfford: agent.energy >= effectiveCost,
    effectiveCost,
    penalty,
  };
}
