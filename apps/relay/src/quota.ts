/** One coordinated RAM-only object. No subject/IP fingerprint is a durable object name. */
export interface QuotaState { storage?: unknown }
export interface QuotaStub { fetch(request: Request): Promise<Response> }
export interface QuotaNamespace { idFromName(name: string): unknown; get(id: unknown): QuotaStub }
interface Counters { forwards: number[]; mints: number[]; leases: Array<{ id: string; until: number }> }
export const SUBJECT_REQUESTS_PER_MINUTE = 50;
export const SUBJECT_CONCURRENT = 6;
export const TECHNICAL_STATE_TTL_MS = 24 * 60 * 60 * 1000;
export const COORDINATOR_NAME = 'simagents-quota-coordinator-v2';
export const COORDINATOR_WARMUP_MS = 90_000;
const LEASE_MS = 90_000, MAX_SUBJECTS = 4096;
export class SubjectQuota {
  private tail: Promise<void> = Promise.resolve();
  private readonly counters = new Map<string, Counters>();
  private readonly warmUntil: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  constructor(_state: QuotaState, _env?: unknown, private readonly now = () => performance.now()) {
    // After eviction/restart all prior 60s windows and 90s leases must finish
    // before a new grant. No persisted marker, alarm, subject or counter is used.
    this.warmUntil = this.now() + COORDINATOR_WARMUP_MS;
    this.cleanupTimer = setInterval(() => this.cleanup(), 5000);
    (this.cleanupTimer as unknown as { unref?: () => void }).unref?.();
  }
  fetch(request: Request): Promise<Response> {
    const result = this.tail.then(() => this.process(request));
    // Never retain the last Response/opaque lease in the queue after completion.
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
  private async process(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/status', '/mint', '/forward', '/release'].includes(path)) return Response.json({ error: 'invalid-operation' }, { status: 400 });
    const remaining = Math.max(0, this.warmUntil - this.now());
    if (path === '/status') return Response.json({ ready: remaining === 0, retryAfter: Math.ceil(remaining / 1000) }, { status: remaining ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
    if (remaining && path !== '/release') return Response.json({ error: 'warming', retryAfter: Math.ceil(remaining / 1000) }, { status: 503, headers: { 'Retry-After': String(Math.ceil(remaining / 1000)) } });
    let body: { subject?: unknown; lease?: unknown };
    try {
      const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 2048) throw new Error();
      body = JSON.parse(raw);
    } catch { return Response.json({ error: 'invalid-request' }, { status: 400 }); }
    if (!body || typeof body.subject !== 'string' || !/^[a-zA-Z0-9_:.-]{1,128}$/.test(body.subject)) return Response.json({ error: 'invalid-subject' }, { status: 400 });
    const now = this.now();
    this.cleanup(now);
    let counters = this.counters.get(body.subject);
    if (path === '/release') {
      if (typeof body.lease !== 'string' || body.lease.length > 100) return Response.json({ error: 'invalid-lease' }, { status: 400 });
      if (counters) { counters.leases = counters.leases.filter(lease => lease.id !== body.lease); this.prune(body.subject, counters, now); }
      return Response.json({ ok: true });
    }
    if (!counters) {
      if (this.counters.size >= MAX_SUBJECTS) return Response.json({ error: 'capacity' }, { status: 429 });
      counters = { forwards: [], mints: [], leases: [] }; this.counters.set(body.subject, counters);
    }
    if (path === '/mint') {
      if (counters.mints.length >= 4) return Response.json({ error: 'mint-rate-limit' }, { status: 429 });
      counters.mints.push(now); return Response.json({ ok: true });
    }
    if (counters.forwards.length >= SUBJECT_REQUESTS_PER_MINUTE || counters.leases.length >= SUBJECT_CONCURRENT) return Response.json({ error: 'rate-limit' }, { status: 429 });
    const lease = { id: crypto.randomUUID(), until: now + LEASE_MS };
    counters.forwards.push(now); counters.leases.push(lease);
    return Response.json({ lease: lease.id });
  }
  private prune(subject: string, counters: Counters, now: number) {
    counters.forwards = counters.forwards.filter(time => time > now - 60_000);
    counters.mints = counters.mints.filter(time => time > now - 60_000);
    counters.leases = counters.leases.filter(lease => lease.until > now);
    if (!counters.forwards.length && !counters.mints.length && !counters.leases.length) this.counters.delete(subject);
  }
  private cleanup(now = this.now()) { for (const [subject, counters] of this.counters) this.prune(subject, counters, now); }
}
export async function quotaOperation(namespace: QuotaNamespace, subject: string, operation: 'status' | 'mint' | 'forward' | 'release', lease?: string): Promise<Response> {
  return namespace.get(namespace.idFromName(COORDINATOR_NAME)).fetch(new Request(`https://quota.internal/${operation}`, { method: 'POST', body: JSON.stringify({ subject, ...(lease ? { lease } : {}) }) }));
}
