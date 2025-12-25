/**
 * Shared constants for Agents City
 */

// Tick configuration (MVP: 10 minutes for cost optimization)
export const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const TICKS_PER_DAY = 144;

// Isometric rendering
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// World boundaries
export const WORLD_SIZE = 100; // 100x100 grid

// Agent limits
export const MAX_AGENTS_MVP = 6;

// Event types
export const EVENT_TYPES = {
  WORLD_UPDATE: 'world_update',
  AGENT_ACTION: 'agent_action',
  AGENT_INTERACTION: 'agent_interaction',
  LOCATION_EVENT: 'location_event',
} as const;

// Agent states
export const AGENT_STATES = {
  IDLE: 'idle',
  WALKING: 'walking',
  WORKING: 'working',
  SLEEPING: 'sleeping',
  INTERACTING: 'interacting',
} as const;

// Location types
export const LOCATION_TYPES = {
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  CIVIC: 'civic',
} as const;

// LLM types (MVP: 6 agents, one per LLM)
export const LLM_TYPES = {
  CLAUDE: 'claude',
  CODEX: 'codex',
  GEMINI: 'gemini',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  GLM: 'glm',
} as const;
