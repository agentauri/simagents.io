import type { StoredReplayFrame } from '../engine-host/engine-client';

export const REPLAY_FRAMES_STORAGE_KEY = 'simagents_replay_frames_v1';

const MAX_BYTES = 1_500_000;
const MAX_FRAMES = 240;

interface ReplayFrameEnvelope {
  schemaVersion: 1;
  frames: StoredReplayFrame[];
}

export function loadReplayFrames(): StoredReplayFrame[] {
  try {
    const raw = localStorage.getItem(REPLAY_FRAMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ReplayFrameEnvelope>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.frames)) return [];
    return parsed.frames.filter((frame) => frame.schemaVersion === 1);
  } catch (error) {
    console.warn('[ReplayFrames] Failed to load replay frames:', error);
    return [];
  }
}

export function appendReplayFrame(frame: StoredReplayFrame): void {
  try {
    const byTick = new Map(loadReplayFrames().map((item) => [item.tick, item]));
    byTick.set(frame.tick, frame);
    let frames = [...byTick.values()].sort((a, b) => a.tick - b.tick).slice(-MAX_FRAMES);
    let payload: ReplayFrameEnvelope = { schemaVersion: 1, frames };
    while (JSON.stringify(payload).length > MAX_BYTES && frames.length > 1) {
      frames = frames.slice(1);
      payload = { schemaVersion: 1, frames };
    }
    localStorage.setItem(REPLAY_FRAMES_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[ReplayFrames] Failed to persist replay frame:', error);
  }
}

export function clearReplayFrames(): void {
  try {
    localStorage.removeItem(REPLAY_FRAMES_STORAGE_KEY);
  } catch (error) {
    console.warn('[ReplayFrames] Failed to clear replay frames:', error);
  }
}

export function startReplayFramePersistence(): () => void {
  const listener = (event: Event) => {
    const frame = (event as CustomEvent<StoredReplayFrame>).detail;
    if (frame?.schemaVersion === 1) appendReplayFrame(frame);
  };
  window.addEventListener('simagents:replay-frame', listener);
  return () => window.removeEventListener('simagents:replay-frame', listener);
}
