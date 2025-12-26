/**
 * Agent sprite configuration for isometric rendering
 * Sprite sheet layout: 6 columns (agent types) x 8 rows (animations)
 */

// Sprite dimensions
export const AGENT_SPRITE_WIDTH = 48;
export const AGENT_SPRITE_HEIGHT = 64;

// Total sprite sheet dimensions
export const SPRITE_SHEET_COLS = 6;
export const SPRITE_SHEET_ROWS = 8;

// LLM type to sprite column mapping
export const LLM_TO_SPRITE_COL: Record<string, number> = {
  claude: 0,
  gemini: 1,
  codex: 2,
  deepseek: 3,
  qwen: 4,
  glm: 5,
};

// LLM type colors (for fallback/procedural rendering)
export const LLM_COLORS: Record<string, string> = {
  claude: '#e07a5f',    // Orange
  gemini: '#4285f4',    // Blue
  codex: '#10a37f',     // Green
  deepseek: '#7c3aed',  // Purple
  qwen: '#dc2626',      // Red
  glm: '#0d9488',       // Teal
};

// Animation row indices
export const ANIM_ROWS = {
  idle_se: 0,       // Idle facing South-East
  idle_sw: 1,       // Idle facing South-West
  walk_se: [2, 3, 4],  // Walk animation facing SE (3 frames)
  walk_sw: [5, 6, 7],  // Walk animation facing SW (3 frames)
};

// Animation timing
export const ANIM_FRAME_DURATION = 150; // ms per frame
export const MOVE_SPEED = 2.0; // grid cells per second

// Helper to get sprite column for any LLM type
export function getSpriteCol(llmType: string): number {
  const normalized = llmType.toLowerCase();
  return LLM_TO_SPRITE_COL[normalized] ?? 0;
}

// Helper to get color for any LLM type
export function getLLMColor(llmType: string): string {
  const normalized = llmType.toLowerCase();
  return LLM_COLORS[normalized] ?? '#888888';
}

// Determine facing direction based on movement delta
export function getFacingDirection(dx: number, dy: number): 'se' | 'sw' {
  // In isometric, moving +X is SE, moving +Y is SW
  // If moving diagonally, prefer the larger component
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'se' : 'sw';
  }
  return dy >= 0 ? 'sw' : 'se';
}
