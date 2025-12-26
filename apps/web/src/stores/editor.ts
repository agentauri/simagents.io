import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { type TileDef, type TileCatalogEntry, GRASS_TILE, GRID_SIZE, createEmptyGrid } from '../utils/tiles';

// =============================================================================
// Types
// =============================================================================

export type AppMode = 'editor' | 'simulation';

export interface EditorState {
  // App mode
  mode: AppMode;

  // Editor grid (20x20 array of TileDef)
  grid: TileDef[][];

  // Currently selected tile for placement
  selectedTile: TileCatalogEntry | null;

  // Simulation state
  isPaused: boolean;

  // Last saved grid (for reset functionality)
  lastSavedGrid: TileDef[][] | null;

  // Actions
  setMode: (mode: AppMode) => void;
  setSelectedTile: (tile: TileCatalogEntry | null) => void;
  placeTile: (gridX: number, gridY: number) => void;
  eraseTile: (gridX: number, gridY: number) => void;
  setGrid: (grid: TileDef[][]) => void;
  clearGrid: () => void;
  setPaused: (paused: boolean) => void;
  saveCurrentGrid: () => void;
  restoreLastSavedGrid: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  mode: 'editor',
  grid: createEmptyGrid(),
  selectedTile: null,
  isPaused: false,
  lastSavedGrid: null,

  // Actions
  setMode: (mode) => set({ mode }),

  setSelectedTile: (tile) => set({ selectedTile: tile }),

  placeTile: (gridX, gridY) => {
    const { grid, selectedTile, mode } = get();

    // Only allow placement in editor mode
    if (mode !== 'editor' || !selectedTile) return;

    // Bounds check
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return;

    // Create new grid with placed tile
    const newGrid = grid.map((row, y) =>
      row.map((cell, x) =>
        x === gridX && y === gridY
          ? { col: selectedTile.col, row: selectedTile.row }
          : cell
      )
    );

    set({ grid: newGrid });
  },

  eraseTile: (gridX, gridY) => {
    const { grid, mode } = get();

    // Only allow erasing in editor mode
    if (mode !== 'editor') return;

    // Bounds check
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return;

    // Create new grid with grass tile
    const newGrid = grid.map((row, y) =>
      row.map((cell, x) =>
        x === gridX && y === gridY
          ? { ...GRASS_TILE }
          : cell
      )
    );

    set({ grid: newGrid });
  },

  setGrid: (grid) => set({ grid }),

  clearGrid: () => set({ grid: createEmptyGrid() }),

  setPaused: (paused) => set({ isPaused: paused }),

  saveCurrentGrid: () => {
    const { grid } = get();
    // Deep copy the grid
    const savedGrid = grid.map(row => row.map(cell => ({ ...cell })));
    set({ lastSavedGrid: savedGrid });
  },

  restoreLastSavedGrid: () => {
    const { lastSavedGrid } = get();
    if (lastSavedGrid) {
      // Deep copy to restore
      const restoredGrid = lastSavedGrid.map(row => row.map(cell => ({ ...cell })));
      set({ grid: restoredGrid });
    }
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useAppMode = () =>
  useEditorStore((state) => state.mode);

export const useEditorGrid = () =>
  useEditorStore(useShallow((state) => state.grid));

export const useSelectedTile = () =>
  useEditorStore((state) => state.selectedTile);

export const useIsPaused = () =>
  useEditorStore((state) => state.isPaused);

export const useIsEditorMode = () =>
  useEditorStore((state) => state.mode === 'editor');

export const useIsSimulationMode = () =>
  useEditorStore((state) => state.mode === 'simulation');

export const useHasLastSavedGrid = () =>
  useEditorStore((state) => state.lastSavedGrid !== null);

// Combined selector for tile at specific position
export const useTileAt = (gridX: number, gridY: number) =>
  useEditorStore((state) => {
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
      return null;
    }
    return state.grid[gridY]?.[gridX] ?? null;
  });
