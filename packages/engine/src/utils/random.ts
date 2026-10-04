/**
 * Seeded Random Number Generator
 *
 * Provides deterministic random number generation for reproducible experiments.
 * Uses seedrandom for reproducible pseudorandom streams; not for security.
 *
 * Usage:
 * - Call initializeRNG(seed) at experiment/simulation start
 * - Use random() instead of Math.random() everywhere
 * - Use randomInt(min, max) for integer ranges
 * - Use randomChoice(array) for random selection
 */

import seedrandom from 'seedrandom';

// Global RNG instance
type StatefulRng = seedrandom.StatefulPRNG<seedrandom.State.Arc4>;
let rng: ReturnType<typeof seedrandom> | null = null;
const agentStreams = new Map<string, StatefulRng>();
let completeHistory = false;
export interface RandomSnapshot {
  schemaVersion: 1;
  complete: boolean;
  seed: string | null;
  world: seedrandom.State.Arc4 | null;
  agents: Array<[string, seedrandom.State.Arc4]>;
}
export function validRandomSnapshot(value: unknown): value is RandomSnapshot {
  const data = value as RandomSnapshot;
  const byte = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 256;
  const state = (v: unknown): boolean => {
    const row = v as seedrandom.State.Arc4;
    return !!row && byte(row.i) && byte(row.j) && Array.isArray(row.S) && row.S.length === 256 && row.S.every(byte) && new Set(row.S).size === 256;
  };
  return !!data && data.schemaVersion === 1 && typeof data.complete === 'boolean' &&
    (typeof data.seed === 'string' || data.seed === null) && (data.world === null ? data.seed === null && !data.complete : typeof data.seed === 'string' && state(data.world)) &&
    Array.isArray(data.agents) && data.agents.length <= 10000 && data.agents.every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && state(row[1])) && new Set(data.agents.map(row => row[0])).size === data.agents.length;
}
export function snapshotRNG(): RandomSnapshot {
  if (rngStack.length) throw new Error('Cannot snapshot inside a temporary random scope');
  return { schemaVersion: 1, complete: completeHistory, seed: currentSeed,
    world: rng ? (rng as StatefulRng).state() : null,
    agents: [...agentStreams].map(([id, source]) => [id, source.state()]) };
}
export function restoreRNG(data: RandomSnapshot): void {
  if (!validRandomSnapshot(data)) throw new Error('Invalid random generator state');
  resetRNG();
  currentSeed = data.seed; completeHistory = data.complete;
  rng = data.world ? seedrandom('', { state: data.world }) : null;
  for (const [id, state] of data.agents) agentStreams.set(id, seedrandom('', { state }));
}
export function initializeLegacyRNG(seed: string): void { initializeRNG(seed); completeHistory = false; }
export function agentRng(id: string, seed: string): RandomSource {
  let source = agentStreams.get(id);
  if (!source) { source = seedrandom(seed, { state: true }); agentStreams.set(id, source); }
  return source;
}
export function pruneAgentRng(aliveIds: Set<string>): void {
  for (const id of agentStreams.keys()) if (!aliveIds.has(id)) agentStreams.delete(id);
}

// Current seed for debugging/logging
let currentSeed: string | null = null;

export type RandomSource = () => number;

const rngStack: Array<ReturnType<typeof seedrandom> | null> = [];

/**
 * Initialize the RNG with a specific seed.
 * Call this at the start of each experiment or simulation run.
 *
 * @param seed - The seed string for reproducibility
 */
export function initializeRNG(seed: string): void {
  currentSeed = seed;
  rng = seedrandom(seed, { state: true });
  agentStreams.clear();
  completeHistory = true;
}

/**
 * Set the RNG seed (alias for initializeRNG for convenience).
 * Accepts either a string or number seed.
 *
 * @param seed - The seed for reproducibility (string or number)
 */
export function setSeed(seed: string | number): void {
  initializeRNG(String(seed));
}

/**
 * Reset RNG to unseeded mode (uses Math.random behavior).
 * Useful for tests or when reproducibility is not needed.
 */
export function resetRNG(): void {
  rng = null;
  currentSeed = null;
  agentStreams.clear();
  completeHistory = false;
}

/**
 * Get the current seed (if any).
 */
export function getCurrentSeed(): string | null {
  return currentSeed;
}

/**
 * Check if RNG is seeded.
 */
export function isSeeded(): boolean {
  return rng !== null;
}

/**
 * Generate a random number between 0 (inclusive) and 1 (exclusive).
 * Drop-in replacement for Math.random().
 */
export function random(): number {
  return rng ? (rng as () => number)() : Math.random();
}

/**
 * Create an isolated deterministic RNG stream.
 *
 * This does not affect the module-level RNG used by existing handlers. The
 * browser engine uses it for per-agent decision streams while leaving handler
 * randomness on the legacy global stream.
 */
export function createRng(seed: string): RandomSource {
  const local = seedrandom(seed);
  return () => local();
}

/**
 * Temporarily route the existing random helpers through a supplied RNG.
 *
 * Baseline agents were written against the module-level random() helper. This
 * keeps their public behavior intact while allowing a runner to provide an
 * isolated stream for one synchronous decision.
 */
export function withRng<T>(source: RandomSource, fn: () => T): T {
  rngStack.push(rng);
  rng = source as ReturnType<typeof seedrandom>;
  try {
    return fn();
  } finally {
    rng = rngStack.pop() ?? null;
  }
}

/**
 * Generate a random integer between min (inclusive) and max (exclusive).
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min)) + min;
}

/**
 * Generate a random integer between 0 (inclusive) and max (exclusive).
 *
 * @param max - Maximum value (exclusive)
 */
export function randomBelow(max: number): number {
  return Math.floor(random() * max);
}

/**
 * Select a random element from an array.
 *
 * @param array - The array to select from
 * @returns A random element, or undefined if array is empty
 */
export function randomChoice<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[randomBelow(array.length)];
}

/**
 * Generate a random boolean with optional probability.
 *
 * @param probability - Probability of returning true (default 0.5)
 */
export function randomBool(probability = 0.5): boolean {
  return random() < probability;
}

/**
 * Generate a deterministic UUID v4 using the seeded RNG.
 * Falls back to crypto.randomUUID() when RNG is not seeded.
 */
export function deterministicUUID(): string {
  if (!rng) {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a random hex color.
 */
export function randomColor(): string {
  return `#${Math.floor(random() * 16777215)
    .toString(16)
    .padStart(6, '0')}`;
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm.
 *
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference)
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a random value following a normal (Gaussian) distribution.
 * Uses Box-Muller transform.
 *
 * @param mean - Mean of the distribution (default 0)
 * @param stddev - Standard deviation (default 1)
 */
export function randomNormal(mean = 0, stddev = 1): number {
  const u1 = random();
  const u2 = random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}
