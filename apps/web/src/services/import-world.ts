import type { WorldSnapshotV1 } from '@simagents/engine/engine/persistence';
import { parseWorldExportFile, saveImportedWorld, type SavedWorld } from './persistence';
export interface ImportEngine {
  validateSnapshot(snapshot: WorldSnapshotV1): Promise<void>;
  isRunning(): boolean;
  isPaused(): boolean;
  pause(): Promise<void>;
  resetHard(): void;
}
/** Reject first, then drain the old session, commit, and retire its credential copies. */
export async function importWorld(input: unknown, client: ImportEngine, commit: (file: SavedWorld) => Promise<SavedWorld> = saveImportedWorld): Promise<SavedWorld> {
  const parsed = parseWorldExportFile(input);
  await client.validateSnapshot(parsed.snapshot);
  if (client.isRunning() || client.isPaused()) await client.pause();
  const saved = await commit(parsed);
  // A failed commit leaves the previous engine available, paused for explicit recovery.
  client.resetHard();
  return saved;
}
