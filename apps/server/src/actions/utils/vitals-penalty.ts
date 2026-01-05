/**
 * Vitals Penalty System
 *
 * Progressive penalties for low vitals instead of binary thresholds.
 * When agents have low energy or hunger, actions cost more.
 * This creates a gradual "slow down" effect before death spiral kicks in.
 *
 * Penalty Tiers:
 * - Energy < 30: +50% action costs
 * - Energy < 15: +100% action costs (cumulative with above)
 * - Hunger < 30: +30% action costs
 *
 * Example: Agent with energy=10, hunger=25 has penalty = 1.0 + 0.5 + 0.5 + 0.3 = 2.3x cost
 */

import type { Agent } from '../../db/schema';

// Configuration for progressive penalties
const PENALTY_CONFIG = {
  // Energy thresholds and penalties
  lowEnergyThreshold: 30,
  lowEnergyPenalty: 0.5, // +50% cost

  criticalEnergyThreshold: 15,
  criticalEnergyPenalty: 0.5, // +50% additional (cumulative)

  // Hunger thresholds and penalties
  lowHungerThreshold: 30,
  lowHungerPenalty: 0.3, // +30% cost
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
