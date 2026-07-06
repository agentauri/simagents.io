import { beforeEach, describe, expect, test } from 'bun:test';
import {
  hydrateWorld,
  serializeWorld,
  validateWorldSnapshotV1,
  WORLD_SNAPSHOT_SCHEMA_VERSION,
  WorldSnapshotError,
} from '../../engine/persistence';
import { getPuzzleGameById, createPuzzleGame } from '../../engine-memory/queries/puzzles';
import { resetStore, store } from '../../engine-memory/store';

function captureSnapshotError(input: unknown): WorldSnapshotError {
  try {
    validateWorldSnapshotV1(input);
  } catch (error) {
    expect(error).toBeInstanceOf(WorldSnapshotError);
    return error as WorldSnapshotError;
  }
  throw new Error('Expected snapshot validation to fail');
}

describe('world persistence', () => {
  beforeEach(() => {
    resetStore();
  });

  test('serializes, validates, and hydrates browser-local puzzle state', async () => {
    const game = await createPuzzleGame({
      id: 'puzzle-a',
      gameType: 'fragment-chase',
      status: 'active',
      solution: 'saffron',
      prizePool: 50,
      createdAtTick: 12,
      endsAtTick: 99,
    });
    store.nextEventId = 42;

    const snapshot = serializeWorld({
      savedAtSimTimeMs: 123_000,
      worldSeed: 'seed-a',
      speed: 4,
    });

    expect(snapshot.schemaVersion).toBe(WORLD_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.store.puzzleGames).toHaveLength(1);
    expect(validateWorldSnapshotV1(snapshot).store.nextEventId).toBe(42);

    resetStore();
    expect(await getPuzzleGameById(game.id)).toBeUndefined();

    hydrateWorld(snapshot);

    const restored = await getPuzzleGameById(game.id);
    expect(restored?.status).toBe('active');
    expect(restored?.solution).toBe('saffron');
    expect(restored?.createdAt).toBeInstanceOf(Date);
    expect(store.nextEventId).toBe(42);
  });

  test('rejects unsupported snapshot schema versions', () => {
    const snapshot = serializeWorld({
      savedAtSimTimeMs: 1,
      worldSeed: 'seed-a',
      speed: 1,
    });

    const error = captureSnapshotError({ ...snapshot, schemaVersion: 2 });

    expect(error.code).toBe('VERSION_MISMATCH');
    expect(error.message).toContain('Unsupported world snapshot schema version');
  });

  test('rejects malformed store payloads before hydration mutates state', async () => {
    const game = await createPuzzleGame({
      id: 'puzzle-a',
      gameType: 'fragment-chase',
      solution: 'saffron',
      createdAtTick: 12,
    });
    const snapshot = serializeWorld({
      savedAtSimTimeMs: 1,
      worldSeed: 'seed-a',
      speed: 1,
    });

    const error = captureSnapshotError({
      ...snapshot,
      store: { ...snapshot.store, events: null },
    });

    expect(error.code).toBe('INVALID_SNAPSHOT');
    expect(error.message).toContain('store.events');
    expect(await getPuzzleGameById(game.id)).toBeDefined();
  });
});
