/**
 * Phase 1 — Exhaustive handler verification on the in-memory store.
 *
 * Covers every remaining production handler that depends ONLY on the ported
 * in-memory query modules (no `db/index` / `ledger` / `cache` dependency):
 * naming, employment lifecycle (quit/cancel), credentials (revoke), knowledge
 * (share-info), reproduction (spawn-offspring), conflict (steal/deceive), and
 * the full puzzle team/fragment flow (form-team → join-team → share-fragment →
 * leave-puzzle).
 *
 * Handlers that use raw `db.execute(sql)` or import `db`/`ledger`/`cache`
 * directly (work, pay-worker, claim-escrow, fire-worker, submit-solution,
 * inject-info, trade) are intentionally NOT covered here — they need a
 * dedicated refactor/stub (tracked in docs/browser-mode-plan.md).
 */

import { describe, expect, test, beforeEach, beforeAll, mock } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetStore, store } from '../../engine-memory/store';
import { setSeed } from '../../utils/random';
import { createAgent } from '../../engine-memory/queries/agents';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { createJobOffer, createEmployment } from '../../engine-memory/queries/employment';
import { createCredential } from '../../engine-memory/queries/credentials';
import { recordDirectDiscovery } from '../../engine-memory/queries/knowledge';
import {
  createPuzzleGame,
  addPuzzleParticipant,
  createPuzzleFragments,
  assignFragmentToAgent,
} from '../../engine-memory/queries/puzzles';
import type { ActionType } from '../../actions/types';

// Redirect the whole engine data layer to the in-memory store.
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
mock.module('../../world/scent', () => import('../../engine-memory/scent'));

let h: {
  nameLocation: typeof import('../../actions/handlers/name-location').handleNameLocation;
  quitJob: typeof import('../../actions/handlers/quit-job').handleQuitJob;
  cancelJobOffer: typeof import('../../actions/handlers/cancel-job-offer').handleCancelJobOffer;
  revokeCredential: typeof import('../../actions/handlers/revoke-credential').handleRevokeCredential;
  shareInfo: typeof import('../../actions/handlers/share-info').handleShareInfo;
  spawnOffspring: typeof import('../../actions/handlers/spawn-offspring').handleSpawnOffspring;
  steal: typeof import('../../actions/handlers/steal').handleSteal;
  deceive: typeof import('../../actions/handlers/deceive').handleDeceive;
  formTeam: typeof import('../../actions/handlers/form-team').handleFormTeam;
  joinTeam: typeof import('../../actions/handlers/join-team').handleJoinTeam;
  shareFragment: typeof import('../../actions/handlers/share-fragment').handleShareFragment;
  leavePuzzle: typeof import('../../actions/handlers/leave-puzzle').handleLeavePuzzle;
};

beforeAll(async () => {
  h = {
    nameLocation: (await import('../../actions/handlers/name-location')).handleNameLocation,
    quitJob: (await import('../../actions/handlers/quit-job')).handleQuitJob,
    cancelJobOffer: (await import('../../actions/handlers/cancel-job-offer')).handleCancelJobOffer,
    revokeCredential: (await import('../../actions/handlers/revoke-credential')).handleRevokeCredential,
    shareInfo: (await import('../../actions/handlers/share-info')).handleShareInfo,
    spawnOffspring: (await import('../../actions/handlers/spawn-offspring')).handleSpawnOffspring,
    steal: (await import('../../actions/handlers/steal')).handleSteal,
    deceive: (await import('../../actions/handlers/deceive')).handleDeceive,
    formTeam: (await import('../../actions/handlers/form-team')).handleFormTeam,
    joinTeam: (await import('../../actions/handlers/join-team')).handleJoinTeam,
    shareFragment: (await import('../../actions/handlers/share-fragment')).handleShareFragment,
    leavePuzzle: (await import('../../actions/handlers/leave-puzzle')).handleLeavePuzzle,
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
  createAgent({ id: uuid(), llmType: 'claude', x: 5, y: 5, energy: 100, health: 100, balance: 100, ...over });

describe('exhaustive handler verification on in-memory modules', () => {
  beforeEach(() => {
    resetStore();
    setSeed('engine-memory-verification'); // deterministic RNG for probabilistic handlers (steal)
  });

  test('naming: name-location proposes a name (module: naming)', async () => {
    const agent = await mkAgent({ x: 20, y: 20 });
    const result = await h.nameLocation(
      intent(agent.id, 'name_location', { name: 'Riverside' }),
      agent
    );
    expect(result.success).toBe(true);
    expect(store.locationNames.size).toBe(1);
    expect([...store.locationNames.values()][0].name).toBe('Riverside');
  });

  test('employment: quit-job ends an active contract (module: employment)', async () => {
    const employer = await mkAgent();
    const worker = await mkAgent({ x: 6, y: 5 });
    const employment = await createEmployment({
      jobOfferId: uuid(),
      employerId: employer.id,
      workerId: worker.id,
      salary: 20,
      paymentType: 'on_completion',
      escrowAmount: 0,
      ticksRequired: 5,
      status: 'active',
      startedAtTick: 0,
    });

    const result = await h.quitJob(intent(worker.id, 'quit_job', { employmentId: employment.id }), worker);
    expect(result.success).toBe(true);
    expect(store.employments.get(employment.id)!.status).not.toBe('active');
  });

  test('employment: cancel-job-offer withdraws an open offer (module: employment)', async () => {
    const employer = await mkAgent({ balance: 200 });
    const offer = await createJobOffer({
      employerId: employer.id,
      salary: 20,
      duration: 5,
      paymentType: 'on_completion',
      escrowAmount: 0,
      status: 'open',
      x: employer.x,
      y: employer.y,
      createdAtTick: 0,
    });

    const result = await h.cancelJobOffer(
      intent(employer.id, 'cancel_job_offer', { jobOfferId: offer.id }),
      employer
    );
    expect(result.success).toBe(true);
    expect(store.jobOffers.get(offer.id)!.status).not.toBe('open');
  });

  test('credentials: revoke-credential by issuer (module: credentials)', async () => {
    const issuer = await mkAgent();
    const subject = await mkAgent({ x: 5, y: 6 });
    const cred = await createCredential({
      tick: 1,
      issuerId: issuer.id,
      issuerSignature: 'sig',
      subjectId: subject.id,
      claimType: 'skill',
      claimDescription: 'Good trader',
    });

    const result = await h.revokeCredential(
      intent(issuer.id, 'revoke_credential', { credentialId: cred.id, reason: 'mistake' }),
      issuer
    );
    expect(result.success).toBe(true);
    expect(store.agentCredentials.get(cred.id)!.revoked).toBe(true);
  });

  test('knowledge: share-info about a known third agent (module: knowledge)', async () => {
    const sharer = await mkAgent({ x: 5, y: 5 });
    const target = await mkAgent({ x: 5, y: 5 });
    const subject = await mkAgent({ x: 40, y: 40 });
    // Precondition: sharer must already know the subject.
    await recordDirectDiscovery(sharer.id, subject.id, { x: 40, y: 40 }, 0);

    const result = await h.shareInfo(
      intent(sharer.id, 'share_info', {
        targetAgentId: target.id,
        subjectAgentId: subject.id,
        infoType: 'location',
      }),
      sharer
    );
    expect(result.success).toBe(true);
    // The target now knows about the subject (referral knowledge recorded).
    const targetKnows = [...store.agentKnowledge.values()].some(
      (k) => k.agentId === target.id && k.knownAgentId === subject.id
    );
    expect(targetKnows).toBe(true);
  });

  test('reproduction: spawn-offspring begins gestation (module: reproduction)', async () => {
    const agent = await mkAgent({ balance: 1000, energy: 100, health: 100 });
    const result = await h.spawnOffspring(
      intent(agent.id, 'spawn_offspring', { mutationIntensity: 0.1 }),
      agent
    );
    expect(result.success).toBe(true);
    // A gestating reproduction state was created.
    expect([...store.reproductionStates.values()].some((r) => r.parentAgentId === agent.id)).toBe(true);
  });

  test('conflict: steal items from an adjacent agent (modules: roles + inventory)', async () => {
    const thief = await mkAgent({ x: 7, y: 7, energy: 100 });
    const victim = await mkAgent({ x: 7, y: 7 });
    await addToInventory(victim.id, 'food', 3);

    const result = await h.steal(
      intent(thief.id, 'steal', { targetAgentId: victim.id, targetItemType: 'food', quantity: 2 }),
      thief
    );
    // Theft success is probabilistic (random() < successRate): a successful
    // theft returns success:true and moves items; a failed (caught) attempt
    // returns success:false. Both run on the in-memory store. The seed makes
    // the outcome deterministic; assert the invariants that hold either way.
    const victimFood = [...store.inventory.values()].find((i) => i.agentId === victim.id && i.itemType === 'food');
    const thiefFood = [...store.inventory.values()].find((i) => i.agentId === thief.id && i.itemType === 'food');
    // Inventory module conserves items regardless of outcome.
    expect((victimFood?.quantity ?? 0) + (thiefFood?.quantity ?? 0)).toBe(3);
    if (result.success) {
      // Successful theft: items transferred + roles module recorded the act.
      expect(thiefFood?.quantity).toBe(2);
      expect(store.retaliationChains.length).toBeGreaterThan(0);
    }
  });

  test('conflict: deceive plants false info in an adjacent agent (module: relationships)', async () => {
    const liar = await mkAgent({ x: 2, y: 2 });
    const victim = await mkAgent({ x: 2, y: 2 });

    const result = await h.deceive(
      intent(liar.id, 'deceive', {
        targetAgentId: victim.id,
        claim: 'There is abundant food to the north',
        claimType: 'resource_location',
      }),
      liar
    );
    expect(result.success).toBe(true);
    // A memory of the lie was stored for the liar.
    expect([...store.memories.values()].some((m) => m.agentId === liar.id)).toBe(true);
  });

  test('puzzles: full team flow form → join → share-fragment → leave (module: puzzles)', async () => {
    const a = await mkAgent({ x: 1, y: 1, balance: 100, energy: 100 });
    const b = await mkAgent({ x: 1, y: 1, balance: 100, energy: 100 });
    const game = await createPuzzleGame({
      gameType: 'coordinates',
      status: 'active',
      solution: '9,9',
      entryStake: 5,
      maxParticipants: 10,
      minParticipants: 2,
      fragmentCount: 2,
      createdAtTick: 0,
    });
    await addPuzzleParticipant({ gameId: game.id, agentId: a.id, stakedAmount: 5, joinedAtTick: 0, status: 'active' });
    await addPuzzleParticipant({ gameId: game.id, agentId: b.id, stakedAmount: 5, joinedAtTick: 0, status: 'active' });

    // form-team (A leads)
    const form = await h.formTeam(intent(a.id, 'form_team', { gameId: game.id, teamName: 'Solvers' }), a);
    expect(form.success).toBe(true);
    expect(store.puzzleTeams.size).toBe(1);
    const teamId = [...store.puzzleTeams.values()][0].id;

    // join-team (B joins)
    const join = await h.joinTeam(intent(b.id, 'join_team', { teamId }), b);
    expect(join.success).toBe(true);

    // share-fragment (A shares a fragment with B)
    const [fragment] = await createPuzzleFragments([
      { gameId: game.id, fragmentIndex: 0, content: 'secret-piece' },
    ]);
    await assignFragmentToAgent(fragment.id, a.id);
    const share = await h.shareFragment(
      intent(a.id, 'share_fragment', { fragmentId: fragment.id, targetAgentId: b.id }),
      a
    );
    expect(share.success).toBe(true);
    expect((store.puzzleFragments.get(fragment.id)!.sharedWith as string[])).toContain(b.id);

    // leave-puzzle (B leaves)
    const leave = await h.leavePuzzle(intent(b.id, 'leave_puzzle', { gameId: game.id }), b);
    expect(leave.success).toBe(true);
    const participantB = [...store.puzzleParticipants.values()].find((p) => p.agentId === b.id)!;
    expect(participantB.status).toBe('left');
  });

  test('no PostgreSQL/Redis is ever loaded by this handler set', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (p) => p.includes('/db/index') || /node_modules\/postgres\//.test(p) || p.includes('/cache/index')
    );
    expect(offenders).toEqual([]);
  });
});
