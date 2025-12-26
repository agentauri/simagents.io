/**
 * City layout encoding/decoding utilities
 * Supports Base64 URL encoding (like IsoCity) and JSON file export
 */

import { type TileDef, GRID_SIZE, SPRITE_COLS, createEmptyGrid } from './tiles';

// =============================================================================
// Base64 URL Encoding (for shareable links)
// =============================================================================

/**
 * Encode grid to Base64 string for URL hash
 * Each tile is encoded as a single byte: row * SPRITE_COLS + col
 */
export function encodeGridToBase64(grid: TileDef[][]): string {
  const bytes = new Uint8Array(GRID_SIZE * GRID_SIZE);
  let i = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y]?.[x] ?? { col: 0, row: 0 };
      bytes[i++] = tile.row * SPRITE_COLS + tile.col;
    }
  }

  // Convert to Base64
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode Base64 string back to grid
 */
export function decodeBase64ToGrid(base64: string): TileDef[][] {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const grid: TileDef[][] = [];
    let i = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        const byte = bytes[i++] || 0;
        grid[y][x] = {
          row: Math.floor(byte / SPRITE_COLS),
          col: byte % SPRITE_COLS,
        };
      }
    }

    return grid;
  } catch {
    console.error('[CityCodec] Failed to decode Base64 string');
    return createEmptyGrid();
  }
}

// =============================================================================
// URL Hash Management
// =============================================================================

/**
 * Save grid to URL hash (enables sharing)
 */
export function saveToUrlHash(grid: TileDef[][]): void {
  const encoded = encodeGridToBase64(grid);
  history.pushState(null, '', `#${encoded}`);
}

/**
 * Load grid from URL hash
 * Returns null if no hash or invalid
 */
export function loadFromUrlHash(): TileDef[][] | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  try {
    return decodeBase64ToGrid(hash);
  } catch {
    return null;
  }
}

/**
 * Check if URL has a city hash
 */
export function hasUrlHash(): boolean {
  return window.location.hash.length > 1;
}

/**
 * Clear URL hash
 */
export function clearUrlHash(): void {
  history.pushState(null, '', window.location.pathname);
}

// =============================================================================
// JSON File Export/Import
// =============================================================================

export interface CityFile {
  version: number;
  gridSize: number;
  grid: TileDef[][];
  createdAt: string;
  name?: string;
}

/**
 * Export grid as downloadable JSON file
 */
export function downloadAsJson(grid: TileDef[][], filename?: string): void {
  const data: CityFile = {
    version: 1,
    gridSize: GRID_SIZE,
    grid,
    createdAt: new Date().toISOString(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `agents-city-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Load grid from JSON file
 * Returns a promise that resolves with the grid
 */
export function loadFromJsonFile(file: File): Promise<TileDef[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text) as CityFile;

        // Validate version
        if (data.version !== 1) {
          console.warn('[CityCodec] Unknown file version:', data.version);
        }

        // Validate grid size
        if (data.gridSize !== GRID_SIZE) {
          console.warn('[CityCodec] Grid size mismatch:', data.gridSize, 'vs', GRID_SIZE);
        }

        // Validate grid structure
        if (!Array.isArray(data.grid) || data.grid.length === 0) {
          throw new Error('Invalid grid structure');
        }

        // Normalize grid to current GRID_SIZE
        const normalizedGrid = createEmptyGrid();
        for (let y = 0; y < Math.min(data.grid.length, GRID_SIZE); y++) {
          for (let x = 0; x < Math.min(data.grid[y]?.length ?? 0, GRID_SIZE); x++) {
            const tile = data.grid[y][x];
            if (tile && typeof tile.col === 'number' && typeof tile.row === 'number') {
              normalizedGrid[y][x] = { col: tile.col, row: tile.row };
            }
          }
        }

        resolve(normalizedGrid);
      } catch (err) {
        reject(new Error('Failed to parse city file: ' + (err as Error).message));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Create a file input and trigger file selection dialog
 * Returns a promise that resolves with the loaded grid
 */
export function openFileDialog(): Promise<TileDef[][]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const grid = await loadFromJsonFile(file);
        resolve(grid);
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}
