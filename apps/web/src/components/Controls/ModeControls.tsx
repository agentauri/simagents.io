import { useState, useRef } from 'react';
import { useEditorStore, useAppMode, useIsPaused, useHasLastSavedGrid } from '../../stores/editor';
import { downloadAsJson, openFileDialog, saveToUrlHash } from '../../utils/cityCodec';

interface ModeControlsProps {
  onStartSimulation: () => void;
  onReset: () => void;
}

export function ModeControls({ onStartSimulation, onReset }: ModeControlsProps) {
  const mode = useAppMode();
  const isPaused = useIsPaused();
  const hasLastSaved = useHasLastSavedGrid();
  const { setPaused, grid, setGrid, saveCurrentGrid, clearGrid } = useEditorStore();
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  // Editor mode controls
  if (mode === 'editor') {
    return (
      <div className="flex items-center gap-2">
        {/* Mode badge */}
        <span className="px-2 py-0.5 bg-city-accent/20 text-city-accent text-xs font-medium rounded">
          Editor
        </span>

        {/* Save dropdown */}
        <div className="relative" ref={saveMenuRef}>
          <button
            type="button"
            onClick={() => setShowSaveMenu(!showSaveMenu)}
            className="px-3 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showSaveMenu && (
            <div className="absolute top-full left-0 mt-1 bg-city-surface border border-city-border rounded-md shadow-lg z-50 min-w-[140px]">
              <button
                type="button"
                onClick={() => {
                  downloadAsJson(grid);
                  setShowSaveMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-xs text-city-text hover:bg-city-surface-hover"
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  saveToUrlHash(grid);
                  setShowSaveMenu(false);
                  // Copy URL to clipboard
                  navigator.clipboard.writeText(window.location.href);
                  alert('URL copied to clipboard!');
                }}
                className="w-full px-3 py-2 text-left text-xs text-city-text hover:bg-city-surface-hover border-t border-city-border/30"
              >
                Copy Link
              </button>
            </div>
          )}
        </div>

        {/* Load button */}
        <button
          type="button"
          onClick={async () => {
            try {
              const loadedGrid = await openFileDialog();
              setGrid(loadedGrid);
            } catch {
              // User cancelled or error
            }
          }}
          className="px-3 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Load
        </button>

        {/* Clear button */}
        <button
          type="button"
          onClick={() => {
            if (confirm('Clear the entire city? This cannot be undone.')) {
              clearGrid();
            }
          }}
          className="px-3 py-1.5 bg-city-surface-hover hover:bg-red-500/20 text-city-text-muted hover:text-red-400 text-xs font-medium rounded border border-city-border/50"
        >
          Clear
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-city-border/50 mx-1" />

        {/* Start button */}
        <button
          type="button"
          onClick={() => {
            saveCurrentGrid();
            onStartSimulation();
          }}
          className="px-4 py-1.5 bg-city-accent hover:bg-city-accent-light text-white text-xs font-semibold rounded flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Start Simulation
        </button>
      </div>
    );
  }

  // Simulation mode controls
  return (
    <div className="flex items-center gap-2">
      {/* Mode badge */}
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
        isPaused
          ? 'bg-yellow-500/20 text-yellow-400'
          : 'bg-green-500/20 text-green-400'
      }`}>
        {isPaused ? 'Paused' : 'Running'}
      </span>

      {/* Pause/Resume button */}
      <button
        type="button"
        onClick={() => setPaused(!isPaused)}
        className="px-3 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
      >
        {isPaused ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Resume
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            Pause
          </>
        )}
      </button>

      {/* Reset button */}
      <button
        type="button"
        onClick={() => {
          if (confirm('Reset simulation? You can edit the city again.')) {
            onReset();
          }
        }}
        className="px-3 py-1.5 bg-city-surface-hover hover:bg-red-500/20 text-city-text-muted hover:text-red-400 text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        Reset
      </button>
    </div>
  );
}
