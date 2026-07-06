import type { Agent } from '../db/schema';
import {
  fallbackDecisionFor,
  toActionDecision,
  type ActionDecision,
  type DecisionContext,
  type DecisionInput,
  type DecisionProvider,
} from './decision';

export interface BrowserAgentAdapterContext extends DecisionContext {
  agent: Agent;
}

export interface BrowserAgentAdapter {
  id: string;
  label?: string;
  observe?(ctx: BrowserAgentAdapterContext, signal: AbortSignal): unknown | Promise<unknown>;
  decide(ctx: BrowserAgentAdapterContext, signal: AbortSignal): DecisionInput | Promise<DecisionInput>;
}

const adapters = new Map<string, BrowserAgentAdapter>();

export function registerBrowserAgentAdapter(adapter: BrowserAgentAdapter): void {
  if (!adapter.id.trim()) throw new Error('Browser agent adapter requires an id');
  adapters.set(adapter.id, adapter);
}

export function unregisterBrowserAgentAdapter(adapterId: string): void {
  adapters.delete(adapterId);
}

export function clearBrowserAgentAdapters(): void {
  adapters.clear();
}

export function getBrowserAgentAdapter(adapterId: string): BrowserAgentAdapter | undefined {
  return adapters.get(adapterId);
}

export function listBrowserAgentAdapters(): Array<{ id: string; label?: string }> {
  return [...adapters.values()].map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
  }));
}

export class BrowserAgentDecisionProvider implements DecisionProvider {
  readonly kind: string;

  constructor(private readonly adapter: BrowserAgentAdapter) {
    this.kind = `browser_adapter:${adapter.id}`;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');

    const adapterCtx: BrowserAgentAdapterContext = {
      ...ctx,
      agent: ctx.agent,
      observation: this.adapter.observe
        ? await this.adapter.observe({ ...ctx, agent: ctx.agent }, signal)
        : ctx.observation,
    };

    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');
    return toActionDecision(await this.adapter.decide(adapterCtx, signal));
  }
}

export function createBrowserAgentDecisionProvider(adapterId: string): DecisionProvider | undefined {
  const adapter = adapters.get(adapterId);
  return adapter ? new BrowserAgentDecisionProvider(adapter) : undefined;
}

export function createFallbackBrowserAgentAdapter(id: string, label?: string): BrowserAgentAdapter {
  return {
    id,
    label,
    decide(ctx) {
      return fallbackDecisionFor(ctx.agent, ctx.observation);
    },
  };
}
