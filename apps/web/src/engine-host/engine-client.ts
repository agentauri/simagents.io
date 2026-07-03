import type { AgentRosterEntry, LLMType } from '@simagents/shared';
import type { SimEngineState } from '@server/engine/engine';
import type { WorldSnapshotV1 } from '@server/engine/persistence';
import type { WorldEvent } from '../stores/world';

export interface EngineInitPayload {
  roster: AgentRosterEntry[];
  keys: Partial<Record<LLMType, string>>;
  proxyUrl?: string;
  speed: number;
  worldSeed?: string;
  configOverrides?: Record<string, unknown>;
  resume?: WorldSnapshotV1;
}

type WorkerCommand =
  | { cmd: 'init'; payload: EngineInitPayload }
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }
  | { cmd: 'setSpeed'; speed: number }
  | { cmd: 'getState' }
  | { cmd: 'snapshot' }
  | { cmd: 'export' };

export interface EngineSnapshotPayload {
  snapshot: WorldSnapshotV1;
  recentEvents: WorldEvent[];
}

export interface EngineExportPayload {
  snapshot: WorldSnapshotV1;
  events: WorldEvent[];
}

type WorkerMessage =
  | { type: 'ready'; state: SimEngineState }
  | { type: 'event'; event: WorldEvent }
  | { type: 'state'; state: SimEngineState }
  | { type: 'snapshot'; snapshot: WorldSnapshotV1; recentEvents: WorldEvent[] }
  | { type: 'export'; snapshot: WorldSnapshotV1; events: WorldEvent[] }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string };

type EventListener = (event: WorldEvent) => void;
type StateListener = (state: SimEngineState) => void;
type StatusListener = (status: EngineClientStatus) => void;
type SnapshotListener = (payload: EngineSnapshotPayload) => void;
type WarningListener = (message: string) => void;

export type EngineClientStatus = 'disconnected' | 'connecting' | 'connected';

class EngineClient {
  private worker: Worker | undefined;
  private status: EngineClientStatus = 'disconnected';
  private running = false;
  private paused = false;
  private readyResolver: ((state: SimEngineState) => void) | undefined;
  private readyRejecter: ((error: Error) => void) | undefined;
  private stateResolver: ((state: SimEngineState) => void) | undefined;
  private stateRejecter: ((error: Error) => void) | undefined;
  private snapshotResolver: ((payload: EngineSnapshotPayload) => void) | undefined;
  private snapshotRejecter: ((error: Error) => void) | undefined;
  private exportResolver: ((payload: EngineExportPayload) => void) | undefined;
  private exportRejecter: ((error: Error) => void) | undefined;
  private readonly eventListeners = new Set<EventListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly warningListeners = new Set<WarningListener>();

  init(payload: EngineInitPayload): Promise<SimEngineState> {
    this.ensureWorker();
    this.setStatus('connecting');
    this.running = false;
    this.paused = false;

    return new Promise((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejecter = reject;
      this.post({ cmd: 'init', payload });
    });
  }

  async start(): Promise<void> {
    this.running = true;
    this.paused = false;
    this.setStatus('connected');
    this.post({ cmd: 'start' });
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.post({ cmd: 'pause' });
  }

  async resume(): Promise<void> {
    this.running = true;
    this.paused = false;
    this.setStatus('connected');
    this.post({ cmd: 'resume' });
  }

  async reset(): Promise<SimEngineState> {
    this.running = false;
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.stateResolver = resolve;
      this.stateRejecter = reject;
      this.post({ cmd: 'reset' });
    });
  }

  resetHard(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.running = false;
    this.paused = false;
    this.rejectPending(new Error('Engine worker reset'));
    this.setStatus('disconnected');
  }

  async setSpeed(speed: number): Promise<void> {
    this.post({ cmd: 'setSpeed', speed });
  }

  async getState(): Promise<SimEngineState> {
    return new Promise((resolve, reject) => {
      this.stateResolver = resolve;
      this.stateRejecter = reject;
      this.post({ cmd: 'getState' });
    });
  }

  async requestSnapshot(): Promise<EngineSnapshotPayload> {
    return new Promise((resolve, reject) => {
      this.snapshotResolver = resolve;
      this.snapshotRejecter = reject;
      this.post({ cmd: 'snapshot' });
    });
  }

  async exportWorld(): Promise<EngineExportPayload> {
    return new Promise((resolve, reject) => {
      this.exportResolver = resolve;
      this.exportRejecter = reject;
      this.post({ cmd: 'export' });
    });
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onWarning(listener: WarningListener): () => void {
    this.warningListeners.add(listener);
    return () => this.warningListeners.delete(listener);
  }

  getStatus(): EngineClientStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private ensureWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (message: MessageEvent<WorkerMessage>) => this.handleMessage(message.data);
    this.worker.onerror = (error) => {
      this.rejectPending(new Error(error.message || 'Engine worker failed'));
      this.setStatus('disconnected');
    };
  }

  private post(command: WorkerCommand): void {
    this.ensureWorker();
    this.worker!.postMessage(command);
  }

  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'ready':
        this.setStatus('connected');
        this.readyResolver?.(message.state);
        this.readyResolver = undefined;
        this.readyRejecter = undefined;
        this.emitState(message.state);
        break;
      case 'state':
        this.stateResolver?.(message.state);
        this.stateResolver = undefined;
        this.stateRejecter = undefined;
        this.emitState(message.state);
        break;
      case 'event':
        for (const listener of this.eventListeners) {
          listener(message.event);
        }
        break;
      case 'snapshot': {
        const payload = {
          snapshot: message.snapshot,
          recentEvents: message.recentEvents,
        };
        this.snapshotResolver?.(payload);
        this.snapshotResolver = undefined;
        this.snapshotRejecter = undefined;
        for (const listener of this.snapshotListeners) {
          listener(payload);
        }
        break;
      }
      case 'export':
        this.exportResolver?.({
          snapshot: message.snapshot,
          events: message.events,
        });
        this.exportResolver = undefined;
        this.exportRejecter = undefined;
        break;
      case 'warning':
        console.warn('[EngineWorker]', message.message);
        for (const listener of this.warningListeners) {
          listener(message.message);
        }
        break;
      case 'error': {
        const error = new Error(message.message);
        this.rejectPending(error);
        console.error('[EngineWorker]', error);
        break;
      }
    }
  }

  private emitState(state: SimEngineState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private setStatus(status: EngineClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private rejectPending(error: Error): void {
    this.readyRejecter?.(error);
    this.stateRejecter?.(error);
    this.snapshotRejecter?.(error);
    this.exportRejecter?.(error);
    this.readyResolver = undefined;
    this.readyRejecter = undefined;
    this.stateResolver = undefined;
    this.stateRejecter = undefined;
    this.snapshotResolver = undefined;
    this.snapshotRejecter = undefined;
    this.exportResolver = undefined;
    this.exportRejecter = undefined;
  }
}

const singleton = new EngineClient();

export function getEngineClient(): EngineClient {
  return singleton;
}
