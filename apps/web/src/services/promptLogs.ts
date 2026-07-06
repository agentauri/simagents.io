import { getDefaultSystemPrompt } from '@simagents/engine/llm/prompt-manager';
import type { WorldEvent } from '../stores/world';
import type { PromptLog } from '../stores/promptInspectorStore';

export const PROMPT_LOGS_STORAGE_KEY = 'simagents_prompt_logs_v1';

const MAX_LOGS = 500;
const MAX_BYTES = 1_500_000;

interface PromptLogsEnvelope {
  schemaVersion: 1;
  logs: PromptLog[];
}

export function loadPromptLogs(): PromptLog[] {
  try {
    const raw = localStorage.getItem(PROMPT_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PromptLogsEnvelope>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.logs)) return [];
    return parsed.logs;
  } catch (error) {
    console.warn('[PromptLogs] Failed to load prompt logs:', error);
    return [];
  }
}

export function recordPromptEvent(event: WorldEvent): void {
  if (!isDecisionEvent(event)) return;
  try {
    const logs = loadPromptLogs();
    const action = typeof event.payload.action === 'string'
      ? event.payload.action
      : event.type.replace(/^agent_/, '');
    const reasoning = typeof event.payload.reasoning === 'string'
      ? event.payload.reasoning
      : typeof event.payload.error === 'string'
        ? event.payload.error
        : undefined;
    const systemPrompt = getDefaultSystemPrompt(null);
    const observationPrompt = `Tick ${event.tick}\nAgent ${event.agentId ?? 'unknown'} selected ${action}.`;
    const tokens = typeof event.payload.tokens === 'object' && event.payload.tokens !== null
      ? event.payload.tokens as { input?: number; output?: number }
      : undefined;
    const log: PromptLog = {
      id: Date.now(),
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
      usedFallback: event.payload.usedFallback === true || event.type === 'action_failed',
      usedCache: false,
      createdAt: new Date(event.timestamp).toISOString(),
    };
    writeLogs([...logs, log]);
  } catch (error) {
    console.warn('[PromptLogs] Failed to record prompt event:', error);
  }
}

export function clearPromptLogs(): void {
  try {
    localStorage.removeItem(PROMPT_LOGS_STORAGE_KEY);
  } catch (error) {
    console.warn('[PromptLogs] Failed to clear prompt logs:', error);
  }
}

function writeLogs(nextLogs: PromptLog[]): void {
  let logs = nextLogs.slice(-MAX_LOGS);
  let payload: PromptLogsEnvelope = { schemaVersion: 1, logs };
  while (JSON.stringify(payload).length > MAX_BYTES && logs.length > 1) {
    logs = logs.slice(1);
    payload = { schemaVersion: 1, logs };
  }
  localStorage.setItem(PROMPT_LOGS_STORAGE_KEY, JSON.stringify(payload));
}

function isDecisionEvent(event: WorldEvent): boolean {
  return !!event.agentId && (event.type.startsWith('agent_') || event.type === 'action_failed');
}
