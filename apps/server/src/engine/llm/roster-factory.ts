import {
  getDefaultModelId,
  isBaselineProviderId,
  isLLMProviderId,
  type AgentRosterEntry,
  type LLMType,
} from '@simagents/shared';
import type { Agent } from '../../db/schema';
import {
  BaselineDecisionProvider,
  type DecisionContext,
  type DecisionProvider,
} from '../decision';
import type { LLMDecisionProviderConfig } from './llm-provider';
import { ProviderUnavailableError } from './request-builder';
import type { KeySource } from './keys';

export interface RosterProviderFactoryOptions {
  proxyUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderFactoryTools {
  sleepWall(wallMs: number, signal: AbortSignal): Promise<void>;
}

export type RosterProviderFactory = (
  agent: Agent,
  tools: ProviderFactoryTools
) => DecisionProvider;

export function createRosterProviderFactory(
  roster: AgentRosterEntry[],
  keySource: KeySource,
  options: RosterProviderFactoryOptions = {}
): RosterProviderFactory {
  const assignments = new Map<string, AgentRosterEntry>();
  let nextIndex = 0;
  const entries = roster.length > 0 ? roster : [];

  return (agent) => {
    const existing = assignments.get(agent.id);
    const entry = existing ?? entries[nextIndex % entries.length];
    if (!existing && entry) {
      assignments.set(agent.id, entry);
      nextIndex++;
    }

    if (!entry) {
      return new BaselineDecisionProvider('baseline_rule');
    }
    if (isBaselineProviderId(entry.provider)) {
      return new BaselineDecisionProvider(entry.provider);
    }
    if (!isLLMProviderId(entry.provider)) {
      return new BaselineDecisionProvider('baseline_rule');
    }

    const provider = entry.provider as LLMType;
    const apiKey = keySource.getKey(provider);
    if (!apiKey) {
      return new UnavailableDecisionProvider(provider, 'no-key');
    }

    return new LazyLLMDecisionProvider({
      provider,
      modelId: entry.modelId || getDefaultModelId(provider),
      reasoningLevel: entry.reasoningLevel,
      apiKey,
      proxyUrl: options.proxyUrl,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  };
}

class LazyLLMDecisionProvider implements DecisionProvider {
  readonly kind: LLMType;
  private delegate: DecisionProvider | undefined;

  constructor(private readonly config: LLMDecisionProviderConfig) {
    this.kind = config.provider;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal) {
    if (!this.delegate) {
      const { LLMDecisionProvider } = await import('./llm-provider');
      this.delegate = new LLMDecisionProvider(this.config);
    }

    return this.delegate.decide(ctx, signal);
  }
}

class UnavailableDecisionProvider implements DecisionProvider {
  readonly kind: string;

  constructor(
    private readonly provider: LLMType,
    private readonly reason: 'no-key' | 'needs-proxy'
  ) {
    this.kind = provider;
  }

  async decide(): Promise<never> {
    throw new ProviderUnavailableError(this.provider, this.reason);
  }
}
