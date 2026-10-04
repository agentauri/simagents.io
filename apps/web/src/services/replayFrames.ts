import type { StoredReplayFrame } from '../engine-host/engine-client';
import { IndexedCollection, legacyArray, reportSecondaryFailure } from './secondary-data';
export const REPLAY_FRAMES_STORAGE_KEY = 'simagents_replay_frames_v1';
function isFrame(value: unknown): value is StoredReplayFrame {
  const frame = value as StoredReplayFrame;
  return !!frame && frame.schemaVersion === 1 && Number.isSafeInteger(frame.tick) && frame.tick >= 0 &&
    Number.isFinite(frame.simTimeMs) && Number.isFinite(frame.capturedAt) && !!frame.snapshot &&
    frame.snapshot.tick === frame.tick && Array.isArray(frame.snapshot.agents) &&
    Array.isArray(frame.snapshot.events) && Array.isArray(frame.snapshot.shelters) && Array.isArray(frame.snapshot.resourceSpawns) &&
    frame.snapshot.agents.every(agent => !!agent && typeof agent.id === 'string' && typeof agent.llmType === 'string' && typeof agent.state === 'string' && [agent.x, agent.y, agent.hunger, agent.energy, agent.health, agent.balance, agent.tick].every(Number.isFinite)) &&
    frame.snapshot.resourceSpawns.every(spawn => !!spawn && typeof spawn.id === 'string' && typeof spawn.resourceType === 'string' && [spawn.x, spawn.y, spawn.currentAmount, spawn.maxAmount].every(Number.isFinite)) &&
    frame.snapshot.shelters.every(shelter => !!shelter && typeof shelter.id === 'string' && typeof shelter.canSleep === 'boolean' && [shelter.x, shelter.y].every(Number.isFinite)) &&
    frame.snapshot.events.every(event => !!event && Number.isFinite(event.id) && Number.isSafeInteger(event.tick) && typeof event.eventType === 'string' && typeof event.createdAt === 'string' && !!event.payload && typeof event.payload === 'object');
}
const frames = new IndexedCollection<StoredReplayFrame>(REPLAY_FRAMES_STORAGE_KEY, value => {
  const envelope = value as { schemaVersion?: number; frames?: unknown };
  if (envelope?.schemaVersion !== 1) throw new Error('Unsupported legacy replay.');
  return legacyArray(envelope.frames, isFrame);
}, frame => JSON.stringify([frame.worldSeed, frame.tick]), frame => ({ world: frame.worldSeed, tick: frame.tick, eventCount: frame.snapshot.events.length, capturedAt: frame.capturedAt }));
export const replayFrameDescriptors = () => frames.descriptors();
export const readReplayFrame = (id: string) => frames.item(id);
export const loadReplayFrames = () => frames.load().then(items => items.sort((a, b) => a.tick - b.tick));
export async function appendReplayFrame(frame: StoredReplayFrame): Promise<void> {
  if (!isFrame(frame)) throw new Error('Invalid replay frame.');
  await frames.put(frame);
}
export const clearReplayFrames = () => frames.clear();
export function startReplayFramePersistence(): () => void {
  const listener = (event: Event) => {
    void appendReplayFrame((event as CustomEvent<StoredReplayFrame>).detail).catch(reportSecondaryFailure);
  };
  window.addEventListener('simagents:replay-frame', listener);
  return () => window.removeEventListener('simagents:replay-frame', listener);
}
