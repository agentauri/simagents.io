/**
 * Phase 0 browser pivot — handlers unblocked by query-module refactors.
 *
 * Runs the real production handlers against the in-memory query modules and
 * ledger, proving these paths no longer import PostgreSQL or Redis-backed code.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetStore, store } from '../../engine-memory/store';
import { createAgent } from '../../engine-memory/queries/agents';
import { addToInventory, getInventoryItem } from '../../engine-memory/queries/inventory';
import { createEmployment } from '../../engine-memory/queries/employment';
import {
  addPuzzleParticipant,
  assignFragmentToAgent,
  createPuzzleFragments,
  createPuzzleGame,
} from '../../engine-memory/queries/puzzles';
import { getTotalMoneySupply } from '../../engine-memory/ledger';
import type { ActionType } from '../../actions/types';

mock.module('../../db/queries/world', () => import('../../engine-memory/queries/world'));
mock.module('../../db/queries/agents', () => import('../../engine-memory/queries/agents'));
mock.module('../../db/queries/inventory', () => import('../../engine-memory/queries/inventory'));
mock.module('../../db/queries/events', () => import('../../engine-memory/queries/events'));
mock.module('../../db/queries/memories', () => import('../../engine-memory/queries/memories'));
mock.module('../../db/queries/employment', () => import('../../engine-memory/queries/employment'));
mock.module('../../db/queries/reproduction', () => import('../../engine-memory/queries/reproduction'));
mock.module('../../db/queries/gossip', () => import('../../engine-memory/queries/gossip'));
mock.module('../../db/queries/credentials', () => import('../../engine-memory/queries/credentials'));
mock.module('../../db/queries/beliefs', () => import('../../engine-memory/queries/beliefs'));
mock.module('../../db/queries/roles', () => import('../../engine-memory/queries/roles'));
mock.module('../../db/queries/claims', () => import('../../engine-memory/queries/claims'));
mock.module('../../db/queries/knowledge', () => import('../../engine-memory/queries/knowledge'));
mock.module('../../db/queries/naming', () => import('../../engine-memory/queries/naming'));
mock.module('../../db/queries/puzzles', () => import('../../engine-memory/queries/puzzles'));
mock.module('../../ledger', () => import('../../engine-memory/ledger'));
mock.module('../../cache/projections', () => import('../../engine-memory/projections'));
mock.module('../../world/scent', () => import('../../engine-memory/scent'));

let h: {
  work: typeof import('../../actions/handlers/work').handleWork;
  payWorker: typeof import('../../actions/handlers/pay-worker').handlePayWorker;
  claimEscrow: typeof import('../../actions/handlers/claim-escrow').handleClaimEscrow;
  fireWorker: typeof import('../../actions/handlers/fire-worker').handleFireWorker;
  trade: typeof import('../../actions/handlers/trade').handleTrade;
  submitSolution: typeof import('../../actions/handlers/submit-solution').handleSubmitSolution;
  shareFragment: typeof import('../../actions/handlers/share-fragment').handleShareFragment;
};

beforeAll(async () => {
  h = {
    work: (await import('../../actions/handlers/work')).handleWork,
    payWorker: (await import('../../actions/handlers/pay-worker')).handlePayWorker,
    claimEscrow: (await import('../../actions/handlers/claim-escrow')).handleClaimEscrow,
    fireWorker: (await import('../../actions/handlers/fire-worker')).handleFireWorker,
    trade: (await import('../../actions/handlers/trade')).handleTrade,
    submitSolution: (await import('../../actions/handlers/submit-solution')).handleSubmitSolution,
    shareFragment: (await import('../../actions/handlers/share-fragment')).handleShareFragment,
  };
});

const intent = <T>(agentId: string, type: ActionType, params: T, tick = 1) => ({
  agentId,
  type,
  params,
  tick,
  timestamp: Date.now(),
});

const mkAgent = (over: Partial<Parameters<typeof createAgent>[0]> = {}) =>
  createAgent({
    id: uuid(),
    llmType: 'claude',
    x: 5,
    y: 5,
    energy: 100,
    hunger: 100,
    health: 100,
    balance: 100,
    ...over,
  });

const agentBalanceTotal = (ids: string[]) =>
  ids.reduce((sum, id) => sum + (store.agents.get(id)?.balance ?? 0), 0);

describe('newly unblocked real handlers on in-memory modules', () => {
  beforeEach(() => {
    resetStore();
  });

  test('work pays a per-tick worker and increments ticks worked', async () => {
    const employer = await mkAgent({ balance: 100 });
    const worker = await mkAgent({ x: 6, y: 5, balance: 10 });
    const employment = await createEmployment({
      jobOfferId: uuid(),
      employerId: employer.id,
      workerId: worker.id,
      salary: 30,
      paymentType: 'per_tick',
      escrowAmount: 0,
      ticksRequired: 3,
      ticksWorked: 0,
      amountPaid: 0,
      status: 'active',
      startedAtTick: 0,
    });
    const beforeTotal = agentBalanceTotal([employer.id, worker.id]);

    const result = await h.work(intent(worker.id, 'work', {}, 1), worker);

    expect(result.success).toBe(true);
    expect(store.employments.get(employment.id)?.ticksWorked).toBe(1);
    expect(store.employments.get(employment.id)?.amountPaid).toBe(10);
    expect(store.agents.get(employer.id)?.balance).toBe(90);
    expect(store.agents.get(worker.id)?.balance).toBe(20);
    expect(agentBalanceTotal([employer.id, worker.id])).toBe(beforeTotal);
  });

  test('pay-worker completes an on-completion contract and conserves agent balances', async () => {
    const employer = await mkAgent({ balance: 100 });
    const worker = await mkAgent({ x: 6, y: 5, balance: 10 });
    const employment = await createEmployment({
      jobOfferId: uuid(),
      employerId: employer.id,
      workerId: worker.id,
      salary: 30,
      paymentType: 'on_completion',
      escrowAmount: 0,
      ticksRequired: 3,
      ticksWorked: 3,
      amountPaid: 0,
      status: 'active',
      startedAtTick: 0,
    });
    const beforeTotal = agentBalanceTotal([employer.id, worker.id]);

    const result = await h.payWorker(
      intent(employer.id, 'pay_worker', { employmentId: employment.id }, 5),
      employer
    );

    expect(result.success).toBe(true);
    const updated = store.employments.get(employment.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.endedAtTick).toBe(5);
    expect(updated.amountPaid).toBe(30);
    expect(store.agents.get(employer.id)?.balance).toBe(70);
    expect(store.agents.get(worker.id)?.balance).toBe(40);
    expect(agentBalanceTotal([employer.id, worker.id])).toBe(beforeTotal);
  });

  test('claim-escrow transfers escrow to worker and marks employer unpaid', async () => {
    const employer = await mkAgent({ balance: 40 });
    const worker = await mkAgent({ x: 6, y: 5, balance: 10 });
    const employment = await createEmployment({
      jobOfferId: uuid(),
      employerId: employer.id,
      workerId: worker.id,
      salary: 30,
      paymentType: 'on_completion',
      escrowAmount: 15,
      ticksRequired: 2,
      ticksWorked: 2,
      amountPaid: 0,
      status: 'active',
      startedAtTick: 0,
    });
    const beforeAgentBalancesPlusEscrow =
      agentBalanceTotal([employer.id, worker.id]) + employment.escrowAmount;

    const result = await h.claimEscrow(
      intent(worker.id, 'claim_escrow', { employmentId: employment.id }, 20),
      worker
    );

    expect(result.success).toBe(true);
    const updated = store.employments.get(employment.id)!;
    expect(updated.status).toBe('unpaid');
    expect(updated.endedAtTick).toBe(20);
    expect(store.agents.get(employer.id)?.balance).toBe(40);
    expect(store.agents.get(worker.id)?.balance).toBe(25);
    expect(agentBalanceTotal([employer.id, worker.id])).toBe(beforeAgentBalancesPlusEscrow);
  });

  test('fire-worker pays prorated severance, returns escrow, and marks fired', async () => {
    const employer = await mkAgent({ balance: 80 });
    const worker = await mkAgent({ x: 6, y: 5, balance: 10 });
    const employment = await createEmployment({
      jobOfferId: uuid(),
      employerId: employer.id,
      workerId: worker.id,
      salary: 40,
      paymentType: 'on_completion',
      escrowAmount: 20,
      ticksRequired: 4,
      ticksWorked: 2,
      amountPaid: 0,
      status: 'active',
      startedAtTick: 0,
    });
    const beforeAgentBalancesPlusEscrow =
      agentBalanceTotal([employer.id, worker.id]) + employment.escrowAmount;

    const result = await h.fireWorker(
      intent(employer.id, 'fire_worker', { employmentId: employment.id }, 4),
      employer
    );

    expect(result.success).toBe(true);
    const updated = store.employments.get(employment.id)!;
    expect(updated.status).toBe('fired');
    expect(updated.endedAtTick).toBe(4);
    expect(updated.amountPaid).toBe(20);
    expect(store.agents.get(employer.id)?.balance).toBe(80);
    expect(store.agents.get(worker.id)?.balance).toBe(30);
    expect(agentBalanceTotal([employer.id, worker.id])).toBe(beforeAgentBalancesPlusEscrow);
  });

  test('trade swaps items successfully and conserves item totals per type', async () => {
    const initiator = await mkAgent();
    const target = await mkAgent({ x: 6, y: 5 });
    await addToInventory(initiator.id, 'food', 5);
    await addToInventory(target.id, 'water', 4);

    const result = await h.trade(
      intent(initiator.id, 'trade', {
        targetAgentId: target.id,
        offeringItemType: 'food',
        offeringQuantity: 2,
        requestingItemType: 'water',
        requestingQuantity: 3,
      }),
      initiator
    );

    expect(result.success).toBe(true);
    expect((await getInventoryItem(initiator.id, 'food'))?.quantity).toBe(3);
    expect((await getInventoryItem(initiator.id, 'water'))?.quantity).toBe(3);
    expect((await getInventoryItem(target.id, 'food'))?.quantity).toBe(2);
    expect((await getInventoryItem(target.id, 'water'))?.quantity).toBe(1);
    expect(
      ((await getInventoryItem(initiator.id, 'food'))?.quantity ?? 0) +
        ((await getInventoryItem(target.id, 'food'))?.quantity ?? 0)
    ).toBe(5);
    expect(
      ((await getInventoryItem(initiator.id, 'water'))?.quantity ?? 0) +
        ((await getInventoryItem(target.id, 'water'))?.quantity ?? 0)
    ).toBe(4);
  });

  test('trade fails cleanly when initiator conditional decrement returns false', async () => {
    const initiator = await mkAgent();
    const target = await mkAgent({ x: 6, y: 5 });
    await addToInventory(initiator.id, 'food', 1);
    await addToInventory(target.id, 'water', 4);

    const result = await h.trade(
      intent(initiator.id, 'trade', {
        targetAgentId: target.id,
        offeringItemType: 'food',
        offeringQuantity: 2,
        requestingItemType: 'water',
        requestingQuantity: 3,
      }),
      initiator
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough food to offer (have: 1, need: 2)');
    expect((await getInventoryItem(initiator.id, 'food'))?.quantity).toBe(1);
    expect(await getInventoryItem(initiator.id, 'water')).toBeUndefined();
    expect(await getInventoryItem(target.id, 'food')).toBeUndefined();
    expect((await getInventoryItem(target.id, 'water'))?.quantity).toBe(4);
  });

  test('trade restores initiator items when target has insufficient quantity', async () => {
    const initiator = await mkAgent();
    const target = await mkAgent({ x: 6, y: 5 });
    await addToInventory(initiator.id, 'food', 2);
    await addToInventory(target.id, 'water', 1);

    const result = await h.trade(
      intent(initiator.id, 'trade', {
        targetAgentId: target.id,
        offeringItemType: 'food',
        offeringQuantity: 2,
        requestingItemType: 'water',
        requestingQuantity: 3,
      }),
      initiator
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Target agent doesn't have enough water (have: 1, need: 3)");
    expect((await getInventoryItem(initiator.id, 'food'))?.quantity).toBe(2);
    expect(await getInventoryItem(initiator.id, 'water')).toBeUndefined();
    expect(await getInventoryItem(target.id, 'food')).toBeUndefined();
    expect((await getInventoryItem(target.id, 'water'))?.quantity).toBe(1);
  });

  test('submit-solution distributes prizes through the in-memory double-entry ledger', async () => {
    const solver = await mkAgent({ balance: 10, energy: 100 });
    const game = await createPuzzleGame({
      gameType: 'coordinates',
      status: 'active',
      solution: '42,42',
      prizePool: 100,
      entryStake: 0,
      maxParticipants: 5,
      minParticipants: 1,
      fragmentCount: 2,
      createdAtTick: 0,
    });
    await addPuzzleParticipant({
      gameId: game.id,
      agentId: solver.id,
      stakedAmount: 0,
      contributionScore: 0,
      joinedAtTick: 0,
      status: 'active',
    });
    const beforeSupply = await getTotalMoneySupply();

    const result = await h.submitSolution(
      intent(solver.id, 'submit_solution', { gameId: game.id, solution: '42,42' }, 12),
      solver
    );

    expect(result.success).toBe(true);
    expect(store.puzzleGames.get(game.id)?.status).toBe('completed');
    expect(store.puzzleAttempts.size).toBe(1);

    const positiveLedgerAmount = store.ledgerEntries
      .filter((entry) => entry.toAgentId === solver.id && entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const netLedgerAmount = store.ledgerEntries.reduce((sum, entry) => sum + entry.amount, 0);

    expect(store.ledgerEntries).toHaveLength(4);
    expect(netLedgerAmount).toBe(0);
    expect(positiveLedgerAmount).toBe(90);
    expect(await getTotalMoneySupply()).toBe(beforeSupply + positiveLedgerAmount);
    expect(store.agents.get(solver.id)?.balance).toBe(100);
  });

  test('share-fragment gameId fallback marks the resolved fragment, not the raw param', async () => {
    const sharer = await mkAgent();
    const receiver = await mkAgent({ x: 6, y: 5 });
    const game = await createPuzzleGame({
      gameType: 'coordinates',
      status: 'active',
      solution: '42,42',
      prizePool: 100,
      entryStake: 0,
      maxParticipants: 5,
      minParticipants: 1,
      fragmentCount: 2,
      createdAtTick: 0,
    });
    for (const agentId of [sharer.id, receiver.id]) {
      await addPuzzleParticipant({
        gameId: game.id,
        agentId,
        stakedAmount: 0,
        contributionScore: 0,
        joinedAtTick: 0,
        status: 'active',
      });
    }
    const [fragment] = await createPuzzleFragments([
      { gameId: game.id, fragmentIndex: 0, content: 'secret-piece' },
    ]);
    await assignFragmentToAgent(fragment.id, sharer.id);

    // Common LLM mistake: gameId provided instead of a fragmentId.
    const result = await h.shareFragment(
      intent(sharer.id, 'share_fragment', { gameId: game.id, targetAgentId: receiver.id }),
      sharer
    );

    expect(result.success).toBe(true);
    expect(store.puzzleFragments.get(fragment.id)!.sharedWith as string[]).toContain(receiver.id);
    expect(result.events?.[0]?.payload.fragmentId).toBe(fragment.id);
  });

  test('PostgreSQL and Redis modules are never loaded by the unblocked handler set', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (p) =>
        p.includes('/db/index') ||
        /node_modules\/postgres\//.test(p) ||
        p.includes('/cache/index') ||
        p.includes('/cache/pubsub')
    );
    expect(offenders).toEqual([]);
  });
});
