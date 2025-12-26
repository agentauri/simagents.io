import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editor';
import {
  loadFromUrlHash,
  hasUrlHash,
  saveToUrlHash,
  downloadAsJson,
  openFileDialog,
} from '../utils/cityCodec';

/**
 * Hook to manage city persistence (save/load)
 * - Loads from URL hash on mount
 * - Provides save/load functions
 */
export function useCityPersistence() {
  const { grid, setGrid } = useEditorStore();

  // Load from URL hash on mount
  useEffect(() => {
    if (hasUrlHash()) {
      const loadedGrid = loadFromUrlHash();
      if (loadedGrid) {
        console.log('[Persistence] Loaded city from URL hash');
        setGrid(loadedGrid);
      }
    }
  }, [setGrid]);

  // Save to URL hash
  const saveToUrl = useCallback(() => {
    saveToUrlHash(grid);
    console.log('[Persistence] Saved city to URL hash');
  }, [grid]);

  // Save to JSON file
  const saveToFile = useCallback(
    (filename?: string) => {
      downloadAsJson(grid, filename);
      console.log('[Persistence] Downloaded city as JSON');
    },
    [grid]
  );

  // Load from JSON file
  const loadFromFile = useCallback(async () => {
    try {
      const loadedGrid = await openFileDialog();
      setGrid(loadedGrid);
      console.log('[Persistence] Loaded city from file');
      return true;
    } catch (err) {
      console.error('[Persistence] Failed to load from file:', err);
      return false;
    }
  }, [setGrid]);

  // Copy shareable URL to clipboard
  const copyShareUrl = useCallback(() => {
    saveToUrlHash(grid);
    navigator.clipboard.writeText(window.location.href);
    return window.location.href;
  }, [grid]);

  return {
    saveToUrl,
    saveToFile,
    loadFromFile,
    copyShareUrl,
    hasUrlHash: hasUrlHash(),
  };
}
