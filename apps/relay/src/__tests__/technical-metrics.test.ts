import { expect, test } from 'bun:test';
import { TechnicalMetrics, validTechnicalSample, authorizedMonitor } from '../technical-metrics';
import { quotaNamespace } from './quota-fixture';
import { COORDINATOR_NAME, metricsOperation } from '../quota';
import { createRelay, type RelayEnv } from '../worker';
import { issueRelayToken } from '../access';
const base = { operation: 'relay-inference', outcome: 'ok', status: 200, elapsedMs: 100, upstreamHttpMs: 80 } as const;
test('numeric aggregates separate relay/provider HTTP and admission; unavailable processing is null', () => {
  const metrics = new TechnicalMetrics(() => 1000000);
  expect(metrics.record(base)).toBe(true);
  expect(metrics.record({ operation: 'admission-renewal', outcome: 'access', status: 401, elapsedMs: 700 })).toBe(true);
  const result = metrics.snapshot();
  expect(result.requests).toBe(2); expect(result.totalWorker.meanMs).toBe(100);
  expect(result.relayOverhead.meanMs).toBe(20); expect(result.upstreamHttp.meanMs).toBe(80);
  expect(result.admissionWorker.meanMs).toBe(700); expect(result.providerProcessingMs).toBeNull();
  expect(result.upstreamHttp.p95UpperBoundMs).toBe(100);
  expect(result.operations['admission-renewal']).toBe(1);
});
test('unknown measurements never become zero and content/identifiers cannot enter the aggregate', () => {
  const metrics = new TechnicalMetrics(() => 1000);
  for (const sample of [{ ...base, key: 'private-provider-key' }, { ...base, prompt: 'private prompt' }, { ...base, ip: '192.0.2.1' }, { ...base, subject: 'person' }, { ...base, model: 'private model' }, { ...base, endpoint: 'private URL' }, { ...base, status: 99 }, { ...base, elapsedMs: NaN }, { ...base, elapsedMs: Infinity }, { ...base, upstreamHttpMs: 101 }, { ...base, operation: 'admission-initial' }]) {
    expect(validTechnicalSample(sample)).toBe(false); expect(metrics.record(sample)).toBe(false);
  }
  const result = metrics.snapshot();
  expect(result.requests).toBe(0); expect(result.upstreamHttp.meanMs).toBeNull(); expect(result.upstreamHttp.p95UpperBoundMs).toBeNull();
  expect(JSON.stringify(result)).not.toContain('private'); expect(JSON.stringify(result)).not.toContain('192.0.2.1');
});
test('RAM history is bounded and expires before24h even with a five-second cleanup delay', () => {
  let now = 0; const metrics = new TechnicalMetrics(() => now);
  for (let i = 0; i < 1000; i++) { now = i * 300000; expect(metrics.record(base)).toBe(true); }
  expect(metrics.snapshot().buckets).toBeLessThanOrEqual(276);
  now += 23 * 3600000 + 5000; metrics.prune();
  expect(metrics.snapshot().requests).toBe(0);
});
test('monitor access needs a distinct secret; relay/provider credentials do not grant access', async () => {
  const secret = 'dedicated-private-monitor-secret-at-least32';
  const request = (value: string) => new Request('https://relay.test/v1/metrics', { headers: { Authorization: `Bearer ${value}` } });
  expect(await authorizedMonitor(request(secret), secret, 'relay-signing-secret')).toBe(true);
  expect(await authorizedMonitor(request('provider-key'), secret, 'relay-signing-secret')).toBe(false);
  expect(await authorizedMonitor(request(secret), secret, secret)).toBe(false);
  expect(await authorizedMonitor(request(secret), undefined, 'relay-signing-secret')).toBe(false);
});
test('global metric calls use the same constant object, preserve quotas and reject payload fields', async () => {
  const { namespace, entries } = quotaNamespace();
  expect((await metricsOperation(namespace, base)).status).toBe(200);
  const report = await (await metricsOperation(namespace)).json() as { requests: number };
  expect(report.requests).toBe(1); expect([...entries.keys()]).toEqual([COORDINATOR_NAME]);
  const stub = namespace.get(namespace.idFromName(COORDINATOR_NAME));
  expect((await stub.fetch(new Request('https://quota.internal/metrics/record', { method: 'POST', body: JSON.stringify({ ...base, key: 'private-key' }) }))).status).toBe(400);
  expect((await (await metricsOperation(namespace)).json() as { requests: number }).requests).toBe(1);
});
test('relay measures the HTTP interval and critical-path overhead without changing the response', async () => {
  let ms = 0, calls = 0;
  const quota = quotaNamespace(), namespace = quota.namespace;
  const originalGet = namespace.get.bind(namespace);
  const settings: RelayEnv = { AUTH_SECRET: 'synthetic-signing-secret-at-least32', METRICS_SECRET: 'private-monitor-secret-not-the-signing-secret', ALLOWED_ORIGINS: 'https://app.test',
    EDGE_LIMITER: { limit: async () => { ms += 10; return { success: true }; } }, REQUEST_LIMITER: { limit: async () => { ms += 20; return { success: true }; } },
    SUBJECT_QUOTAS: { idFromName: namespace.idFromName.bind(namespace), get: id => { const stub = originalGet(id); return { fetch: async req => { if (new URL(req.url).pathname === '/release') ms += 5; return stub.fetch(req); } }; } } };
  const token = await issueRelayToken(settings.AUTH_SECRET, { v: 1, aud: 'simagents-relay', sub: 'subject', origin: settings.ALLOWED_ORIGINS, iat: 1000, exp: 1900 }, 1000);
  const relay = createRelay((async () => { calls++; ms += 80; return Response.json({ output: 'private model response' }); }) as unknown as typeof fetch, 60000, () => 1000, () => ms);
  const response = await relay(new Request('https://relay.test/v1/inference', { method: 'POST', headers: { Origin: settings.ALLOWED_ORIGINS, Authorization: `Bearer ${token}`, 'X-Provider-Key': 'private-provider-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'codex', protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses', modelId: 'fixture', body: { model: 'fixture', instructions: 'private system', input: 'private prompt', max_output_tokens: 128, store: false } }) }), settings);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ output: 'private model response' }); expect(calls).toBe(1);
  expect(response.headers.get('Server-Timing')).toBe('relay_overhead;dur=35.00, upstream_http;dur=80.00');
  const monitorRequest = (credential: string) => new Request('https://relay.test/v1/metrics', { headers: { Authorization: `Bearer ${credential}` } });
  expect((await relay(monitorRequest('private-provider-key'), settings)).status).toBe(401);
  const observed = await relay(monitorRequest(settings.METRICS_SECRET!), settings);
  const text = await observed.text(); expect(text).not.toContain('private');
  const report = JSON.parse(text); expect(report.requests).toBe(1); expect(report.relayOverhead.meanMs).toBe(35); expect(report.upstreamHttp.meanMs).toBe(80);
  expect(calls).toBe(1);
});
test('the last completed five-minute window distinguishes renewal failures from ordinary errors',()=>{
 let now=0;const metrics=new TechnicalMetrics(()=>now);
 metrics.record(base);metrics.record({operation:'admission-renewal',outcome:'access',status:401,elapsedMs:20});
 expect(metrics.snapshot().lastClosedFiveMinuteBucket).toBeNull();now=300000;
 const closed=metrics.snapshot().lastClosedFiveMinuteBucket!;expect(closed.ageSeconds).toBe(0);expect(closed.requests).toBe(2);expect(closed.httpStatusClasses).toEqual([0,1,0,1,0]);expect(closed.renewalFailures).toBe(1);
 now=23*3600000+5000;expect(metrics.snapshot().lastClosedFiveMinuteBucket).toBeNull();
});
test('a failed metric publication or execution-context hook never retries or changes inference',async()=>{
 const quotas=quotaNamespace(),namespace=quotas.namespace;
 const settings:RelayEnv={AUTH_SECRET:'synthetic-signing-key-for-monitored-relay',ALLOWED_ORIGINS:'https://app.test',EDGE_LIMITER:{limit:async()=>({success:true})},REQUEST_LIMITER:{limit:async()=>({success:true})},SUBJECT_QUOTAS:{idFromName:namespace.idFromName.bind(namespace),get:id=>{const stub=namespace.get(id);return{fetch:req=>new URL(req.url).pathname.startsWith('/metrics/')?Promise.reject(new Error('private-key-not-for-logging')):stub.fetch(req)}}}};
 const token=await issueRelayToken(settings.AUTH_SECRET,{v:1,aud:'simagents-relay',sub:'subject',origin:settings.ALLOWED_ORIGINS,iat:1000,exp:1900},1000);
 let calls=0;const relay=createRelay((async()=>{calls++;return Response.json({output:'original response'})})as unknown as typeof fetch,60000,()=>1000);
 const req=new Request('https://relay.test/v1/inference',{method:'POST',headers:{Origin:settings.ALLOWED_ORIGINS,Authorization:`Bearer ${token}`,'X-Provider-Key':'private-provider-key','Content-Type':'application/json'},body:JSON.stringify({providerId:'codex',protocol:'openai-responses',endpoint:'https://api.openai.com/v1/responses',modelId:'fixture',body:{model:'fixture',instructions:'system',input:'prompt',max_output_tokens:128,store:false}})});
 const response=await relay(req,settings,{waitUntil(){throw new Error('context unavailable')}});expect(response.status).toBe(200);expect(await response.json()).toEqual({output:'original response'});expect(calls).toBe(1);
});
