export type BiomeType = 'forest' | 'desert' | 'tundra' | 'plains';

/**
 * Determine biome based on position.
 * - NW (x < 50, y < 50): forest
 * - NE (x >= 50, y < 50): tundra
 * - SW (x < 50, y >= 50): desert
 * - SE (x >= 50, y >= 50): plains
 */
export function getBiomeForPosition(x: number, y: number): BiomeType {
  const midX = 50;
  const midY = 50;

  if (x < midX && y < midY) return 'forest';
  if (x >= midX && y < midY) return 'tundra';
  if (x < midX && y >= midY) return 'desert';
  return 'plains';
}
