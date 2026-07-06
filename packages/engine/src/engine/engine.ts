import type { Agent, ResourceSpawn, Shelter } from '../db/schema';
import { getRuntimeConfig } from '../config';
import { subscribe, type WorldEvent } from '../engine-memory/bus';
import { seedWorld, type SeedOptions } from '../engine-memory/seed';
import { store, resetStore } from '../engine-memory/store';
import { getAliveAgents } from '../engine-memory/queries/agents';
import { SimClock, DEFAULT_SIM_SPEED } from './time';
import { runHousekeeping } from './heartbeat';
import { ActionExecutor } from './executor';
import { AgentRunner, type AgentRunnerHost } from './agent-runner';
import { hydrateWorld, serializeWorld, type WorldSnapshotV1 } from './persistence';
import {
  createDecisionProviderForLLMType,
  type DecisionProvider,
} from './decision';
export { createRosterProviderFactory } from './llm/roster-factory';
export type { KeySource, ProviderAvailability } from './llm/keys';

interface Waiter {
  target: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
  abort: () => void;
}

interface PauseWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
  abort: () => void;
}

class EngineScheduler {
  private wallTimeMs = 0;
  private readonly simWaiters: Waiter[] = [];
  private readonly wallWaiters: Waiter[] = [];
  private readonly pauseWaiters: PauseWaiter[] = [];

  constructor(
    private readonly nowMs: () => number,
    private readonly isPaused: () => boolean
  ) {}

  sleepUntilSim(targetSimTimeMs: number, signal: AbortSignal): Promise<void> {
    if (targetSimTimeMs <= this.nowMs()) return Promise.resolve();
    return this.addWaiter(this.simWaiters, targetSimTimeMs, signal);
  }

  sleepWall(wallMs: number, signal: AbortSignal): Promise<void> {
    if (wallMs <= 0) return Promise.resolve();
    return this.addWaiter(this.wallWaiters, this.wallTimeMs + wallMs, signal);
  }

  waitWhilePaused(signal: AbortSignal): Promise<void> {
    if (!this.isPaused()) return Promise.resolve();
    if (signal.aborted) return Promise.reject(new Error('Aborted'));

    return new Promise((resolve, reject) => {
      const waiter: PauseWaiter = {
        resolve,
        reject,
        signal,
        abort: () => {
          this.removePauseWaiter(waiter);
          reject(new Error('Aborted'));
        },
      };
      signal.addEventListener('abort', waiter.abort, { once: true });
      this.pauseWaiters.push(waiter);
    });
  }

  advanceWall(wallDeltaMs: number): void {
    this.wallTimeMs += wallDeltaMs;
    this.flushWaiters(this.wallWaiters, this.wallTimeMs);
    this.flushWaiters(this.simWaiters, this.nowMs());
  }

  resume(): void {
    while (this.pauseWaiters.length > 0) {
      const waiter = this.pauseWaiters.shift();
      if (!waiter) continue;
      waiter.signal.removeEventListener('abort', waiter.abort);
      waiter.resolve();
    }
  }

  reset(): void {
    this.wallTimeMs = 0;
    this.rejectAll(this.simWaiters);
    this.rejectAll(this.wallWaiters);
    this.rejectPauseWaiters();
  }

  private addWaiter(waiters: Waiter[], target: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error('Aborted'));

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        target,
        resolve,
        reject,
        signal,
        abort: () => {
          this.removeWaiter(waiters, waiter);
          reject(new Error('Aborted'));
        },
      };
      signal.addEventListener('abort', waiter.abort, { once: true });
      waiters.push(waiter);
    });
  }

  private flushWaiters(waiters: Waiter[], now: number): void {
    for (let index = 0; index < waiters.length; ) {
      const waiter = waiters[index];
      if (waiter.target > now) {
        index++;
        continue;
      }

      waiters.splice(index, 1);
      waiter.signal.removeEventListener('abort', waiter.abort);
      waiter.resolve();
    }
  }

  private removeWaiter(waiters: Waiter[], waiter: Waiter): void {
    const index = waiters.indexOf(waiter);
    if (index >= 0) waiters.splice(index, 1);
  }

  private removePauseWaiter(waiter: PauseWaiter): void {
    const index = this.pauseWaiters.indexOf(waiter);
    if (index >= 0) this.pauseWaiters.splice(index, 1);
  }

  private rejectAll(waiters: Waiter[]): void {
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (!waiter) continue;
      waiter.signal.removeEventListener('abort', waiter.abort);
      waiter.reject(new Error('Scheduler reset'));
    }
  }

  private rejectPauseWaiters(): void {
    while (this.pauseWaiters.length > 0) {
      const waiter = this.pauseWaiters.shift();
      if (!waiter) continue;
      waiter.signal.removeEventListener('abort', waiter.abort);
      waiter.reject(new Error('Scheduler reset'));
    }
  }
}

export interface ProviderFactoryTools {
  sleepWall(wallMs: number, signal: AbortSignal): Promise<void>;
}

export type ProviderFactory = (
  agent: Agent,
  tools: ProviderFactoryTools
) => DecisionProvider;

export interface SimEngineOptions {
  speed?: number;
  simTimeMs?: number;
  worldSeed?: string;
  providerFactory?: ProviderFactory;
  /**
   * Called when a background failure occurs (interval tick or an agent
   * runner crash). In the browser the worker console is invisible to users,
   * so hosts should surface these (e.g. postMessage an error to the UI).
   */
  onError?: (error: unknown, context: string) => void;
}

export interface SimEngineState {
  tick: number;
  simTimeMs: number;
  agents: Agent[];
  resources: ResourceSpawn[];
  shelters: Shelter[];
}

export class SimEngine implements AgentRunnerHost {
  private clock: SimClock;
  private readonly scheduler: EngineScheduler;
  private readonly executor: ActionExecutor;
  private readonly runners = new Map<string, AgentRunner>();
  private readonly providerFactory: ProviderFactory;
  private readonly worldSeed: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastHeartbeatMs = 0;
  private readonly onError?: (error: unknown, context: string) => void;

  constructor(options: SimEngineOptions = {}) {
    this.onError = options.onError;
    this.clock = new SimClock({
      simTimeMs: options.simTimeMs ?? 0,
      speed: options.speed ?? DEFAULT_SIM_SPEED,
    });
    this.worldSeed = options.worldSeed ?? 'simagents';
    this.scheduler = new EngineScheduler(
      () => this.clock.simTimeMs,
      () => this.clock.paused
    );
    this.executor = new ActionExecutor({ nowMs: () => this.clock.simTimeMs });
    this.providerFactory =
      options.providerFactory ??
      ((agent) => createDecisionProviderForLLMType(agent.llmType));
  }

  async seed(world: SeedOptions = {}): Promise<void> {
    await this.reset();
    await seedWorld(world);
    await this.syncRunners();
  }

  async hydrate(snapshot: WorldSnapshotV1): Promise<void> {
    this.stopRuntime();
    this.scheduler.reset();
    hydrateWorld(snapshot);
    this.clock = new SimClock({
      simTimeMs: snapshot.savedAtSimTimeMs,
      speed: snapshot.speed,
      paused: store.worldState.isPaused,
    });
    // May sit up to one interval past the last actually-fired heartbeat: the
    // first post-resume heartbeat is then slightly delayed, which is harmless
    // because vitals decay anchors to each agent's persisted vitalsUpdatedAt.
    this.lastHeartbeatMs = snapshot.savedAtSimTimeMs;
    await this.syncRunners();
  }

  snapshot(): WorldSnapshotV1 {
    return serializeWorld({
      savedAtSimTimeMs: this.clock.simTimeMs,
      worldSeed: this.worldSeed,
      speed: this.clock.speed,
    });
  }

  async start(): Promise<void> {
    await this.syncRunners();
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.tickWall(250).catch((error) => {
        console.error('[engine] interval tick failed:', error);
        this.onError?.(error, 'interval-tick');
      });
    }, 250);
  }

  pause(): void {
    this.clock.pause();
    store.worldState = { ...store.worldState, isPaused: true };
  }

  resume(): void {
    this.clock.resume();
    store.worldState = { ...store.worldState, isPaused: false };
    this.scheduler.resume();
  }

  async reset(): Promise<void> {
    this.stopRuntime();
    this.scheduler.reset();
    resetStore();
    this.clock = new SimClock({ speed: this.clock.speed });
    this.lastHeartbeatMs = 0;
  }

  stop(): void {
    this.stopRuntime();
  }

  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  async tickWall(wallDeltaMs: number): Promise<void> {
    await this.syncRunners();
    this.clock.advance(wallDeltaMs);
    await this.runDueHeartbeats();
    // While paused the whole world freezes, including wall-clock waiters:
    // an in-flight decision must not time out (and fall back) during a pause.
    if (!this.clock.paused) {
      this.scheduler.advanceWall(wallDeltaMs);
    }
    await flushMicrotasks();
    await this.executor.onDrain();
    await this.syncRunners();
    await flushMicrotasks();
    await this.executor.onDrain();
  }

  getState(): SimEngineState {
    return {
      tick: this.clock.tick,
      simTimeMs: this.clock.simTimeMs,
      agents: [...store.agents.values()],
      resources: [...store.resourceSpawns.values()],
      shelters: [...store.shelters.values()],
    };
  }

  subscribe(listener: (event: WorldEvent) => void): () => void {
    return subscribe(listener);
  }

  nowMs(): number {
    return this.clock.simTimeMs;
  }

  isPaused(): boolean {
    return this.clock.paused;
  }

  sleepUntilSim(targetSimTimeMs: number, signal: AbortSignal): Promise<void> {
    return this.scheduler.sleepUntilSim(targetSimTimeMs, signal);
  }

  sleepWall(wallMs: number, signal: AbortSignal): Promise<void> {
    return this.scheduler.sleepWall(wallMs, signal);
  }

  waitWhilePaused(signal: AbortSignal): Promise<void> {
    return this.scheduler.waitWhilePaused(signal);
  }

  getExecutor(): ActionExecutor {
    return this.executor;
  }

  getRunner(agentId: string): AgentRunner | undefined {
    return this.runners.get(agentId);
  }

  private async runDueHeartbeats(): Promise<void> {
    const interval = Math.max(1, getRuntimeConfig().engine.heartbeatIntervalMs);
    while (this.lastHeartbeatMs + interval <= this.clock.simTimeMs) {
      const nextHeartbeatMs = this.lastHeartbeatMs + interval;
      await runHousekeeping(nextHeartbeatMs, nextHeartbeatMs - this.lastHeartbeatMs);
      this.lastHeartbeatMs = nextHeartbeatMs;
    }
  }

  private async syncRunners(): Promise<void> {
    const aliveAgents = await getAliveAgents();
    const aliveIds = new Set(aliveAgents.map((agent) => agent.id));

    for (const agent of aliveAgents) {
      if (this.runners.has(agent.id)) continue;

      const provider = this.providerFactory(agent, {
        sleepWall: (wallMs, signal) => this.sleepWall(wallMs, signal),
      });
      const runner = new AgentRunner({
        agentId: agent.id,
        worldSeed: this.worldSeed,
        provider,
        executor: this.executor,
        host: this,
      });
      this.runners.set(agent.id, runner);
      runner.start().catch((error) => {
        console.error(`[engine] agent runner ${agent.id} failed:`, error);
        this.onError?.(error, `agent-runner:${agent.id}`);
      });
    }

    for (const [agentId, runner] of [...this.runners.entries()]) {
      if (runner.isStopped) {
        this.runners.delete(agentId);
        continue;
      }

      if (!aliveIds.has(agentId) && !runner.isThinking) {
        runner.stop();
        this.runners.delete(agentId);
      }
    }
  }

  private stopRuntime(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    for (const runner of this.runners.values()) {
      runner.stop();
    }
    this.runners.clear();
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await Promise.resolve();
  }
}
