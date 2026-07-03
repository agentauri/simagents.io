import { beforeEach, describe, expect, test } from 'bun:test';
import type { Agent } from '../../db/schema';
import {
  computeVitals,
  damageDurationAfterGraceMs,
  durationBelowLinearThresholdMs,
  energyThresholdCrossingTimeMs,
  thresholdCrossingTimeMs,
  vitalsAt,
} from '../../engine/vitals';
import type { VitalsMeta } from '../../engine/vitals-meta';
import { TICK_MS } from '../../engine/time';
import { resetRuntimeConfig } from '../../config';

const baseAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1',
  tenantId: null,
  llmType: 'claude',
  x: 0,
  y: 0,
  hunger: 100,
  energy: 100,
  health: 100,
  balance: 100,
  state: 'idle',
  color: '#888888',
  personality: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  diedAt: null,
  ...overrides,
});

const meta = (overrides: Partial<VitalsMeta> = {}): VitalsMeta => ({
  vitalsUpdatedAt: 0,
  criticalSince: {},
  ...overrides,
});

describe('vitalsAt continuous decay', () => {
  beforeEach(() => {
    resetRuntimeConfig();
  });

  test('applies per-state hunger and energy multipliers over one sim-minute', () => {
    const cases = [
      ['idle', 99.4, 99.7],
      ['walking', 99.1, 99.64],
      ['working', 99.22, 99.7],
      ['sleeping', 99.7, 100],
    ] as const;

    for (const [state, expectedHunger, expectedEnergy] of cases) {
      const vitals = vitalsAt(baseAgent({ state }), meta(), TICK_MS);
      expect(vitals.hunger).toBeCloseTo(expectedHunger, 5);
      expect(vitals.energy).toBeCloseTo(expectedEnergy, 5);
      expect(vitals.health).toBe(100);
      expect(vitals.dead).toBe(false);
    }
  });

  test('adds extra energy drain while hunger is below the hungry threshold', () => {
    const vitals = vitalsAt(baseAgent({ hunger: 19, energy: 50 }), meta(), TICK_MS);

    expect(vitals.hunger).toBeCloseTo(18.4, 5);
    expect(vitals.energy).toBeCloseTo(48.7, 5);
  });

  test('integrates critical hunger crossing from the crossing time, not interval start', () => {
    const result = computeVitals(
      baseAgent({ hunger: 10.3, energy: 100, health: 100 }),
      meta(),
      4 * TICK_MS
    );

    expect(result.meta.criticalSince.hunger).toBeCloseTo(30_000, 5);
    expect(result.healthDamage.hunger).toBeCloseTo(1, 5);
    expect(result.vitals.health).toBeCloseTo(99, 5);
  });

  test('honors the three-sim-minute grace period before critical damage', () => {
    const graceEdge = computeVitals(
      baseAgent({ hunger: 9, energy: 100, health: 100 }),
      meta({ criticalSince: { hunger: 0 } }),
      3 * TICK_MS
    );
    expect(graceEdge.healthDamage.hunger).toBe(0);
    expect(graceEdge.vitals.health).toBe(100);

    const afterGrace = computeVitals(
      baseAgent({ hunger: 9, energy: 100, health: 100 }),
      meta({ criticalSince: { hunger: 0 } }),
      4 * TICK_MS
    );
    expect(afterGrace.healthDamage.hunger).toBeCloseTo(2, 5);
    expect(afterGrace.vitals.health).toBeCloseTo(98, 5);
  });

  test('applies critical energy damage immediately, with no grace period', () => {
    // Legacy needs-decay parity: only hunger is grace-gated; energy damage
    // starts the moment energy is critical.
    const result = computeVitals(
      baseAgent({ hunger: 100, energy: 9, health: 100 }),
      meta({ criticalSince: { energy: 0 } }),
      4 * TICK_MS
    );

    expect(result.healthDamage.energy).toBeCloseTo(4, 5);
    expect(result.vitals.health).toBeCloseTo(96, 5);
  });

  test('starts energy damage at the mid-interval crossing time', () => {
    // energy 10.3, idle rate 0.3/min -> crosses critical (10) after 1 sim-minute;
    // damage accrues for the remaining 3 minutes at 1 HP/min.
    const result = computeVitals(
      baseAgent({ hunger: 100, energy: 10.3, health: 100 }),
      meta(),
      4 * TICK_MS
    );

    expect(result.meta.criticalSince.energy).toBeCloseTo(TICK_MS, 5);
    expect(result.healthDamage.energy).toBeCloseTo(3, 5);
    expect(result.vitals.health).toBeCloseTo(97, 5);
  });

  test('is idempotent: materializing [t0,t1]+[t1,t2] equals one [t0,t2] pass', () => {
    const start = baseAgent({ hunger: 10.3, energy: 100, health: 100 });

    const single = computeVitals(start, meta(), 4 * TICK_MS);

    const first = computeVitals(start, meta(), 2 * TICK_MS);
    const intermediate = baseAgent({ ...start, ...first.newState });
    const second = computeVitals(intermediate, first.meta, 4 * TICK_MS);

    expect(second.newState.hunger).toBeCloseTo(single.newState.hunger, 5);
    expect(second.newState.energy).toBeCloseTo(single.newState.energy, 5);
    expect(second.newState.health).toBeCloseTo(single.newState.health, 5);
    expect(second.meta.criticalSince.hunger).toBeCloseTo(
      single.meta.criticalSince.hunger ?? Number.NaN,
      5
    );
  });

  test('regenerates health while well-fed and rested', () => {
    const result = computeVitals(
      baseAgent({ hunger: 80, energy: 80, health: 90 }),
      meta(),
      5 * TICK_MS
    );

    expect(result.healthRegen).toBeCloseTo(1, 5);
    expect(result.vitals.health).toBeCloseTo(91, 5);
    expect(result.effects).toContain('health_regenerated');
  });

  test('reports death exactly at the health boundary', () => {
    const result = computeVitals(
      baseAgent({ hunger: 0, energy: 100, health: 2 }),
      meta({ criticalSince: { hunger: 0 } }),
      4 * TICK_MS
    );

    expect(result.vitals.health).toBe(0);
    expect(result.vitals.dead).toBe(true);
    expect(result.effects).toContain('death');
  });

  test('exports threshold helpers for piecewise assertions', () => {
    expect(thresholdCrossingTimeMs(10.3, 0.6, 10)).toBeCloseTo(30_000, 5);
    expect(durationBelowLinearThresholdMs(20.3, 0.6, 20, TICK_MS)).toBeCloseTo(30_000, 5);
    expect(
      energyThresholdCrossingTimeMs(10.3, 0.3, 1, 0, 10, TICK_MS)
    ).toBeCloseTo((0.3 / 1.3) * TICK_MS, 5);
    expect(damageDurationAfterGraceMs(3 * TICK_MS, 4 * TICK_MS, 0)).toBe(TICK_MS);
  });
});
