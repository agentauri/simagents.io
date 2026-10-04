import type { RequestTrace } from '@simagents/engine/engine/llm/request-trace';
import { IndexedCollection, legacyArray, reportSecondaryFailure } from './secondary-data';
import type { ItemMetadata } from './app-data';
import type { WorldEvent } from '../stores/world';
import type { PromptLog, TimelineSummary } from '../stores/promptInspectorStore';

export const PROMPT_LOGS_STORAGE_KEY = 'simagents_prompt_logs_v1';

function promptMetadata(log: PromptLog): ItemMetadata {
  const summary: TimelineSummary = { id: log.id, eventId: log.eventId, source: log.source,
    agentId: log.agentId, tick: log.tick, llmType: log.llmType, action: log.decision?.action ?? null,
    processingTimeMs: log.processingTimeMs, usedFallback: log.usedFallback, usedCache: log.usedCache, createdAt: log.createdAt };
  return { world: log.requestTrace?.worldSeed, agent: log.agentId, tick: log.tick, capturedAt: log.id,
    summary: summary as unknown as Record<string, unknown> };
}
const logs = new IndexedCollection<PromptLog>(PROMPT_LOGS_STORAGE_KEY, value => {
  const envelope = value as { schemaVersion?: number; logs?: unknown };
  if (envelope?.schemaVersion !== 1) throw new Error('Unsupported legacy prompt logs.');
  return legacyArray(envelope.logs, (item): item is PromptLog => {
    const log = item as PromptLog;
    return !!log && typeof log.agentId === 'string' && Number.isFinite(log.tick) && typeof log.fullPrompt === 'string';
  }).map(log => ({ ...log, source: 'reconstructed' }));
}, (log, index) => log.eventId ?? `legacy:${log.id}:${index}`, promptMetadata);
export const loadPromptLogs = () => logs.load();
export const promptLogDescriptors = () => logs.descriptors();
export const queryPromptSummaries = async (agent: string, tick?: number): Promise<TimelineSummary[]> => {
  const descriptors = await logs.queryDescriptors({ agent, tick }, 1000, true);
  return descriptors.map(value => value.summary as unknown as TimelineSummary).sort((a, b) =>
    b.tick - a.tick || Number(b.source === 'captured') - Number(a.source === 'captured') || b.id - a.id);
};
export const readPromptLog = (id: string) => logs.item(id);

export async function recordPromptEvent(event: WorldEvent): Promise<void> {
  if (!isDecisionEvent(event)) return;
  try {
    const action = typeof event.payload.action === 'string'
      ? event.payload.action
      : event.type.replace(/^agent_/, '');
    const reasoning = typeof event.payload.reasoning === 'string'
      ? event.payload.reasoning
      : typeof event.payload.error === 'string'
        ? event.payload.error
        : undefined;
    const systemPrompt = 'Not captured. This record summarizes a simulation event.';
    const observationPrompt = `Tick ${event.tick}\nAgent ${event.agentId ?? 'unknown'} selected ${action}.`;
    const tokens = typeof event.payload.tokens === 'object' && event.payload.tokens !== null
      ? event.payload.tokens as { input?: number; output?: number }
      : undefined;
    const log: PromptLog = {
      id: Date.now(),
      eventId: event.id,
      source: 'reconstructed',
      agentId: event.agentId ?? 'unknown',
      tick: event.tick,
      systemPrompt,
      observationPrompt,
      fullPrompt: `${systemPrompt}\n\n${observationPrompt}`,
      decision: {
        action,
        params: typeof event.payload.params === 'object' && event.payload.params !== null
          ? event.payload.params as Record<string, unknown>
          : undefined,
        reasoning,
      },
      rawResponse: null,
      llmType: typeof event.payload.modelId === 'string' ? event.payload.modelId : 'local',
      personality: null,
      promptMode: 'emergent',
      safetyLevel: 'standard',
      inputTokens: tokens?.input ?? null,
      outputTokens: tokens?.output ?? null,
      processingTimeMs: typeof event.payload.processingTimeMs === 'number' ? event.payload.processingTimeMs : null,
      usedFallback: event.payload.usedFallback === true,
      usedCache: false,
      createdAt: new Date(event.timestamp).toISOString(),
    };
    await logs.put(log);
  } catch (error) {
    reportSecondaryFailure(error);
  }
}

export const clearPromptLogs = () => logs.clear();

function isDecisionEvent(event: WorldEvent): boolean {
  return !!event.agentId && typeof event.payload.action === 'string' && event.type === `agent_${event.payload.action}`;
}

export async function recordRequestTrace(trace: RequestTrace): Promise<void> {
  const { requestBody, responseBody, ...metadata } = trace;
  const log: PromptLog = {
    id: trace.startedAt, eventId: `request:${trace.requestId}`, source: 'captured', requestTrace: metadata,
    agentId: trace.agentId, tick: trace.tick, fullPrompt: requestBody,
    systemPrompt: 'See the actual protocol request body.', observationPrompt: 'See the actual protocol request body.',
    decision: null, rawResponse: responseBody ?? null, llmType: trace.requestedModel, personality: null,
    promptMode: 'emergent', safetyLevel: 'standard', inputTokens: null, outputTokens: null,
    processingTimeMs: trace.durationMs, usedFallback: false, usedCache: false, createdAt: new Date(trace.startedAt).toISOString(),
  };
  try { await logs.put(log); }
  catch (error) { reportSecondaryFailure(error); }
}
