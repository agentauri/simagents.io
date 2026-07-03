import type { AgentRosterEntry, LLMType } from '@simagents/shared';
import { setRuntimeConfig } from '@server/config';
import { SimEngine, createRosterProviderFactory, type SimEngineState } from '@server/engine/engine';
import type { WorldEvent } from '../stores/world';

interface InitPayload {
  roster: AgentRosterEntry[];
  keys: Partial<Record<LLMType, string>>;
  proxyUrl?: string;
  speed: number;
  worldSeed?: string;
  configOverrides?: Record<string, unknown>;
}

type WorkerCommand =
  | { cmd: 'init'; payload: InitPayload }
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }
  | { cmd: 'setSpeed'; speed: number }
  | { cmd: 'getState' };

let engine: SimEngine | undefined;
let unsubscribe: (() => void) | undefined;
let stateTimer: ReturnType<typeof setInterval> | undefined;

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
      break;
    case 'pause':
      requireEngine().pause();
      stopStateTimer();
      postState();
      break;
    case 'resume':
      requireEngine().resume();
      startStateTimer();
      postState();
      break;
    case 'reset':
      stopStateTimer();
      await requireEngine().reset();
      postState();
      break;
    case 'setSpeed':
      requireEngine().setSpeed(command.speed);
      break;
    case 'getState':
      postState();
      break;
  }
}

async function init(payload: InitPayload): Promise<void> {
  stopStateTimer();
  unsubscribe?.();
  if (engine) {
    await engine.reset();
  }

  if (payload.configOverrides) {
    setRuntimeConfig(payload.configOverrides as Parameters<typeof setRuntimeConfig>[0]);
  }

  const providerFactory = createRosterProviderFactory(
    payload.roster,
    keySource(payload.keys),
    { proxyUrl: payload.proxyUrl || undefined }
  );

  engine = new SimEngine({
    speed: payload.speed,
    worldSeed: payload.worldSeed ?? 'browser-local',
    providerFactory,
    // The worker console is invisible to users: surface background engine
    // failures (interval tick, agent runner crashes) to the UI.
    onError: (error, context) => {
      postError(error instanceof Error ? new Error(`[${context}] ${error.message}`) : error);
    },
  });

  unsubscribe = engine.subscribe((event) => {
    self.postMessage({ type: 'event', event } satisfies { type: 'event'; event: WorldEvent });
  });

  await engine.seed({
    roster: payload.roster,
    worldSeed: payload.worldSeed,
  });

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

function stopStateTimer(): void {
  if (!stateTimer) return;
  clearInterval(stateTimer);
  stateTimer = undefined;
}
