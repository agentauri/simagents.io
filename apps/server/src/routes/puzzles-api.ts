/**
 * Puzzle Games API Routes
 *
 * Provides endpoints for viewing puzzle games, their participants,
 * fragments, teams, and results.
 */

import type { FastifyInstance } from 'fastify';
import {
  getActivePuzzleGames,
  getPuzzleGameById,
  getActiveParticipantsForGame,
  getFragmentsForGame,
  getTeamsForGame,
  getTeamMembers,
  getAttemptsForGame,
  getWinningAttempt,
} from '../db/queries/puzzles';
import { getAgentById } from '../db/queries/agents';
import { db } from '../db';
import { puzzleGames, puzzleParticipants, agents } from '../db/schema';
import { eq, or, desc, inArray, sql, count } from 'drizzle-orm';

/**
 * Batch fetch agents by IDs to avoid N+1 queries
 */
async function batchGetAgents(agentIds: string[]): Promise<Map<string, { id: string; llmType: string; color: string | null }>> {
  if (agentIds.length === 0) return new Map();

  const uniqueIds = [...new Set(agentIds)];
  const results = await db
    .select({ id: agents.id, llmType: agents.llmType, color: agents.color })
    .from(agents)
    .where(inArray(agents.id, uniqueIds));

  return new Map(results.map(a => [a.id, a]));
}

/**
 * Get participant counts for multiple games in a single query
 */
async function batchGetParticipantCounts(gameIds: string[]): Promise<Map<string, number>> {
  if (gameIds.length === 0) return new Map();

  const results = await db
    .select({
      gameId: puzzleParticipants.gameId,
      count: count(),
    })
    .from(puzzleParticipants)
    .where(
      sql`${puzzleParticipants.gameId} IN ${gameIds} AND ${puzzleParticipants.status} = 'active'`
    )
    .groupBy(puzzleParticipants.gameId);

  return new Map(results.map(r => [r.gameId, r.count]));
}

export async function registerPuzzlesRoutes(server: FastifyInstance): Promise<void> {
  // =============================================================================
  // GET /api/puzzles - List all puzzle games
  // =============================================================================
  server.get<{
    Querystring: { status?: string; limit?: string; offset?: string };
  }>('/api/puzzles', {
    schema: {
      description: 'List all puzzle games with optional status filter',
      tags: ['Puzzles'],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'active', 'completed', 'expired'],
            description: 'Filter by status (default: all)',
          },
          limit: { type: 'string', description: 'Max results (default: 50)' },
          offset: { type: 'string', description: 'Offset for pagination (default: 0)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  gameType: { type: 'string' },
                  status: { type: 'string' },
                  prizePool: { type: 'number' },
                  entryStake: { type: 'number' },
                  startsAtTick: { type: 'number' },
                  endsAtTick: { type: 'number' },
                  participantCount: { type: 'number' },
                  fragmentCount: { type: 'number' },
                  winnerId: { type: 'string', nullable: true },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const status = request.query.status || 'all';
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    let games;
    if (status === 'active') {
      games = await getActivePuzzleGames();
    } else if (status === 'all') {
      games = await db.select().from(puzzleGames).orderBy(desc(puzzleGames.startsAtTick)).limit(limit).offset(offset);
    } else {
      games = await db
        .select()
        .from(puzzleGames)
        .where(eq(puzzleGames.status, status as 'open' | 'active' | 'completed' | 'expired'))
        .orderBy(desc(puzzleGames.startsAtTick))
        .limit(limit)
        .offset(offset);
    }

    // Get participant counts for all games in a single batch query
    const gameIds = games.map(g => g.id);
    const participantCounts = await batchGetParticipantCounts(gameIds);

    const puzzlesWithCounts = games.map((game) => ({
      id: game.id,
      gameType: game.gameType,
      status: game.status,
      prizePool: game.prizePool,
      entryStake: game.entryStake,
      startsAtTick: game.startsAtTick,
      endsAtTick: game.endsAtTick,
      participantCount: participantCounts.get(game.id) || 0,
      fragmentCount: game.fragmentCount,
      winnerId: game.winnerId,
    }));

    // Get total count for pagination using COUNT query instead of fetching all
    const [{ totalCount }] = await db.select({ totalCount: count() }).from(puzzleGames);
    const total = totalCount;

    return { puzzles: puzzlesWithCounts, total };
  });

  // =============================================================================
  // GET /api/puzzles/:id - Get puzzle details
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id', {
    schema: {
      description: 'Get detailed information about a specific puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzle: { type: 'object', additionalProperties: true },
            participants: { type: 'array' },
            teams: { type: 'array' },
            fragments: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const [participants, teams, fragments] = await Promise.all([
      getActiveParticipantsForGame(id),
      getTeamsForGame(id),
      getFragmentsForGame(id),
    ]);

    // Collect all agent IDs for batch fetch
    const allAgentIds: string[] = [
      ...participants.map(p => p.agentId),
      ...fragments.filter(f => f.ownerId).map(f => f.ownerId as string),
      ...fragments.filter(f => f.originalOwnerId).map(f => f.originalOwnerId as string),
      ...teams.filter(t => t.leaderId).map(t => t.leaderId as string),
    ];

    // Fetch team members and add their agent IDs
    const teamMembersMap = new Map<string, Awaited<ReturnType<typeof getTeamMembers>>>();
    for (const team of teams) {
      const members = await getTeamMembers(team.id);
      teamMembersMap.set(team.id, members);
      allAgentIds.push(...members.map(m => m.agentId));
    }

    // Batch fetch all agents
    const agentsMap = await batchGetAgents(allAgentIds);

    // Enrich participants with agent info
    const enrichedParticipants = participants.map((p) => {
      const agent = agentsMap.get(p.agentId);
      return {
        ...p,
        agentName: agent?.llmType || 'Unknown',
        agentColor: agent?.color || '#888',
      };
    });

    // Enrich teams with member info
    const enrichedTeams = teams.map((team) => {
      const members = teamMembersMap.get(team.id) || [];
      const enrichedMembers = members.map((m) => {
        const agent = agentsMap.get(m.agentId);
        return {
          agentId: m.agentId,
          agentName: agent?.llmType || 'Unknown',
          agentColor: agent?.color || '#888888',
          contributionScore: m.contributionScore,
          fragmentsShared: m.fragmentsShared ?? 0,
        };
      });
      const leader = team.leaderId ? agentsMap.get(team.leaderId) : null;
      return {
        id: team.id,
        name: team.name || `Team ${team.id.slice(0, 8)}`,
        status: team.status,
        totalStake: team.totalStake ?? 0,
        leader: leader ? { id: leader.id, name: leader.llmType } : null,
        members: enrichedMembers,
        memberCount: enrichedMembers.length,
      };
    });

    // Enrich fragments with owner info
    const enrichedFragments = fragments.map((f) => {
      const owner = f.ownerId ? agentsMap.get(f.ownerId) : null;
      const originalOwner = f.originalOwnerId ? agentsMap.get(f.originalOwnerId) : null;
      return {
        id: f.id,
        fragmentIndex: f.fragmentIndex,
        content: f.content,
        owner: owner ? { id: owner.id, name: owner.llmType, color: owner.color } : null,
        originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.llmType } : null,
        sharedWith: f.sharedWith || [],
        sharedCount: ((f.sharedWith as string[]) || []).length,
      };
    });

    return {
      puzzle: {
        id: puzzle.id,
        gameType: puzzle.gameType,
        status: puzzle.status,
        prizePool: puzzle.prizePool,
        entryStake: puzzle.entryStake,
        startsAtTick: puzzle.startsAtTick,
        endsAtTick: puzzle.endsAtTick,
        fragmentCount: puzzle.fragmentCount,
        winnerId: puzzle.winnerId,
        solution: puzzle.status === 'completed' ? puzzle.solution : null,
      },
      participants: enrichedParticipants,
      teams: enrichedTeams,
      fragments: enrichedFragments,
    };
  });

  // =============================================================================
  // GET /api/puzzles/:id/results - Get puzzle results
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/results', {
    schema: {
      description: 'Get results of a completed puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzle: { type: 'object' },
            winner: { type: 'object', nullable: true },
            attempts: { type: 'array' },
            prizeDistribution: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const [attempts, participants, winningAttempt] = await Promise.all([
      getAttemptsForGame(id),
      getActiveParticipantsForGame(id),
      puzzle.winnerId ? getWinningAttempt(id) : Promise.resolve(undefined),
    ]);

    // Collect all agent IDs and batch fetch
    const allAgentIds = [
      ...attempts.map(a => a.submitterId),
      ...participants.map(p => p.agentId),
      ...(puzzle.winnerId ? [puzzle.winnerId] : []),
    ];
    const agentsMap = await batchGetAgents(allAgentIds);

    // Enrich attempts with agent names
    const enrichedAttempts = attempts.map((a) => {
      const agent = agentsMap.get(a.submitterId);
      return {
        id: a.id,
        submitterId: a.submitterId,
        submitterName: agent?.llmType || 'Unknown',
        attemptedSolution: a.attemptedSolution,
        isCorrect: a.isCorrect,
        submittedAtTick: a.submittedAtTick,
      };
    });

    // Get winner info if exists
    let winner = null;
    if (puzzle.winnerId) {
      const winnerAgent = agentsMap.get(puzzle.winnerId);
      winner = {
        agentId: puzzle.winnerId,
        agentName: winnerAgent?.llmType || 'Unknown',
        solution: puzzle.solution,
        submittedAtTick: winningAttempt?.submittedAtTick,
      };
    }

    // Calculate prize distribution based on contribution scores
    const totalContribution = participants.reduce((sum, p) => sum + (p.contributionScore || 0), 0);
    const prizeDistribution = participants.map((p) => {
      const agent = agentsMap.get(p.agentId);
      const share = totalContribution > 0
        ? (p.contributionScore || 0) / totalContribution
        : 1 / participants.length;
      const prize = puzzle.status === 'completed' && puzzle.winnerId
        ? puzzle.prizePool * share
        : 0;

      return {
        agentId: p.agentId,
        agentName: agent?.llmType || 'Unknown',
        contributionScore: p.contributionScore || 0,
        fragmentsShared: p.fragmentsShared,
        attemptsMade: p.attemptsMade,
        prizeAmount: Math.round(prize * 100) / 100,
        isWinner: p.agentId === puzzle.winnerId,
      };
    });

    return {
      puzzle: {
        id: puzzle.id,
        gameType: puzzle.gameType,
        status: puzzle.status,
        prizePool: puzzle.prizePool,
        solution: puzzle.status === 'completed' ? puzzle.solution : null,
      },
      winner,
      attempts: enrichedAttempts,
      prizeDistribution: prizeDistribution.sort((a, b) => b.prizeAmount - a.prizeAmount),
    };
  });

  // =============================================================================
  // GET /api/puzzles/:id/fragments - Get fragments for a puzzle
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/fragments', {
    schema: {
      description: 'Get all fragments for a puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            fragments: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const fragments = await getFragmentsForGame(id);

    // Collect all agent IDs for batch fetch
    const allAgentIds: string[] = [];
    for (const f of fragments) {
      if (f.ownerId) allAgentIds.push(f.ownerId);
      if (f.originalOwnerId) allAgentIds.push(f.originalOwnerId);
      const sharedWithIds = (f.sharedWith as string[]) || [];
      allAgentIds.push(...sharedWithIds);
    }
    const agentsMap = await batchGetAgents(allAgentIds);

    const enrichedFragments = fragments.map((f) => {
      const owner = f.ownerId ? agentsMap.get(f.ownerId) : null;
      const originalOwner = f.originalOwnerId ? agentsMap.get(f.originalOwnerId) : null;
      const sharedWithIds = (f.sharedWith as string[]) || [];
      const sharedWithAgents = sharedWithIds.map((agentId) => {
        const agent = agentsMap.get(agentId);
        return {
          agentId,
          agentName: agent?.llmType || 'Unknown',
        };
      });

      return {
        id: f.id,
        fragmentIndex: f.fragmentIndex,
        content: puzzle.status === 'completed' ? f.content : '[HIDDEN]',
        owner: owner ? { id: owner.id, name: owner.llmType, color: owner.color } : null,
        originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.llmType } : null,
        sharedWith: sharedWithAgents,
      };
    });

    return { fragments: enrichedFragments };
  });

  // =============================================================================
  // GET /api/puzzles/:id/teams - Get teams for a puzzle
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/teams', {
    schema: {
      description: 'Get all teams for a puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            teams: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const teams = await getTeamsForGame(id);

    // Fetch all team members first
    const teamMembersMap = new Map<string, Awaited<ReturnType<typeof getTeamMembers>>>();
    const allAgentIds: string[] = [];
    for (const team of teams) {
      const members = await getTeamMembers(team.id);
      teamMembersMap.set(team.id, members);
      allAgentIds.push(...members.map(m => m.agentId));
      if (team.leaderId) allAgentIds.push(team.leaderId);
    }

    // Batch fetch all agents
    const agentsMap = await batchGetAgents(allAgentIds);

    const enrichedTeams = teams.map((team) => {
      const members = teamMembersMap.get(team.id) || [];
      const leader = team.leaderId ? agentsMap.get(team.leaderId) : null;

      const enrichedMembers = members.map((m) => {
        const agent = agentsMap.get(m.agentId);
        return {
          agentId: m.agentId,
          agentName: agent?.llmType || 'Unknown',
          agentColor: agent?.color || '#888',
          contributionScore: m.contributionScore,
          fragmentsShared: m.fragmentsShared,
        };
      });

      return {
        id: team.id,
        name: team.name,
        status: team.status,
        totalStake: team.totalStake,
        leader: leader ? { id: leader.id, name: leader.llmType } : null,
        members: enrichedMembers,
        memberCount: members.length,
      };
    });

    return { teams: enrichedTeams };
  });

  // =============================================================================
  // GET /api/puzzles/stats - Get overall puzzle statistics
  // =============================================================================
  server.get('/api/puzzles/stats', {
    schema: {
      description: 'Get overall puzzle game statistics',
      tags: ['Puzzles'],
      response: {
        200: {
          type: 'object',
          properties: {
            totalGames: { type: 'number' },
            activeGames: { type: 'number' },
            completedGames: { type: 'number' },
            expiredGames: { type: 'number' },
            totalPrizeDistributed: { type: 'number' },
            averageParticipants: { type: 'number' },
          },
        },
      },
    },
  }, async () => {
    // Use aggregation queries instead of loading all games into memory
    const [stats] = await db.select({
      totalGames: count(),
      activeGames: sql<number>`COUNT(*) FILTER (WHERE ${puzzleGames.status} IN ('open', 'active'))`,
      completedGames: sql<number>`COUNT(*) FILTER (WHERE ${puzzleGames.status} = 'completed')`,
      expiredGames: sql<number>`COUNT(*) FILTER (WHERE ${puzzleGames.status} = 'expired')`,
      totalPrizeDistributed: sql<number>`COALESCE(SUM(${puzzleGames.prizePool}) FILTER (WHERE ${puzzleGames.status} = 'completed'), 0)`,
    }).from(puzzleGames);

    // Get total participants count in a single query
    const [participantStats] = await db.select({
      totalParticipants: count(),
    }).from(puzzleParticipants).where(eq(puzzleParticipants.status, 'active'));

    const averageParticipants = stats.totalGames > 0
      ? Math.round((participantStats.totalParticipants / stats.totalGames) * 100) / 100
      : 0;

    return {
      totalGames: stats.totalGames,
      activeGames: stats.activeGames,
      completedGames: stats.completedGames,
      expiredGames: stats.expiredGames,
      totalPrizeDistributed: Math.round(stats.totalPrizeDistributed * 100) / 100,
      averageParticipants,
    };
  });

  console.log('[Routes] Puzzle API routes registered');
}
