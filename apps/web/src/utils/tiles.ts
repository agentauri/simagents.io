/**
 * Complete Tile Catalog for IsoCity tileset
 * Sprite sheet: 12 columns × 6 rows = 72 tiles
 * Each tile: 130×230 pixels
 */

export interface TileDef {
  col: number;
  row: number;
}

export interface TileCatalogEntry {
  id: string;
  col: number;
  row: number;
  name: string;
  category: 'ground' | 'road' | 'decoration' | 'canal' | 'residential' | 'commercial' | 'industrial' | 'civic';
  isBuilding: boolean;
  buildingType?: 'residential' | 'commercial' | 'industrial' | 'civic';
}

// Grid configuration
export const GRID_SIZE = 20;
export const SPRITE_COLS = 12;
export const SPRITE_ROWS = 6;
export const SPRITE_WIDTH = 130;
export const SPRITE_HEIGHT = 230;
export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

// Default grass tile for erasing
export const GRASS_TILE: TileDef = { col: 0, row: 0 };

/**
 * Complete catalog of all 72 tiles from the IsoCity sprite sheet
 * Organized by row (0-5), column (0-11)
 */
export const TILE_CATALOG: TileCatalogEntry[] = [
  // =============================================================================
  // Ground and basic roads (16 tiles)
  // =============================================================================
  { id: 'grass', col: 0, row: 0, name: 'Grass', category: 'ground', isBuilding: false },
  { id: 'fountain', col: 1, row: 0, name: 'Fountain', category: 'ground', isBuilding: false },
  { id: 'road_straight_1', col: 0, row: 2, name: 'Straight 1', category: 'ground', isBuilding: false },
  { id: 'road_straight_2', col: 1, row: 2, name: 'Straight 2', category: 'ground', isBuilding: false },
  { id: 'curve_gray_1', col: 2, row: 2, name: 'Curve Gray 1', category: 'ground', isBuilding: false },
  { id: 'curve_gray_2', col: 4, row: 2, name: 'Curve Gray 2', category: 'ground', isBuilding: false },
  { id: 'curve_gray_3', col: 3, row: 2, name: 'Curve Gray 3', category: 'ground', isBuilding: false },
  { id: 'curve_gray_4', col: 5, row: 2, name: 'Curve Gray 4', category: 'ground', isBuilding: false },
  { id: 'intersection_1', col: 8, row: 2, name: 'Intersection 1', category: 'ground', isBuilding: false },
  { id: 'intersection_2', col: 7, row: 2, name: 'Intersection 2', category: 'ground', isBuilding: false },
  { id: 'intersection_3', col: 9, row: 2, name: 'Intersection 3', category: 'ground', isBuilding: false },
  { id: 'intersection_4', col: 6, row: 2, name: 'Intersection 4', category: 'ground', isBuilding: false },
  { id: 'wall_1', col: 6, row: 3, name: 'Wall 1', category: 'ground', isBuilding: false },
  { id: 'wall_2', col: 7, row: 3, name: 'Wall 2', category: 'ground', isBuilding: false },
  { id: 'wall_3', col: 8, row: 3, name: 'Wall 3', category: 'ground', isBuilding: false },
  { id: 'wall_4', col: 9, row: 3, name: 'Wall 4', category: 'ground', isBuilding: false },

  // =============================================================================
  // Road with lampposts and sidewalk variants (20 tiles)
  // =============================================================================
  { id: 'road_1', col: 2, row: 0, name: 'Road 1', category: 'road', isBuilding: false },
  { id: 'road_2', col: 3, row: 0, name: 'Road 2', category: 'road', isBuilding: false },
  { id: 'sidewalk_1', col: 4, row: 0, name: 'Sidewalk 1', category: 'road', isBuilding: false },
  { id: 'sidewalk_2', col: 5, row: 0, name: 'Sidewalk 2', category: 'road', isBuilding: false },
  { id: 'roundabout_1', col: 8, row: 0, name: 'Roundabout 1', category: 'road', isBuilding: false },
  { id: 'intersection', col: 9, row: 0, name: 'Intersection', category: 'road', isBuilding: false },
  { id: 'concrete_1', col: 10, row: 0, name: 'Concrete 1', category: 'road', isBuilding: false },
  { id: 'concrete_2', col: 11, row: 0, name: 'Concrete 2', category: 'road', isBuilding: false },
  { id: 'road_lamp_1', col: 0, row: 1, name: 'Road+Lamp H', category: 'road', isBuilding: false },
  { id: 'road_lamp_2', col: 1, row: 1, name: 'Road+Lamp V', category: 'road', isBuilding: false },
  { id: 'road_lamp_3', col: 2, row: 1, name: 'Sidewalk T1', category: 'road', isBuilding: false },
  { id: 'road_lamp_4', col: 3, row: 1, name: 'Sidewalk T2', category: 'road', isBuilding: false },
  { id: 'underpass_1', col: 11, row: 2, name: 'Underpass 1', category: 'road', isBuilding: false },
  { id: 'underpass_2', col: 0, row: 3, name: 'Underpass 2', category: 'road', isBuilding: false },
  { id: 'underpass_3', col: 10, row: 2, name: 'Underpass 3', category: 'road', isBuilding: false },
  { id: 'underpass_4', col: 1, row: 3, name: 'Underpass 4', category: 'road', isBuilding: false },
  { id: 'road_curve_1', col: 2, row: 3, name: 'Road Curve 1', category: 'road', isBuilding: false },
  { id: 'road_curve_2', col: 3, row: 3, name: 'Road Curve 2', category: 'road', isBuilding: false },
  { id: 'road_curve_3', col: 4, row: 3, name: 'Road Curve 3', category: 'road', isBuilding: false },
  { id: 'road_curve_4', col: 5, row: 3, name: 'Road Curve 4', category: 'road', isBuilding: false },


  // =============================================================================
  // Canals (6 tiles)
  // =============================================================================
  { id: 'pool_1', col: 0, row: 4, name: 'Pool 1', category: 'canal', isBuilding: false },
  { id: 'pool_2', col: 1, row: 4, name: 'Pool 2', category: 'canal', isBuilding: false },
  { id: 'pool_3', col: 2, row: 4, name: 'Pool 3', category: 'canal', isBuilding: false },
  { id: 'pool_4', col: 3, row: 4, name: 'Pool 4', category: 'canal', isBuilding: false },
  { id: 'pool_5', col: 4, row: 4, name: 'Pool 5', category: 'canal', isBuilding: false },
  { id: 'pool_6', col: 5, row: 4, name: 'Pool 6', category: 'canal', isBuilding: false },

  // =============================================================================
  // Decorations (10 tiles)
  // =============================================================================
  { id: 'trees_1', col: 6, row: 0, name: 'Trees', category: 'decoration', isBuilding: false },
  { id: 'trees_2', col: 7, row: 0, name: 'Trees Alt', category: 'decoration', isBuilding: false },
  { id: 'end_road_1', col: 4, row: 1, name: 'End Road 1', category: 'decoration', isBuilding: false },
  { id: 'end_road_2', col: 5, row: 1, name: 'End Road 2', category: 'decoration', isBuilding: false },
  { id: 'end_road_3', col: 6, row: 1, name: 'End Road 3', category: 'decoration', isBuilding: false },
  { id: 'end_road_4', col: 7, row: 1, name: 'End Road 4', category: 'decoration', isBuilding: false },
  { id: 'road_with_intersection_1', col: 8, row: 1, name: 'Road with Intersection 1', category: 'decoration', isBuilding: false },
  { id: 'road_with_intersection_2', col: 9, row: 1, name: 'Road with Intersection 2', category: 'decoration', isBuilding: false },
  { id: 'road_with_intersection_3', col: 10, row: 1, name: 'Road with Intersection 3', category: 'decoration', isBuilding: false },
  { id: 'road_with_intersection_4', col: 11, row: 1, name: 'Road with Intersection 4', category: 'decoration', isBuilding: false },

  // =============================================================================
  // Residentials (8 tiles)
  // =============================================================================
  { id: 'tower_blue', col: 10, row: 4, name: 'Tower Blue', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'apartment_red_1', col: 0, row: 5, name: 'Apartment Red 1', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'apartment_red_2', col: 10, row: 5, name: 'Apartment Red 2', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'tower_red_1', col: 1, row: 5, name: 'Tower Red 1', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'tower_red_2', col: 5, row: 5, name: 'Tower Red 2', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'apartment_brown_1', col: 2, row: 5, name: 'Apartment Brown 1', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'apartment_brown_2', col: 3, row: 5, name: 'Apartment Brown 2', category: 'residential', isBuilding: true, buildingType: 'residential' },
  { id: 'small_house', col: 7, row: 5, name: 'Building Beige', category: 'residential', isBuilding: true, buildingType: 'residential' },

  // =============================================================================
  // Commercials (5 tiles)
  // =============================================================================
  { id: 'shop_red', col: 6, row: 4, name: 'Shop Red', category: 'commercial', isBuilding: true, buildingType: 'commercial' },
  { id: 'shop_green', col: 8, row: 4, name: 'Shop Green', category: 'commercial', isBuilding: true, buildingType: 'commercial' },
  { id: 'small_shop_red', col: 9, row: 5, name: 'Small Shop Red', category: 'commercial', isBuilding: true, buildingType: 'commercial' },
  { id: 'small_shop_green', col: 6, row: 5, name: 'Small Shop Green', category: 'commercial', isBuilding: true, buildingType: 'commercial' },
  { id: 'shop_corner', col: 8, row: 5, name: 'Shop Corner', category: 'commercial', isBuilding: true, buildingType: 'commercial' },

  // =============================================================================
  // Industrials (3 tiles)
  // =============================================================================
  { id: 'office_tall', col: 10, row: 3, name: 'Office Tall', category: 'industrial', isBuilding: true, buildingType: 'industrial' },
  { id: 'office_beige', col: 11, row: 3, name: 'Office Beige', category: 'industrial', isBuilding: true, buildingType: 'industrial' },
  { id: 'industrial_tall', col: 7, row: 4, name: 'Industrial Tall', category: 'industrial', isBuilding: true, buildingType: 'industrial' },

  // =============================================================================
  // Civics (4 tiles)
  // =============================================================================
  { id: 'tower_red', col: 4, row: 5, name: 'Tower Red', category: 'civic', isBuilding: true, buildingType: 'civic' },
  { id: 'civic', col: 11, row: 5, name: 'Civic', category: 'civic', isBuilding: true, buildingType: 'civic' },
  { id: 'civic_beige', col: 9, row: 4, name: 'Civic Beige', category: 'civic', isBuilding: true, buildingType: 'civic' },
  { id: 'civic_brown', col: 11, row: 4, name: 'Civic Brown', category: 'civic', isBuilding: true, buildingType: 'civic' },
];

/**
 * Get tile catalog entries grouped by category
 */
export function getTilesByCategory(): Record<string, TileCatalogEntry[]> {
  const grouped: Record<string, TileCatalogEntry[]> = {};

  for (const tile of TILE_CATALOG) {
    if (!grouped[tile.category]) {
      grouped[tile.category] = [];
    }
    grouped[tile.category].push(tile);
  }

  return grouped;
}

/**
 * Find a tile catalog entry by col/row
 */
export function findTileEntry(col: number, row: number): TileCatalogEntry | undefined {
  return TILE_CATALOG.find(t => t.col === col && t.row === row);
}

/**
 * Find a tile catalog entry by id
 */
export function findTileById(id: string): TileCatalogEntry | undefined {
  return TILE_CATALOG.find(t => t.id === id);
}

/**
 * Create an empty grid filled with grass tiles
 */
export function createEmptyGrid(): TileDef[][] {
  const grid: TileDef[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      grid[y][x] = { ...GRASS_TILE };
    }
  }
  return grid;
}

/**
 * Category display order for toolbar
 */
export const CATEGORY_ORDER: TileCatalogEntry['category'][] = [
  'ground',
  'road',
  'canal',
  'decoration',
  'residential',
  'commercial',
  'industrial',
  'civic',
];

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<TileCatalogEntry['category'], string> = {
  ground: 'Ground',
  road: 'Roads',
  canal: 'Canals',
  decoration: 'Decor',
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  civic: 'Civic',
};
