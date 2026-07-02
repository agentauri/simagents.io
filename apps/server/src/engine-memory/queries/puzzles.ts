/**
 * Puzzle System Queries (Fragment Chase) — in-memory implementation.
 *
 * Signature-compatible with `db/queries/puzzles.ts`. Backed by the shared
 * in-memory store; no DB/Redis connection is ever opened.
 *
 * Supports the collaborative puzzle game where agents must share
 * information fragments to solve puzzles and win prizes.
 */

import { v4 as uuid } from 'uuid';
import { store } from '../store';
import type {
  PuzzleGame,
  NewPuzzleGame,
  PuzzleTeam,
  NewPuzzleTeam,
  PuzzleFragment,
  NewPuzzleFragment,
  PuzzleParticipant,
  NewPuzzleParticipant,
  PuzzleAttempt,
  NewPuzzleAttempt,
} from '../../db/schema';
import { isValidUUID } from '../../utils/validators';

// =============================================================================
// PUZZLE GAMES
// =============================================================================

/**
 * Build a tenant filter predicate for puzzle game queries.
 *
 * - undefined: no filter (return all)
 * - null: return only NULL tenant games
 * - string (valid UUID): return matching tenant games AND NULL tenant games (global puzzles)
 * - string (invalid UUID): treated as null (return only NULL tenant games)
 */
function buildTenantPredicate(
  tenantId: string | null | undefined
): ((game: PuzzleGame) => boolean) | null {
  if (tenantId === undefined) return null;
  if (tenantId === null) return (game) => game.tenantId === null;
  if (!isValidUUID(tenantId)) {
    console.warn(`[Puzzles] Invalid tenant UUID "${tenantId}", treating as null`);
    return (game) => game.tenantId === null;
  }
  return (game) => game.tenantId === tenantId || game.tenantId === null;
}

/**
 * Create a new puzzle game
 */
export async function createPuzzleGame(game: NewPuzzleGame): Promise<PuzzleGame> {
  const created: PuzzleGame = {
    id: game.id ?? uuid(),
    tenantId: game.tenantId ?? null,
    gameType: game.gameType,
    status: game.status ?? 'open',
    solution: game.solution,
    solutionHash: game.solutionHash ?? null,
    prizePool: game.prizePool ?? 0,
    entryStake: game.entryStake ?? 5,
    maxParticipants: game.maxParticipants ?? 10,
    minParticipants: game.minParticipants ?? 2,
    fragmentCount: game.fragmentCount ?? 5,
    createdAtTick: game.createdAtTick,
    startsAtTick: game.startsAtTick ?? null,
    endsAtTick: game.endsAtTick ?? null,
    winnerId: game.winnerId ?? null,
    createdAt: game.createdAt ?? new Date(),
  };
  store.puzzleGames.set(created.id, created);
  return created;
}

/**
 * Get puzzle game by ID
 */
export async function getPuzzleGameById(id: string): Promise<PuzzleGame | undefined> {
  return store.puzzleGames.get(id);
}

/**
 * Get all active puzzle games (open or active status)
 */
export async function getActivePuzzleGames(tenantId?: string | null): Promise<PuzzleGame[]> {
  const tenantPredicate = buildTenantPredicate(tenantId);
  return [...store.puzzleGames.values()].filter(
    (g) =>
      (g.status === 'open' || g.status === 'active') &&
      (tenantPredicate ? tenantPredicate(g) : true)
  );
}

/**
 * Get open puzzle games that can be joined
 */
export async function getOpenPuzzleGames(tenantId?: string | null): Promise<PuzzleGame[]> {
  const tenantPredicate = buildTenantPredicate(tenantId);
  return [...store.puzzleGames.values()].filter(
    (g) => g.status === 'open' && (tenantPredicate ? tenantPredicate(g) : true)
  );
}

/**
 * Update puzzle game status
 */
export async function updatePuzzleGameStatus(
  id: string,
  status: 'open' | 'active' | 'completed' | 'expired'
): Promise<void> {
  const game = store.puzzleGames.get(id);
  if (!game) return;
  store.puzzleGames.set(id, { ...game, status });
}

/**
 * Set puzzle game winner
 */
export async function setPuzzleGameWinner(id: string, winnerId: string): Promise<void> {
  const game = store.puzzleGames.get(id);
  if (!game) return;
  store.puzzleGames.set(id, { ...game, winnerId, status: 'completed' });
}

/**
 * Add to puzzle game prize pool
 */
export async function addToPrizePool(id: string, amount: number): Promise<void> {
  const game = store.puzzleGames.get(id);
  if (!game) return;
  store.puzzleGames.set(id, { ...game, prizePool: game.prizePool + amount });
}

/**
 * Expire puzzle games past their end tick
 */
export async function expirePuzzleGames(currentTick: number): Promise<number> {
  const gamesToExpire = [...store.puzzleGames.values()].filter(
    (g) =>
      (g.status === 'open' || g.status === 'active') &&
      g.endsAtTick !== null &&
      g.endsAtTick <= currentTick
  );

  if (gamesToExpire.length === 0) return 0;

  for (const game of gamesToExpire) {
    store.puzzleGames.set(game.id, { ...game, status: 'expired' });
  }

  return gamesToExpire.length;
}

/**
 * Get puzzle game with participant count
 */
export async function getPuzzleGameWithParticipantCount(
  id: string
): Promise<(PuzzleGame & { participantCount: number }) | undefined> {
  const game = store.puzzleGames.get(id);
  if (!game) return undefined;

  const participants = [...store.puzzleParticipants.values()].filter(
    (p) => p.gameId === id && p.status === 'active'
  );

  return { ...game, participantCount: participants.length };
}

// =============================================================================
// PUZZLE TEAMS
// =============================================================================

/**
 * Create a new puzzle team
 */
export async function createPuzzleTeam(team: NewPuzzleTeam): Promise<PuzzleTeam> {
  const created: PuzzleTeam = {
    id: team.id ?? uuid(),
    gameId: team.gameId,
    leaderId: team.leaderId,
    name: team.name ?? null,
    totalStake: team.totalStake ?? 0,
    status: team.status ?? 'forming',
    createdAtTick: team.createdAtTick,
    createdAt: team.createdAt ?? new Date(),
  };
  store.puzzleTeams.set(created.id, created);
  return created;
}

/**
 * Get puzzle team by ID
 */
export async function getPuzzleTeamById(id: string): Promise<PuzzleTeam | undefined> {
  return store.puzzleTeams.get(id);
}

/**
 * Get teams for a puzzle game
 */
export async function getTeamsForGame(gameId: string): Promise<PuzzleTeam[]> {
  return [...store.puzzleTeams.values()].filter((t) => t.gameId === gameId);
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId: string): Promise<PuzzleParticipant[]> {
  return [...store.puzzleParticipants.values()].filter(
    (p) => p.teamId === teamId && p.status === 'active'
  );
}

/**
 * Update team status
 */
export async function updateTeamStatus(
  id: string,
  status: 'forming' | 'active' | 'won' | 'lost'
): Promise<void> {
  const team = store.puzzleTeams.get(id);
  if (!team) return;
  store.puzzleTeams.set(id, { ...team, status });
}

/**
 * Update team total stake
 */
export async function updateTeamTotalStake(id: string, totalStake: number): Promise<void> {
  const team = store.puzzleTeams.get(id);
  if (!team) return;
  store.puzzleTeams.set(id, { ...team, totalStake });
}

/**
 * Get agent's team in a game
 */
export async function getAgentTeamInGame(
  agentId: string,
  gameId: string
): Promise<PuzzleTeam | undefined> {
  const participant = [...store.puzzleParticipants.values()].find(
    (p) => p.agentId === agentId && p.gameId === gameId && p.status === 'active'
  );

  if (!participant?.teamId) return undefined;

  return store.puzzleTeams.get(participant.teamId);
}

// =============================================================================
// PUZZLE FRAGMENTS
// =============================================================================

/**
 * Create puzzle fragments
 */
export async function createPuzzleFragments(
  fragments: NewPuzzleFragment[]
): Promise<PuzzleFragment[]> {
  return fragments.map((fragment) => {
    const created: PuzzleFragment = {
      id: fragment.id ?? uuid(),
      gameId: fragment.gameId,
      fragmentIndex: fragment.fragmentIndex,
      content: fragment.content,
      hint: fragment.hint ?? null,
      ownerId: fragment.ownerId ?? null,
      originalOwnerId: fragment.originalOwnerId ?? null,
      sharedWith: fragment.sharedWith ?? [],
      createdAt: fragment.createdAt ?? new Date(),
    };
    store.puzzleFragments.set(created.id, created);
    return created;
  });
}

/**
 * Get fragment by ID
 */
export async function getFragmentById(id: string): Promise<PuzzleFragment | undefined> {
  return store.puzzleFragments.get(id);
}

/**
 * Get all fragments for a game
 */
export async function getFragmentsForGame(gameId: string): Promise<PuzzleFragment[]> {
  return [...store.puzzleFragments.values()].filter((f) => f.gameId === gameId);
}

/**
 * Get fragments owned by an agent
 */
export async function getFragmentsOwnedByAgent(agentId: string): Promise<PuzzleFragment[]> {
  return [...store.puzzleFragments.values()].filter((f) => f.ownerId === agentId);
}

/**
 * Get fragments for an agent in a specific game
 */
export async function getAgentFragmentsInGame(
  agentId: string,
  gameId: string
): Promise<PuzzleFragment[]> {
  return [...store.puzzleFragments.values()].filter(
    (f) => f.ownerId === agentId && f.gameId === gameId
  );
}

/**
 * Assign fragment to an agent
 */
export async function assignFragmentToAgent(
  fragmentId: string,
  agentId: string,
  isOriginal: boolean = false
): Promise<void> {
  const fragment = store.puzzleFragments.get(fragmentId);
  if (!fragment) return;
  const updated: PuzzleFragment = { ...fragment, ownerId: agentId };
  if (isOriginal) {
    updated.originalOwnerId = agentId;
  }
  store.puzzleFragments.set(fragmentId, updated);
}

/**
 * Clear fragment ownership (return to pool)
 */
export async function clearFragmentOwner(fragmentId: string): Promise<void> {
  const fragment = store.puzzleFragments.get(fragmentId);
  if (!fragment) return;
  store.puzzleFragments.set(fragmentId, { ...fragment, ownerId: null });
}

/**
 * Mark fragment as shared with another agent.
 *
 * Mirrors the atomic JSONB append in the DB version: append the agent id to
 * `sharedWith` only if not already present.
 */
export async function markFragmentShared(
  fragmentId: string,
  sharedWithAgentId: string
): Promise<void> {
  const fragment = store.puzzleFragments.get(fragmentId);
  if (!fragment) return;
  const sharedWith = (fragment.sharedWith as string[]) || [];
  if (sharedWith.includes(sharedWithAgentId)) return;
  store.puzzleFragments.set(fragmentId, {
    ...fragment,
    sharedWith: [...sharedWith, sharedWithAgentId],
  });
}

/**
 * Get fragments shared with an agent (not owned but received)
 */
export async function getFragmentsSharedWithAgent(
  agentId: string,
  gameId: string
): Promise<PuzzleFragment[]> {
  const allFragments = await getFragmentsForGame(gameId);
  return allFragments.filter((f) => {
    const sharedWith = (f.sharedWith as string[]) || [];
    return sharedWith.includes(agentId) && f.ownerId !== agentId;
  });
}

// =============================================================================
// PUZZLE PARTICIPANTS
// =============================================================================

/**
 * Add participant to a puzzle game
 */
export async function addPuzzleParticipant(
  participant: NewPuzzleParticipant
): Promise<PuzzleParticipant> {
  const created: PuzzleParticipant = {
    id: participant.id ?? uuid(),
    gameId: participant.gameId,
    agentId: participant.agentId,
    teamId: participant.teamId ?? null,
    stakedAmount: participant.stakedAmount ?? 0,
    contributionScore: participant.contributionScore ?? 0,
    fragmentsReceived: participant.fragmentsReceived ?? 0,
    fragmentsShared: participant.fragmentsShared ?? 0,
    attemptsMade: participant.attemptsMade ?? 0,
    joinedAtTick: participant.joinedAtTick,
    status: participant.status ?? 'active',
    createdAt: participant.createdAt ?? new Date(),
  };
  store.puzzleParticipants.set(created.id, created);
  return created;
}

/**
 * Get participant by agent and game
 */
export async function getParticipant(
  agentId: string,
  gameId: string
): Promise<PuzzleParticipant | undefined> {
  return [...store.puzzleParticipants.values()].find(
    (p) => p.agentId === agentId && p.gameId === gameId
  );
}

/**
 * Get all active participants for a game
 */
export async function getActiveParticipantsForGame(gameId: string): Promise<PuzzleParticipant[]> {
  return [...store.puzzleParticipants.values()].filter(
    (p) => p.gameId === gameId && p.status === 'active'
  );
}

/**
 * Update participant status
 */
export async function updateParticipantStatus(
  id: string,
  status: 'active' | 'left' | 'banned'
): Promise<void> {
  const participant = store.puzzleParticipants.get(id);
  if (!participant) return;
  store.puzzleParticipants.set(id, { ...participant, status });
}

/**
 * Join participant to a team
 */
export async function joinParticipantToTeam(participantId: string, teamId: string): Promise<void> {
  const participant = store.puzzleParticipants.get(participantId);
  if (!participant) return;
  store.puzzleParticipants.set(participantId, { ...participant, teamId });
}

/**
 * Increment fragments shared count
 */
export async function incrementFragmentsShared(participantId: string): Promise<void> {
  const participant = store.puzzleParticipants.get(participantId);
  if (!participant) return;
  store.puzzleParticipants.set(participantId, {
    ...participant,
    fragmentsShared: participant.fragmentsShared + 1,
  });
}

/**
 * Increment attempts made count
 */
export async function incrementAttemptsMade(participantId: string): Promise<void> {
  const participant = store.puzzleParticipants.get(participantId);
  if (!participant) return;
  store.puzzleParticipants.set(participantId, {
    ...participant,
    attemptsMade: participant.attemptsMade + 1,
  });
}

/**
 * Update contribution score
 */
export async function updateContributionScore(
  participantId: string,
  score: number
): Promise<void> {
  const participant = store.puzzleParticipants.get(participantId);
  if (!participant) return;
  store.puzzleParticipants.set(participantId, { ...participant, contributionScore: score });
}

/**
 * Add to contribution score
 */
export async function addContributionScore(participantId: string, amount: number): Promise<void> {
  const participant = store.puzzleParticipants.get(participantId);
  if (!participant) return;
  store.puzzleParticipants.set(participantId, {
    ...participant,
    contributionScore: participant.contributionScore + amount,
  });
}

/**
 * Get all active puzzle participations for an agent
 */
export async function getAgentActivePuzzleParticipations(
  agentId: string
): Promise<PuzzleParticipant[]> {
  return [...store.puzzleParticipants.values()].filter(
    (p) => p.agentId === agentId && p.status === 'active'
  );
}

/**
 * Check if agent is participating in any active puzzle
 */
export async function isAgentInActivePuzzle(agentId: string): Promise<boolean> {
  const participations = await getAgentActivePuzzleParticipations(agentId);
  if (participations.length === 0) return false;

  // Check if any of these games are still active
  const gameIds = new Set(participations.map((p) => p.gameId));
  const games = [...store.puzzleGames.values()].filter(
    (g) => gameIds.has(g.id) && (g.status === 'open' || g.status === 'active')
  );

  return games.length > 0;
}

/**
 * Get current active puzzle game for an agent (if any)
 */
export async function getAgentActivePuzzleGame(agentId: string): Promise<PuzzleGame | undefined> {
  const participations = await getAgentActivePuzzleParticipations(agentId);
  if (participations.length === 0) return undefined;

  const gameIds = new Set(participations.map((p) => p.gameId));
  return [...store.puzzleGames.values()].find(
    (g) => gameIds.has(g.id) && (g.status === 'open' || g.status === 'active')
  );
}

// =============================================================================
// PUZZLE ATTEMPTS
// =============================================================================

/**
 * Record a solution attempt
 */
export async function recordPuzzleAttempt(attempt: NewPuzzleAttempt): Promise<PuzzleAttempt> {
  const created: PuzzleAttempt = {
    id: attempt.id ?? uuid(),
    gameId: attempt.gameId,
    submitterId: attempt.submitterId,
    teamId: attempt.teamId ?? null,
    attemptedSolution: attempt.attemptedSolution,
    isCorrect: attempt.isCorrect ?? false,
    submittedAtTick: attempt.submittedAtTick,
    createdAt: attempt.createdAt ?? new Date(),
  };
  store.puzzleAttempts.set(created.id, created);
  return created;
}

/**
 * Get attempts for a game
 */
export async function getAttemptsForGame(gameId: string): Promise<PuzzleAttempt[]> {
  return [...store.puzzleAttempts.values()].filter((a) => a.gameId === gameId);
}

/**
 * Get attempts by an agent
 */
export async function getAttemptsByAgent(
  agentId: string,
  gameId: string
): Promise<PuzzleAttempt[]> {
  return [...store.puzzleAttempts.values()].filter(
    (a) => a.submitterId === agentId && a.gameId === gameId
  );
}

/**
 * Get correct attempt (winning submission)
 */
export async function getWinningAttempt(gameId: string): Promise<PuzzleAttempt | undefined> {
  return [...store.puzzleAttempts.values()].find((a) => a.gameId === gameId && a.isCorrect === true);
}

// =============================================================================
// COMBINED / CONTEXT QUERIES
// =============================================================================

/**
 * Get full puzzle context for an agent (for LLM prompt)
 */
export async function getAgentPuzzleContext(
  agentId: string,
  tenantId?: string | null
): Promise<{
  activePuzzleGames: (PuzzleGame & { participantCount: number; isParticipating: boolean })[];
  myFragments: PuzzleFragment[];
  myTeam: PuzzleTeam | undefined;
  currentGameId: string | undefined;
}> {
  // Get active games
  const activeGames = await getActivePuzzleGames(tenantId);

  // Get agent's participations
  const participations = await getAgentActivePuzzleParticipations(agentId);
  const participatingGameIds = new Set(participations.map((p) => p.gameId));

  // Get participant counts for each game
  const gamesWithCounts = await Promise.all(
    activeGames.map(async (game) => {
      const participants = await getActiveParticipantsForGame(game.id);
      return {
        ...game,
        participantCount: participants.length,
        isParticipating: participatingGameIds.has(game.id),
      };
    })
  );

  // Get agent's fragments (across all active games)
  const myFragments = await getFragmentsOwnedByAgent(agentId);

  // Get agent's current team (if in a game)
  let myTeam: PuzzleTeam | undefined;
  let currentGameId: string | undefined;

  if (participations.length > 0) {
    currentGameId = participations[0].gameId;
    if (participations[0].teamId) {
      myTeam = await getPuzzleTeamById(participations[0].teamId);
    }
  }

  return {
    activePuzzleGames: gamesWithCounts,
    myFragments,
    myTeam,
    currentGameId,
  };
}

/**
 * Calculate contribution score for reward distribution
 */
export async function calculateContributionScores(gameId: string): Promise<void> {
  const participants = await getActiveParticipantsForGame(gameId);
  const fragments = await getFragmentsForGame(gameId);
  const attempts = await getAttemptsForGame(gameId);

  for (const participant of participants) {
    let score = 0;

    // Score for fragments shared (0.3 per share)
    score += participant.fragmentsShared * 0.3;

    // Score for being original owner of fragments that were shared
    const ownedFragments = fragments.filter((f) => f.originalOwnerId === participant.agentId);
    for (const fragment of ownedFragments) {
      const sharedCount = ((fragment.sharedWith as string[]) || []).length;
      if (sharedCount > 0) {
        score += 0.2; // Bonus for sharing your own fragment
      }
    }

    // Score for attempts (showing engagement)
    const agentAttempts = attempts.filter((a) => a.submitterId === participant.agentId);
    score += Math.min(agentAttempts.length * 0.1, 0.3); // Cap at 0.3

    // Bonus for correct submission
    const correctAttempt = agentAttempts.find((a) => a.isCorrect);
    if (correctAttempt) {
      score += 0.25;
    }

    await updateContributionScore(participant.id, score);
  }
}

/**
 * Clear all puzzle data (for world reset)
 */
export async function clearAllPuzzles(): Promise<void> {
  store.puzzleAttempts.clear();
  store.puzzleParticipants.clear();
  store.puzzleFragments.clear();
  store.puzzleTeams.clear();
  store.puzzleGames.clear();
}
