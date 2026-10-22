import { beforeEach, expect, test } from 'bun:test';
import { hydrateWorld, serializeWorld, validateWorldSnapshotV1, type WorldSnapshotV1 } from '../../engine/persistence';
import { resetStore, store } from '../../engine-memory/store';
import { createAgent } from '../../engine-memory/queries/agents';
import { createResourceSpawn } from '../../engine-memory/queries/world';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { appendEvent } from '../../engine-memory/queries/events';
import { createJobOffer, createEmployment } from '../../engine-memory/queries/employment';
import { createPuzzleGame, createPuzzleTeam, createPuzzleFragments, addPuzzleParticipant } from '../../engine-memory/queries/puzzles';
import { storeMemory, getOrCreateRelationship } from '../../engine-memory/queries/memories';
import { resetRuntimeConfig } from '../../config';

const capture = () => serializeWorld({ savedAtSimTimeMs: 0, worldSeed: 'fixture', speed: 1 });
beforeEach(() => { resetStore(); resetRuntimeConfig(); });
async function fixture() {
  await createAgent({ id: 'a', llmType: 'fixture', balance: 100 });
  await createAgent({ id: 'b', llmType: 'fixture', balance: 100 });
  await createResourceSpawn({ id: 'resource', x: 1, y: 1, resourceType: 'food', maxAmount: 10, currentAmount: 5 });
  await addToInventory('a', 'food', 3);
  await storeMemory({ agentId: 'a', type: 'action', content: 'remember', involvedAgentIds: ['b'], tick: 0 });
  await getOrCreateRelationship('a', 'b');
  const offer = await createJobOffer({ id: 'offer', employerId: 'a', salary: 10, duration: 2, paymentType: 'on_completion', x: 0, y: 0, createdAtTick: 0 });
  await createEmployment({ id: 'employment', jobOfferId: offer.id, employerId: 'a', workerId: 'b', salary: 10, paymentType: 'on_completion', ticksRequired: 2, startedAtTick: 0 });
  const game = await createPuzzleGame({ id: 'game', gameType: 'password', solution: 'answer', createdAtTick: 0 });
  await createPuzzleTeam({ id: 'team', gameId: game.id, leaderId: 'a', createdAtTick: 0 });
  await createPuzzleFragments([{ id: 'fragment', gameId: game.id, fragmentIndex: 0, content: 'answer' }]);
  await addPuzzleParticipant({ id: 'participant', gameId: game.id, agentId: 'a', teamId: 'team', joinedAtTick: 0 });
  await appendEvent({ agentId: 'a', tick: 0, eventType: 'agent_signal', payload: { action: 'signal', createdAt: 'tomorrow', nested: { updatedAt: 'original user text' } } });
  return capture();
}
const corruptions: Array<[string, (snapshot: WorldSnapshotV1) => void]> = [
  ['out-of-bounds agent', s => { s.store.agents[0].x = 100; }],
  ['unknown inventory owner', s => { (s.store.inventory[0][1] as Record<string, unknown>).agentId = 'missing'; }],
  ['inventory key mismatch', s => { s.store.inventory[0][0] = 'wrong'; }],
  ['negative resource regeneration', s => { s.store.resourceSpawns[0].regenRate = -1; }],
  ['resource exceeds capacity', s => { s.store.resourceSpawns[0].currentAmount = 11; }],
  ['missing resource field', s => { delete s.store.resourceSpawns[0].discovered; }],
  ['duplicate relationship pair', s => { s.store.relationships.push({ ...s.store.relationships[0], id: 'duplicate' }); }],
  ['unknown memory reference', s => { s.store.memories[0].involvedAgentIds = ['missing']; }],
  ['negative escrow', s => { s.store.employments[0].escrowAmount = -1; }],
  ['active contract cannot record overpayment', s => { s.store.employments[0].amountPaid = 11; }],
  ['completed contract cannot add forfeited escrow', s => {
    Object.assign(s.store.employments[0], { status: 'completed', amountPaid: 11 });
    s.store.jobOffers[0].escrowAmount = 4;
  }],
  ['default payment cannot exceed salary plus its original deposit', s => {
    Object.assign(s.store.employments[0], { status: 'unpaid', amountPaid: 15 });
    s.store.jobOffers[0].escrowAmount = 4;
  }],
  ['abandoned contract without a deposit cannot record overpayment', s => {
    Object.assign(s.store.employments[0], { status: 'abandoned', amountPaid: 11 });
  }],
  ['unknown offer', s => { s.store.employments[0].jobOfferId = 'missing'; }],
  ['employment exceeds required work', s => { s.store.employments[0].ticksWorked = 3; }],
  ['invalid game reference', s => { s.store.puzzleFragments[0].gameId = 'missing'; }],
  ['unknown team', s => { s.store.puzzleParticipants[0].teamId = 'missing'; }],
  ['unknown puzzle winner', s => { s.store.puzzleGames[0].winnerId = 'missing'; }],
  ['puzzle awards exceed the prize pool', s => {
    Object.assign(s.store.puzzleGames[0], { status: 'completed', winnerId: 'a', prizePool: 50,
      prizeDistribution: [{ agentId: 'a', amount: 51, type: 'solo_winner' }] });
  }],
  ['a zero prize pool cannot award a positive amount', s => {
    Object.assign(s.store.puzzleGames[0], { status: 'completed', winnerId: 'a', prizePool: 0,
      prizeDistribution: [{ agentId: 'a', amount: Number.MIN_VALUE, type: 'solo_winner' }] });
  }],
  ['puzzle awards overflow when summed', s => {
    Object.assign(s.store.puzzleGames[0], { status: 'completed', winnerId: 'a', prizePool: Number.MAX_VALUE,
      prizeDistribution: [
        { agentId: 'a', amount: Number.MAX_VALUE, type: 'solo_winner' },
        { agentId: 'a', amount: Number.MAX_VALUE, type: 'contributor' },
      ] });
  }],
  ['duplicate participant', s => { s.store.puzzleParticipants.push({ ...s.store.puzzleParticipants[0], id: 'duplicate' }); }],
  ['duplicate metadata', s => { s.engine.agentMeta = [['a', { busyUntil: 0 }], ['a', { busyUntil: 1 }]]; }],
  ['unknown metadata owner', s => { s.engine.agentMeta = [['missing', { busyUntil: 0 }]]; }],
  ['invalid critical timer', s => { s.engine.vitalsMeta = [['a', { vitalsUpdatedAt: 0, criticalSince: { hunger: -1 } }]]; }],
  ['regressing event identity', s => { s.store.nextEventId = 1; }],
  ['fractional tick', s => { s.store.worldState.currentTick = 0.5; }],
  ['invalid configuration type', s => { s.configuration!.overrides.needs = { hungerDecay: 'bad' as never }; }],
  ['unknown configuration setting', s => { s.configuration!.overrides.agent = { cloudSync: true } as never; }],
  ['unsafe heartbeat interval', s => { s.configuration!.overrides.engine = { heartbeatIntervalMs: 0 }; }],
];
test.each(corruptions)('%s is rejected before changing the current world', async (_label, mutate) => {
  const snapshot = await fixture();
  const original = capture();
  mutate(snapshot);
  expect(() => hydrateWorld(snapshot)).toThrow();
  expect(capture()).toEqual(original);
});
test('valid persisted domain restores entities and leaves model/user payload dates untouched', async () => {
  const snapshot = await fixture();
  expect(validateWorldSnapshotV1(snapshot)).toBe(snapshot);
  hydrateWorld(JSON.parse(JSON.stringify(snapshot)));
  expect(store.events[0].createdAt).toBeInstanceOf(Date);
  expect(store.events[0].payload.createdAt).toBe('tomorrow');
  expect(store.events[0].payload.nested).toEqual({ updatedAt: 'original user text' });
  expect(capture().store).toEqual(snapshot.store);
  expect(capture().engine).toEqual(snapshot.engine);
  expect(capture().random).toEqual(snapshot.random);
  expect(capture().metrics).toEqual(snapshot.metrics);
});
test('a team winner belongs to the same game and is accepted', async () => {
  const snapshot = await fixture();
  snapshot.store.puzzleGames[0].winnerId = 'team';
  expect(() => validateWorldSnapshotV1(snapshot)).not.toThrow();
  snapshot.store.puzzleGames.push({ ...snapshot.store.puzzleGames[0], id: 'other-game' });
  snapshot.store.puzzleTeams[0].gameId = 'other-game';
  expect(() => validateWorldSnapshotV1(snapshot)).toThrow('Cross-game');
});

test('split puzzle awards accept exact and floating-point pool boundaries', async () => {
  const snapshot = await fixture();
  for (const [pool, amounts] of [[50, [30, 20]], [0.3, [0.1, 0.2]]] as const) {
    Object.assign(snapshot.store.puzzleGames[0], { status: 'completed', winnerId: 'a', prizePool: pool,
      prizeDistribution: amounts.map((amount, index) => ({ agentId: 'a', amount, type: index === 0 ? 'solo_winner' : 'contributor' })) });
    expect(() => validateWorldSnapshotV1(snapshot)).not.toThrow();
    hydrateWorld(snapshot);
    expect(capture().store.puzzleGames[0].prizeDistribution).toEqual(snapshot.store.puzzleGames[0].prizeDistribution);
  }
});

test.each(['unpaid', 'abandoned'] as const)('%s contract permits only its documented original deposit beyond wages', async (status) => {
  const snapshot = await fixture();
  snapshot.store.jobOffers[0].escrowAmount = 4;
  Object.assign(snapshot.store.employments[0], { status, amountPaid: 14, escrowAmount: 0 });
  expect(() => validateWorldSnapshotV1(snapshot)).not.toThrow();
  hydrateWorld(JSON.parse(JSON.stringify(snapshot)));
  expect(capture().store.employments[0]).toEqual(snapshot.store.employments[0]);
});

test('decimal default settlement tolerates arithmetic roundoff at its deposit boundary', async () => {
  const snapshot = await fixture();
  Object.assign(snapshot.store.jobOffers[0], { salary: 0.3, escrowAmount: 0.1 });
  Object.assign(snapshot.store.employments[0], { salary: 0.3, status: 'unpaid', amountPaid: 0.4, escrowAmount: 0 });
  expect(() => validateWorldSnapshotV1(snapshot)).not.toThrow();
});
