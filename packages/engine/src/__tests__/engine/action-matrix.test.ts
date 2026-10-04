import { beforeEach, expect, test } from 'bun:test';
import { createIntent, getRegisteredActionTypes } from '../../actions';
import type { ActionType, ActionParams } from '../../actions/types';
import { ActionExecutor } from '../../engine/executor';
import { resetStore, store } from '../../engine-memory/store';
import { createAgent, killAgent, updateAgent } from '../../engine-memory/queries/agents';
import { createResourceSpawn, createShelter } from '../../engine-memory/queries/world';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { createJobOffer, createEmployment } from '../../engine-memory/queries/employment';
import { recordDirectDiscovery } from '../../engine-memory/queries/knowledge';
import { updateRelationshipTrust } from '../../engine-memory/queries/memories';
import { createCredential } from '../../engine-memory/queries/credentials';
import { createPuzzleGame, createPuzzleTeam, createPuzzleFragments, addPuzzleParticipant } from '../../engine-memory/queries/puzzles';
import { initializeRNG } from '../../utils/random';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { serializeWorld, validateWorldSnapshotV1 } from '../../engine/persistence';

type Fixture = { params: ActionParams; missing?: string; prepare?: () => Promise<void>; free?: string };
let executor: ActionExecutor;
const offer = (employerId: string, status = 'open') => createJobOffer({ id: 'offer', employerId, salary: 40, duration: 1,
  paymentType: 'on_completion', escrowAmount: status === 'open' ? 20 : 0, status, x: 0, y: 0, createdAtTick: 0 });
async function employment(workerId: string, completed = true) {
  const employerId = workerId === 'a' ? 'b' : 'a';
  await offer(employerId, 'accepted');
  await createEmployment({ id: 'employment', jobOfferId: 'offer', employerId, workerId, salary: 40,
    paymentType: 'on_completion', escrowAmount: 20, ticksRequired: 1, ticksWorked: completed ? 1 : 0, startedAtTick: 0, endedAtTick: completed ? 0 : null });
}
async function participate(agentId = 'a', teamId: string | null = null) {
  await addPuzzleParticipant({ id: `participant-${agentId}`, gameId: 'game', agentId, teamId, stakedAmount: 5, joinedAtTick: 0 });
}
const fixtures = {
  move: { params: { toX: 1, toY: 0 } },
  buy: { params: { itemType: 'food', quantity: 1, locationId: 'shelter' }, missing: 'locationId' },
  consume: { params: { itemType: 'food', quantity: 1 } },
  sleep: { params: { duration: 1 }, free: 'Rest restores energy without requiring inventory or money.' },
  work: { params: {}, prepare: () => employment('a', false) },
  gather: { params: { resourceType: 'food', quantity: 1 } },
  forage: { params: {} },
  public_work: { params: { taskType: 'road_maintenance' } },
  trade: { params: { targetAgentId: 'b', offeringItemType: 'food', offeringQuantity: 1, requestingItemType: 'material', requestingQuantity: 1 }, missing: 'targetAgentId' },
  claim: { params: { claimType: 'territory', x: 0, y: 0 }, free: 'A territorial claim has no inventory or monetary prerequisite.' },
  name_location: { params: { name: 'Market', x: 0, y: 0 }, free: 'Naming has no inventory or monetary prerequisite.' },
  harm: { params: { targetAgentId: 'b', intensity: 'light' }, missing: 'targetAgentId', prepare: async () => { initializeRNG('1'); } },
  steal: { params: { targetAgentId: 'b', targetItemType: 'material', quantity: 1 }, missing: 'targetAgentId', prepare: async () => { initializeRNG('1'); } },
  deceive: { params: { targetAgentId: 'b', claim: 'A resource nearby', claimType: 'resource_location' }, missing: 'targetAgentId' },
  share_info: { params: { targetAgentId: 'b', subjectAgentId: 'c', infoType: 'location', position: { x: 0, y: 0 } }, missing: 'targetAgentId' },
  signal: { params: { message: 'hello', intensity: 1 } },
  issue_credential: { params: { subjectAgentId: 'b', claimType: 'skill', description: 'A demonstrated skill' }, missing: 'subjectAgentId' },
  revoke_credential: { params: { credentialId: 'credential' }, missing: 'credentialId', prepare: async () => { await createCredential({ id: 'credential', tick: 0, issuerId: 'a', issuerSignature: 'fixture', subjectId: 'b', claimType: 'skill', claimDescription: 'fixture' }); }, free: 'Revocation needs the issuing identity, not inventory or money.' },
  spread_gossip: { params: { targetAgentId: 'b', subjectAgentId: 'c', topic: 'skill', claim: 'Useful skill', sentiment: 1 }, missing: 'targetAgentId' },
  spawn_offspring: { params: { partnerId: 'b', mutationIntensity: 0 }, missing: 'partnerId', prepare: async () => { await updateRelationshipTrust('b', 'a', 100, 0); } },
  offer_job: { params: { salary: 40, duration: 1, paymentType: 'on_completion', escrowPercent: 50 } },
  accept_job: { params: { jobOfferId: 'offer' }, missing: 'jobOfferId', prepare: async () => { await offer('b'); }, free: 'Accepting work requires an open offer, not worker funds.' },
  pay_worker: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('b') },
  claim_escrow: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('a'), free: 'Claiming already-earned escrow requires no claimant funds.' },
  quit_job: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('a', false), free: 'Leaving work requires no inventory or money.' },
  fire_worker: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('b', false), free: 'Firing settles existing escrow without a new payment prerequisite.' },
  cancel_job_offer: { params: { jobOfferId: 'offer' }, missing: 'jobOfferId', prepare: async () => { await offer('a'); }, free: 'Cancelling returns an existing deposit.' },
  join_puzzle: { params: { gameId: 'game' }, missing: 'gameId' },
  leave_puzzle: { params: { gameId: 'game' }, missing: 'gameId', prepare: () => participate() },
  share_fragment: { params: { fragmentId: 'fragment', targetAgentId: 'b' }, missing: 'fragmentId', prepare: async () => { await participate(); await participate('b'); } },
  form_team: { params: { gameId: 'game', teamName: 'Group' }, missing: 'gameId', prepare: () => participate() },
  join_team: { params: { teamId: 'team' }, missing: 'teamId', prepare: async () => { await participate(); await participate('b', 'team'); await createPuzzleTeam({ id: 'team', gameId: 'game', leaderId: 'b', createdAtTick: 0 }); }, free: 'Joining uses the already-staked participant balance.' },
  submit_solution: { params: { gameId: 'game', solution: 'answer' }, missing: 'gameId', prepare: () => participate() },
} satisfies Record<ActionType, Fixture>;
const matrix = getRegisteredActionTypes().map(type => ({ type, ...fixtures[type] })) as Array<Fixture & { type: ActionType }>;
const capture = () => serializeWorld({ worldSeed: 'matrix', savedAtSimTimeMs: 20 * 60000, speed: 1 });
function economicState() {
  return { agents: [...store.agents.values()].map(a => ({ id: a.id, x: a.x, y: a.y, balance: a.balance, health: a.health, energy: a.energy, hunger: a.hunger })),
    inventory: [...store.inventory], resources: [...store.resourceSpawns.values()].map(r => [r.id, r.currentAmount]) };
}
beforeEach(async () => {
  resetStore(); resetRuntimeConfig(); initializeRNG('matrix');
  setRuntimeConfig({ needs: { hungerDecay: 0, energyDecay: 0 }, cooperation: { enabled: false } });
  executor = new ActionExecutor({ nowMs: () => 20 * 60000 });
  await createAgent({ id: 'a', llmType: 'fixture', balance: 1000, energy: 100, hunger: 80, x: 0, y: 0 });
  await createAgent({ id: 'b', llmType: 'fixture', balance: 1000, energy: 100, x: 0, y: 0 });
  await createAgent({ id: 'c', llmType: 'fixture', x: 0, y: 0 });
  await recordDirectDiscovery('a', 'c', { x: 0, y: 0 }, 0);
  await createShelter({ id: 'shelter', x: 0, y: 0 });
  await createResourceSpawn({ id: 'resource', x: 0, y: 0, biome: 'forest', resourceType: 'food', maxAmount: 100, currentAmount: 100 });
  await addToInventory('a', 'food', 10); await addToInventory('b', 'material', 10);
  await createPuzzleGame({ id: 'game', gameType: 'password', solution: 'answer', fragmentCount: 1, entryStake: 5, prizePool: 50, createdAtTick: 0, endsAtTick: 100 });
  await createPuzzleFragments([{ id: 'fragment', gameId: 'game', fragmentIndex: 0, content: 'answer', ownerId: 'a', originalOwnerId: 'a' }]);
});
test('matrix covers the complete runtime registry', () => {
  expect(Object.keys(fixtures).sort()).toEqual(getRegisteredActionTypes().sort());
});
for (const fixture of matrix) {
  const { type, params, prepare, missing, free } = fixture;
  test(`${type}: valid success, costs, events and persisted invariants`, async () => {
    await prepare?.();
    const before = economicState();
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success, result.result.error).toBe(true);
    expect(result.events.some(e => e.type === `agent_${type}`)).toBe(true);
    expect(result.events.every(e => e.tick === 20)).toBe(true);
    expect(store.metrics.totalActions).toBe(1);
    expect(store.metrics.failedActions).toBe(0);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
    if (type === 'buy') { expect(store.agents.get('a')!.balance).toBeLessThan(before.agents[0].balance); expect(store.inventory.get('a:food')!.quantity).toBe(11); }
    if (type === 'consume') expect(store.inventory.get('a:food')!.quantity).toBe(9);
    if (type === 'gather') expect(store.resourceSpawns.get('resource')!.currentAmount).toBe(99);
    if (type === 'trade') { expect(store.inventory.get('a:material')!.quantity).toBe(1); expect(store.inventory.get('b:food')!.quantity).toBe(1); }
    if (type === 'move') expect(store.agents.get('a')!.x).toBe(1);
  });
  test(`${type}: malformed input preserves resources and emits exactly one failed attempt`, async () => {
    await prepare?.(); const before = economicState();
    const result = await executor.submit(createIntent('a', type, { unexpected: true } as never, 20));
    expect(result.result.success).toBe(false);
    expect(economicState()).toEqual(before);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
    expect(store.metrics.failedActions).toBe(1);
  });
  test(`${type}: dead actor cannot mutate resources`, async () => {
    await prepare?.(); await killAgent('a'); const before = economicState();
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success).toBe(false); expect(result.dropped).toBe(true);
    expect(economicState()).toEqual(before);
  });
  test(`${type}: cancellation while queued has no effects, costs or events`, async () => {
    await prepare?.(); const before = capture();
    let release!: () => void;
    const blocker = executor.mutate(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const controller = new AbortController();
    const result = executor.submit(createIntent('a', type, params, 20), undefined, controller.signal);
    controller.abort(); release(); await blocker;
    await expect(result).rejects.toThrow('cancelled');
    expect(capture()).toEqual(before);
  });
  if (missing) test(`${type}: missing reference cannot change economy or inventory`, async () => {
    await prepare?.(); const before = economicState();
    const result = await executor.submit(createIntent('a', type, { ...params, [missing]: 'missing' }, 20));
    expect(result.result.success).toBe(false); expect(economicState()).toEqual(before);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
  });
  test(`${type}: depleted resources ${free ? 'have no additional funding requirement' : 'reject the attempt safely'}`, async () => {
    await prepare?.(); await updateAgent('a', { energy: 0, balance: 0 }); store.inventory.clear();
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success).toBe(!!free);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
    expect([...store.agents.values()].every(a => a.balance >= 0 && a.energy >= 0 && a.health >= 0)).toBe(true);
  });
}
