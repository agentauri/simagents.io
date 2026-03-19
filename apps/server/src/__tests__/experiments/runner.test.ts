/**
 * Experiment Runner Tests
 *
 * Tests for pure functions in the experiment runner that handle
 * claim classification, validation, and reproducibility.
 */

import { describe, expect, test } from 'bun:test';
import {
  hasReplicatedConditions,
  isValidatedRun,
  determineClaimClass,
  supportsScientificFinding,
  buildDeterministicEventTraceHash,
  type RunResult,
} from '../../experiments/runner';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_SCIENTIFIC_CONTROLS = {
  canonicalMinimalWorld: true,
  cooperationIncentivesEnabled: false,
  trustPricingEnabled: false,
  tradeBonusesEnabled: false,
  spoilageEnabled: false,
  puzzleEnabled: false,
  personalitiesEnabled: false,
  llmCacheEnabled: false,
  cacheSharingEnabled: false,
};

function makeRunResult(overrides: Partial<RunResult> & { conditionName: string }): RunResult {
  const { provenance: provenanceOverrides, ...restOverrides } = overrides;
  const defaults = {
    experimentId: 'exp-1',
    variantId: `var-${overrides.conditionName}-${overrides.runNumber ?? 1}`,
    variantName: `${overrides.conditionName} [run ${overrides.runNumber ?? 1}]`,
    runNumber: 1,
    seed: 42,
    profile: 'deterministic_baseline' as const,
    benchmarkWorld: 'canonical_core' as const,
    ticksCompleted: 50,
    initialAgents: 3,
    duration: { startTime: 0, endTime: 1000, elapsedMs: 1000 },
    finalMetrics: {
      aliveAgents: 2,
      survivalRate: 0.67,
      avgWealth: 100,
      avgHealth: 80,
      avgHunger: 30,
      avgEnergy: 60,
      giniCoefficient: 0.35,
      cooperationIndex: 0.1,
      tradeCount: 5,
      conflictCount: 2,
    },
    artifact: {
      snapshotCount: 5,
      eventCount: 100,
      eventTraceHash: 'hash-abc',
      initialStateHash: 'init-hash',
      finalStateHash: 'final-hash',
    },
    survivalAnalysis: {},
    economicAnalysis: {},
  };

  const merged = { ...defaults, ...restOverrides };

  return {
    ...merged,
    provenance: {
      profile: merged.profile,
      benchmarkWorld: merged.benchmarkWorld,
      resolvedMode: 'fallback',
      seed: merged.seed,
      codeVersion: 'abc123',
      llmTypes: [],
      llmCache: { enabled: false, shareAcrossAgents: false },
      activeTransformations: [],
      runtimeConfig: {},
      scientificControls: provenanceOverrides?.scientificControls ?? VALID_SCIENTIFIC_CONTROLS,
      interventions: [],
      notes: [],
      ...provenanceOverrides,
    },
  } as RunResult;
}

function makeInvalidControls(override: Partial<typeof VALID_SCIENTIFIC_CONTROLS>) {
  return { ...VALID_SCIENTIFIC_CONTROLS, ...override };
}

// =============================================================================
// hasReplicatedConditions
// =============================================================================

describe('hasReplicatedConditions', () => {
  test('returns false for empty results', () => {
    expect(hasReplicatedConditions([])).toBe(false);
  });

  test('returns false for single condition', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
    ];
    expect(hasReplicatedConditions(results)).toBe(false);
  });

  test('returns false for 2 conditions with 1 run each', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
    ];
    expect(hasReplicatedConditions(results)).toBe(false);
  });

  test('returns true for 2 conditions with 2+ runs each', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
      makeRunResult({ conditionName: 'B', runNumber: 2 }),
    ];
    expect(hasReplicatedConditions(results)).toBe(true);
  });

  test('returns true for 3+ conditions with 2+ runs each', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
      makeRunResult({ conditionName: 'B', runNumber: 2 }),
      makeRunResult({ conditionName: 'C', runNumber: 1 }),
      makeRunResult({ conditionName: 'C', runNumber: 2 }),
    ];
    expect(hasReplicatedConditions(results)).toBe(true);
  });

  test('returns false when one condition has only 1 run', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
    ];
    expect(hasReplicatedConditions(results)).toBe(false);
  });
});

// =============================================================================
// isValidatedRun
// =============================================================================

describe('isValidatedRun', () => {
  test('returns true when all controls are disabled and profile is deterministic', () => {
    const result = makeRunResult({ conditionName: 'A' });
    expect(isValidatedRun(result)).toBe(true);
  });

  test('returns false when profile is llm_exploratory', () => {
    const result = makeRunResult({
      conditionName: 'A',
      profile: 'llm_exploratory',
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when benchmarkWorld is full_surface', () => {
    const result = makeRunResult({
      conditionName: 'A',
      benchmarkWorld: 'full_surface',
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when canonicalMinimalWorld is false', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ canonicalMinimalWorld: false }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when cooperationIncentivesEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ cooperationIncentivesEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when trustPricingEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ trustPricingEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when tradeBonusesEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ tradeBonusesEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when spoilageEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ spoilageEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when puzzleEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ puzzleEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when personalitiesEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ personalitiesEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when llmCacheEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ llmCacheEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });

  test('returns false when cacheSharingEnabled is true', () => {
    const result = makeRunResult({
      conditionName: 'A',
      provenance: {
        scientificControls: makeInvalidControls({ cacheSharingEnabled: true }),
      } as any,
    });
    expect(isValidatedRun(result)).toBe(false);
  });
});

// =============================================================================
// determineClaimClass
// =============================================================================

describe('determineClaimClass', () => {
  test('returns descriptive_only for unreplicated results', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
    ];
    expect(determineClaimClass(results)).toBe('descriptive_only');
  });

  test('returns descriptive_only for single-condition multi-run', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'A', runNumber: 3 }),
    ];
    expect(determineClaimClass(results)).toBe('descriptive_only');
  });

  test('returns validated when all runs pass isValidatedRun', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
      makeRunResult({ conditionName: 'B', runNumber: 2 }),
    ];
    expect(determineClaimClass(results)).toBe('validated');
  });

  test('returns exploratory when replicated but not all validated', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({
        conditionName: 'B',
        runNumber: 1,
        profile: 'llm_exploratory',
      }),
      makeRunResult({
        conditionName: 'B',
        runNumber: 2,
        profile: 'llm_exploratory',
      }),
    ];
    expect(determineClaimClass(results)).toBe('exploratory');
  });

  test('returns exploratory when one run has invalid controls', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1 }),
      makeRunResult({ conditionName: 'A', runNumber: 2 }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
      makeRunResult({
        conditionName: 'B',
        runNumber: 2,
        provenance: {
          scientificControls: makeInvalidControls({ cooperationIncentivesEnabled: true }),
        } as any,
      }),
    ];
    expect(determineClaimClass(results)).toBe('exploratory');
  });

  test('returns descriptive_only for empty results', () => {
    expect(determineClaimClass([])).toBe('descriptive_only');
  });
});

// =============================================================================
// supportsScientificFinding
// =============================================================================

describe('supportsScientificFinding', () => {
  const makeMetric = (metric: string): any => ({
    metric,
    significantAfterCorrection: true,
    adjustedPValue: 0.01,
  });

  test('returns true for Gini Coefficient', () => {
    expect(supportsScientificFinding(makeMetric('Gini Coefficient'))).toBe(true);
  });

  test('returns true for Survival Rate', () => {
    expect(supportsScientificFinding(makeMetric('Survival Rate'))).toBe(true);
  });

  test('returns true for Trade Count', () => {
    expect(supportsScientificFinding(makeMetric('Trade Count'))).toBe(true);
  });

  test('returns true for Conflict Count', () => {
    expect(supportsScientificFinding(makeMetric('Conflict Count'))).toBe(true);
  });

  test('returns true for Average Wealth', () => {
    expect(supportsScientificFinding(makeMetric('Average Wealth'))).toBe(true);
  });

  test('returns true for Average Health', () => {
    expect(supportsScientificFinding(makeMetric('Average Health'))).toBe(true);
  });

  test('returns true for Average Hunger', () => {
    expect(supportsScientificFinding(makeMetric('Average Hunger'))).toBe(true);
  });

  test('returns true for Average Energy', () => {
    expect(supportsScientificFinding(makeMetric('Average Energy'))).toBe(true);
  });

  test('returns false for cooperationIndex (heuristic metric)', () => {
    expect(supportsScientificFinding(makeMetric('cooperationIndex'))).toBe(false);
  });

  test('returns false for unknown metrics', () => {
    expect(supportsScientificFinding(makeMetric('Custom Metric'))).toBe(false);
  });

  test('strips condition suffix before matching', () => {
    expect(supportsScientificFinding(makeMetric('Gini Coefficient (A vs B)'))).toBe(true);
  });
});

// =============================================================================
// buildDeterministicEventTraceHash
// =============================================================================

describe('buildDeterministicEventTraceHash', () => {
  const makeEvent = (tick: number, eventType: string, agentId: string | null, payload: any = {}) => ({
    id: crypto.randomUUID(),
    tick,
    eventType,
    agentId,
    payload,
    createdAt: new Date(),
  });

  test('produces consistent hash for same event sequence', () => {
    const events = [
      makeEvent(1, 'move', 'agent-1', { x: 5, y: 10 }),
      makeEvent(1, 'gather', 'agent-2', { resource: 'food' }),
      makeEvent(2, 'trade', 'agent-1', { with: 'agent-2' }),
    ];

    const hash1 = buildDeterministicEventTraceHash(events as any);
    const hash2 = buildDeterministicEventTraceHash(events as any);
    expect(hash1).toBe(hash2);
  });

  test('produces different hash for different events', () => {
    const events1 = [
      makeEvent(1, 'move', 'agent-1', { x: 5, y: 10 }),
    ];
    const events2 = [
      makeEvent(1, 'move', 'agent-1', { x: 5, y: 20 }),
    ];

    const hash1 = buildDeterministicEventTraceHash(events1 as any);
    const hash2 = buildDeterministicEventTraceHash(events2 as any);
    expect(hash1).not.toBe(hash2);
  });

  test('handles empty event list', () => {
    const hash = buildDeterministicEventTraceHash([] as any);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('normalizes UUIDs so different IDs for same structure produce same hash', () => {
    const events1 = [
      makeEvent(1, 'move', '11111111-1111-1111-8111-111111111111', { target: '22222222-2222-2222-8222-222222222222' }),
    ];
    const events2 = [
      makeEvent(1, 'move', 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa', { target: 'bbbbbbbb-bbbb-2bbb-8bbb-bbbbbbbbbbbb' }),
    ];

    const hash1 = buildDeterministicEventTraceHash(events1 as any);
    const hash2 = buildDeterministicEventTraceHash(events2 as any);
    expect(hash1).toBe(hash2);
  });

  test('filters out tick_start and tick_end events', () => {
    const events1 = [
      makeEvent(1, 'move', 'agent-1', { x: 5 }),
    ];
    const events2 = [
      makeEvent(1, 'tick_start', null, {}),
      makeEvent(1, 'move', 'agent-1', { x: 5 }),
      makeEvent(1, 'tick_end', null, {}),
    ];

    const hash1 = buildDeterministicEventTraceHash(events1 as any);
    const hash2 = buildDeterministicEventTraceHash(events2 as any);
    expect(hash1).toBe(hash2);
  });
});

// =============================================================================
// Claim Class Enforcement
// =============================================================================

describe('claim class enforcement', () => {
  test('cannot produce validated claim with llm_exploratory profile', () => {
    const results = [
      makeRunResult({ conditionName: 'A', runNumber: 1, profile: 'llm_exploratory' }),
      makeRunResult({ conditionName: 'A', runNumber: 2, profile: 'llm_exploratory' }),
      makeRunResult({ conditionName: 'B', runNumber: 1, profile: 'llm_exploratory' }),
      makeRunResult({ conditionName: 'B', runNumber: 2, profile: 'llm_exploratory' }),
    ];
    const claimClass = determineClaimClass(results);
    expect(claimClass).not.toBe('validated');
    expect(claimClass).toBe('exploratory');
  });

  test('cannot produce validated claim with cooperation enabled', () => {
    const results = [
      makeRunResult({
        conditionName: 'A',
        runNumber: 1,
        provenance: {
          scientificControls: makeInvalidControls({ cooperationIncentivesEnabled: true }),
        } as any,
      }),
      makeRunResult({
        conditionName: 'A',
        runNumber: 2,
        provenance: {
          scientificControls: makeInvalidControls({ cooperationIncentivesEnabled: true }),
        } as any,
      }),
      makeRunResult({ conditionName: 'B', runNumber: 1 }),
      makeRunResult({ conditionName: 'B', runNumber: 2 }),
    ];
    const claimClass = determineClaimClass(results);
    expect(claimClass).not.toBe('validated');
    expect(claimClass).toBe('exploratory');
  });

  test('isValidatedRun rejects each individual control violation', () => {
    const controlKeys = [
      'cooperationIncentivesEnabled',
      'trustPricingEnabled',
      'tradeBonusesEnabled',
      'spoilageEnabled',
      'puzzleEnabled',
      'personalitiesEnabled',
      'llmCacheEnabled',
      'cacheSharingEnabled',
    ] as const;

    for (const key of controlKeys) {
      const result = makeRunResult({
        conditionName: 'A',
        provenance: {
          scientificControls: makeInvalidControls({ [key]: true }),
        } as any,
      });
      expect(isValidatedRun(result)).toBe(false);
    }
  });
});
