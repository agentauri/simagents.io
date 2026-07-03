import { describe, expect, test } from 'bun:test';
import { SimClock, TICK_MS, perTickToPerMs, simMinutes } from '../../engine/time';

describe('SimClock', () => {
  test('advances simulation time by wall delta times speed', () => {
    const clock = new SimClock({ speed: 10 });

    expect(clock.advance(1_000)).toBe(10_000);
    expect(clock.simTimeMs).toBe(10_000);

    clock.setSpeed(60);
    expect(clock.advance(1_000)).toBe(60_000);
    expect(clock.simTimeMs).toBe(70_000);
    expect(clock.tick).toBe(1);
  });

  test('pause and resume gate advancement', () => {
    const clock = new SimClock({ speed: 10 });

    clock.pause();
    expect(clock.advance(1_000)).toBe(0);
    expect(clock.simTimeMs).toBe(0);

    clock.resume();
    expect(clock.advance(1_000)).toBe(10_000);
  });

  test('exports legacy tick conversion helpers', () => {
    expect(perTickToPerMs(60)).toBe(60 / TICK_MS);
    expect(simMinutes(90_000)).toBe(1.5);
  });
});
