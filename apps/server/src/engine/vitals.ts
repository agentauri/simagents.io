import type { Agent } from '../db/schema';
import { getRuntimeConfig } from '../config';
import { getAgentById, updateAgent } from '../engine-memory/queries/agents';
import { getOrCreateVitalsMeta, setVitalsMeta, type VitalsMeta } from './vitals-meta';
import { TICK_MS, simMinutes } from './time';

const MIN = 0;
const MAX = 100;
export const CRITICAL_GRACE_MS = 3 * TICK_MS;

export const STATE_MULTIPLIERS: Record<string, { hunger: number; energy: number }> = {
  idle: { hunger: 1.0, energy: 1.0 },
  walking: { hunger: 1.5, energy: 1.2 },
  working: { hunger: 1.3, energy: 1.0 },
  sleeping: { hunger: 0.5, energy: 0.0 },
  dead: { hunger: 0, energy: 0 },
};

export interface VitalsSnapshot {
  hunger: number;
  energy: number;
  health: number;
  dead: boolean;
}

export interface VitalsComputation {
  previousState: {
    hunger: number;
    energy: number;
    health: number;
  };
  newState: {
    hunger: number;
    energy: number;
    health: number;
  };
  vitals: VitalsSnapshot;
  meta: VitalsMeta;
  effects: string[];
  healthDamage: {
    hunger: number;
    energy: number;
  };
  healthRegen: number;
}

export interface MaterializedVitals extends VitalsComputation {
  agent: Agent;
}

interface RuntimeNeedsConfig {
  hungerDecay: number;
  energyDecay: number;
  lowHungerThreshold: number;
  criticalHungerThreshold: number;
  lowEnergyThreshold: number;
  criticalEnergyThreshold: number;
  hungerEnergyDrain: number;
  criticalHungerHealthDamage: number;
  criticalEnergyHealthDamage: number;
}

function clampVital(value: number): number {
  if (value <= MIN) return MIN;
  if (value >= MAX) return MAX;
  return value;
}

function getNeedsConfig(): RuntimeNeedsConfig {
  const runtime = getRuntimeConfig();
  return {
    hungerDecay: runtime.needs.hungerDecay,
    energyDecay: runtime.needs.energyDecay,
    lowHungerThreshold: runtime.needs.lowHungerThreshold ?? 20,
    criticalHungerThreshold: runtime.needs.criticalHungerThreshold ?? 10,
    lowEnergyThreshold: runtime.needs.lowEnergyThreshold ?? 20,
    criticalEnergyThreshold: runtime.needs.criticalEnergyThreshold ?? 10,
    hungerEnergyDrain: runtime.needs.hungerEnergyDrain ?? 1,
    criticalHungerHealthDamage: runtime.needs.criticalHungerHealthDamage ?? 2,
    criticalEnergyHealthDamage: runtime.needs.criticalEnergyHealthDamage ?? 1,
  };
}

export function thresholdCrossingTimeMs(
  initialValue: number,
  ratePerMinute: number,
  threshold: number
): number {
  if (initialValue < threshold) return 0;
  if (ratePerMinute <= 0) return Infinity;
  if (initialValue === threshold) return 0;
  return ((initialValue - threshold) / ratePerMinute) * TICK_MS;
}

export function durationBelowLinearThresholdMs(
  initialValue: number,
  ratePerMinute: number,
  threshold: number,
  durationMs: number
): number {
  const crossing = thresholdCrossingTimeMs(initialValue, ratePerMinute, threshold);
  if (crossing >= durationMs) return 0;
  return Math.max(0, durationMs - crossing);
}

export function energyAtMs(
  initialEnergy: number,
  baseRatePerMinute: number,
  hungryExtraRatePerMinute: number,
  hungerLowCrossingMs: number,
  elapsedMs: number
): number {
  const baseDrain = baseRatePerMinute * simMinutes(elapsedMs);
  const extraDrain = hungryExtraRatePerMinute * simMinutes(Math.max(0, elapsedMs - hungerLowCrossingMs));
  return initialEnergy - baseDrain - extraDrain;
}

export function energyThresholdCrossingTimeMs(
  initialEnergy: number,
  baseRatePerMinute: number,
  hungryExtraRatePerMinute: number,
  hungerLowCrossingMs: number,
  threshold: number,
  durationMs: number
): number {
  if (initialEnergy < threshold) return 0;

  const firstSegmentEnd = Math.min(durationMs, hungerLowCrossingMs);
  if (baseRatePerMinute > 0) {
    const firstCrossing = ((initialEnergy - threshold) / baseRatePerMinute) * TICK_MS;
    if (firstCrossing <= firstSegmentEnd) return firstCrossing;
  }

  if (hungerLowCrossingMs >= durationMs) return Infinity;

  const energyAtLowCrossing = energyAtMs(
    initialEnergy,
    baseRatePerMinute,
    hungryExtraRatePerMinute,
    hungerLowCrossingMs,
    hungerLowCrossingMs
  );
  if (energyAtLowCrossing < threshold) return hungerLowCrossingMs;

  const combinedRate = baseRatePerMinute + hungryExtraRatePerMinute;
  if (combinedRate <= 0) return Infinity;

  const crossing = hungerLowCrossingMs + ((energyAtLowCrossing - threshold) / combinedRate) * TICK_MS;
  return crossing <= durationMs ? crossing : Infinity;
}

export function damageDurationAfterGraceMs(
  previousUpdatedAtMs: number,
  nowMs: number,
  criticalSinceMs: number | undefined,
  graceMs = CRITICAL_GRACE_MS
): number {
  if (criticalSinceMs === undefined) return 0;
  const startsAt = criticalSinceMs + graceMs;
  const damageStart = Math.max(previousUpdatedAtMs, startsAt);
  return Math.max(0, nowMs - damageStart);
}

function nextCriticalSince(
  previous: number | undefined,
  previousUpdatedAtMs: number,
  crossingWithinIntervalMs: number,
  finalValue: number,
  threshold: number
): number | undefined {
  if (finalValue >= threshold) return undefined;
  if (previous !== undefined) return previous;
  if (crossingWithinIntervalMs === Infinity) return previousUpdatedAtMs;
  return previousUpdatedAtMs + crossingWithinIntervalMs;
}

export function computeVitals(agent: Agent, meta: VitalsMeta, nowMs: number): VitalsComputation {
  const config = getNeedsConfig();
  const previousUpdatedAt = meta.vitalsUpdatedAt;
  const elapsedMs = Math.max(0, nowMs - previousUpdatedAt);
  const elapsedMinutes = simMinutes(elapsedMs);
  const multiplier = STATE_MULTIPLIERS[agent.state] ?? STATE_MULTIPLIERS.idle;

  const hungerRate = config.hungerDecay * multiplier.hunger;
  const baseEnergyRate = config.energyDecay * multiplier.energy;
  const hungerLowCrossing = thresholdCrossingTimeMs(
    agent.hunger,
    hungerRate,
    config.lowHungerThreshold
  );
  const hungryExtraMs = durationBelowLinearThresholdMs(
    agent.hunger,
    hungerRate,
    config.lowHungerThreshold,
    elapsedMs
  );

  const rawHunger = agent.hunger - hungerRate * elapsedMinutes;
  const rawEnergy =
    agent.energy -
    baseEnergyRate * elapsedMinutes -
    config.hungerEnergyDrain * simMinutes(hungryExtraMs);

  const newHunger = clampVital(rawHunger);
  const newEnergy = clampVital(rawEnergy);

  const hungerCriticalCrossing = thresholdCrossingTimeMs(
    agent.hunger,
    hungerRate,
    config.criticalHungerThreshold
  );
  const energyCriticalCrossing = energyThresholdCrossingTimeMs(
    agent.energy,
    baseEnergyRate,
    config.hungerEnergyDrain,
    hungerLowCrossing,
    config.criticalEnergyThreshold,
    elapsedMs
  );

  const hungerCriticalSince = nextCriticalSince(
    meta.criticalSince.hunger,
    previousUpdatedAt,
    hungerCriticalCrossing,
    newHunger,
    config.criticalHungerThreshold
  );
  const energyCriticalSince = nextCriticalSince(
    meta.criticalSince.energy,
    previousUpdatedAt,
    energyCriticalCrossing,
    newEnergy,
    config.criticalEnergyThreshold
  );

  const hungerDamage =
    config.criticalHungerHealthDamage *
    simMinutes(damageDurationAfterGraceMs(previousUpdatedAt, nowMs, hungerCriticalSince));
  // Unlike hunger, critical energy damages health immediately (no grace period),
  // matching legacy needs-decay semantics where only hunger was grace-gated.
  const energyDamage =
    config.criticalEnergyHealthDamage *
    simMinutes(damageDurationAfterGraceMs(previousUpdatedAt, nowMs, energyCriticalSince, 0));

  const hungerRegenCrossing = thresholdCrossingTimeMs(agent.hunger, hungerRate, 70);
  const energyRegenCrossing = energyThresholdCrossingTimeMs(
    agent.energy,
    baseEnergyRate,
    config.hungerEnergyDrain,
    hungerLowCrossing,
    70,
    elapsedMs
  );
  const regenEligibleMs =
    agent.hunger > 70 && agent.energy > 70
      ? Math.max(0, Math.min(elapsedMs, hungerRegenCrossing, energyRegenCrossing))
      : 0;
  const rawRegen = 0.2 * simMinutes(regenEligibleMs);
  const healthAfterDamage = Math.max(0, agent.health - hungerDamage - energyDamage);
  const healthRegen = Math.min(rawRegen, Math.max(0, MAX - healthAfterDamage));
  const newHealth = clampVital(healthAfterDamage + healthRegen);

  const effects: string[] = [];
  if (newHunger < agent.hunger) effects.push('hunger_decreased');
  if (newHunger < config.lowHungerThreshold) effects.push('low_hunger_warning');
  if (newHunger < config.criticalHungerThreshold) {
    effects.push('critical_hunger_warning');
    if (hungerDamage <= 0) effects.push('grace_period_active');
  }
  if (newEnergy < agent.energy) effects.push('energy_decreased');
  if (newEnergy < config.lowEnergyThreshold && newEnergy >= config.criticalEnergyThreshold) {
    effects.push('low_energy_warning');
  }
  if (newEnergy < config.criticalEnergyThreshold) {
    effects.push('critical_energy_warning');
    effects.push('forced_rest');
  }
  if (hungerDamage > 0 || energyDamage > 0) effects.push('health_damaged');
  if (healthRegen > 0) effects.push('health_regenerated');
  if (newHealth <= 0) effects.push('death');

  const nextMeta: VitalsMeta = {
    vitalsUpdatedAt: nowMs,
    criticalSince: {
      hunger: hungerCriticalSince,
      energy: energyCriticalSince,
    },
  };

  return {
    previousState: {
      hunger: agent.hunger,
      energy: agent.energy,
      health: agent.health,
    },
    newState: {
      hunger: newHunger,
      energy: newEnergy,
      health: newHealth,
    },
    vitals: {
      hunger: newHunger,
      energy: newEnergy,
      health: newHealth,
      dead: newHealth <= 0,
    },
    meta: nextMeta,
    effects,
    healthDamage: {
      hunger: hungerDamage,
      energy: energyDamage,
    },
    healthRegen,
  };
}

export function vitalsAt(agent: Agent, meta: VitalsMeta, nowMs: number): VitalsSnapshot {
  return computeVitals(agent, meta, nowMs).vitals;
}

export async function materializeVitals(
  agentId: string,
  nowMs: number
): Promise<MaterializedVitals | undefined> {
  const agent = await getAgentById(agentId);
  if (!agent) return undefined;

  const meta = getOrCreateVitalsMeta(agentId, 0);
  const computed = computeVitals(agent, meta, nowMs);
  const updated = await updateAgent(agentId, computed.newState);
  setVitalsMeta(agentId, computed.meta);

  return {
    ...computed,
    agent: updated ?? agent,
  };
}
