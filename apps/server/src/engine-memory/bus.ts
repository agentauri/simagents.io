/**
 * In-memory event bus — Phase 1 spike.
 *
 * Replaces `cache/pubsub` (Redis) with an in-process emitter. In the browser
 * build, the Web Worker forwards these events to the main thread using the
 * same `WorldEvent` shape the SSE stream used, so the existing Zustand store
 * consumes them unchanged.
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
