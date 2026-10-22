import { expect, test } from 'bun:test';
import { DEFAULT_SESSION_LIMITS, RequestBudget, validateSessionLimits } from '../../engine/llm/request-budget';
const signal = () => new AbortController().signal;
test('concurrent callers cannot exceed the request budget', async () => {
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxRequests: 2 });
  try {
    const results = await Promise.allSettled(['a', 'b', 'c'].map((id) => budget.acquire(id, signal())));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);
    expect(budget.snapshot().requests).toBe(2);
    for (const result of results) if (result.status === 'fulfilled') result.value();
    await expect(budget.acquire('d', signal())).rejects.toThrow('request budget');
  } finally { budget.dispose(); }
});
test('queued requests obey concurrency, spacing, cancellation and session termination', async () => {
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxConcurrentPerConnection: 1, requestsPerMinutePerConnection: 6000 });
  try {
    const release = await budget.acquire('same', signal());
    const abort = new AbortController();
    const pending = budget.acquire('same', abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(budget.snapshot().requests).toBe(1);
    let admitted = false;
    const next = budget.acquire('same', signal()).then((done) => { admitted = true; return done; });
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(admitted).toBe(false);
    release(); release();
    (await next)();
    expect(budget.snapshot().requests).toBe(2);
    budget.dispose();
    await expect(budget.acquire('same', signal())).rejects.toThrow('ended');
  } finally { budget.dispose(); }
});
test('duration is wall time, including time spent paused, and cannot be resumed past the limit', async () => {
  let now = 0;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxDurationSeconds: 1 }, undefined, () => now);
  try {
    budget.start(); now = 1001;
    await expect(budget.acquire('a', signal())).rejects.toThrow('duration');
    expect(budget.snapshot().requests).toBe(0);
  } finally { budget.dispose(); }
});
test('invalid budgets fail before a session can start', () => {
  for (const value of [NaN, Infinity, 0, -1, 1.5]) expect(() => validateSessionLimits({ ...DEFAULT_SESSION_LIMITS, maxRequests: value })).toThrow();
});

test('system suspension expires duration even when the pacing clock is frozen', async () => {
  let wall = 0;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxDurationSeconds: 1 }, undefined, () => 0, () => wall);
  try {
    budget.start(); wall = 3600000;
    await expect(budget.acquire('after-suspend', signal())).rejects.toThrow('duration');
    expect(budget.snapshot()).toMatchObject({ requests: 0, elapsedMs: 3600000 });
  } finally { budget.dispose(); }
});

test('a queued request cannot be admitted after wall duration expires', async () => {
  let wall = 0;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxDurationSeconds: 1, maxConcurrentPerConnection: 1 }, undefined, () => 0, () => wall);
  try {
    const release = await budget.acquire('same', signal());
    const queued = budget.acquire('same', signal());
    wall = 2000; release();
    await expect(queued).rejects.toThrow('duration');
    expect(budget.snapshot().requests).toBe(1);
  } finally { budget.dispose(); }
});

test('calendar rollback cannot reduce elapsed duration or defeat monotonic expiry', async () => {
  let monotonic = 0, wall = 1000;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxDurationSeconds: 1 }, undefined, () => monotonic, () => wall);
  try {
    budget.start(); monotonic = 100; wall = 1400;
    expect(budget.snapshot().elapsedMs).toBe(400);
    monotonic = 200; wall = 500;
    expect(budget.snapshot().elapsedMs).toBe(400);
    monotonic = 1001;
    await expect(budget.acquire('after-rollback', signal())).rejects.toThrow('duration');
  } finally { budget.dispose(); }
});

test('idle duration expiry is noticed after suspend without another request', async () => {
  let wall = 0, expired = 0;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxDurationSeconds: 60 }, () => { expired++; }, () => 0, () => wall);
  try {
    budget.start(); wall = 60001;
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(expired).toBe(1);
    expect(budget.snapshot().requests).toBe(0);
  } finally { budget.dispose(); }
});

test('provider budget exhaustion leaves the engine mutation queue drainable', async () => {
  const { SimEngine } = await import('../../engine/engine');
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxRequests: 1 });
  const engine = new SimEngine({ speed: 10, onError: () => {}, providerFactory: () => ({
    kind: 'fixture', decide: async (_ctx, signal) => {
      const release = await budget.acquire('fixture', signal); release();
      return { type: 'signal', params: { message: 'fixture', intensity: 1 } };
    },
  }) });
  try {
    await engine.seed({ agentCount: 1 });
    await engine.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await engine.tickWall(1000);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(engine.getState().lifecycle).toBe('error');
    engine.pause();
    await engine.getExecutor().onDrain();
    expect(engine.getExecutor().pendingCount).toBe(0);
  } finally { budget.dispose(); await engine.reset(); }
});

test('all connections share six slots and 50-per-minute pacing', async () => {
  let now = 0;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxConcurrentPerConnection: 20, requestsPerMinutePerConnection: 6000 }, undefined, () => now);
  const releases: Array<() => void> = [];
  try {
    for (let index = 0; index < 6; index++) { now = index * 1200; releases.push(await budget.acquire(`connection-${index}`, signal())); }
    now = 7200; let admitted = false;
    const seventh = budget.acquire('seventh', signal()).then(release => { admitted = true; return release; });
    await new Promise(resolve => setTimeout(resolve, 5)); expect(admitted).toBe(false);
    releases.shift()!(); (await seventh)();
    expect(budget.snapshot().requests).toBe(7);
  } finally { releases.forEach(release => release()); budget.dispose(); }
});
