#!/usr/bin/env node
// One-shot, provider-free operations probe. Outputs selected technical data only.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const ORIGINS = { relay: 'https://relay.simagents.io', admission: 'https://admission.simagents.io' };
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function validRules(rules) {
  return rules && ['minimumFiveMinuteRequests', 'maximumFiveXxFraction', 'maximumFiveMinuteRequests', 'maximumFiveMinuteRenewalFailures', 'maximumRelayOverheadP95Ms', 'maximumUpstreamHttpP95Ms', 'additionalUsageBudgetUsd'].every(key => finite(rules[key])) &&
    Number.isSafeInteger(rules.minimumFiveMinuteRequests) && rules.minimumFiveMinuteRequests > 0 && rules.maximumFiveMinuteRequests >= rules.minimumFiveMinuteRequests &&
    Number.isSafeInteger(rules.maximumFiveMinuteRenewalFailures) && rules.maximumFiveMinuteRenewalFailures > 0 && rules.maximumFiveXxFraction > 0 && rules.maximumFiveXxFraction <= 1 && rules.maximumRelayOverheadP95Ms > 0 && rules.maximumUpstreamHttpP95Ms > 0;
}
export function safeMetrics(input) {
  if (input?.schemaVersion !== 1 || input.scope !== 'current-coordinator-instance' || input.storage !== 'RAM-only') return null;
  const hist = value => value && Number.isSafeInteger(value.samples) && value.samples >= 0 && (value.meanMs === null || finite(value.meanMs)) && (value.p95UpperBoundMs === null || finite(value.p95UpperBoundMs)) ? { samples: value.samples, meanMs: value.meanMs, p95UpperBoundMs: value.p95UpperBoundMs } : null;
  if (!Number.isSafeInteger(input.requests) || input.requests < 0) return null;
  const bucket = input.lastClosedFiveMinuteBucket;
  const recent = bucket && finite(bucket.ageSeconds) && Number.isSafeInteger(bucket.requests) && bucket.requests >= 0 && Number.isSafeInteger(bucket.renewalFailures) && bucket.renewalFailures >= 0 && Array.isArray(bucket.httpStatusClasses) && bucket.httpStatusClasses.length === 5 && bucket.httpStatusClasses.every(n => Number.isSafeInteger(n) && n >= 0) ? { ageSeconds: bucket.ageSeconds, requests: bucket.requests, httpStatusClasses: bucket.httpStatusClasses, renewalFailures: bucket.renewalFailures } : null;
  return { scope: input.scope, requests: input.requests, relayOverhead: hist(input.relayOverhead), upstreamHttp: hist(input.upstreamHttp), admissionWorker: hist(input.admissionWorker), recent, providerProcessingMs: null };
}
export function evaluateAlarms(snapshot, rules) {
  const codes = [];
  for (const service of ['relay', 'admission']) if (snapshot.services?.[service]?.ready !== true) codes.push(`${service.toUpperCase()}_UNAVAILABLE`);
  const metrics = snapshot.metrics;
  if (!metrics || !metrics.recent || metrics.recent.ageSeconds > 300) codes.push('METRICS_UNAVAILABLE_OR_STALE');
  else {
    const window = metrics.recent;
    if (window.requests >= rules.minimumFiveMinuteRequests && window.httpStatusClasses[4] / window.requests >= rules.maximumFiveXxFraction) codes.push('ELEVATED_5XX');
    if (window.requests > rules.maximumFiveMinuteRequests) codes.push('TRAFFIC_ANOMALY');
    if (window.renewalFailures >= rules.maximumFiveMinuteRenewalFailures) codes.push('RENEWAL_FAILURES');
  }
  if (metrics?.relayOverhead?.p95UpperBoundMs > rules.maximumRelayOverheadP95Ms) codes.push('RELAY_LATENCY');
  if (metrics?.upstreamHttp?.p95UpperBoundMs > rules.maximumUpstreamHttpP95Ms) codes.push('UPSTREAM_HTTP_LATENCY');
  if (!snapshot.billing || !finite(snapshot.billing.additionalUsageUsd) || !Number.isFinite(snapshot.billing.observedAt) || Math.abs(Date.now() - snapshot.billing.observedAt) > 300000) codes.push('BILLING_SIGNAL_UNAVAILABLE');
  else if (snapshot.billing.additionalUsageUsd > rules.additionalUsageBudgetUsd) codes.push('INFRASTRUCTURE_SPEND_ANOMALY');
  return codes;
}
async function jsonResponse(response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error('Unavailable');
  const chunks = []; let total = 0;
  try { for (;;) { const value = await reader.read(); if (value.done) break; total += value.value.byteLength; if (total > 32768) throw new Error('Size'); chunks.push(value.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function request(service, path, origin, key) {
  try {
    const response = await fetch(`${ORIGINS[service]}${path}`, { headers: { Origin: origin, ...(key ? { Authorization: `Bearer ${key}` } : {}) }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await jsonResponse(response) };
  } catch { return { status: null, body: null }; }
}
export async function runProbe(config) {
  if (!validRules(config.rules)) throw new Error('Complete operational alarm rules required.');
  if (config.spaOrigin !== 'https://app.simagents.io') throw new Error('Configured public SPA origin required.');
  const secrets = JSON.parse(await readFile(config.secretFile, 'utf8'));
  if (typeof secrets.METRICS_SECRET !== 'string' || secrets.METRICS_SECRET.length < 32) throw new Error('Dedicated operational credential required.');
  const [relay, admission, metrics] = await Promise.all([request('relay', '/v1/health', config.spaOrigin), request('admission', '/v1/status', config.spaOrigin), request('relay', '/v1/metrics', config.spaOrigin, secrets.METRICS_SECRET)]);
  let billing = null;
  if (config.billingSnapshotFile) {
    try { const input = JSON.parse(await readFile(config.billingSnapshotFile, 'utf8')); if (finite(input.additionalUsageUsd) && Number.isFinite(input.observedAt)) billing = { additionalUsageUsd: input.additionalUsageUsd, observedAt: input.observedAt }; } catch { /* An unavailable billing source is not zero spend. */ }
  }
  const snapshot = { observedAt: Date.now(), services: { relay: { status: relay.status, ready: relay.status === 200 && relay.body?.status === 'ok' }, admission: { status: admission.status, ready: admission.status === 200 && admission.body?.ready === true } }, metrics: metrics.status === 200 ? safeMetrics(metrics.body) : null, billing };
  return { ...snapshot, alarms: evaluateAlarms(snapshot, config.rules), notificationDelivery: 'not-configured; no messages sent', providerRequests: 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const config = JSON.parse(await readFile(process.argv[2], 'utf8')); console.log(JSON.stringify(await runProbe(config))); }
  catch { console.error('Operational probe unavailable: configuration or credential missing. No response payload or secret was logged.'); process.exitCode = 1; }
}
