/**
 * Building Assignment Utility
 * Scans the editor grid and assigns buildings to simulation locations
 */

import type { Location } from '../stores/world';
import { type TileDef, TILE_CATALOG, GRID_SIZE, findTileEntry } from './tiles';

// Location type requirements for simulation
export interface LocationRequirement {
  type: 'residential' | 'commercial' | 'industrial' | 'civic';
  count: number;
}

// Default requirements - what the simulation needs
export const DEFAULT_REQUIREMENTS: LocationRequirement[] = [
  { type: 'residential', count: 2 },
  { type: 'commercial', count: 2 },
  { type: 'industrial', count: 1 },
  { type: 'civic', count: 1 },
];

// Building found in the grid
interface FoundBuilding {
  gridX: number;
  gridY: number;
  buildingType: 'residential' | 'commercial' | 'industrial' | 'civic';
  tileName: string;
}

/**
 * Convert grid coordinates to world coordinates
 * Grid range [0, 19] -> World range [20, 90] (used by simulation)
 */
function gridToWorld(gridCoord: number): number {
  return gridCoord * 4 + 20;
}

/**
 * Scan grid for all buildings
 */
function findAllBuildings(grid: TileDef[][]): FoundBuilding[] {
  const buildings: FoundBuilding[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y]?.[x];
      if (!tile) continue;

      const entry = findTileEntry(tile.col, tile.row);
      if (entry?.isBuilding && entry.buildingType) {
        buildings.push({
          gridX: x,
          gridY: y,
          buildingType: entry.buildingType,
          tileName: entry.name,
        });
      }
    }
  }

  return buildings;
}

/**
 * Assign buildings from the grid to simulation locations
 * Returns an array of Location objects for the simulation
 *
 * @param grid - The editor grid with placed tiles
 * @param requirements - Location requirements (defaults to DEFAULT_REQUIREMENTS)
 * @returns Array of Location objects
 */
export function assignBuildingsToLocations(
  grid: TileDef[][],
  requirements: LocationRequirement[] = DEFAULT_REQUIREMENTS
): Location[] {
  const locations: Location[] = [];
  const buildings = findAllBuildings(grid);
  const assignedPositions = new Set<string>();

  // Process each requirement type
  for (const req of requirements) {
    // Find buildings that match this type and aren't already assigned
    const matchingBuildings = buildings.filter(
      (b) =>
        b.buildingType === req.type &&
        !assignedPositions.has(`${b.gridX},${b.gridY}`)
    );

    // Assign up to the required count
    const toAssign = matchingBuildings.slice(0, req.count);

    for (let i = 0; i < toAssign.length; i++) {
      const building = toAssign[i];
      const posKey = `${building.gridX},${building.gridY}`;
      assignedPositions.add(posKey);

      locations.push({
        id: `loc-${req.type}-${i}`,
        name: `${capitalize(req.type)} ${i + 1}`,
        type: req.type,
        x: gridToWorld(building.gridX),
        y: gridToWorld(building.gridY),
      });
    }
  }

  return locations;
}

/**
 * Get statistics about buildings in the grid
 */
export function getBuildingStats(grid: TileDef[][]): {
  total: number;
  byType: Record<string, number>;
  meetsRequirements: boolean;
  missingTypes: string[];
} {
  const buildings = findAllBuildings(grid);
  const byType: Record<string, number> = {
    residential: 0,
    commercial: 0,
    industrial: 0,
    civic: 0,
  };

  for (const building of buildings) {
    byType[building.buildingType] = (byType[building.buildingType] || 0) + 1;
  }

  // Check if requirements are met
  const missingTypes: string[] = [];
  for (const req of DEFAULT_REQUIREMENTS) {
    if (byType[req.type] < req.count) {
      missingTypes.push(`${req.type} (need ${req.count}, have ${byType[req.type]})`);
    }
  }

  return {
    total: buildings.length,
    byType,
    meetsRequirements: missingTypes.length === 0,
    missingTypes,
  };
}

/**
 * Validate grid has minimum required buildings
 */
export function validateGrid(grid: TileDef[][]): {
  valid: boolean;
  message: string;
} {
  const stats = getBuildingStats(grid);

  if (stats.total === 0) {
    return {
      valid: false,
      message: 'No buildings placed. Add at least some buildings to start the simulation.',
    };
  }

  if (!stats.meetsRequirements) {
    return {
      valid: false,
      message: `Missing buildings: ${stats.missingTypes.join(', ')}`,
    };
  }

  return {
    valid: true,
    message: 'City is ready for simulation!',
  };
}

// Utility
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
