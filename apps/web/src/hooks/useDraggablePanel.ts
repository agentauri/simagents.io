import { useState, useCallback, useRef, useEffect, type RefObject, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
export interface Position { x: number; y: number }
export interface Size { width: number; height: number }
export interface DraggablePanelOptions {
  initialPosition: Position; initialSize?: Size; minWidth?: number; minHeight?: number;
  maxWidth?: number; maxHeight?: number; clampToViewport?: boolean;
}
export interface DraggablePanelState {
  panelRef: RefObject<HTMLDivElement | null>;
  position: Position; size: Size | undefined; isDragging: boolean; isResizing: boolean;
  viewport: { width: number; height: number; top: number };
  adjustments: { move: (x: number, y: number) => void; resize: (width: number, height: number) => void; resetPosition: () => void; resetSize: () => void };
  handlers: {
    onDragStart: (e: MouseEvent | PointerEvent) => void;
    onResizeStart: (e: MouseEvent | PointerEvent) => void;
    onMoveKeyDown: (e: KeyboardEvent) => void;
    onResizeKeyDown: (e: KeyboardEvent) => void;
  };
}
function viewportBounds() {
  const width = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const height = typeof window === 'undefined' ? 1080 : window.innerHeight;
  const header = typeof document === 'undefined' ? undefined : [...document.querySelectorAll<HTMLElement>('.simulation-header')].find(el => el.getClientRects().length > 0);
  return { width, height, top: Math.min(Math.max(8, (header?.getBoundingClientRect().bottom ?? 64) + 8), Math.max(8, height - 52)) };
}
/** Pointer and keyboard positioning/resizing share the same measured viewport bounds. */
export function useDraggablePanel(options: DraggablePanelOptions): DraggablePanelState {
  const { initialPosition, initialSize, minWidth = 300, minHeight = 200, maxWidth = 800, maxHeight = 600, clampToViewport = true } = options;
  const [position, setPosition] = useState(initialPosition), [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false), [isResizing, setIsResizing] = useState(false);
  const [viewport, setViewport] = useState(viewportBounds);
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position), sizeRef = useRef(size);
  positionRef.current = position; sizeRef.current = size;
  const drag = useRef({ x: 0, y: 0, position: initialPosition });
  const resize = useRef({ x: 0, y: 0, size: initialSize });
  const clampPosition = useCallback((x: number, y: number): Position => {
    if (!clampToViewport) return { x, y };
    const bounds = viewportBounds(), rect = panelRef.current?.getBoundingClientRect();
    const width = Math.min(rect?.width ?? sizeRef.current?.width ?? minWidth, bounds.width - 16);
    const height = Math.min(rect?.height ?? sizeRef.current?.height ?? minHeight, bounds.height - bounds.top - 8);
    return { x: Math.max(8, Math.min(x, bounds.width - width - 8)), y: Math.max(bounds.top, Math.min(y, bounds.height - height - 8)) };
  }, [clampToViewport, minWidth, minHeight]);
  const clampSize = useCallback((width: number, height: number): Size => {
    const bounds = viewportBounds();
    const availableWidth = clampToViewport ? Math.max(44, bounds.width - positionRef.current.x - 8) : maxWidth;
    const availableHeight = clampToViewport ? Math.max(44, bounds.height - positionRef.current.y - 8) : maxHeight;
    const upperWidth = Math.min(maxWidth, availableWidth), upperHeight = Math.min(maxHeight, availableHeight);
    return { width: Math.max(Math.min(minWidth, upperWidth), Math.min(upperWidth, width)), height: Math.max(Math.min(minHeight, upperHeight), Math.min(upperHeight, height)) };
  }, [clampToViewport, minWidth, minHeight, maxWidth, maxHeight]);
  useEffect(() => {
    const fit = () => {
      const bounds = viewportBounds();
      setViewport(prev => prev.width === bounds.width && prev.height === bounds.height && prev.top === bounds.top ? prev : bounds);
      const next = clampPosition(positionRef.current.x, positionRef.current.y);
      positionRef.current = next;
      setPosition(prev => prev.x === next.x && prev.y === next.y ? prev : next);
      if (sizeRef.current) {
        const fitted = clampSize(sizeRef.current.width, sizeRef.current.height);
        setSize(prev => prev?.width === fitted.width && prev?.height === fitted.height ? prev : fitted);
      }
    };
    fit(); window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    if (panelRef.current) observer.observe(panelRef.current);
    document.querySelectorAll('.simulation-header').forEach(el => observer.observe(el));
    return () => { window.removeEventListener('resize', fit); observer.disconnect(); };
  }, [clampPosition, clampSize]);
  const onDragStart = useCallback((event: MouseEvent | PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, textarea, summary, a')) return;
    event.preventDefault(); drag.current = { x: event.clientX, y: event.clientY, position: positionRef.current }; setIsDragging(true);
  }, []);
  const onResizeStart = useCallback((event: MouseEvent | PointerEvent) => {
    if (event.button !== 0 || !sizeRef.current) return;
    event.preventDefault(); event.stopPropagation(); resize.current = { x: event.clientX, y: event.clientY, size: sizeRef.current }; setIsResizing(true);
  }, []);
  const moveBy = useCallback((x: number, y: number) => setPosition(current => clampPosition(current.x + x, current.y + y)), [clampPosition]);
  const resizeBy = useCallback((width: number, height: number) => setSize(current => current ? clampSize(current.width + width, current.height + height) : current), [clampSize]);
  const resetPosition = useCallback(() => setPosition(clampPosition(initialPosition.x, initialPosition.y)), [clampPosition, initialPosition.x, initialPosition.y]);
  const resetSize = useCallback(() => { if (initialSize) setSize(clampSize(initialSize.width, initialSize.height)); }, [clampSize, initialSize?.width, initialSize?.height]);
  const onMoveKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const amount = event.shiftKey ? 40 : 10;
    const directions: Record<string, Position> = { ArrowLeft: { x: -amount, y: 0 }, ArrowRight: { x: amount, y: 0 }, ArrowUp: { x: 0, y: -amount }, ArrowDown: { x: 0, y: amount } };
    const delta = directions[event.key];
    if (!delta && event.key !== 'Home') return;
    event.preventDefault();
    setPosition(current => event.key === 'Home' ? clampPosition(initialPosition.x, initialPosition.y) : clampPosition(current.x + delta.x, current.y + delta.y));
  }, [clampPosition, initialPosition.x, initialPosition.y]);
  const onResizeKeyDown = useCallback((event: KeyboardEvent) => {
    if (!sizeRef.current || event.ctrlKey || event.metaKey || event.altKey) return;
    const amount = event.shiftKey ? 40 : 10;
    const direction: Record<string, Size> = { ArrowLeft: { width: -amount, height: 0 }, ArrowRight: { width: amount, height: 0 }, ArrowUp: { width: 0, height: -amount }, ArrowDown: { width: 0, height: amount } };
    const delta = direction[event.key]; if (!delta && event.key !== 'Home') return;
    event.preventDefault();
    setSize(current => current ? event.key === 'Home' && initialSize ? clampSize(initialSize.width, initialSize.height) : clampSize(current.width + (delta?.width ?? 0), current.height + (delta?.height ?? 0)) : current);
  }, [clampSize, initialSize?.width, initialSize?.height]);
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const move = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      if (isDragging) setPosition(clampPosition(drag.current.position.x + event.clientX - drag.current.x, drag.current.position.y + event.clientY - drag.current.y));
      if (isResizing && resize.current.size) setSize(clampSize(resize.current.size.width + event.clientX - resize.current.x, resize.current.size.height + event.clientY - resize.current.y));
    };
    const end = () => { setIsDragging(false); setIsResizing(false); };
    document.addEventListener('pointermove', move); document.addEventListener('mousemove', move);
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); document.addEventListener('mouseup', end); window.addEventListener('blur', end);
    return () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); document.removeEventListener('mouseup', end); window.removeEventListener('blur', end);
    };
  }, [isDragging, isResizing, clampPosition, clampSize]);
  return { panelRef, position, size, viewport, isDragging, isResizing, adjustments: { move: moveBy, resize: resizeBy, resetPosition, resetSize }, handlers: { onDragStart, onResizeStart, onMoveKeyDown, onResizeKeyDown } };
}
