/**
 * Replay Store (Phase 3: Time Travel)
 *
 * State management for the time travel replay feature.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { appData } from '../services/app-data';
import type { SavedWorld } from '../services/persistence';
import type { ItemDescriptor } from '../services/app-data';
import { replayFrameDescriptors, readReplayFrame } from '../services/replayFrames';

// =============================================================================
// Types
// =============================================================================

export interface ReplayAgent {
  id: string;
  name?: string;
  modelId?: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  tick: number;
}

export interface ReplayEvent {
  id: number;
  eventType: string;
  tick: number;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: string;
  currentAmount: number;
  maxAmount: number;
}

export interface Shelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldSnapshot {
  tick: number;
  agents: ReplayAgent[];
  resourceSpawns: ResourceSpawn[];
  shelters: Shelter[];
  events: ReplayEvent[];
}

export interface TickRange {
  availableTicks?: number[];
  missingTicks?: number;
  unscopedFrames?: number;
  minTick: number;
  maxTick: number;
  currentTick: number;
  totalEvents: number;
}

export interface AgentTimelineEntry {
  tick: number;
  eventType: string;
  action?: string;
  success?: boolean;
  description: string;
}

// =============================================================================
// Store
// =============================================================================

interface ReplayState {
  // Mode
  isReplayMode: boolean;
  isPlaying: boolean;
  playbackSpeed: number; // 1, 2, 4, 8

  // Data
  tickRange: TickRange | null;
  currentTick: number;
  snapshot: WorldSnapshot | null;
  selectedAgentId: string | null;
  agentTimeline: AgentTimelineEntry[];

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  enterReplayMode: () => void;
  exitReplayMode: () => void;
  setTickRange: (range: TickRange) => void;
  setCurrentTick: (tick: number) => void;
  setSnapshot: (snapshot: WorldSnapshot) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  selectAgent: (id: string | null) => void;
  setAgentTimeline: (timeline: AgentTimelineEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isReplayMode: false,
  isPlaying: false,
  playbackSpeed: 1,
  tickRange: null,
  currentTick: 0,
  snapshot: null,
  selectedAgentId: null,
  agentTimeline: [],
  isLoading: false,
  error: null,
};

export const useReplayStore = create<ReplayState>((set) => ({
  ...initialState,

  enterReplayMode: () => set({ isReplayMode: true }),
  exitReplayMode: () => set({ ...initialState }),

  setTickRange: (range) => set({ tickRange: range, currentTick: range.maxTick }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgentTimeline: (timeline) => set({ agentTimeline: timeline }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));

// =============================================================================
// Selectors
// =============================================================================

export const useIsReplayMode = () => useReplayStore((s) => s.isReplayMode);
export const useIsPlaying = () => useReplayStore((s) => s.isPlaying);
export const usePlaybackSpeed = () => useReplayStore((s) => s.playbackSpeed);
export const useTickRange = () => useReplayStore((s) => s.tickRange);
export const useCurrentTick = () => useReplayStore((s) => s.currentTick);
export const useSnapshot = () => useReplayStore((s) => s.snapshot);
export const useReplayAgents = () => useReplayStore(useShallow((s) => s.snapshot?.agents ?? []));
export const useReplayEvents = () => useReplayStore(useShallow((s) => s.snapshot?.events ?? []));
export const useSelectedReplayAgent = () => {
  const selectedId = useReplayStore((s) => s.selectedAgentId);
  const agents = useReplayStore(useShallow((s) => s.snapshot?.agents ?? []));
  return selectedId ? agents.find((a) => a.id === selectedId) : null;
};
export const useAgentTimeline = () => useReplayStore(useShallow((s) => s.agentTimeline));
export const useReplayLoading = () => useReplayStore((s) => s.isLoading);
export const useReplayError = () => useReplayStore((s) => s.error);

// =============================================================================
// API Functions
// =============================================================================

let replayCache = new Map<number, ItemDescriptor>();
export async function fetchTickRange(): Promise<TickRange> {
  const all = await replayFrameDescriptors();
  const saved = await appData.read<SavedWorld>('world:current');
  const latest = all.reduce<ItemDescriptor | undefined>((found, frame) => !found || (frame.capturedAt ?? 0) > (found.capturedAt ?? 0) ? frame : found, undefined);
  const seed = saved?.snapshot.worldSeed ?? latest?.world;
  const candidates = all.filter(frame => frame.world === seed || frame.world === undefined)
    .sort((a, b) => Number(a.world !== undefined) - Number(b.world !== undefined));
  replayCache = new Map(candidates.map(frame => [frame.tick!, frame]));
  const frames = [...replayCache.values()];
  if (!frames.length) throw new Error('No saved replay frames are available.');
  const ticks = [...replayCache.keys()].sort((a, b) => a - b);
  return { minTick: ticks[0], maxTick: ticks.at(-1)!, currentTick: ticks.at(-1)!,
    totalEvents: frames.reduce((sum, frame) => sum + (frame.eventCount ?? 0), 0),
    unscopedFrames: frames.filter(frame => frame.world === undefined).length,
    availableTicks: ticks, missingTicks: Math.max(ticks.at(-1)!, Number(saved?.snapshot.store.worldState.currentTick ?? 0)) - ticks[0] + 1 - ticks.length };
}

export async function fetchWorldSnapshot(tick: number): Promise<WorldSnapshot> {
  const descriptor = replayCache.get(tick);
  const frame = descriptor ? await readReplayFrame(descriptor.id) : undefined;
  if (!frame) throw new Error(`Replay frame missing at tick ${tick}. No substitute frame was used.`);
  return frame.snapshot;
}

export async function fetchAgentTimeline(agentId: string, limit = 100): Promise<AgentTimelineEntry[]> {
  const result: AgentTimelineEntry[] = [];
  const seen = new Set<number>();
  const frames = [...replayCache.values()].sort((a, b) => b.tick! - a.tick!);
  // Decode only one frame at a time and stop when the requested timeline is full.
  for (const descriptor of frames) {
    const frame = await readReplayFrame(descriptor.id);
    if (!frame) continue;
    for (const event of [...frame.snapshot.events].sort((a, b) => b.tick - a.tick || b.id - a.id)) {
      if (event.agentId !== agentId || seen.has(event.id)) continue;
      seen.add(event.id);
      result.push({ tick: event.tick, eventType: event.eventType,
        action: typeof event.payload.action === 'string' ? event.payload.action : undefined,
        success: event.eventType === 'action_failed' ? false : undefined,
        description: typeof event.payload.reasoning === 'string' ? event.payload.reasoning : event.eventType });
      if (result.length >= limit) return result;
    }
  }
  return result;
}
