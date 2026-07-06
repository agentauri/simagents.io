import type { AgentRosterEntry, LLMType } from '@simagents/shared';
import {
  createBrowserAgentDecisionProvider,
  registerBrowserAgentAdapter as registerEngineBrowserAgentAdapter,
} from '@simagents/engine/engine/browser-agent-adapter';
import { fallbackDecisionFor, toActionDecision, type DecisionInput } from '@simagents/engine/engine/decision';
import { resetRuntimeConfig, setRuntimeConfig } from '@simagents/engine/config';
import {
  SimEngine,
  createRosterProviderFactory,
  type ProviderFactory,
  type SimEngineState,
} from '@simagents/engine/engine/engine';
import { store as engineStore } from '@simagents/engine/engine-memory/store';
import {
  getStoredWorldEvents,
  validateWorldSnapshotV1,
  type WorldSnapshotV1,
} from '@simagents/engine/engine/persistence';
import { setCustomSystemPrompt } from '@simagents/engine/llm/prompt-manager';
import type { BrowserAgentAdapterRegistration } from './engine-client';
import type {
  BrowserExperimentDefinition,
  BrowserExperimentRun,
  BrowserExperimentSnapshot,
  BrowserExperimentSummary,
} from '../services/experiments';
import type { AgentTimelineEntry, ReplayEvent, TickRange, WorldSnapshot } from '../stores/replay';
import type {
  PuzzleDetails,
  PuzzleFilter,
  PuzzleGame,
  PuzzleResults,
  PuzzleStats,
} from '../stores/puzzles';
import type { WorldEvent } from '../stores/world';

interface InitPayload {
  roster: AgentRosterEntry[];
  keys: Partial<Record<LLMType, string>>;
  proxyUrl?: string;
  speed: number;
  worldSeed?: string;
  configOverrides?: Record<string, unknown>;
  customPrompt?: string | null;
  resume?: WorldSnapshotV1;
}

type WorkerCommand =
  | { cmd: 'init'; payload: InitPayload }
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }
  | { cmd: 'setSpeed'; speed: number }
  | { cmd: 'getState' }
  | { cmd: 'snapshot' }
  | { cmd: 'export' }
  | { cmd: 'setRuntimeConfig'; updates: Record<string, unknown> }
  | { cmd: 'setCustomPrompt'; prompt: string | null }
  | { cmd: 'getReplayRange'; requestId: string }
  | { cmd: 'getReplayFrame'; requestId: string; tick: number }
  | { cmd: 'getAgentTimeline'; requestId: string; agentId: string; limit?: number }
  | { cmd: 'getPuzzles'; requestId: string; filter?: PuzzleFilter }
  | { cmd: 'getPuzzleDetails'; requestId: string; puzzleId: string }
  | { cmd: 'getPuzzleResults'; requestId: string; puzzleId: string }
  | { cmd: 'getPuzzleStats'; requestId: string }
  | { cmd: 'runExperiment'; requestId: string; definition: BrowserExperimentDefinition }
  | { cmd: 'cancelExperiment'; requestId: string; runId?: string }
  | { cmd: 'getExperimentStatus'; requestId: string; runId?: string }
  | { cmd: 'exportExperiment'; requestId: string; runId: string }
  | { cmd: 'registerBrowserAgentAdapter'; requestId: string; registration: BrowserAgentAdapterRegistration };

interface StoredReplayFrame {
  schemaVersion: 1;
  tick: number;
  simTimeMs: number;
  capturedAt: number;
  snapshot: WorldSnapshot;
}

let engine: SimEngine | undefined;
let unsubscribe: (() => void) | undefined;
let stateTimer: ReturnType<typeof setInterval> | undefined;
let snapshotTimer: ReturnType<typeof setInterval> | undefined;
let replayFrames: StoredReplayFrame[] = [];
let activeExperimentRun: BrowserExperimentRun | undefined;
let cancelExperimentRequested = false;
let browserAdapterRegistrations: BrowserAgentAdapterRegistration[] = [];

const MAX_REPLAY_FRAMES = 240;
const MAX_EXPERIMENT_TICKS = 500;

const keySource = (keys: Partial<Record<LLMType, string>>) => ({
  getKey(provider: LLMType): string | undefined {
    return keys[provider];
  },
});

function createBrowserAwareProviderFactory(rosterProviderFactory: ProviderFactory): ProviderFactory {
  return (agent, tools) => {
    const registration = findBrowserAdapterRegistration(agent.id, (agent as { name?: string }).name);
    if (registration) {
      const provider = createBrowserAgentDecisionProvider(registration.id);
      if (provider) return provider;
    }
    return rosterProviderFactory(agent, tools);
  };
}

self.onmessage = (message: MessageEvent<WorkerCommand>) => {
  void handleCommand(message.data).catch((error) => {
    postError(error, 'requestId' in message.data ? message.data.requestId : undefined);
  });
};

async function handleCommand(command: WorkerCommand): Promise<void> {
  switch (command.cmd) {
    case 'init':
      await init(command.payload);
      break;
    case 'start':
      requireEngine().resume();
      await requireEngine().start();
      startStateTimer();
      startSnapshotTimer();
      break;
    case 'pause':
      requireEngine().pause();
      stopStateTimer();
      stopSnapshotTimer();
      postState();
      postSnapshot();
      break;
    case 'resume':
      requireEngine().resume();
      startStateTimer();
      startSnapshotTimer();
      postState();
      break;
    case 'reset':
      stopStateTimer();
      stopSnapshotTimer();
      await requireEngine().reset();
      postState();
      break;
    case 'setSpeed':
      requireEngine().setSpeed(command.speed);
      break;
    case 'getState':
      postState();
      break;
    case 'snapshot':
      postSnapshot();
      break;
    case 'export':
      postExport();
      break;
    case 'setRuntimeConfig':
      setRuntimeConfig(command.updates as Parameters<typeof setRuntimeConfig>[0]);
      break;
    case 'setCustomPrompt':
      setCustomSystemPrompt(command.prompt);
      break;
    case 'getReplayRange':
      postResponse(command.requestId, getReplayRange());
      break;
    case 'getReplayFrame':
      postResponse(command.requestId, getReplayFrame(command.tick));
      break;
    case 'getAgentTimeline':
      postResponse(command.requestId, getAgentTimeline(command.agentId, command.limit));
      break;
    case 'getPuzzles':
      postResponse(command.requestId, getPuzzles(command.filter ?? 'all'));
      break;
    case 'getPuzzleDetails':
      postResponse(command.requestId, getPuzzleDetails(command.puzzleId));
      break;
    case 'getPuzzleResults':
      postResponse(command.requestId, getPuzzleResults(command.puzzleId));
      break;
    case 'getPuzzleStats':
      postResponse(command.requestId, getPuzzleStats());
      break;
    case 'runExperiment':
      postResponse(command.requestId, await runExperiment(command.definition));
      break;
    case 'cancelExperiment':
      postResponse(command.requestId, cancelExperiment(command.runId));
      break;
    case 'getExperimentStatus':
      postResponse(command.requestId, getExperimentStatus(command.runId));
      break;
    case 'exportExperiment':
      postResponse(command.requestId, exportExperiment(command.runId));
      break;
    case 'registerBrowserAgentAdapter':
      postResponse(command.requestId, registerBrowserAgentAdapter(command.registration));
      break;
  }
}

async function init(payload: InitPayload): Promise<void> {
  stopStateTimer();
  stopSnapshotTimer();
  unsubscribe?.();
  if (engine) {
    await engine.reset();
  }

  resetRuntimeConfig();
  if (payload.configOverrides) {
    setRuntimeConfig(payload.configOverrides as Parameters<typeof setRuntimeConfig>[0]);
  }
  setCustomSystemPrompt(payload.customPrompt ?? null);
  replayFrames = [];

  const rosterProviderFactory = createRosterProviderFactory(
    payload.roster,
    keySource(payload.keys),
    { proxyUrl: payload.proxyUrl || undefined }
  );
  const providerFactory = createBrowserAwareProviderFactory(rosterProviderFactory);

  const createEngine = (speed: number, worldSeed: string) =>
    new SimEngine({
      speed,
      worldSeed,
      providerFactory,
      // The worker console is invisible to users: surface background engine
      // failures (interval tick, agent runner crashes) to the UI.
      onError: (error, context) => {
        postError(error instanceof Error ? new Error(`[${context}] ${error.message}`) : error);
      },
    });

  let resumeSnapshot: WorldSnapshotV1 | undefined;
  if (payload.resume) {
    try {
      resumeSnapshot = validateWorldSnapshotV1(payload.resume);
    } catch (error) {
      postWarning(`Saved world could not be loaded; starting a new world. ${formatError(error)}`);
    }
  }

  engine = createEngine(
    resumeSnapshot?.speed ?? payload.speed,
    resumeSnapshot?.worldSeed ?? payload.worldSeed ?? 'browser-local'
  );

  unsubscribe = engine.subscribe((event) => {
    self.postMessage({ type: 'event', event } satisfies { type: 'event'; event: WorldEvent });
  });

  if (resumeSnapshot) {
    try {
      await engine.hydrate(resumeSnapshot);
    } catch (error) {
      postWarning(`Saved world could not be loaded; starting a new world. ${formatError(error)}`);
      await engine.reset();
      engine = createEngine(payload.speed, payload.worldSeed ?? 'browser-local');
      unsubscribe?.();
      unsubscribe = engine.subscribe((event) => {
        self.postMessage({ type: 'event', event } satisfies { type: 'event'; event: WorldEvent });
      });
      await engine.seed({
        roster: payload.roster,
        worldSeed: payload.worldSeed,
      });
    }
  } else {
    await engine.seed({
      roster: payload.roster,
      worldSeed: payload.worldSeed,
    });
  }

  self.postMessage({ type: 'ready', state: engine.getState() } satisfies {
    type: 'ready';
    state: SimEngineState;
  });
  recordReplayFrame();
}

function requireEngine(): SimEngine {
  if (!engine) throw new Error('Engine worker has not been initialized');
  return engine;
}

function postState(): void {
  const current = requireEngine().getState();
  self.postMessage({ type: 'state', state: current } satisfies { type: 'state'; state: SimEngineState });
  recordReplayFrame(current);
}

function postError(error: unknown, requestId?: string): void {
  const message = error instanceof Error ? error.message : String(error);
  self.postMessage({ type: 'error', message, requestId } satisfies {
    type: 'error';
    message: string;
    requestId?: string;
  });
}

function postWarning(message: string): void {
  self.postMessage({ type: 'warning', message } satisfies { type: 'warning'; message: string });
}

function postSnapshot(): void {
  const snapshot = requireEngine().snapshot();
  recordReplayFrame();
  self.postMessage({
    type: 'snapshot',
    snapshot,
    recentEvents: getStoredWorldEvents(1000),
  } satisfies { type: 'snapshot'; snapshot: WorldSnapshotV1; recentEvents: WorldEvent[] });
}

function postExport(): void {
  const snapshot = requireEngine().snapshot();
  self.postMessage({
    type: 'export',
    snapshot,
    events: getStoredWorldEvents(),
  } satisfies { type: 'export'; snapshot: WorldSnapshotV1; events: WorldEvent[] });
}

function postResponse(requestId: string, payload: unknown): void {
  self.postMessage({ type: 'response', requestId, payload } satisfies {
    type: 'response';
    requestId: string;
    payload: unknown;
  });
}

function recordReplayFrame(state = requireEngine().getState()): void {
  const frame = buildReplayFrame(state);
  const existingIndex = replayFrames.findIndex((item) => item.tick === frame.tick);
  if (existingIndex >= 0) {
    replayFrames[existingIndex] = frame;
  } else {
    replayFrames.push(frame);
  }
  replayFrames.sort((a, b) => a.tick - b.tick);
  if (replayFrames.length > MAX_REPLAY_FRAMES) {
    replayFrames = replayFrames.slice(-MAX_REPLAY_FRAMES);
  }
  self.postMessage({ type: 'replayFrame', frame } satisfies {
    type: 'replayFrame';
    frame: StoredReplayFrame;
  });
}

function buildReplayFrame(state: SimEngineState): StoredReplayFrame {
  const events = getStoredWorldEvents(500)
    .map(worldEventToReplayEvent)
    .filter((event) => event.tick === state.tick)
    .sort((a, b) => a.id - b.id);

  return {
    schemaVersion: 1,
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    capturedAt: Date.now(),
    snapshot: {
      tick: state.tick,
      agents: state.agents.map((agent) => ({
        id: agent.id,
        llmType: agent.llmType,
        x: agent.x,
        y: agent.y,
        hunger: agent.hunger,
        energy: agent.energy,
        health: agent.health,
        balance: agent.balance,
        state: agent.state,
        tick: state.tick,
      })),
      resourceSpawns: state.resources.map((spawn) => ({
        id: spawn.id,
        x: spawn.x,
        y: spawn.y,
        resourceType: spawn.resourceType,
        currentAmount: spawn.currentAmount,
        maxAmount: spawn.maxAmount,
      })),
      shelters: state.shelters.map((shelter) => ({
        id: shelter.id,
        x: shelter.x,
        y: shelter.y,
        canSleep: shelter.canSleep,
      })),
      events,
    },
  };
}

function worldEventToReplayEvent(event: WorldEvent, index: number): ReplayEvent {
  const numericId = typeof event.id === 'number' ? event.id : index + 1;
  return {
    id: numericId,
    eventType: event.type,
    tick: event.tick,
    agentId: event.agentId ?? null,
    payload: event.payload,
    createdAt: new Date(event.timestamp).toISOString(),
  };
}

function getReplayRange(): TickRange {
  if (replayFrames.length === 0) recordReplayFrame();
  const ticks = replayFrames.map((frame) => frame.tick);
  const currentTick = requireEngine().getState().tick;
  return {
    minTick: Math.min(...ticks, currentTick),
    maxTick: Math.max(...ticks, currentTick),
    currentTick,
    totalEvents: getStoredWorldEvents().length,
  };
}

function getReplayFrame(tick: number): WorldSnapshot {
  if (replayFrames.length === 0) recordReplayFrame();
  const exact = replayFrames.find((frame) => frame.tick === tick);
  if (exact) return exact.snapshot;
  const prior = replayFrames.filter((frame) => frame.tick <= tick).at(-1);
  return (prior ?? replayFrames[replayFrames.length - 1] ?? buildReplayFrame(requireEngine().getState())).snapshot;
}

function getAgentTimeline(agentId: string, limit = 100): AgentTimelineEntry[] {
  return getStoredWorldEvents()
    .filter((event) => event.agentId === agentId)
    .slice(0, limit)
    .map((event) => {
      const action = typeof event.payload.action === 'string' ? event.payload.action : undefined;
      const success = event.type !== 'action_failed';
      return {
        tick: event.tick,
        eventType: event.type,
        action,
        success,
        description: describeTimelineEvent(event),
      };
    });
}

function describeTimelineEvent(event: WorldEvent): string {
  if (typeof event.payload.reasoning === 'string') return event.payload.reasoning;
  if (typeof event.payload.error === 'string') return event.payload.error;
  return event.type.replace(/_/g, ' ');
}

function getPuzzles(filter: PuzzleFilter): PuzzleGame[] {
  const puzzles = [...engineStore.puzzleGames.values()].map((puzzle) => ({
    id: puzzle.id,
    gameType: puzzle.gameType,
    status: puzzle.status as PuzzleGame['status'],
    prizePool: puzzle.prizePool,
    entryStake: puzzle.entryStake,
    startsAtTick: puzzle.startsAtTick ?? puzzle.createdAtTick,
    endsAtTick: puzzle.endsAtTick ?? puzzle.createdAtTick,
    participantCount: [...engineStore.puzzleParticipants.values()].filter((p) => p.gameId === puzzle.id).length,
    fragmentCount: puzzle.fragmentCount,
    winnerId: puzzle.winnerId,
  }));
  if (filter === 'all') return puzzles;
  if (filter === 'active') return puzzles.filter((puzzle) => puzzle.status === 'open' || puzzle.status === 'active');
  return puzzles.filter((puzzle) => puzzle.status === filter);
}

function getPuzzleDetails(puzzleId: string): PuzzleDetails {
  const puzzle = engineStore.puzzleGames.get(puzzleId);
  if (!puzzle) throw new Error('Puzzle not found');
  const isCompleted = puzzle.status === 'completed';
  return {
    puzzle: { ...getPuzzles('all').find((item) => item.id === puzzleId)!, solution: isCompleted ? puzzle.solution ?? null : null },
    participants: [...engineStore.puzzleParticipants.values()]
      .filter((participant) => participant.gameId === puzzleId)
      .map((participant) => {
        const agent = engineStore.agents.get(participant.agentId);
        return {
          id: participant.id,
          agentId: participant.agentId,
          agentName: agent?.name ?? agent?.llmType ?? participant.agentId,
          agentColor: agent?.color ?? '#888888',
          teamId: participant.teamId,
          stakeAmount: participant.stakedAmount,
          contributionScore: participant.contributionScore,
          fragmentsShared: participant.fragmentsShared,
          attemptsMade: participant.attemptsMade,
        };
      }),
    teams: [...engineStore.puzzleTeams.values()]
      .filter((team) => team.gameId === puzzleId)
      .map((team) => {
        const leader = engineStore.agents.get(team.leaderId);
        const members = [...engineStore.puzzleParticipants.values()]
          .filter((participant) => participant.teamId === team.id)
          .map((participant) => {
            const agent = engineStore.agents.get(participant.agentId);
            return {
              agentId: participant.agentId,
              agentName: agent?.name ?? agent?.llmType ?? participant.agentId,
              agentColor: agent?.color ?? '#888888',
              contributionScore: participant.contributionScore,
              fragmentsShared: participant.fragmentsShared,
            };
          });
        return {
          id: team.id,
          name: team.name ?? 'Team',
          status: team.status,
          totalStake: team.totalStake,
          leader: leader ? { id: leader.id, name: leader.name ?? leader.llmType } : null,
          members,
          memberCount: members.length,
        };
      }),
    fragments: [...engineStore.puzzleFragments.values()]
      .filter((fragment) => fragment.gameId === puzzleId)
      .map((fragment) => {
        const owner = fragment.ownerId ? engineStore.agents.get(fragment.ownerId) : undefined;
        const originalOwner = fragment.originalOwnerId ? engineStore.agents.get(fragment.originalOwnerId) : undefined;
        return {
          id: fragment.id,
          fragmentIndex: fragment.fragmentIndex,
          content: isCompleted ? fragment.content : '',
          owner: owner ? { id: owner.id, name: owner.name ?? owner.llmType, color: owner.color } : null,
          originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.name ?? originalOwner.llmType } : null,
          sharedWith: fragment.sharedWith.map((agentId) => {
            const agent = engineStore.agents.get(agentId);
            return { agentId, agentName: agent?.name ?? agent?.llmType ?? agentId };
          }),
          sharedCount: fragment.sharedWith.length,
        };
      }),
  };
}

function getPuzzleResults(puzzleId: string): PuzzleResults {
  const details = getPuzzleDetails(puzzleId);
  const attempts = [...engineStore.puzzleAttempts.values()]
    .filter((attempt) => attempt.gameId === puzzleId)
    .map((attempt) => {
      const agent = engineStore.agents.get(attempt.submitterId);
      return {
        id: attempt.id,
        submitterId: attempt.submitterId,
        submitterName: agent?.name ?? agent?.llmType ?? attempt.submitterId,
        attemptedSolution: attempt.attemptedSolution,
        isCorrect: attempt.isCorrect,
        submittedAtTick: attempt.submittedAtTick,
      };
    });
  const winningAttempt = attempts.find((attempt) => attempt.isCorrect) ?? null;
  return {
    puzzle: {
      id: details.puzzle.id,
      gameType: details.puzzle.gameType,
      status: details.puzzle.status,
      prizePool: details.puzzle.prizePool,
      solution: details.puzzle.solution,
    },
    winner: winningAttempt
      ? {
          agentId: winningAttempt.submitterId,
          agentName: winningAttempt.submitterName,
          solution: winningAttempt.attemptedSolution,
          submittedAtTick: winningAttempt.submittedAtTick,
        }
      : null,
    attempts,
    prizeDistribution: details.participants.map((participant) => ({
      agentId: participant.agentId,
      agentName: participant.agentName,
      contributionScore: participant.contributionScore,
      fragmentsShared: participant.fragmentsShared,
      attemptsMade: participant.attemptsMade,
      prizeAmount: details.puzzle.status === 'completed' ? details.puzzle.prizePool / Math.max(1, details.participants.length) : 0,
      isWinner: winningAttempt?.submitterId === participant.agentId,
    })),
  };
}

function getPuzzleStats(): PuzzleStats {
  const puzzles = getPuzzles('all');
  const totalParticipants = [...engineStore.puzzleParticipants.values()].length;
  return {
    totalGames: puzzles.length,
    activeGames: puzzles.filter((puzzle) => puzzle.status === 'open' || puzzle.status === 'active').length,
    completedGames: puzzles.filter((puzzle) => puzzle.status === 'completed').length,
    expiredGames: puzzles.filter((puzzle) => puzzle.status === 'expired').length,
    totalPrizeDistributed: puzzles
      .filter((puzzle) => puzzle.status === 'completed')
      .reduce((sum, puzzle) => sum + puzzle.prizePool, 0),
    averageParticipants: puzzles.length === 0 ? 0 : totalParticipants / puzzles.length,
  };
}

async function runExperiment(definition: BrowserExperimentDefinition): Promise<BrowserExperimentRun> {
  if (activeExperimentRun?.status === 'running') {
    throw new Error(`Experiment already running: ${activeExperimentRun.id}`);
  }

  const currentEngine = requireEngine();
  const startedState = currentEngine.getState();
  const targetTicks = clampInt(definition.ticks ?? 10, 1, MAX_EXPERIMENT_TICKS);
  const wallStepMs = clampInt(definition.wallStepMs ?? 6000, 1, 60_000);
  const captureEveryTicks = clampInt(definition.captureEveryTicks ?? 1, 1, targetTicks);
  const startedEventCount = getStoredWorldEvents().length;
  const shouldRestartRuntime = stateTimer !== undefined;
  const wasPaused = currentEngine.isPaused();

  if (definition.configOverrides) {
    setRuntimeConfig(definition.configOverrides as Parameters<typeof setRuntimeConfig>[0]);
  }

  const run: BrowserExperimentRun = {
    schemaVersion: 1,
    id: definition.id ? `${definition.id}-${Date.now()}` : `browser-run-${Date.now()}`,
    definition: {
      ...definition,
      ticks: targetTicks,
      wallStepMs,
      captureEveryTicks,
    },
    status: 'running',
    startedAt: Date.now(),
    targetTicks,
    ticksCompleted: 0,
    snapshots: [buildExperimentSnapshot(startedState)],
  };

  activeExperimentRun = run;
  cancelExperimentRequested = false;
  stopStateTimer();
  stopSnapshotTimer();
  currentEngine.stop();
  currentEngine.resume();

  try {
    let iterations = 0;
    let lastCapturedTick = startedState.tick;
    const maxIterations = targetTicks * 20;

    while (run.ticksCompleted < targetTicks && iterations < maxIterations) {
      if (cancelExperimentRequested) {
        run.status = 'cancelled';
        break;
      }

      iterations += 1;
      await currentEngine.tickWall(wallStepMs);
      const state = currentEngine.getState();
      run.ticksCompleted = Math.max(0, state.tick - startedState.tick);

      const shouldCapture =
        state.tick !== lastCapturedTick &&
        (run.ticksCompleted >= targetTicks || run.ticksCompleted % captureEveryTicks === 0);
      if (shouldCapture) {
        lastCapturedTick = state.tick;
        run.snapshots.push(buildExperimentSnapshot(state));
        recordReplayFrame(state);
      }

      if (iterations % 5 === 0) postState();
    }

    if (run.status === 'running') {
      run.status = 'completed';
    }
  } catch (error) {
    run.status = 'failed';
    run.error = formatError(error);
  } finally {
    const endedState = currentEngine.getState();
    if (run.snapshots.at(-1)?.tick !== endedState.tick) {
      run.snapshots.push(buildExperimentSnapshot(endedState));
    }
    run.completedAt = Date.now();
    run.summary = buildExperimentSummary(run, startedState.tick, startedEventCount);
    activeExperimentRun = run;
    cancelExperimentRequested = false;

    currentEngine.stop();
    if (wasPaused) currentEngine.pause();
    else currentEngine.resume();
    if (shouldRestartRuntime) {
      await currentEngine.start();
      startStateTimer();
      startSnapshotTimer();
    }
    postState();
    postSnapshot();
  }

  return run;
}

function cancelExperiment(runId?: string): BrowserExperimentRun | undefined {
  if (!activeExperimentRun) return undefined;
  if (runId && activeExperimentRun.id !== runId) return activeExperimentRun;
  if (activeExperimentRun.status === 'running') {
    cancelExperimentRequested = true;
  }
  return activeExperimentRun;
}

function getExperimentStatus(runId?: string): BrowserExperimentRun | undefined {
  if (!runId) return activeExperimentRun;
  return activeExperimentRun?.id === runId ? activeExperimentRun : undefined;
}

function exportExperiment(runId: string): BrowserExperimentRun | undefined {
  return activeExperimentRun?.id === runId ? activeExperimentRun : undefined;
}

function buildExperimentSnapshot(state: SimEngineState): BrowserExperimentSnapshot {
  const aliveAgents = state.agents.filter((agent) => agent.state !== 'dead');
  const count = Math.max(1, aliveAgents.length);
  return {
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    capturedAt: Date.now(),
    agentCount: state.agents.length,
    aliveAgents: aliveAgents.length,
    avgHunger: round2(aliveAgents.reduce((sum, agent) => sum + agent.hunger, 0) / count),
    avgEnergy: round2(aliveAgents.reduce((sum, agent) => sum + agent.energy, 0) / count),
    avgHealth: round2(aliveAgents.reduce((sum, agent) => sum + agent.health, 0) / count),
    totalBalance: round2(state.agents.reduce((sum, agent) => sum + agent.balance, 0)),
    resourceAmount: round2(state.resources.reduce((sum, resource) => sum + resource.currentAmount, 0)),
    eventCount: getStoredWorldEvents().length,
  };
}

function buildExperimentSummary(
  run: BrowserExperimentRun,
  startedTick: number,
  startedEventCount: number
): BrowserExperimentSummary {
  const last = run.snapshots.at(-1);
  return {
    startedTick,
    endedTick: last?.tick ?? startedTick,
    ticksAdvanced: Math.max(0, (last?.tick ?? startedTick) - startedTick),
    eventsGenerated: Math.max(0, (last?.eventCount ?? startedEventCount) - startedEventCount),
    finalAliveAgents: last?.aliveAgents ?? 0,
    finalAvgHealth: last?.avgHealth ?? 0,
    finalResourceAmount: last?.resourceAmount ?? 0,
  };
}

function registerBrowserAgentAdapter(
  registration: BrowserAgentAdapterRegistration
): { id: string; appliedTo: number } {
  const id = registration.id.trim();
  if (!id) throw new Error('Browser agent adapter id is required');

  const normalized: BrowserAgentAdapterRegistration = {
    ...registration,
    id,
    agentIds: registration.agentIds?.filter(Boolean),
    agentNames: registration.agentNames?.filter(Boolean),
  };

  registerEngineBrowserAgentAdapter({
    id,
    label: normalized.label,
    async decide(ctx, signal) {
      const latency = Math.max(0, normalized.latencyMs ?? 0);
      if (latency > 0) await sleepWall(latency, signal);
      if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');
      return normalized.fallbackAction
        ? toActionDecision(normalized.fallbackAction as DecisionInput)
        : fallbackDecisionFor(ctx.agent, ctx.observation);
    },
  });

  browserAdapterRegistrations = [
    normalized,
    ...browserAdapterRegistrations.filter((item) => item.id !== id),
  ];

  return { id, appliedTo: countMatchedAgents(normalized) };
}

function findBrowserAdapterRegistration(
  agentId: string,
  agentName?: string
): BrowserAgentAdapterRegistration | undefined {
  return browserAdapterRegistrations.find((registration) => {
    if (registration.allAgents) return true;
    if (registration.agentIds?.includes(agentId)) return true;
    return !!agentName && !!registration.agentNames?.includes(agentName);
  });
}

function countMatchedAgents(registration: BrowserAgentAdapterRegistration): number {
  return [...engineStore.agents.values()].filter((agent) => (
    registration.allAgents ||
    registration.agentIds?.includes(agent.id) ||
    ((agent as { name?: string }).name ? registration.agentNames?.includes((agent as { name: string }).name) : false)
  )).length;
}

function sleepWall(wallMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Decision aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, wallMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Decision aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function startStateTimer(): void {
  if (stateTimer) return;
  stateTimer = setInterval(() => {
    try {
      postState();
    } catch (error) {
      postError(error);
    }
  }, 2000);
}

function startSnapshotTimer(): void {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(() => {
    try {
      postSnapshot();
    } catch (error) {
      postError(error);
    }
  }, 10_000);
}

function stopStateTimer(): void {
  if (!stateTimer) return;
  clearInterval(stateTimer);
  stateTimer = undefined;
}

function stopSnapshotTimer(): void {
  if (!snapshotTimer) return;
  clearInterval(snapshotTimer);
  snapshotTimer = undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
