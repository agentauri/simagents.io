import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore, useIsEditorMode, useSelectedTile } from '../stores/editor';
import type { IsometricRenderer } from '../components/Canvas/renderer';

interface UseEditorInteractionOptions {
  rendererRef: React.RefObject<IsometricRenderer | null>;
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Hook to handle editor canvas interactions
 * - Left click: place selected tile
 * - Right click: erase (place grass)
 * - Mouse move: show hover highlight
 * - Mouse drag: continuous placement
 */
export function useEditorInteraction({
  rendererRef,
  containerRef,
}: UseEditorInteractionOptions) {
  const isEditorMode = useIsEditorMode();
  const selectedTile = useSelectedTile();
  const { placeTile, eraseTile } = useEditorStore();

  // Track if we're currently dragging (mouse down while moving)
  const isDragging = useRef(false);
  const isRightDragging = useRef(false);
  const lastPlacedPos = useRef<{ x: number; y: number } | null>(null);

  // Get grid position from mouse event
  const getGridPosition = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const renderer = rendererRef.current;
      const container = containerRef.current;
      if (!renderer || !container) return null;

      const rect = container.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      return renderer.screenToGrid(screenX, screenY);
    },
    [rendererRef, containerRef]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!isEditorMode) return;

      const pos = getGridPosition(e);
      if (!pos) return;

      if (e.button === 0 && selectedTile) {
        // Left click - start placing
        isDragging.current = true;
        placeTile(pos.gridX, pos.gridY);
        lastPlacedPos.current = { x: pos.gridX, y: pos.gridY };
      } else if (e.button === 2) {
        // Right click - start erasing
        isRightDragging.current = true;
        eraseTile(pos.gridX, pos.gridY);
        lastPlacedPos.current = { x: pos.gridX, y: pos.gridY };
      }
    },
    [isEditorMode, selectedTile, getGridPosition, placeTile, eraseTile]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const renderer = rendererRef.current;
      if (!renderer || !isEditorMode) return;

      const pos = getGridPosition(e);

      if (pos) {
        // Update hover position
        renderer.setHoverPosition(pos.gridX, pos.gridY);

        // If dragging, place/erase tiles
        if (isDragging.current && selectedTile) {
          // Only place if position changed
          if (
            !lastPlacedPos.current ||
            lastPlacedPos.current.x !== pos.gridX ||
            lastPlacedPos.current.y !== pos.gridY
          ) {
            placeTile(pos.gridX, pos.gridY);
            lastPlacedPos.current = { x: pos.gridX, y: pos.gridY };
          }
        } else if (isRightDragging.current) {
          if (
            !lastPlacedPos.current ||
            lastPlacedPos.current.x !== pos.gridX ||
            lastPlacedPos.current.y !== pos.gridY
          ) {
            eraseTile(pos.gridX, pos.gridY);
            lastPlacedPos.current = { x: pos.gridX, y: pos.gridY };
          }
        }
      } else {
        // Mouse outside grid
        renderer.clearHoverPosition();
      }
    },
    [isEditorMode, selectedTile, getGridPosition, placeTile, eraseTile, rendererRef]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    isRightDragging.current = false;
    lastPlacedPos.current = null;
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.clearHoverPosition();
    }
    isDragging.current = false;
    isRightDragging.current = false;
    lastPlacedPos.current = null;
  }, [rendererRef]);

  // Handle context menu (prevent default for right-click)
  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (isEditorMode) {
        e.preventDefault();
      }
    },
    [isEditorMode]
  );

  // Set up event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('contextmenu', handleContextMenu);

    // Also listen on window for mouse up (in case mouse leaves while dragging)
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    containerRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  ]);

  return {
    getGridPosition,
  };
}
