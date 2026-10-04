/** Numeric/categorical operational aggregates. No request, subject, IP or content fields. */
export const METRIC_OPERATIONS = ['relay-inference', 'relay-models', 'relay-health', 'relay-other', 'admission-initial', 'admission-renewal', 'admission-status', 'admission-other'] as const;
export const METRIC_OUTCOMES = ['ok', 'access', 'abuse', 'warming', 'quota', 'timeout', 'upstream-error', 'error'] as const;
export interface TechnicalSample {
  operation: typeof METRIC_OPERATIONS[number];
  outcome: typeof METRIC_OUTCOMES[number];
  status: number;
  elapsedMs: number;
  upstreamHttpMs?: number;
}
const BOUNDS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000];
const SLOT_MS = 300000;
// Even a delayed five-second cleanup remains well below the 24-hour ceiling.
const RETENTION_MS = 23 * 3600000;
interface Histogram { counts: number[]; samples: number; sumMs: number }
interface Bucket { requests: number; renewalFailures: number; statuses: number[]; operations: number[]; outcomes: number[]; total: Histogram; relay: Histogram; upstream: Histogram; admission: Histogram }
const histogram = (): Histogram => ({ counts: BOUNDS.map(() => 0), samples: 0, sumMs: 0 });
const bucket = (): Bucket => ({ requests: 0, renewalFailures: 0, statuses: [0, 0, 0, 0, 0], operations: METRIC_OPERATIONS.map(() => 0), outcomes: METRIC_OUTCOMES.map(() => 0), total: histogram(), relay: histogram(), upstream: histogram(), admission: histogram() });
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 120000;
export function validTechnicalSample(value: unknown): value is TechnicalSample {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).every(key => ['operation', 'outcome', 'status', 'elapsedMs', 'upstreamHttpMs'].includes(key)) &&
    METRIC_OPERATIONS.includes(row.operation as TechnicalSample['operation']) && METRIC_OUTCOMES.includes(row.outcome as TechnicalSample['outcome']) &&
    Number.isInteger(row.status) && Number(row.status) >= 100 && Number(row.status) <= 599 && duration(row.elapsedMs) &&
    (row.upstreamHttpMs === undefined || (['relay-inference', 'relay-models'].includes(String(row.operation)) && duration(row.upstreamHttpMs) && row.upstreamHttpMs <= row.elapsedMs));
}
function add(hist: Histogram, ms: number) { hist.samples++; hist.sumMs += ms; hist.counts[BOUNDS.findIndex(bound => ms <= bound)]++; }
function merge(target: Histogram, source: Histogram) { target.samples += source.samples; target.sumMs += source.sumMs; source.counts.forEach((count, index) => { target.counts[index] += count; }); }
function describe(hist: Histogram) {
  let cumulative = 0;
  const index = hist.counts.findIndex(count => { cumulative += count; return cumulative >= Math.ceil(hist.samples * 0.95); });
  return { samples: hist.samples, meanMs: hist.samples ? hist.sumMs / hist.samples : null, p95UpperBoundMs: hist.samples ? BOUNDS[index] : null, bucketUpperBoundsMs: BOUNDS, counts: hist.counts };
}
export class TechnicalMetrics {
  private readonly buckets = new Map<number, Bucket>();
  constructor(private readonly now: () => number) {}
  prune(at = this.now()) { for (const key of this.buckets.keys()) if (key <= at - RETENTION_MS) this.buckets.delete(key); }
  record(sample: unknown): boolean {
    if (!validTechnicalSample(sample)) return false;
    const at = this.now(); this.prune(at);
    const key = Math.floor(at / SLOT_MS) * SLOT_MS;
    let current = this.buckets.get(key);
    if (!current) { current = bucket(); this.buckets.set(key, current); }
    current.requests++; current.statuses[Math.floor(sample.status / 100) - 1]++;
    if (sample.operation === 'admission-renewal' && sample.status >= 400) current.renewalFailures++;
    current.operations[METRIC_OPERATIONS.indexOf(sample.operation)]++;
    current.outcomes[METRIC_OUTCOMES.indexOf(sample.outcome)]++;
    if (sample.operation.startsWith('relay-')) {
      add(current.total, sample.elapsedMs);
      add(current.relay, sample.elapsedMs - (sample.upstreamHttpMs ?? 0));
      if (sample.upstreamHttpMs !== undefined) add(current.upstream, sample.upstreamHttpMs);
    } else add(current.admission, sample.elapsedMs);
    return true;
  }
  snapshot() {
    this.prune(); const combined = bucket();
    for (const row of this.buckets.values()) {
      combined.requests += row.requests;
      combined.renewalFailures += row.renewalFailures;
      for (const key of ['statuses', 'operations', 'outcomes'] as const) row[key].forEach((count, index) => { combined[key][index] += count; });
      for (const key of ['total', 'relay', 'upstream', 'admission'] as const) merge(combined[key], row[key]);
    }
    const now = this.now(), closed = [...this.buckets.entries()].filter(([start]) => start + SLOT_MS <= now).sort(([a], [b]) => b - a)[0];
    return { schemaVersion: 1, scope: 'current-coordinator-instance', storage: 'RAM-only', retentionSeconds: RETENTION_MS / 1000,
      coverage: 'Successfully recorded samples only; eviction/restart resets history. Not an account-wide billing meter.', buckets: this.buckets.size,
      requests: combined.requests, httpStatusClasses: combined.statuses,
      operations: Object.fromEntries(METRIC_OPERATIONS.map((name, i) => [name, combined.operations[i]])),
      outcomes: Object.fromEntries(METRIC_OUTCOMES.map((name, i) => [name, combined.outcomes[i]])),
      renewalFailures: combined.renewalFailures,
      lastClosedFiveMinuteBucket: closed ? { ageSeconds: (now - closed[0] - SLOT_MS) / 1000, requests: closed[1].requests, httpStatusClasses: closed[1].statuses, renewalFailures: closed[1].renewalFailures, outcomes: Object.fromEntries(METRIC_OUTCOMES.map((name, i) => [name, closed[1].outcomes[i]])) } : null,
      totalWorker: describe(combined.total), relayOverhead: describe(combined.relay), upstreamHttp: describe(combined.upstream),
      admissionWorker: describe(combined.admission),
      providerProcessingMs: null, timingDefinition: 'Upstream HTTP includes provider/network/body transfer; provider internal processing is unavailable. Relay overhead excludes that interval.' };
  }
}

export async function authorizedMonitor(request: Request, secret: string | undefined, signingSecret: string): Promise<boolean> {
  if (!secret || secret.length < 32 || secret === signingSecret) return false;
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 16384) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [expected, received] = await Promise.all([digest(secret), digest(authorization.slice(7))]);
  let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ received[i];
  return difference === 0;
}
