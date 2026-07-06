import { describe, expect, test } from 'bun:test';
import {
  damageDurationAfterGraceMs,
  durationBelowLinearThresholdMs,
  energyAtMs,
  energyThresholdCrossingTimeMs,
  thresholdCrossingTimeMs,
} from '../../engine/vitals';
import { TICK_MS } from '../../engine/time';

describe('vitals math', () => {
  test('finds linear threshold crossings in simulation time', () => {
    expect(thresholdCrossingTimeMs(80, 2, 20)).toBe(30 * TICK_MS);
    expect(thresholdCrossingTimeMs(20, 2, 20)).toBe(0);
    expect(thresholdCrossingTimeMs(80, 0, 20)).toBe(Infinity);
    expect(thresholdCrossingTimeMs(10, 2, 20)).toBe(0);
  });

  test('counts only the elapsed time spent below a threshold', () => {
    expect(durationBelowLinearThresholdMs(25, 1, 20, 10 * TICK_MS)).toBe(5 * TICK_MS);
    expect(durationBelowLinearThresholdMs(40, 1, 20, 10 * TICK_MS)).toBe(0);
  });

  test('applies hungry energy drain after the hunger crossing', () => {
    expect(energyAtMs(100, 2, 1, 10 * TICK_MS, 15 * TICK_MS)).toBe(65);
    expect(
      energyThresholdCrossingTimeMs(100, 2, 1, 10 * TICK_MS, 65, 15 * TICK_MS)
    ).toBe(15 * TICK_MS);
    expect(
      energyThresholdCrossingTimeMs(100, 2, 1, 10 * TICK_MS, 10, 15 * TICK_MS)
    ).toBe(Infinity);
  });

  test('delays critical damage until after the grace window', () => {
    expect(damageDurationAfterGraceMs(0, 6 * TICK_MS, 1 * TICK_MS)).toBe(2 * TICK_MS);
    expect(damageDurationAfterGraceMs(5 * TICK_MS, 6 * TICK_MS, 1 * TICK_MS)).toBe(
      1 * TICK_MS
    );
    expect(damageDurationAfterGraceMs(0, 6 * TICK_MS, undefined)).toBe(0);
  });
});
