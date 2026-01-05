/**
 * Shared constants for Sim Agents
 */

// Tick configuration (default: 1 minute, configurable via TICK_INTERVAL_MS env var)
export const TICK_INTERVAL_MS = 60 * 1000; // 1 minute
export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = 1440;

// Isometric rendering
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// World boundaries
export const WORLD_SIZE = 100; // 100x100 grid

// Agent limits
export const MAX_AGENTS = 7; // One per LLM type

// Event types
export const EVENT_TYPES = {
  WORLD_UPDATE: 'world_update',
  AGENT_ACTION: 'agent_action',
  AGENT_INTERACTION: 'agent_interaction',
  RESOURCE_EVENT: 'resource_event',
  LOCATION_EVENT: 'location_event', // Legacy, kept for compatibility
} as const;

// Agent states
export const AGENT_STATES = {
  IDLE: 'idle',
  WALKING: 'walking',
  WORKING: 'working',
  SLEEPING: 'sleeping',
  DEAD: 'dead',
  INTERACTING: 'interacting', // Legacy, kept for compatibility
} as const;

// Biome types (Sugarscape-inspired)
export const BIOME_TYPES = {
  FOREST: 'forest',
  DESERT: 'desert',
  TUNDRA: 'tundra',
  PLAINS: 'plains',
} as const;

// Resource types
export const RESOURCE_TYPES = {
  FOOD: 'food',
  ENERGY: 'energy',
  MATERIAL: 'material',
} as const;

// Location types (Legacy - world now uses ResourceSpawns + Shelters + Biomes)
export const LOCATION_TYPES = {
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  CIVIC: 'civic',
} as const;

// LLM types (7 agents + external)
export const LLM_TYPES = {
  CLAUDE: 'claude',
  CODEX: 'codex',
  GEMINI: 'gemini',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  GLM: 'glm',
  GROK: 'grok',
  EXTERNAL: 'external',
} as const;
