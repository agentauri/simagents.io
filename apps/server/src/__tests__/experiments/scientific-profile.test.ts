import { describe, expect, test } from 'bun:test';
import { resolveScientificProfile } from '../../experiments/scientific-profile';
import type { ExperimentSchema } from '../../experiments/schema';

const baseSchema: ExperimentSchema = {
  name: 'Scientific Profile Test',
  duration: 25,
  mode: 'fallback',
  agents: [
    { type: 'baseline_random', count: 1 },
    { type: 'baseline_rule', count: 1 },
  ],
};

describe('resolveScientificProfile', () => {
  test('defaults baseline-friendly runs to deterministic profile', () => {
    const profile = resolveScientificProfile(baseSchema);
    expect(profile.profile).toBe('deterministic_baseline');
    expect(profile.resolvedMode).toBe('fallback');
    expect(profile.llmCacheConfig.enabled).toBe(false);
  });

  test('forces llm experiments into llm_exploratory profile', () => {
    const profile = resolveScientificProfile({
      ...baseSchema,
      mode: 'llm',
      profile: 'llm_exploratory',
      agents: [
        { type: 'claude', count: 2 },
        { type: 'baseline_random', count: 1 },
        { type: 'baseline_rule', count: 1 },
      ],
    });

    expect(profile.profile).toBe('llm_exploratory');
    expect(profile.resolvedMode).toBe('llm');
    expect(profile.runtimeConfig.experiment?.normalizeCapabilities).toBe(true);
  });

  test('canonical_core disables incentive-heavy mechanics for validated runs', () => {
    const profile = resolveScientificProfile({
      ...baseSchema,
      benchmarkWorld: 'canonical_core',
    });

    expect(profile.runtimeConfig.cooperation?.enabled).toBe(false);
    expect(profile.runtimeConfig.spoilage?.enabled).toBe(false);
    expect(profile.runtimeConfig.puzzle?.enabled).toBe(false);
    expect(profile.runtimeConfig.experiment?.enablePersonalities).toBe(false);
    expect(profile.scientificControls).toEqual({
      canonicalMinimalWorld: true,
      cooperationIncentivesEnabled: false,
      trustPricingEnabled: false,
      tradeBonusesEnabled: false,
      spoilageEnabled: false,
      puzzleEnabled: false,
      personalitiesEnabled: false,
      llmCacheEnabled: false,
      cacheSharingEnabled: false,
      biomeExclusivityEnabled: false,
      seasonsEnabled: false,
      resourceDepletionEnabled: false,
    });
  });

  test('rejects deterministic profile with llm mode', () => {
    expect(() => resolveScientificProfile({
      ...baseSchema,
      profile: 'deterministic_baseline',
      mode: 'llm',
    })).toThrow();
  });
});
