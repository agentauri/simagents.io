import { expect, test } from 'bun:test';
import { elapsedContinuous, openSoakClock } from './soak-clock';
const start = { continuousMs: 1000000, uptimeMs: 500000, wallMs: 2000000 };
test('continuous elapsed time accepts regular native samples', () => {
  expect(elapsedContinuous(start, { continuousMs: 1010000, uptimeMs: 510000, wallMs: 2010000 })).toBe(10000);
});
test('suspension cannot turn sixty active minutes into a real-hour pass', () => {
  expect(() => elapsedContinuous(start, { continuousMs: 4600000, uptimeMs: 500100, wallMs: 5600000 })).toThrow('suspension');
});
test('missing observations cannot certify an uninterrupted run', () => {
  expect(() => elapsedContinuous(start, { continuousMs: 1031000, uptimeMs: 531000, wallMs: 2031000 })).toThrow('sampling gap');
});
test('calendar adjustments do not change a native continuous measurement', () => {
  for (const wallMs of [1, 9000000]) expect(elapsedContinuous(start, { continuousMs: 1010000, uptimeMs: 510000, wallMs })).toBe(10000);
});
test('missing or regressing native clocks fail closed', () => {
  expect(() => elapsedContinuous(start, { ...start, continuousMs: NaN })).toThrow('unavailable');
  expect(() => elapsedContinuous(start, { ...start, uptimeMs: 1 })).toThrow('regressed');
});
test('actual native clock is readable and cannot be reused after disposal', async () => {
  const clock = openSoakClock();
  try {
    const before = clock.read(); await new Promise(resolve => setTimeout(resolve, 20)); const after = clock.read();
    expect(elapsedContinuous(before, after)).toBeGreaterThan(0);
    expect(after.continuousMs).toBeGreaterThan(0);
    expect(after.uptimeMs).toBeGreaterThan(0);
  } finally { clock.dispose(); }
  expect(() => clock.read()).toThrow('disposed');
});
