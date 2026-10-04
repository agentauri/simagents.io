import type { WorldEvent } from '../stores/world';
import type { ReplayEvent } from '../stores/replay';

/** Engine events retain their identity when a bounded/reversed list changes. */
export function worldEventToReplayEvent(event: WorldEvent): ReplayEvent {
  const match = /^store-([1-9]\d*)$/.exec(event.id);
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Replay requires a valid stored engine event identity.');
  return { id, eventType: event.type, tick: event.tick, agentId: event.agentId ?? null,
    payload: event.payload, createdAt: new Date(event.timestamp).toISOString() };
}
