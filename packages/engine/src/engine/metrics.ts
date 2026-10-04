import type { PricingContext } from './decision';
import type { Event } from '../db/schema';
export interface ReportedTokenUsage {
  samples: number; inputSamples: number; outputSamples: number; completeSamples: number; costEligibleSamples: number;
  inputTokens: number; outputTokens: number; maximumInputTokens: number;
  pricingContext?: PricingContext; mixedContext: boolean;
}
export interface AgentCounters {
  agentId: string; llmType: string; actionsCount: number; failedCount: number;
  actions: Array<{ type: string; count: number }>;
  latencySamples: number; latencyTotalMs: number; fallbackCount: number; totalTokens: number;
  firstSimTimeMs: number;
  firstTick: number; lastTick: number; lastModelId?: string; tokenUsage?: ReportedTokenUsage;
}
export interface WorldMetrics {
  schemaVersion: 1; complete: boolean; totalEvents: number; totalActions: number; failedActions: number;
  deaths: { starvation: number; exhaustion: number; other: number };
  agents: AgentCounters[];
  recentTicks: Array<{ tick: number; events: number; actions: number; maxDecisionMs: number; agentCount: number }>;
}
export function emptyMetrics(complete = true): WorldMetrics {
  return { schemaVersion: 1, complete, totalEvents: 0, totalActions: 0, failedActions: 0,
    deaths: { starvation: 0, exhaustion: 0, other: 0 }, agents: [], recentTicks: [] };
}
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function accumulateMetrics(metrics: WorldMetrics, event: Pick<Event, 'eventType' | 'payload' | 'tick' | 'agentId'>, llmType = 'unknown', agentCount = 0): void {
  metrics.totalEvents++;
  let tick = metrics.recentTicks.find(row => row.tick === event.tick);
  if (!tick) { tick = { tick: event.tick, events: 0, actions: 0, maxDecisionMs: 0, agentCount }; metrics.recentTicks.push(tick); metrics.recentTicks.sort((a,b) => a.tick-b.tick); metrics.recentTicks = metrics.recentTicks.slice(-120); }
  tick.events++; tick.agentCount = agentCount;
  const payload = event.payload as Record<string, unknown>;
  if (event.eventType === 'agent_died') {
    const cause = String(payload.cause ?? payload.reason ?? payload.deathCause ?? '').toLowerCase();
    metrics.deaths[/starv|hunger/.test(cause) ? 'starvation' : /exhaust|energy/.test(cause) ? 'exhaustion' : 'other']++;
  }
  const action = payload.action;
  if (!event.agentId || typeof action !== 'string' || (event.eventType !== `agent_${action}` && event.eventType !== 'action_failed')) return;
  metrics.totalActions++; tick.actions++;
  const failed = event.eventType === 'action_failed';
  if (failed) metrics.failedActions++;
  let agent = metrics.agents.find(row => row.agentId === event.agentId);
  if (!agent) { agent = { agentId: event.agentId, llmType, actions: [], actionsCount: 0, failedCount: 0, latencySamples: 0, latencyTotalMs: 0, fallbackCount: 0, totalTokens: 0, firstSimTimeMs: nonnegative(payload.simTimeMs) ? payload.simTimeMs : event.tick * 60000, firstTick: event.tick, lastTick: event.tick }; metrics.agents.push(agent); }
  agent.actionsCount++; agent.failedCount += Number(failed); agent.lastTick = Math.max(agent.lastTick, event.tick);
  const actionCount = agent.actions.find(row => row.type === action);
  if (actionCount) actionCount.count++; else agent.actions.push({ type: action, count: 1 });
  if (payload.usedFallback === true) agent.fallbackCount++;
  if (nonnegative(payload.processingTimeMs)) { agent.latencySamples++; agent.latencyTotalMs += payload.processingTimeMs; tick.maxDecisionMs = Math.max(tick.maxDecisionMs, payload.processingTimeMs); }
  if (typeof payload.modelId === 'string') agent.lastModelId = payload.modelId;
  const tokens = payload.tokens as { input?: unknown; output?: unknown } | undefined;
  for (const count of [tokens?.input, tokens?.output]) if (nonnegative(count) && Number.isSafeInteger(count)) agent.totalTokens += count;
  const usage = agent.tokenUsage ??= { samples: 0, inputSamples: 0, outputSamples: 0, completeSamples: 0, costEligibleSamples: 0, inputTokens: 0, outputTokens: 0, maximumInputTokens: 0, mixedContext: false };
  usage.samples++;
  const input = tokens?.input, output = tokens?.output;
  const inputKnown = count(input), outputKnown = count(output);
  if (inputKnown) { usage.inputSamples++; usage.inputTokens += input; usage.maximumInputTokens = Math.max(usage.maximumInputTokens, input); }
  if (outputKnown) { usage.outputSamples++; usage.outputTokens += output; }
  if (inputKnown && outputKnown) { usage.completeSamples++; if (payload.costEligible === true) usage.costEligibleSamples++; }
  const context = payload.pricingContext;
  if (validPricingContext(context)) {
    if (!usage.pricingContext) usage.pricingContext = { ...context };
    else if (JSON.stringify(usage.pricingContext) !== JSON.stringify(context)) usage.mixedContext = true;
  } else usage.mixedContext = true;

}
const count = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);
function validPricingContext(value: unknown): value is PricingContext {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'endpoint,modelId,providerId') return false;
  const c = value as PricingContext;
  if (typeof c.providerId !== 'string' || !/^[a-z0-9_-]{1,100}$/.test(c.providerId) || typeof c.modelId !== 'string' || !c.modelId || c.modelId.length > 500 || typeof c.endpoint !== 'string' || c.endpoint.length > 2048) return false;
  try { const u = new URL(c.endpoint); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
}
function validUsage(usage: ReportedTokenUsage | undefined, actions: number, totalTokens: number): boolean {
  if (usage === undefined) return true; // legacy totals lack split/coverage and cannot produce a complete estimate
  return !!usage && [usage.samples, usage.inputSamples, usage.outputSamples, usage.completeSamples, usage.costEligibleSamples, usage.inputTokens, usage.outputTokens, usage.maximumInputTokens].every(count) && typeof usage.mixedContext === 'boolean' && usage.samples <= actions &&
    usage.inputSamples <= usage.samples && usage.outputSamples <= usage.samples && usage.completeSamples <= Math.min(usage.inputSamples, usage.outputSamples) && usage.costEligibleSamples <= usage.completeSamples && usage.maximumInputTokens <= usage.inputTokens && (usage.inputSamples > 0 || usage.inputTokens === 0) && (usage.outputSamples > 0 || usage.outputTokens === 0) &&
    usage.inputTokens + usage.outputTokens <= totalTokens && (usage.pricingContext === undefined || validPricingContext(usage.pricingContext));
}
export function validMetrics(value: unknown): value is WorldMetrics {
  const m = value as WorldMetrics;
  if (!m || m.schemaVersion !== 1 || typeof m.complete !== 'boolean' || ![m.totalEvents, m.totalActions, m.failedActions].every(count) || !m.deaths || ![m.deaths.starvation, m.deaths.exhaustion, m.deaths.other].every(count)) return false;
  if (!Array.isArray(m.agents) || m.agents.length > 10000 || !Array.isArray(m.recentTicks) || m.recentTicks.length > 120) return false;
  if (!m.agents.every(a => !!a && typeof a.agentId === 'string' && typeof a.llmType === 'string' && (a.lastModelId === undefined || typeof a.lastModelId === 'string') && nonnegative(a.firstSimTimeMs) && nonnegative(a.latencyTotalMs) && [a.actionsCount,a.failedCount,a.latencySamples,a.fallbackCount,a.totalTokens,a.firstTick,a.lastTick].every(count) && validUsage(a.tokenUsage, a.actionsCount, a.totalTokens) && a.failedCount <= a.actionsCount && a.latencySamples <= a.actionsCount && a.fallbackCount <= a.actionsCount && a.firstTick <= a.lastTick && Array.isArray(a.actions) && a.actions.length <= 128 && a.actions.every(row => !!row && typeof row.type === 'string' && row.type.length <= 100 && count(row.count)) && new Set(a.actions.map(row => row.type)).size === a.actions.length && a.actions.reduce((sum,row) => sum+row.count,0) === a.actionsCount)) return false;
  return new Set(m.agents.map(a => a.agentId)).size === m.agents.length && m.agents.reduce((sum,a) => sum+a.actionsCount,0) === m.totalActions && m.agents.reduce((sum,a) => sum+a.failedCount,0) === m.failedActions && m.totalActions <= m.totalEvents &&
    m.recentTicks.every(t => !!t && nonnegative(t.maxDecisionMs) && [t.tick,t.events,t.actions,t.agentCount].every(count) && t.actions <= t.events) && new Set(m.recentTicks.map(t => t.tick)).size === m.recentTicks.length && m.recentTicks.reduce((sum,t) => sum+t.events,0) <= m.totalEvents && m.recentTicks.reduce((sum,t) => sum+t.actions,0) <= m.totalActions && m.deaths.starvation+m.deaths.exhaustion+m.deaths.other <= m.totalEvents;
}
