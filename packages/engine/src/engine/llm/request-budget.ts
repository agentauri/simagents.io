export interface SessionLimits {
  maxRequests: number;
  maxDurationSeconds: number;
  maxOutputTokens: number;
  maxConcurrentPerConnection: number;
  requestsPerMinutePerConnection: number;
}
export const GLOBAL_REQUEST_CONCURRENCY = 6;
export const GLOBAL_REQUESTS_PER_MINUTE = 50;
export const DEFAULT_SESSION_LIMITS: SessionLimits = {
  maxRequests: 100, maxDurationSeconds: 900, maxOutputTokens: 1024,
  maxConcurrentPerConnection: 2, requestsPerMinutePerConnection: 30,
};
export function validateSessionLimits(value: SessionLimits): SessionLimits {
  const bounds: Record<keyof SessionLimits, [number, number]> = {
    maxRequests: [1, 10000], maxDurationSeconds: [1, 3600], maxOutputTokens: [32, 32768],
    maxConcurrentPerConnection: [1, 20], requestsPerMinutePerConnection: [1, 6000],
  };
  if (!value || typeof value !== 'object') throw new Error('Session limits are required');
  for (const key of Object.keys(bounds) as Array<keyof SessionLimits>) {
    if (!Number.isInteger(value[key]) || value[key] < bounds[key][0] || value[key] > bounds[key][1]) throw new Error(`Invalid session limit: ${key}`);
  }
  return { ...value };
}
export class RequestBudgetError extends Error {
  constructor(readonly code: 'request-limit' | 'duration-limit' | 'session-ended') {
    super(code === 'request-limit' ? 'The request budget is exhausted. Start a new session explicitly to make more requests.'
      : code === 'duration-limit' ? 'The session duration limit was reached. Start a new session explicitly to continue.' : 'The request session has ended.');
  }
}
export class RequestBudget {
  readonly limits: SessionLimits;
  private requests = 0;
  private active = 0;
  private nextGlobalStart = 0;
  private startedAt?: number;
  private startedWallAt?: number;
  private observedElapsedMs = 0;
  private ended = false;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly connections = new Map<string, { active: number; nextStart: number }>();
  private readonly waiters = new Set<() => void>();
  private readonly now: () => number;
  private readonly wallNow: () => number;
  constructor(limits: SessionLimits, private readonly onExpired: () => void = () => {}, now?: () => number, wallNow?: () => number) {
    this.limits = validateSessionLimits(limits);
    this.now = now ?? (() => performance.now());
    // A supplied test clock continues to control both domains unless a
    // separate wall clock is provided. Production uses both real clocks:
    // performance.now() can stop during OS suspend on macOS/Linux browsers.
    this.wallNow = wallNow ?? now ?? (() => Date.now());
  }
  start(): void {
    if (this.ended) throw new RequestBudgetError('session-ended');
    if (this.startedAt === undefined) {
      this.startedAt = this.now();
      this.startedWallAt = this.wallNow();
      this.scheduleExpiry();
    }
    this.check();
  }
  snapshot() {
    return { requests: this.requests, limits: { ...this.limits }, elapsedMs: this.elapsedMs() };
  }
  async acquire(connectionId: string, signal: AbortSignal): Promise<() => void> {
    this.start();
    let state = this.connections.get(connectionId);
    if (!state) { state = { active: 0, nextStart: 0 }; this.connections.set(connectionId, state); }
    for (;;) {
      if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      this.check();
      const delay = Math.max(state.nextStart, this.nextGlobalStart) - this.now();
      if (state.active < this.limits.maxConcurrentPerConnection && this.active < GLOBAL_REQUEST_CONCURRENCY && delay <= 0) {
        // Admission and count are synchronous: concurrent agents cannot overspend this local budget.
        this.requests++;
        state.active++; this.active++;
        this.nextGlobalStart = this.now() + 60000 / GLOBAL_REQUESTS_PER_MINUTE;
        state.nextStart = this.now() + 60000 / this.limits.requestsPerMinutePerConnection;
        let released = false;
        return () => { if (!released) { released = true; state!.active--; this.active--; this.wake(); } };
      }
      await this.wait(signal, delay > 0 ? delay : undefined);
    }
  }
  dispose(): void { this.ended = true; clearTimeout(this.timer); this.wake(); }
  private elapsedMs(): number {
    if (this.startedAt === undefined || this.startedWallAt === undefined) return 0;
    // Neither a backward calendar adjustment nor a suspended monotonic clock
    // may give back already consumed duration. A forward clock adjustment
    // expires conservatively rather than allowing additional requests.
    this.observedElapsedMs = Math.max(this.observedElapsedMs, 0,
      this.now() - this.startedAt, this.wallNow() - this.startedWallAt);
    return this.observedElapsedMs;
  }
  private scheduleExpiry(): void {
    const remaining = this.limits.maxDurationSeconds * 1000 - this.elapsedMs();
    this.timer = setTimeout(() => {
      if (this.ended) return;
      if (this.elapsedMs() >= this.limits.maxDurationSeconds * 1000) {
        this.wake(); this.onExpired();
      } else this.scheduleExpiry();
    }, Math.min(1000, Math.max(0, remaining)));
  }
  private check(): void {
    if (this.ended) throw new RequestBudgetError('session-ended');
    if (this.startedAt !== undefined && this.elapsedMs() >= this.limits.maxDurationSeconds * 1000) throw new RequestBudgetError('duration-limit');
    if (this.requests >= this.limits.maxRequests) throw new RequestBudgetError('request-limit');
  }
  private wake(): void { for (const wake of [...this.waiters]) wake(); }
  private wait(signal: AbortSignal, delay?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clean = () => { clearTimeout(timer); this.waiters.delete(wake); signal.removeEventListener('abort', abort); };
      const wake = () => { clean(); resolve(); };
      const abort = () => { clean(); reject(new DOMException('Request cancelled', 'AbortError')); };
      this.waiters.add(wake);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else if (delay !== undefined) timer = setTimeout(wake, Math.max(1, delay));
    });
  }
}
