/**
 * Seasonal Resource Cycles
 *
 * Configurable seasonal cycles that modify resource regeneration rates.
 * Agents must DISCOVER seasonal patterns through observation, not prompt instructions.
 */

import { getRuntimeConfig } from '../config';

export type SeasonName = 'abundance' | 'drought' | 'recovery' | 'plenty';

export interface SeasonMultipliers {
  food: number;
  energy: number;
  material: number;
}

export interface SeasonInfo {
  name: SeasonName;
  multipliers: SeasonMultipliers;
  /** Progress through current season (0-1) */
  progress: number;
  tickInCycle: number;
  cycleLength: number;
}

const DEFAULT_PHASES = {
  abundance: { start: 0, end: 0.25, foodMultiplier: 1.0, energyMultiplier: 1.0, materialMultiplier: 1.0 },
  drought: { start: 0.25, end: 0.5, foodMultiplier: 0.2, energyMultiplier: 0.5, materialMultiplier: 0.8 },
  recovery: { start: 0.5, end: 0.75, foodMultiplier: 0.6, energyMultiplier: 0.8, materialMultiplier: 1.5 },
  plenty: { start: 0.75, end: 1.0, foodMultiplier: 1.5, energyMultiplier: 1.2, materialMultiplier: 1.0 },
};

/**
 * Get the current season based on the tick number.
 * Reads config once per call — caller should cache result when calling multiple times per tick.
 */
export function getCurrentSeason(tick: number): SeasonInfo {
  const config = getRuntimeConfig();
  const cycleLength = config.seasons?.cycleLengthTicks ?? 100;
  const phases = config.seasons?.phases ?? DEFAULT_PHASES;

  const tickInCycle = tick % cycleLength;
  const progress = tickInCycle / cycleLength;

  for (const [name, phase] of Object.entries(phases)) {
    if (progress >= phase.start && progress < phase.end) {
      const seasonProgress = (progress - phase.start) / (phase.end - phase.start);
      return {
        name: name as SeasonName,
        multipliers: {
          food: phase.foodMultiplier,
          energy: phase.energyMultiplier,
          material: phase.materialMultiplier,
        },
        progress: seasonProgress,
        tickInCycle,
        cycleLength,
      };
    }
  }

  return {
    name: 'abundance',
    multipliers: { food: 1.0, energy: 1.0, material: 1.0 },
    progress: 0,
    tickInCycle,
    cycleLength,
  };
}

/**
 * Get a sensory description of the current season for the emergent prompt.
 * Accepts pre-computed SeasonInfo to avoid redundant config reads.
 */
export function getSeasonSensoryDescription(tick: number, precomputed?: SeasonInfo): string | null {
  const config = getRuntimeConfig();
  if (!config.seasons?.enabled) return null;

  const season = precomputed ?? getCurrentSeason(tick);

  switch (season.name) {
    case 'abundance':
      return 'The world feels balanced. Resources grow at their natural pace.';
    case 'drought':
      if (season.progress < 0.3) {
        return 'You notice the plants around you beginning to wilt. Food seems harder to find.';
      } else if (season.progress < 0.7) {
        return 'The land is parched. Food is scarce and energy drains faster. The world feels harsh.';
      } else {
        return 'The drought persists, though you sense the faintest signs of change in the air.';
      }
    case 'recovery':
      if (season.progress < 0.3) {
        return 'New growth appears tentatively. Food is slowly returning, and you notice unusual mineral deposits.';
      } else {
        return 'The world recovers. Plants grow again, though material resources seem particularly abundant now.';
      }
    case 'plenty':
      if (season.progress < 0.5) {
        return 'Everything grows vigorously. Resources seem more abundant than usual.';
      } else {
        return 'Abundance surrounds you, though you sense it may not last forever.';
      }
  }
}
