/**
 * Phase 1 — Real handlers that exercise the 9 newly ported query modules.
 *
 * Mocks the ENTIRE data layer (`db/queries/*` + `world/scent`) to the in-memory
 * implementations, then runs the actual production handlers for employment,
 * claims, credentials, gossip, puzzles and conflict — proving the new modules
 * are drop-in replacements and that no PostgreSQL/Redis is ever loaded.
 */

import { describe, expect, test, beforeEach, beforeAll, mock } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { resetStore, store } from '../../engine-memory/store';
import { setSeed } from '../../utils/random';
import { createAgent } from '../../engine-memory/queries/agents';
import { createPuzzleGame } from '../../engine-memory/queries/puzzles';
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
mock.module('../../db/queries/puzzles', () => import('../../engine-memory/queries/puzzles'));
mock.module('../../world/scent', () => import('../../engine-memory/scent'));

let handleOfferJob: typeof import('../../actions/handlers/offer-job').handleOfferJob;
let handleAcceptJob: typeof import('../../actions/handlers/accept-job').handleAcceptJob;
let handleClaim: typeof import('../../actions/handlers/claim').handleClaim;
let handleIssueCredential: typeof import('../../actions/handlers/issue-credential').handleIssueCredential;
let handleSpreadGossip: typeof import('../../actions/handlers/spread-gossip').handleSpreadGossip;
let handleJoinPuzzle: typeof import('../../actions/handlers/join-puzzle').handleJoinPuzzle;
let handleHarm: typeof import('../../actions/handlers/harm').handleHarm;

beforeAll(async () => {
  ({ handleOfferJob } = await import('../../actions/handlers/offer-job'));
  ({ handleAcceptJob } = await import('../../actions/handlers/accept-job'));
  ({ handleClaim } = await import('../../actions/handlers/claim'));
  ({ handleIssueCredential } = await import('../../actions/handlers/issue-credential'));
  ({ handleSpreadGossip } = await import('../../actions/handlers/spread-gossip'));
  ({ handleJoinPuzzle } = await import('../../actions/handlers/join-puzzle'));
  ({ handleHarm } = await import('../../actions/handlers/harm'));
});

const intent = <T>(agentId: string, type: ActionType, params: T, tick = 1) => ({
  agentId,
  type,
  params,
  tick,
  timestamp: Date.now(),
});

describe('real handlers on the 9 ported in-memory modules', () => {
  beforeEach(() => {
    resetStore();
    setSeed('engine-memory-extended'); // deterministic RNG for probabilistic handlers (harm)
  });

  test('employment: offer-job → accept-job (module: employment)', async () => {
    const employer = await createAgent({ id: uuid(), llmType: 'claude', x: 5, y: 5, balance: 100 });
    const worker = await createAgent({ id: uuid(), llmType: 'gemini', x: 6, y: 5, balance: 50 });

    const offer = await handleOfferJob(
      intent(employer.id, 'offer_job', {
        salary: 20,
        duration: 5,
        paymentType: 'on_completion',
        escrowPercent: 0,
      }),
      employer
    );
    expect(offer.success).toBe(true);
    expect(store.jobOffers.size).toBe(1);

    const jobOfferId = [...store.jobOffers.values()][0].id;
    const accept = await handleAcceptJob(
      intent(worker.id, 'accept_job', { jobOfferId }),
      worker
    );
    expect(accept.success).toBe(true);
    expect(store.employments.size).toBe(1);
    // accept-job updates trust both ways → relationships module exercised.
    expect(store.relationships.size).toBe(2);
  });

  test('claims: claim current position (module: claims)', async () => {
    const agent = await createAgent({ id: uuid(), llmType: 'codex', x: 12, y: 12 });

    const result = await handleClaim(
      intent(agent.id, 'claim', { claimType: 'home', description: 'my base' }),
      agent
    );

    expect(result.success).toBe(true);
    expect(store.agentClaims.size).toBe(1);
    const claim = [...store.agentClaims.values()][0];
    expect(claim.agentId).toBe(agent.id);
    expect(claim.claimType).toBe('home');
  });

  test('credentials: issue a credential to a nearby agent (module: credentials)', async () => {
    const issuer = await createAgent({ id: uuid(), llmType: 'claude', x: 8, y: 8, energy: 100 });
    const subject = await createAgent({ id: uuid(), llmType: 'gemini', x: 8, y: 8 });

    const result = await handleIssueCredential(
      intent(issuer.id, 'issue_credential', {
        subjectAgentId: subject.id,
        claimType: 'skill',
        description: 'Excellent forager',
      }),
      issuer
    );

    expect(result.success).toBe(true);
    expect(store.agentCredentials.size).toBe(1);
    const cred = [...store.agentCredentials.values()][0];
    expect(cred.issuerId).toBe(issuer.id);
    expect(cred.subjectId).toBe(subject.id);
  });

  test('gossip: spread gossip to a nearby agent (module: gossip)', async () => {
    const source = await createAgent({ id: uuid(), llmType: 'claude', x: 3, y: 3, energy: 100 });
    const target = await createAgent({ id: uuid(), llmType: 'gemini', x: 3, y: 3 });
    const subject = await createAgent({ id: uuid(), llmType: 'codex', x: 30, y: 30 });

    const result = await handleSpreadGossip(
      intent(source.id, 'spread_gossip', {
        targetAgentId: target.id,
        subjectAgentId: subject.id,
        topic: 'warning',
        claim: 'That agent stole from me',
        sentiment: -60,
      }),
      source
    );

    expect(result.success).toBe(true);
    expect(store.gossipEvents.length).toBe(1);
    expect(store.gossipEvents[0].sentiment).toBe(-60);
  });

  test('puzzles: join an open puzzle game (module: puzzles)', async () => {
    const agent = await createAgent({ id: uuid(), llmType: 'claude', x: 1, y: 1, balance: 100 });
    const game = await createPuzzleGame({
      gameType: 'coordinates',
      status: 'open',
      solution: '42,42',
      entryStake: 5,
      maxParticipants: 10,
      minParticipants: 2,
      fragmentCount: 5,
      createdAtTick: 0,
    });

    const result = await handleJoinPuzzle(
      intent(agent.id, 'join_puzzle', { gameId: game.id, stakeAmount: 5 }),
      agent
    );

    expect(result.success).toBe(true);
    expect(store.puzzleParticipants.size).toBe(1);
    const participant = [...store.puzzleParticipants.values()][0];
    expect(participant.agentId).toBe(agent.id);
    expect(participant.gameId).toBe(game.id);
  });

  test('conflict: harm an adjacent agent (modules: roles + agents)', async () => {
    const attacker = await createAgent({ id: uuid(), llmType: 'claude', x: 7, y: 7, energy: 100, health: 100 });
    const victim = await createAgent({ id: uuid(), llmType: 'gemini', x: 7, y: 7, health: 1 });

    const result = await handleHarm(
      intent(attacker.id, 'harm', { targetAgentId: victim.id, intensity: 'severe' }),
      attacker
    );

    // harm is probabilistic (hit vs miss); with a fixed seed the outcome is
    // deterministic. Both branches run on the in-memory store: energy is
    // consumed and the victim→attacker relationship is recorded regardless.
    expect(result.changes?.energy).toBeLessThan(100);
    expect(store.relationships.size).toBeGreaterThan(0);
    if (result.success) {
      // Hit: damage applied (agents module) + retaliation chain (roles module).
      expect(store.agents.get(victim.id)!.health).toBeLessThan(1);
      expect(store.retaliationChains.length).toBeGreaterThan(0);
    }
  });

  test('the Node-only postgres driver is never loaded by any of these handlers', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter((p) => p.includes('/db/index') || /node_modules\/postgres\//.test(p));
    expect(offenders).toEqual([]);
  });
});
