/**
 * Prompt Inspector Store
 *
 * Phase 2: Live Inspector - State management for prompt inspection
 *
 * Features:
 * - Fetches prompt logs from backend
 * - Caches logs for quick access
 * - Provides timeline and detail views
 */

import { create } from 'zustand';
import { getDefaultSystemPrompt } from '@simagents/engine/llm/prompt-manager';
import { useWorldStore, type WorldEvent } from './world';
import { loadPromptLogs } from '../services/promptLogs';

// =============================================================================
// Types
// =============================================================================

export interface PromptDecision {
  action: string;
  params?: Record<string, unknown>;
  reasoning?: string;
}

export interface PromptLog {
  id: number;
  agentId: string;
  tick: number;
  systemPrompt: string;
  observationPrompt: string;
  fullPrompt: string;
  decision: PromptDecision | null;
  rawResponse: string | null;
  llmType: string;
  personality: string | null;
  promptMode: 'prescriptive' | 'emergent';
  safetyLevel: 'standard' | 'minimal' | 'none';
  inputTokens: number | null;
  outputTokens: number | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: string;
}

export interface TimelineSummary {
  id: number;
  agentId: string;
  tick: number;
  llmType: string;
  action: string | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: string;
}

export interface InspectorConfig {
  maxLogsPerAgent: number;
  retentionTicks: number;
}

export interface InspectorStatus {
  enabled: boolean;
  hasData: boolean;
  config: InspectorConfig;
}

interface PromptInspectorState {
  // Status
  status: InspectorStatus | null;
  statusLoading: boolean;
  statusError: string | null;

  // Selected agent
  selectedAgentId: string | null;

  // Timeline data
  timeline: TimelineSummary[];
  timelineLoading: boolean;
  timelineError: string | null;

  // Current log detail
  currentLog: PromptLog | null;
  currentLogLoading: boolean;
  currentLogError: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  setSelectedAgent: (agentId: string | null) => void;
  fetchTimeline: (agentId: string) => Promise<void>;
  fetchLogDetail: (agentId: string, tick: number) => Promise<void>;
  fetchCurrentLog: (agentId: string) => Promise<void>;
  clearSelection: () => void;
}

// =============================================================================
async function fetchInspectorStatus(): Promise<InspectorStatus> {
  const logs = localPromptLogs();
  return {
    enabled: true,
    hasData: logs.length > 0,
    config: {
      maxLogsPerAgent: 100,
      retentionTicks: 1000,
    },
  };
}

interface TimelineResponse {
  success: boolean;
  data: TimelineSummary[];
  error?: string;
}

async function fetchTimelineAPI(agentId: string, limit = 50): Promise<TimelineSummary[]> {
  return localPromptLogs()
    .filter((log) => log.agentId === agentId)
    .slice(0, limit)
    .map((log) => ({
      id: log.id,
      agentId: log.agentId,
      tick: log.tick,
      llmType: log.llmType,
      action: log.decision?.action ?? null,
      processingTimeMs: log.processingTimeMs,
      usedFallback: log.usedFallback,
      usedCache: log.usedCache,
      createdAt: log.createdAt,
    }));
}

interface LogResponse {
  success: boolean;
  data: PromptLog | null;
  error?: string;
}

async function fetchLogByTickAPI(agentId: string, tick: number): Promise<PromptLog | null> {
  return localPromptLogs().find((log) => log.agentId === agentId && log.tick === tick) ?? null;
}

async function fetchCurrentLogAPI(agentId: string): Promise<PromptLog | null> {
  return localPromptLogs().find((log) => log.agentId === agentId) ?? null;
}

function localPromptLogs(): PromptLog[] {
  const stored = loadPromptLogs();
  if (stored.length > 0) {
    return stored.slice().sort((a, b) => b.tick - a.tick || b.id - a.id);
  }

  const { events, agents } = useWorldStore.getState();
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  return events
    .filter(isDecisionEvent)
    .slice(-500)
    .reverse()
    .map((event, index) => {
      const agent = event.agentId ? agentById.get(event.agentId) : undefined;
      const action = typeof event.payload.action === 'string'
        ? event.payload.action
        : event.type.replace(/^agent_/, '');
      const reasoning = typeof event.payload.reasoning === 'string'
        ? event.payload.reasoning
        : typeof event.payload.error === 'string'
          ? event.payload.error
          : undefined;
      const systemPrompt = getDefaultSystemPrompt(agent?.personality as Parameters<typeof getDefaultSystemPrompt>[0]);
      const observationPrompt = `Tick ${event.tick}\nAgent ${event.agentId ?? 'unknown'} selected ${action}.`;
      const fullPrompt = `${systemPrompt}\n\n${observationPrompt}`;
      return {
        id: index + 1,
        agentId: event.agentId ?? 'unknown',
        tick: event.tick,
        systemPrompt,
        observationPrompt,
        fullPrompt,
        decision: {
          action,
          params: typeof event.payload.params === 'object' && event.payload.params !== null
            ? event.payload.params as Record<string, unknown>
            : undefined,
          reasoning,
        },
        rawResponse: null,
        llmType: agent?.llmType ?? 'unknown',
        personality: agent?.personality ?? null,
        promptMode: 'emergent',
        safetyLevel: 'standard',
        inputTokens: typeof event.payload.tokens === 'object' && event.payload.tokens !== null
          ? (event.payload.tokens as { input?: number }).input ?? null
          : null,
        outputTokens: typeof event.payload.tokens === 'object' && event.payload.tokens !== null
          ? (event.payload.tokens as { output?: number }).output ?? null
          : null,
        processingTimeMs: typeof event.payload.processingTimeMs === 'number' ? event.payload.processingTimeMs : null,
        usedFallback: event.payload.usedFallback === true || event.type === 'action_failed',
        usedCache: false,
        createdAt: new Date(event.timestamp).toISOString(),
      } satisfies PromptLog;
    });
}

function isDecisionEvent(event: WorldEvent): boolean {
  return !!event.agentId && (event.type.startsWith('agent_') || event.type === 'action_failed');
}

// =============================================================================
// Store
// =============================================================================

export const usePromptInspectorStore = create<PromptInspectorState>((set, get) => ({
  // Initial state
  status: null,
  statusLoading: false,
  statusError: null,
  selectedAgentId: null,
  timeline: [],
  timelineLoading: false,
  timelineError: null,
  currentLog: null,
  currentLogLoading: false,
  currentLogError: null,

  // Fetch inspector status
  fetchStatus: async () => {
    set({ statusLoading: true, statusError: null });
    try {
      const status = await fetchInspectorStatus();
      set({ status, statusLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch status';
      set({ statusError: error, statusLoading: false });
      console.error('[PromptInspector] Status error:', e);
    }
  },

  // Set selected agent
  setSelectedAgent: (agentId: string | null) => {
    set({
      selectedAgentId: agentId,
      timeline: [],
      currentLog: null,
      timelineError: null,
      currentLogError: null,
    });

    // Auto-fetch timeline when agent is selected
    if (agentId) {
      get().fetchTimeline(agentId);
    }
  },

  // Fetch timeline for agent
  fetchTimeline: async (agentId: string) => {
    set({ timelineLoading: true, timelineError: null });
    try {
      const timeline = await fetchTimelineAPI(agentId);
      set({ timeline, timelineLoading: false });

      // Auto-fetch most recent log detail
      if (timeline.length > 0) {
        get().fetchLogDetail(agentId, timeline[0].tick);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch timeline';
      set({ timelineError: error, timelineLoading: false });
      console.error('[PromptInspector] Timeline error:', e);
    }
  },

  // Fetch specific log detail
  fetchLogDetail: async (agentId: string, tick: number) => {
    set({ currentLogLoading: true, currentLogError: null });
    try {
      const log = await fetchLogByTickAPI(agentId, tick);
      set({ currentLog: log, currentLogLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch log detail';
      set({ currentLogError: error, currentLogLoading: false });
      console.error('[PromptInspector] Log detail error:', e);
    }
  },

  // Fetch current (most recent) log
  fetchCurrentLog: async (agentId: string) => {
    set({ currentLogLoading: true, currentLogError: null });
    try {
      const log = await fetchCurrentLogAPI(agentId);
      set({ currentLog: log, currentLogLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch current log';
      set({ currentLogError: error, currentLogLoading: false });
      console.error('[PromptInspector] Current log error:', e);
    }
  },

  // Clear selection
  clearSelection: () => {
    set({
      selectedAgentId: null,
      timeline: [],
      currentLog: null,
      timelineError: null,
      currentLogError: null,
    });
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useInspectorStatus = () => usePromptInspectorStore((state) => state.status);
export const useInspectorStatusLoading = () => usePromptInspectorStore((state) => state.statusLoading);
export const useInspectorStatusError = () => usePromptInspectorStore((state) => state.statusError);

export const useSelectedAgentId = () => usePromptInspectorStore((state) => state.selectedAgentId);

export const useInspectorTimeline = () => usePromptInspectorStore((state) => state.timeline);
export const useInspectorTimelineLoading = () => usePromptInspectorStore((state) => state.timelineLoading);
export const useInspectorTimelineError = () => usePromptInspectorStore((state) => state.timelineError);

export const useCurrentPromptLog = () => usePromptInspectorStore((state) => state.currentLog);
export const useCurrentLogLoading = () => usePromptInspectorStore((state) => state.currentLogLoading);
export const useCurrentLogError = () => usePromptInspectorStore((state) => state.currentLogError);

export const useIsInspectorEnabled = () =>
  usePromptInspectorStore((state) => state.status?.enabled ?? false);
export const useHasInspectorData = () =>
  usePromptInspectorStore((state) => state.status?.hasData ?? false);
