export const TICK_MS = 60_000;
export const DEFAULT_SIM_SPEED = 10;

export function perTickToPerMs(value: number): number {
  return value / TICK_MS;
}

export function simMinutes(ms: number): number {
  return ms / TICK_MS;
}

export function tickFromSimTime(simTimeMs: number): number {
  return Math.floor(simTimeMs / TICK_MS);
}

export class SimClock {
  private simTimeMsValue: number;
  private speedValue: number;
  private pausedValue: boolean;

  constructor(opts: { simTimeMs?: number; speed?: number; paused?: boolean } = {}) {
    this.simTimeMsValue = opts.simTimeMs ?? 0;
    this.speedValue = opts.speed ?? DEFAULT_SIM_SPEED;
    this.pausedValue = opts.paused ?? false;
  }

  get simTimeMs(): number {
    return this.simTimeMsValue;
  }

  get speed(): number {
    return this.speedValue;
  }

  get paused(): boolean {
    return this.pausedValue;
  }

  get tick(): number {
    return tickFromSimTime(this.simTimeMsValue);
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed < 0) {
      throw new Error(`Invalid simulation speed: ${speed}`);
    }
    this.speedValue = speed;
  }

  pause(): void {
    this.pausedValue = true;
  }

  resume(): void {
    this.pausedValue = false;
  }

  advance(wallDeltaMs: number): number {
    if (!Number.isFinite(wallDeltaMs) || wallDeltaMs < 0) {
      throw new Error(`Invalid wall delta: ${wallDeltaMs}`);
    }
    if (this.pausedValue) return 0;

    const simDelta = wallDeltaMs * this.speedValue;
    this.simTimeMsValue += simDelta;
    return simDelta;
  }
}
