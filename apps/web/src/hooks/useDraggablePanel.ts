import { useState, useCallback, useRef, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface DraggablePanelOptions {
  initialPosition: Position;
  initialSize?: Size;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Clamp position to viewport bounds */
  clampToViewport?: boolean;
}

export interface DraggablePanelState {
  position: Position;
  size: Size | undefined;
  isDragging: boolean;
  isResizing: boolean;
  handlers: {
    onDragStart: (e: React.MouseEvent | React.PointerEvent) => void;
    onResizeStart: (e: React.MouseEvent | React.PointerEvent) => void;
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MIN_WIDTH = 300;
const DEFAULT_MIN_HEIGHT = 200;
const DEFAULT_MAX_WIDTH = 800;
const DEFAULT_MAX_HEIGHT = 600;

// =============================================================================
// Hook
// =============================================================================

/**
 * Custom hook for draggable and optionally resizable floating panels.
 *
 * Features:
 * - Drag to move panel
 * - Resize from corner (if initialSize provided)
 * - Viewport bounds clamping (optional)
 * - Proper event listener cleanup
 * - Uses refs for tracking to minimize re-renders
 *
 * @example
 * ```tsx
 * const { position, size, handlers } = useDraggablePanel({
 *   initialPosition: { x: 20, y: 72 },
 *   initialSize: { width: 380, height: 320 },
 *   clampToViewport: true,
 * });
 *
 * return (
 *   <div style={{ left: position.x, top: position.y, width: size?.width, height: size?.height }}>
 *     <header onMouseDown={handlers.onDragStart}>Drag me</header>
 *     <div onMouseDown={handlers.onResizeStart}>Resize handle</div>
 *   </div>
 * );
 * ```
 */
export function useDraggablePanel(options: DraggablePanelOptions): DraggablePanelState {
  const {
    initialPosition,
    initialSize,
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    clampToViewport = true,
  } = options;

  // State
  const [position, setPosition] = useState<Position>(initialPosition);
  const [size, setSize] = useState<Size | undefined>(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Refs for tracking without causing re-renders
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, startWidth: 0, startHeight: 0 });

  // Refs for current values (avoids stale closure)
  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  positionRef.current = position;
  sizeRef.current = size;

  // ==========================================================================
  // Clamp position to viewport bounds
  // ==========================================================================
  const clampPosition = useCallback((x: number, y: number): Position => {
    if (!clampToViewport) return { x, y };

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const panelWidth = sizeRef.current?.width ?? minWidth;
    const panelHeight = sizeRef.current?.height ?? minHeight;

    return {
      x: Math.max(0, Math.min(x, viewportWidth - panelWidth)),
      y: Math.max(0, Math.min(y, viewportHeight - panelHeight)),
    };
  }, [clampToViewport, minWidth, minHeight]);

  // ==========================================================================
  // Drag handlers
  // ==========================================================================
  const onDragStart = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: positionRef.current.x,
      startPosY: positionRef.current.y,
    };
  }, []);

  // ==========================================================================
  // Resize handlers
  // ==========================================================================
  const onResizeStart = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (!sizeRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: sizeRef.current.width,
      startHeight: sizeRef.current.height,
    };
  }, []);

  // ==========================================================================
  // Mouse move/up effect
  // ==========================================================================
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent | PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newPos = clampPosition(
          dragRef.current.startPosX + dx,
          dragRef.current.startPosY + dy
        );
        setPosition(newPos);
      }

      if (isResizing && sizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        setSize({
          width: Math.max(minWidth, Math.min(maxWidth, resizeRef.current.startWidth + dx)),
          height: Math.max(minHeight, Math.min(maxHeight, resizeRef.current.startHeight + dy)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    // Use pointer events for better touch support
    document.addEventListener('pointermove', handleMouseMove);
    document.addEventListener('pointerup', handleMouseUp);
    // Fallback for older browsers
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, minWidth, minHeight, maxWidth, maxHeight, clampPosition]);

  return {
    position,
    size,
    isDragging,
    isResizing,
    handlers: {
      onDragStart,
      onResizeStart,
    },
  };
}
