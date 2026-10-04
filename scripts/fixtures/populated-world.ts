import { hydrateWorld, serializeWorld, validateWorldSnapshotV1, type WorldSnapshotV1 } from '../../packages/engine/src/engine/persistence';
import { createPuzzleGame, createPuzzleFragments, addPuzzleParticipant } from '../../packages/engine/src/engine-memory/queries/puzzles';
import { resetStore } from '../../packages/engine/src/engine-memory/store';
/** Imported QA fixture only; never stands in for a provider decision or real history. */
export async function populatedWorld(snapshot: WorldSnapshotV1) {
  hydrateWorld(snapshot);
  try {
    const agent = snapshot.store.agents[0]; if (!agent) throw new Error('Public fixture needs a real seeded agent');
    const tick = snapshot.store.worldState.currentTick;
    for (const [id, status] of [['ui-open-puzzle', 'open'], ['ui-completed-puzzle', 'completed']] as const) {
      await createPuzzleGame({ id, gameType: 'password', status, solution: 'synthetic-answer', entryStake: 0, prizePool: 50, fragmentCount: 2, minParticipants: 1, maxParticipants: 10, createdAtTick: tick, startsAtTick: tick, endsAtTick: tick + 10, winnerId: status === 'completed' ? agent.id : null });
      await addPuzzleParticipant({ gameId: id, agentId: agent.id, stakedAmount: 0, joinedAtTick: tick });
      await createPuzzleFragments([0, 1].map(index => ({ id: `${id}:fragment:${index}`, gameId: id, fragmentIndex: index, content: `Synthetic fragment ${index + 1}`, hint: 'Imported QA content', ownerId: agent.id, originalOwnerId: agent.id, sharedWith: [] })));
    }
    const next = serializeWorld({ savedAtSimTimeMs: snapshot.savedAtSimTimeMs, speed: snapshot.speed, worldSeed: snapshot.worldSeed });
    next.configuration = snapshot.configuration;
    return validateWorldSnapshotV1(JSON.parse(JSON.stringify(next)));
  } finally { resetStore(); }
}
