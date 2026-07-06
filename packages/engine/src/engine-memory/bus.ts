/**
 * In-memory event bus — Phase 1 spike.
 *
 * In-process emitter for the browser engine. The Web Worker forwards these
 * events to the main thread using the same `WorldEvent` shape consumed by the
 * Zustand store.
 */

export interface WorldEvent {
  id: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

type Handler = (event: WorldEvent) => void;

const handlers = new Set<Handler>();

/** Subscribe to all world events. Returns an unsubscribe function. */
export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Publish an event to all subscribers (synchronous, single-threaded). */
export async function publishEvent(event: WorldEvent): Promise<void> {
  for (const handler of handlers) {
    handler(event);
  }
}

/** Remove all subscribers (test cleanup). */
export function clearSubscribers(): void {
  handlers.clear();
}
