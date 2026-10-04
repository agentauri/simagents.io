import { expect, test } from 'bun:test';
import { RelaySession, type RelaySessionOptions } from '../services/relay-session';
function fixture(overrides: Partial<RelaySessionOptions> = {}) {
  let now = 0, attempts = 0, proofs = 0, suspensions = 0;
  const applied: string[] = [], bodies: Record<string, unknown>[] = [];
  const timers: Array<{ callback: () => void; at: number; cancelled: boolean }> = [];
  const options: RelaySessionOptions = {
    admissionUrl: 'https://admission.example.test/v1/session', now: () => now,
    schedule: (callback, delay) => { const timer = { callback, at: now + delay, cancelled: false }; timers.push(timer); return timer as unknown as ReturnType<typeof setTimeout>; },
    unschedule: id => { (id as unknown as typeof timers[number]).cancelled = true; },
    obtainProof: async () => `fresh-proof-${++proofs}`,
    onSuspend: async () => { suspensions++; }, onToken: async token => { applied.push(token); },
    transport: (async (_url: RequestInfo | URL, init?: RequestInit) => { attempts++; bodies.push(JSON.parse(String(init?.body))); expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error'); return Response.json({ token: `access-${attempts}`, expiresAt: now / 1000 + 900, renewAt: now / 1000 + 780 }); }) as unknown as typeof fetch,
    ...overrides,
  };
  const session = new RelaySession(options);
  async function advance(target: number) {
    now = target;
    for (const timer of [...timers]) if (!timer.cancelled && timer.at <= now) { timer.cancelled = true; timer.callback(); }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { session, options, advance, applied, bodies, timers, counts: () => ({ attempts, proofs, suspensions }) };
}
test('relay access is private memory state and automatically renews at minute 13 with the same subject token', async () => {
  const f = fixture();
  try {
    await f.session.start(); expect(f.session.getToken()).toBe('access-1');
    expect(f.session.snapshot()).toEqual({ status: 'ready', renewing: false, expiresAt: 900 });
    expect(JSON.stringify(f.session.snapshot())).not.toContain('access-1');
    expect(f.bodies).toEqual([{ proof: 'fresh-proof-1' }]);
    await f.advance(779000); expect(f.counts().attempts).toBe(1);
    await f.advance(780000); expect(f.counts()).toEqual({ attempts: 2, proofs: 2, suspensions: 0 });
    expect(f.bodies[1]).toEqual({ proof: 'fresh-proof-2', previousToken: 'access-1' });
    expect(f.applied).toEqual(['access-1', 'access-2']);
    expect(f.session.getToken()).toBe('access-2');
  } finally { f.session.clear(); }
});
test('interactive renewal suspends requests before proof submission and never resumes the simulation', async () => {
  let count = 0, interact: (() => void) | undefined, solve: ((proof: string) => void) | undefined;
  const f = fixture({ obtainProof: (notify, signal) => {
    if (++count === 1) return Promise.resolve('first-proof');
    interact = notify;
    return new Promise(resolve => { solve = resolve; signal.addEventListener('abort', () => {}, { once: true }); });
  } });
  try {
    await f.session.start(); await f.advance(780000);
    expect(f.session.snapshot().status).toBe('checking'); expect(f.session.getToken()).toBe('access-1');
    interact!(); expect(f.session.snapshot().status).toBe('interaction-required');
    expect(f.session.getToken()).toBeUndefined(); expect(f.counts().suspensions).toBe(1); expect(f.counts().attempts).toBe(1);
    solve!('interactive-proof'); await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.session.snapshot().status).toBe('ready'); expect(f.session.getToken()).toBe('access-2');
    expect(f.counts().suspensions).toBe(1); expect(f.bodies[1].previousToken).toBe('access-1');
  } finally { f.session.clear(); }
});
test('failed admission has no automatic retry and removes authorization until explicit recovery', async () => {
  let calls = 0;
  const f = fixture({ transport: (async () => { calls++; return Response.json({ error: { message: 'payload-must-not-escape' } }, { status: 429 }); }) as unknown as typeof fetch });
  try {
    await f.session.start(); expect(f.session.snapshot().failure).toBe('rate-limit'); expect(f.session.getToken()).toBeUndefined();
    expect(JSON.stringify(f.session.snapshot())).not.toContain('payload-must-not-escape');
    await f.advance(2000000); expect(calls).toBe(1);
    await f.session.start(); expect(calls).toBe(2);
  } finally { f.session.clear(); }
});
test('missed renewal and failed renewal expire without silently issuing a new subject', async () => {
  let solve: ((proof: string) => void) | undefined;
  let proofCount = 0;
  const f = fixture({ obtainProof: async () => ++proofCount === 1 ? 'initial-proof' : new Promise(resolve => { solve = resolve; }) });
  try {
    await f.session.start(); await f.advance(780000); expect(f.session.snapshot().status).toBe('checking');
    await f.advance(900000); expect(f.session.snapshot().status).toBe('expired'); expect(f.session.getToken()).toBeUndefined();
    solve!('too-late'); await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.counts().attempts).toBe(1); expect(f.applied).toEqual(['access-1']);
    await f.session.renew(); expect(f.counts().attempts).toBe(1);
    const next = f.session.start(); solve!('new-session-proof'); await next;
    expect(f.bodies[1]).toEqual({ proof: 'new-session-proof' });
  } finally { f.session.clear(); }
});
test('concurrent admission clicks share one proof and clear prevents a late response from restoring access', async () => {
  let answer: ((response: Response) => void) | undefined, calls = 0;
  const f = fixture({ transport: (async () => { calls++; return new Promise<Response>(resolve => { answer = resolve; }); }) as unknown as typeof fetch });
  const first = f.session.start(), second = f.session.start();
  expect(first).toBe(second);
  await new Promise(resolve => setTimeout(resolve, 0)); expect(calls).toBe(1);
  f.session.clear(); answer!(Response.json({ token: 'late-access', expiresAt: 900, renewAt: 780 })); await first;
  expect(f.session.snapshot().status).toBe('idle'); expect(f.session.getToken()).toBeUndefined(); expect(f.applied).toEqual([]);
});
test('unexpected destinations and malformed or oversized access responses cannot authorize the Worker', async () => {
  for (const response of [{ token: 'access', expiresAt: 1800, renewAt: 1680 }, { token: 'access', expiresAt: 900, renewAt: 790 }, null, { token: 'x'.repeat(9000), expiresAt: 900, renewAt: 780 }]) {
    const f = fixture({ transport: (async () => Response.json(response)) as unknown as typeof fetch });
    await f.session.start(); expect(f.session.snapshot().failure).toBe('invalid-response'); expect(f.applied).toHaveLength(0); f.session.clear();
  }
  const f = fixture({ admissionUrl: 'https://evil.test/v1/session?credential=bad' });
  await f.session.start(); expect(f.counts().attempts).toBe(0); expect(f.session.snapshot().failure).toBe('not-configured'); f.session.clear();
});
test('a stalled admission response is bounded and its stream is cancelled', async () => {
  let cancelled = false;
  const f = fixture({ transport: (async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }))) as unknown as typeof fetch });
  const pending = f.session.start(); await new Promise(resolve => setTimeout(resolve, 0));
  await f.advance(20000); await pending;
  expect(f.session.snapshot().status).toBe('failed'); expect(cancelled).toBe(true); expect(f.applied).toHaveLength(0); f.session.clear();
});
test('denied renewal needs explicit new admission and never silently replaces its subject', async () => {
  const f = fixture();
  const transport = f.options.transport!;
  let denied = false;
  f.options.transport = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.previousToken && !denied) { denied = true; return Response.json({ error: { code: 'renewal-denied' } }, { status: 401 }); }
    return transport(url, init);
  }) as unknown as typeof fetch;
  try {
    await f.session.start(); await f.advance(780000);
    expect(f.session.snapshot().failure).toBe('access-denied'); expect(f.session.getToken()).toBeUndefined();
    expect(f.counts().attempts).toBe(1);
    await f.session.start(); expect(f.bodies[1].previousToken).toBeUndefined(); expect(f.session.snapshot().status).toBe('ready');
  } finally { f.session.clear(); }
});
