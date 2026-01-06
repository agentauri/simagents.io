/**
 * Visualization Store
 *
 * Manages state for:
 * - Heatmap overlays (resource density, agent density, activity)
 * - Event filters (show/hide event types)
 * - Social graph settings
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

export type HeatmapMetric =
  | 'none'
  | 'agent_density'
  | 'resource_density'
  | 'activity'
  | 'trust'
  | 'conflict';

export type EventTypeFilter =
  | 'move'
  | 'gather'
  | 'consume'
  | 'sleep'
  | 'work'
  | 'buy'
  | 'trade'
  | 'harm'
  | 'steal'
  | 'deceive'
  | 'share_info'
  | 'death';

export const ALL_EVENT_TYPES: EventTypeFilter[] = [
  'move',
  'gather',
  'consume',
  'sleep',
  'work',
  'buy',
  'trade',
  'harm',
  'steal',
  'deceive',
  'share_info',
  'death',
];

export const EVENT_TYPE_COLORS: Record<EventTypeFilter, string> = {
  move: '#6b7280',      // Gray
  gather: '#22c55e',    // Green
  consume: '#f59e0b',   // Amber
  sleep: '#8b5cf6',     // Purple
  work: '#3b82f6',      // Blue
  buy: '#14b8a6',       // Teal
  trade: '#10b981',     // Emerald
  harm: '#ef4444',      // Red
  steal: '#dc2626',     // Red-dark
  deceive: '#f97316',   // Orange
  share_info: '#06b6d4', // Cyan
  death: '#1f2937',     // Gray-dark
};

export const EVENT_TYPE_LABELS: Record<EventTypeFilter, string> = {
  move: 'Movement',
  gather: 'Gather',
  consume: 'Consume',
  sleep: 'Sleep',
  work: 'Work',
  buy: 'Buy',
  trade: 'Trade',
  harm: 'Harm',
  steal: 'Steal',
  deceive: 'Deceive',
  share_info: 'Gossip',
  death: 'Death',
};

// =============================================================================
// Event Type Mapping (shared utility)
// =============================================================================

/**
 * Maps raw event types from the backend to filter types.
 * Used by EventFeed, HeatmapLayer, and SocialGraph.
 */
export const EVENT_TYPE_MAPPING: Record<string, EventTypeFilter> = {
  agent_move: 'move',
  agent_gather: 'gather',
  agent_consume: 'consume',
  agent_sleep: 'sleep',
  agent_work: 'work',
  agent_buy: 'buy',
  agent_trade: 'trade',
  agent_traded: 'trade',
  agent_harm: 'harm',
  agent_harmed: 'harm',
  agent_steal: 'steal',
  agent_stole: 'steal',
  agent_deceive: 'deceive',
  agent_deceived: 'deceive',
  agent_share_info: 'share_info',
  agent_died: 'death',
};

/**
 * Get the filter type for a raw event type string.
 * Returns undefined if the event type is not recognized.
 */
export function mapEventToFilterType(eventType: string): EventTypeFilter | undefined {
  return EVENT_TYPE_MAPPING[eventType];
}

/**
 * Event types that represent trust-building actions (for heatmaps/social graph)
 */
export const TRUST_EVENT_TYPES = ['agent_trade', 'agent_traded', 'agent_share_info'] as const;

/**
 * Event types that represent conflict/harm actions (for heatmaps/social graph)
 */
export const CONFLICT_EVENT_TYPES = ['agent_harm', 'agent_harmed', 'agent_steal', 'agent_stole'] as const;

// Social graph edge types
export type SocialEdgeType = 'trade' | 'harm' | 'gossip' | 'trust' | 'distrust';

export interface SocialEdge {
  source: string;
  target: string;
  type: SocialEdgeType;
  weight: number;
  lastTick: number;
}

// =============================================================================
// Store
// =============================================================================

interface VisualizationState {
  // Heatmap settings
  heatmapMetric: HeatmapMetric;
  heatmapOpacity: number;
  heatmapEnabled: boolean;

  // Event filter settings
  visibleEventTypes: Set<EventTypeFilter>;
  eventFilterEnabled: boolean;

  // Social graph settings
  socialGraphVisible: boolean;
  socialEdges: SocialEdge[];
  socialGraphEdgeTypes: Set<SocialEdgeType>;

  // Actions - Heatmap
  setHeatmapMetric: (metric: HeatmapMetric) => void;
  setHeatmapOpacity: (opacity: number) => void;
  toggleHeatmap: () => void;

  // Actions - Event Filters
  toggleEventType: (type: EventTypeFilter) => void;
  setAllEventTypes: (visible: boolean) => void;
  toggleEventFilter: () => void;

  // Actions - Social Graph
  toggleSocialGraph: () => void;
  addSocialEdge: (edge: Omit<SocialEdge, 'weight' | 'lastTick'>, tick: number) => void;
  clearSocialEdges: () => void;
  toggleSocialEdgeType: (type: SocialEdgeType) => void;
}

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  // Initial state - Heatmap
  heatmapMetric: 'none',
  heatmapOpacity: 0.5,
  heatmapEnabled: false,

  // Initial state - Event Filters (all visible by default)
  visibleEventTypes: new Set(ALL_EVENT_TYPES),
  eventFilterEnabled: false,

  // Initial state - Social Graph
  socialGraphVisible: false,
  socialEdges: [],
  socialGraphEdgeTypes: new Set<SocialEdgeType>(['trade', 'harm', 'gossip']),

  // Heatmap actions
  setHeatmapMetric: (metric) => set({ heatmapMetric: metric, heatmapEnabled: metric !== 'none' }),

  setHeatmapOpacity: (opacity) => set({ heatmapOpacity: Math.max(0.1, Math.min(1, opacity)) }),

  toggleHeatmap: () => set((state) => ({ heatmapEnabled: !state.heatmapEnabled })),

  // Event filter actions
  toggleEventType: (type) =>
    set((state) => {
      const newSet = new Set(state.visibleEventTypes);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return { visibleEventTypes: newSet };
    }),

  setAllEventTypes: (visible) =>
    set({
      visibleEventTypes: visible ? new Set(ALL_EVENT_TYPES) : new Set(),
    }),

  toggleEventFilter: () => set((state) => ({ eventFilterEnabled: !state.eventFilterEnabled })),

  // Social graph actions
  toggleSocialGraph: () => set((state) => ({ socialGraphVisible: !state.socialGraphVisible })),

  addSocialEdge: (edge, tick) =>
    set((state) => {
      const existingIndex = state.socialEdges.findIndex(
        (e) => e.source === edge.source && e.target === edge.target && e.type === edge.type
      );

      if (existingIndex >= 0) {
        // Update existing edge weight
        const updated = [...state.socialEdges];
        updated[existingIndex] = {
          ...updated[existingIndex],
          weight: updated[existingIndex].weight + 1,
          lastTick: tick,
        };
        return { socialEdges: updated };
      }

      // Add new edge
      return {
        socialEdges: [
          ...state.socialEdges,
          { ...edge, weight: 1, lastTick: tick },
        ],
      };
    }),

  clearSocialEdges: () => set({ socialEdges: [] }),

  toggleSocialEdgeType: (type) =>
    set((state) => {
      const newSet = new Set(state.socialGraphEdgeTypes);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return { socialGraphEdgeTypes: newSet };
    }),
}));

// =============================================================================
// Selectors
// =============================================================================

export const useHeatmapSettings = () =>
  useVisualizationStore(
    useShallow((state) => ({
      metric: state.heatmapMetric,
      opacity: state.heatmapOpacity,
      enabled: state.heatmapEnabled,
    }))
  );

export const useEventFilters = () =>
  useVisualizationStore(
    useShallow((state) => ({
      visibleTypes: state.visibleEventTypes,
      enabled: state.eventFilterEnabled,
    }))
  );

export const useSocialGraphSettings = () =>
  useVisualizationStore(
    useShallow((state) => ({
      visible: state.socialGraphVisible,
      edges: state.socialEdges,
      edgeTypes: state.socialGraphEdgeTypes,
    }))
  );
