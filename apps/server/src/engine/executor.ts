import { v4 as uuid } from 'uuid';
import type { Agent } from '../db/schema';
import type { ActionIntent, ActionResult, ActionType } from '../actions/types';
import { executeAction } from '../actions';
import { getRuntimeConfig } from '../config';
import { publishEvent, type WorldEvent } from '../engine-memory/bus';
import { appendEvent } from '../engine-memory/queries/events';
import { getAgentById, updateAgent } from '../engine-memory/queries/agents';
import { materializeVitals } from './vitals';
import { deleteAgentMeta, setAgentBusyUntil } from './agent-meta';
import { tickFromSimTime } from './time';

export interface ExecutorClock {
  nowMs(): number;
}

export interface ActionExecution {
  intent: ActionIntent;
  tick: number;
  simTimeMs: number;
  result: ActionResult;
  events: WorldEvent[];
  dropped?: boolean;
}

/**
 * Decision telemetry carried alongside the intent so the executor can emit the
 * legacy decision event (`agent_<action>` with reasoning/usedFallback/
 * processingTimeMs) exactly like the tick engine did.
 */
export interface DecisionMeta {
  reasoning?: string;
  usedFallback?: boolean;
  processingTimeMs?: number;
}

interface QueueItem {
  intent: ActionIntent;
  decisionMeta?: DecisionMeta;
  resolve: (execution: ActionExecution) => void;
  reject: (error: unknown) => void;
}

export class ActionExecutor {
  private readonly queue: QueueItem[] = [];
  private readonly drainListeners = new Set<() => void>();
  private draining = false;

  constructor(private readonly clock: ExecutorClock) {}

  submit(intent: ActionIntent, decisionMeta?: DecisionMeta): Promise<ActionExecution> {
    return new Promise((resolve, reject) => {
      this.queue.push({ intent, decisionMeta, resolve, reject });
      void this.drain();
    });
  }

  onDrain(listener: () => void): () => void;
  onDrain(): Promise<void>;
  onDrain(listener?: () => void): Promise<void> | (() => void) {
    if (listener) {
      this.drainListeners.add(listener);
      return () => this.drainListeners.delete(listener);
    }

    if (!this.draining && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const unsubscribe = this.onDrain(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  get pendingCount(): number {
    return this.queue.length + (this.draining ? 1 : 0);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) continue;

        try {
          item.resolve(await this.execute(item.intent, item.decisionMeta));
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        void this.drain();
      } else {
        this.notifyDrain();
      }
    }
  }

  private async execute(
    intent: ActionIntent,
    decisionMeta?: DecisionMeta
  ): Promise<ActionExecution> {
    const simTimeMs = this.clock.nowMs();
    const tick = tickFromSimTime(simTimeMs);
    const materialized = await materializeVitals(intent.agentId, simTimeMs);
    const agent = materialized?.agent ?? (await getAgentById(intent.agentId));

    if (!agent || agent.state === 'dead' || materialized?.vitals.dead) {
      deleteAgentMeta(intent.agentId);
      const result: ActionResult = {
        success: false,
        error: 'agent_dead',
      };
      const event = await this.emitActionFailed(intent, tick, simTimeMs, 'agent_dead');
      return {
        intent,
        tick,
        simTimeMs,
        result,
        events: [event],
        dropped: true,
      };
    }

    const result = await executeAction({ ...intent, tick }, agent);
    const events: WorldEvent[] = [];

    if (result.success) {
      if (result.changes) {
        await updateAgent(intent.agentId, result.changes);
      }

      const durationMs = actionDurationMs(intent.type, agent, result);
      setAgentBusyUntil(intent.agentId, simTimeMs + durationMs);

      // Legacy parity (tick-engine.ts:236-264): every successful action emits
      // the DECISION event (present tense, carries reasoning/telemetry) before
      // the handler's result events (past tense). The UI's heatmap and event
      // filters consume the present-tense shapes.
      events.push(
        await this.emitActionEvent(
          {
            id: uuid(),
            type: `agent_${intent.type}`,
            tick,
            timestamp: Date.now(),
            agentId: intent.agentId,
            payload: {
              action: intent.type,
              params: intent.params,
              reasoning: decisionMeta?.reasoning,
              usedFallback: decisionMeta?.usedFallback ?? false,
              processingTimeMs: decisionMeta?.processingTimeMs,
            },
          },
          tick,
          simTimeMs
        )
      );

      for (const event of result.events ?? []) {
        events.push(await this.emitActionEvent(event, tick, simTimeMs));
      }
    } else {
      setAgentBusyUntil(
        intent.agentId,
        simTimeMs + getRuntimeConfig().durations.failedActionPenaltyMs
      );
      events.push(await this.emitActionFailed(intent, tick, simTimeMs, result.error));
    }

    return {
      intent,
      tick,
      simTimeMs,
      result,
      events,
    };
  }

  private async emitActionEvent(
    event: WorldEvent,
    tick: number,
    simTimeMs: number
  ): Promise<WorldEvent> {
    const stamped: WorldEvent = {
      ...event,
      tick,
      timestamp: Date.now(),
      payload: {
        ...event.payload,
        simTimeMs,
      },
    };
    await emit(stamped);
    return stamped;
  }

  private async emitActionFailed(
    intent: ActionIntent,
    tick: number,
    simTimeMs: number,
    error: string | undefined
  ): Promise<WorldEvent> {
    const failure = error ?? 'Unknown action failure';
    const event: WorldEvent = {
      id: uuid(),
      type: 'action_failed',
      tick,
      timestamp: Date.now(),
      agentId: intent.agentId,
      payload: {
        action: intent.type,
        params: intent.params,
        error: failure,
        reason: failure === 'agent_dead' ? 'agent_dead' : undefined,
        simTimeMs,
      },
    };
    await emit(event);
    return event;
  }

  private notifyDrain(): void {
    for (const listener of this.drainListeners) {
      listener();
    }
  }
}

async function emit(event: WorldEvent): Promise<void> {
  await publishEvent(event);
  await appendEvent({
    tick: event.tick,
    agentId: event.agentId ?? null,
    eventType: event.type,
    payload: event.payload,
  });
}

export function actionDurationMs(
  actionType: ActionType,
  agentBefore: Agent,
  result: ActionResult
): number {
  const durations = getRuntimeConfig().durations;

  if (actionType === 'move') {
    const nextX = typeof result.changes?.x === 'number' ? result.changes.x : agentBefore.x;
    const nextY = typeof result.changes?.y === 'number' ? result.changes.y : agentBefore.y;
    const distance = Math.max(Math.abs(nextX - agentBefore.x), Math.abs(nextY - agentBefore.y));
    return Math.max(0, distance) * durations.movePerTileMs;
  }

  switch (actionType) {
    case 'gather':
      return durations.gatherMs;
    case 'forage':
      return durations.forageMs;
    case 'work':
      return durations.workMs;
    case 'sleep':
      return durations.sleepMs;
    case 'trade':
      return durations.tradeMs;
    case 'buy':
      return durations.buyMs;
    case 'consume':
      return durations.consumeMs;
    case 'share_info':
      return durations.shareInfoMs;
    case 'signal':
      return durations.signalMs;
    case 'harm':
      return durations.harmMs;
    case 'steal':
      return durations.stealMs;
    default:
      return durations.defaultMs;
  }
}
