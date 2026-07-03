import { v4 as uuid } from 'uuid';
import { CONFIG, getRuntimeConfig } from '../config';
import { getAliveAgents } from '../engine-memory/queries/agents';
import {
  assignFragmentToAgent,
  createPuzzleFragments,
  createPuzzleGame,
  expirePuzzleGames,
  getActiveParticipantsForGame,
  getActivePuzzleGames,
  getFragmentsForGame,
  getOpenPuzzleGames,
  getPuzzleGameWithParticipantCount,
  updatePuzzleGameStatus,
} from '../engine-memory/queries/puzzles';
import type { NewPuzzleFragment, PuzzleGame } from '../db/schema';
import { random, randomBelow } from '../utils/random';
import { simMinutes } from './time';

type PuzzleType = 'coordinates' | 'password' | 'logic';

interface GeneratedPuzzle {
  type: PuzzleType;
  solution: string;
  fragments: Array<{
    content: string;
    hint: string;
  }>;
  entryStake: number;
  prizePool: number;
}

function generateCoordinatesPuzzle(): GeneratedPuzzle {
  const targetX = randomBelow(CONFIG.simulation.gridSize);
  const targetY = randomBelow(CONFIG.simulation.gridSize);
  return {
    type: 'coordinates',
    solution: `${targetX},${targetY}`,
    fragments: [
      { content: `The X coordinate is ${targetX}`, hint: 'Reveals X coordinate' },
      { content: `The Y coordinate is ${targetY}`, hint: 'Reveals Y coordinate' },
      { content: `Sum of coordinates is ${targetX + targetY}`, hint: 'Verification clue' },
    ],
    entryStake: CONFIG.puzzle.defaultEntryStake,
    prizePool: 100,
  };
}

function generatePasswordPuzzle(): GeneratedPuzzle {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'omega'];
  const wordCount = 3 + randomBelow(2);
  const selectedWords: string[] = [];
  const usedIndices = new Set<number>();

  while (selectedWords.length < wordCount) {
    const idx = randomBelow(words.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selectedWords.push(words[idx]);
    }
  }

  return {
    type: 'password',
    solution: selectedWords.join('-'),
    fragments: [
      ...selectedWords.map((word, i) => ({
        content: `Word ${i + 1} is "${word}"`,
        hint: `Contains word position ${i + 1}`,
      })),
      {
        content: `The password has ${wordCount} words separated by dashes`,
        hint: 'Format information',
      },
    ],
    entryStake: CONFIG.puzzle.defaultEntryStake * 1.5,
    prizePool: 150,
  };
}

function generateLogicPuzzle(): GeneratedPuzzle {
  const targetNumber = 10 + randomBelow(90);
  return {
    type: 'logic',
    solution: targetNumber.toString(),
    fragments: [
      {
        content: `The number is ${targetNumber % 2 === 0 ? 'even' : 'odd'}`,
        hint: 'Parity information',
      },
      {
        content: `The number is between ${Math.floor(targetNumber / 10) * 10} and ${
          Math.floor(targetNumber / 10) * 10 + 9
        }`,
        hint: 'Range constraint',
      },
      {
        content: `The sum of digits is ${Math.floor(targetNumber / 10) + (targetNumber % 10)}`,
        hint: 'Digit sum',
      },
      {
        content: `The number is ${targetNumber > 50 ? 'greater' : 'less'} than 50`,
        hint: 'Comparison clue',
      },
      { content: `The last digit is ${targetNumber % 10}`, hint: 'Last digit revealed' },
    ],
    entryStake: CONFIG.puzzle.defaultEntryStake * 2,
    prizePool: 200,
  };
}

function generatePuzzle(type?: PuzzleType): GeneratedPuzzle {
  if (type === 'coordinates') return generateCoordinatesPuzzle();
  if (type === 'password') return generatePasswordPuzzle();
  if (type === 'logic') return generateLogicPuzzle();

  const roll = random();
  if (roll < 0.4) return generateCoordinatesPuzzle();
  if (roll < 0.7) return generatePasswordPuzzle();
  return generateLogicPuzzle();
}

export function perMinuteHazardProbability(perMinuteProbability: number, dtMs: number): number {
  if (dtMs <= 0 || perMinuteProbability <= 0) return 0;
  if (perMinuteProbability >= 1) return 1;
  return 1 - Math.pow(1 - perMinuteProbability, simMinutes(dtMs));
}

export async function createNewPuzzleGame(
  tenantId: string | null,
  tick: number,
  type?: PuzzleType
): Promise<PuzzleGame> {
  const puzzle = generatePuzzle(type);
  const game = await createPuzzleGame({
    id: uuid(),
    tenantId,
    gameType: puzzle.type,
    status: 'open',
    solution: puzzle.solution,
    solutionHash: null,
    prizePool: puzzle.prizePool,
    entryStake: puzzle.entryStake,
    maxParticipants: 10,
    minParticipants: 2,
    fragmentCount: puzzle.fragments.length,
    createdAtTick: tick,
    startsAtTick: tick,
    endsAtTick: tick + CONFIG.puzzle.roundDurationTicks,
  });

  const fragmentDocs: NewPuzzleFragment[] = puzzle.fragments.map((fragment, i) => ({
    gameId: game.id,
    fragmentIndex: i,
    content: fragment.content,
    hint: fragment.hint,
    ownerId: null,
    originalOwnerId: null,
    sharedWith: [],
  }));
  await createPuzzleFragments(fragmentDocs);

  return game;
}

export async function distributeFragments(gameId: string): Promise<void> {
  const fragments = await getFragmentsForGame(gameId);
  const participants = await getActiveParticipantsForGame(gameId);
  if (participants.length === 0) return;

  const unassigned = fragments.filter((fragment) => !fragment.ownerId);
  for (let i = 0; i < unassigned.length; i++) {
    const participant = participants[i % participants.length];
    await assignFragmentToAgent(unassigned[i].id, participant.agentId, true);
  }
}

export async function checkGameActivation(gameId: string, tick: number): Promise<boolean> {
  const game = await getPuzzleGameWithParticipantCount(gameId);
  if (!game || game.status !== 'open') return false;

  const registrationEnded = tick >= (game.startsAtTick || 0) + CONFIG.puzzle.registrationWindow;
  const hasMinParticipants = game.participantCount >= game.minParticipants;
  const isFull = game.participantCount >= game.maxParticipants;

  if ((registrationEnded && hasMinParticipants) || isFull) {
    await updatePuzzleGameStatus(gameId, 'active');
    await distributeFragments(gameId);
    return true;
  }

  return false;
}

export async function processPuzzleLifecycle(
  tick: number,
  dtMs: number,
  tenantId: string | null = null
): Promise<{
  expiredCount: number;
  activatedGames: string[];
  newGames: string[];
  creationProbability: number;
}> {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.puzzle.enabled) {
    return { expiredCount: 0, activatedGames: [], newGames: [], creationProbability: 0 };
  }

  const expiredCount = await expirePuzzleGames(tick);
  const openGames = await getOpenPuzzleGames(tenantId);
  const activatedGames: string[] = [];

  for (const game of openGames) {
    if (await checkGameActivation(game.id, tick)) {
      activatedGames.push(game.id);
    }
  }

  const activeGames = await getActivePuzzleGames(tenantId);
  const newGames: string[] = [];
  const creationProbability = perMinuteHazardProbability(0.1, dtMs);

  if (activeGames.length < 2) {
    const aliveAgents = await getAliveAgents();
    if (aliveAgents.length >= 3 && random() < creationProbability) {
      const game = await createNewPuzzleGame(tenantId, tick);
      newGames.push(game.id);
    }
  }

  return { expiredCount, activatedGames, newGames, creationProbability };
}
