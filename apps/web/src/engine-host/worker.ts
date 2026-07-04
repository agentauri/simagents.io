import type { AgentRosterEntry, LLMType } from '@simagents/shared';
import { resetRuntimeConfig, setRuntimeConfig } from '@server/config';
import { SimEngine, createRosterProviderFactory, type SimEngineState } from '@server/engine/engine';
import {
  getStoredWorldEvents,
  validateWorldSnapshotV1,
  type WorldSnapshotV1,
} from '@server/engine/persistence';
import type { WorldEvent } from '../stores/world';

interface InitPayload {
  roster: AgentRosterEntry[];
  keys: Partial<Record<LLMType, string>>;
  proxyUrl?: string;
  speed: number;
  worldSeed?: string;
  configOverrides?: Record<string, unknown>;
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
  | { cmd: 'export' };

let engine: SimEngine | undefined;
let unsubscribe: (() => void) | undefined;
let stateTimer: ReturnType<typeof setInterval> | undefined;
let snapshotTimer: ReturnType<typeof setInterval> | undefined;

const keySource = (keys: Partial<Record<LLMType, string>>) => ({
  getKey(provider: LLMType): string | undefined {
    return keys[provider];
  },
});

self.onmessage = (message: MessageEvent<WorkerCommand>) => {
  void handleCommand(message.data).catch((error) => {
    postError(error);
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

  const providerFactory = createRosterProviderFactory(
    payload.roster,
    keySource(payload.keys),
    { proxyUrl: payload.proxyUrl || undefined }
  );

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
}

function requireEngine(): SimEngine {
  if (!engine) throw new Error('Engine worker has not been initialized');
  return engine;
}

function postState(): void {
  const current = requireEngine().getState();
  self.postMessage({ type: 'state', state: current } satisfies { type: 'state'; state: SimEngineState });
}

function postError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  self.postMessage({ type: 'error', message } satisfies { type: 'error'; message: string });
}

function postWarning(message: string): void {
  self.postMessage({ type: 'warning', message } satisfies { type: 'warning'; message: string });
}

function postSnapshot(): void {
  const snapshot = requireEngine().snapshot();
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
