/** Coordinated technical counters. Never pass IPs, credentials, prompts or responses here. */
export interface QuotaStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(time: number): Promise<void>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}
export interface QuotaState { storage: QuotaStorage }
export interface QuotaStub { fetch(request: Request): Promise<Response> }
export interface QuotaNamespace { idFromName(name: string): unknown; get(id: unknown): QuotaStub }
interface Counters { expiresAt: number; forwards: number[]; mints: number[]; leases: Array<{ id: string; until: number }> }
export const SUBJECT_REQUESTS_PER_MINUTE = 50;
export const SUBJECT_CONCURRENT = 6;
export const TECHNICAL_STATE_TTL_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 90_000;
export class SubjectQuota {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly state: QuotaState, _env?: unknown, private readonly now = () => Date.now()) {}
  fetch(request: Request): Promise<Response> {
    const result = this.tail.then(() => this.process(request));
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async process(request: Request): Promise<Response> {
    const now = this.now(), path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/mint', '/forward', '/release'].includes(path)) return Response.json({ error: 'invalid-operation' }, { status: 400 });
    const stored = await this.state.storage.get<Counters>('counters');
    const counters: Counters = stored && stored.expiresAt > now ? stored : { expiresAt: now + TECHNICAL_STATE_TTL_MS, forwards: [], mints: [], leases: [] };
    this.prune(counters, now);
    if (path === '/mint') {
      if (counters.mints.length >= 4) return Response.json({ error: 'mint-rate-limit' }, { status: 429 });
      counters.mints.push(now);
    } else if (path === '/forward') {
      if (counters.forwards.length >= SUBJECT_REQUESTS_PER_MINUTE || counters.leases.length >= SUBJECT_CONCURRENT) return Response.json({ error: 'rate-limit' }, { status: 429 });
      const lease = { id: crypto.randomUUID(), until: now + LEASE_MS };
      counters.forwards.push(now); counters.leases.push(lease);
      await this.store(counters, now);
      return Response.json({ lease: lease.id });
    } else {
      const body = await request.json() as { lease?: unknown };
      if (typeof body.lease !== 'string' || body.lease.length > 100) return Response.json({ error: 'invalid-lease' }, { status: 400 });
      counters.leases = counters.leases.filter(lease => lease.id !== body.lease);
    }
    await this.store(counters, now);
    return Response.json({ ok: true });
  }
  private prune(counters: Counters, now: number) {
    counters.forwards = counters.forwards.filter(time => time > now - 60_000);
    counters.mints = counters.mints.filter(time => time > now - 60_000);
    counters.leases = counters.leases.filter(lease => lease.until > now);
  }
  private async store(counters: Counters, now: number) {
    const deadlines = [...counters.forwards.map(time => time + 60_000), ...counters.mints.map(time => time + 60_000), ...counters.leases.map(lease => lease.until)];
    if (!deadlines.length) { await this.state.storage.deleteAll(); return; }
    // Expire only after every live window/lease ends. A calendar boundary never resets limits.
    counters.expiresAt = Math.min(now + TECHNICAL_STATE_TTL_MS, Math.max(...deadlines));
    const nextCleanup = Math.min(...deadlines, counters.expiresAt);
    // SQLite DO transactions include direct storage operations, including alarm writes.
    await this.state.storage.transaction(async () => {
      await this.state.storage.put('counters', counters);
      await this.state.storage.setAlarm(nextCleanup);
    });
  }
  alarm(): Promise<void> {
    const result = this.tail.then(async () => {
      const counters = await this.state.storage.get<Counters>('counters');
      if (!counters) return;
      const now = this.now();
      this.prune(counters, now);
      // A stale alarm prunes expired entries while retaining fresh admissions and active leases.
      await this.store(counters, now);
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
export async function quotaOperation(namespace: QuotaNamespace, subject: string, operation: 'mint' | 'forward' | 'release', lease?: string): Promise<Response> {
  return namespace.get(namespace.idFromName(subject)).fetch(new Request(`https://quota.internal/${operation}`, { method: 'POST', body: JSON.stringify(lease ? { lease } : {}) }));
}
