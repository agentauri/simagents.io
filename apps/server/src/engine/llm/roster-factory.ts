import {
  getDefaultModelId,
  isBaselineProviderId,
  isLLMProviderId,
  type AgentRosterEntry,
  type LLMType,
} from '@simagents/shared';
import type { Agent } from '../../db/schema';
import { store } from '../../engine-memory/store';
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
  // Deterministic binding: an agent is driven by the roster entry whose NAME
  // matches the agent's seeded name. Seeding bakes identity (name/color/
  // llmType) from the roster, agent names are persisted in world snapshots,
  // and the roster store deduplicates names - so this mapping is stable
  // across runner-sync order, world resume, and agent deaths. (A round-robin
  // over request order would scramble identity vs. driving model, because
  // getAliveAgents sorts by llmType, not roster order.)
  const entriesByName = new Map<string, AgentRosterEntry>();
  for (const entry of roster) {
    if (!entriesByName.has(entry.name)) entriesByName.set(entry.name, entry);
  }
  const resolvedByAgentId = new Map<string, AgentRosterEntry | undefined>();

  const entryForAgent = (agent: Agent): AgentRosterEntry | undefined => {
    if (resolvedByAgentId.has(agent.id)) return resolvedByAgentId.get(agent.id);

    const agentName = (agent as Agent & { name?: string }).name;
    let entry = agentName ? entriesByName.get(agentName) : undefined;

    if (!entry) {
      // Reproduction newborns have no roster entry of their own: they inherit
      // the provider of their first recorded parent (one lineage hop).
      const lineage = [...store.agentLineages.values()].find(
        (candidate) => candidate.agentId === agent.id
      );
      const parentIds = (lineage?.parentIds as string[] | null | undefined) ?? [];
      const parentId = parentIds[0] ?? lineage?.spawnedByParentId ?? undefined;
      const parent = parentId ? store.agents.get(parentId) : undefined;
      const parentName = parent ? (parent as Agent & { name?: string }).name : undefined;
      entry = parentName ? entriesByName.get(parentName) : undefined;
    }

    resolvedByAgentId.set(agent.id, entry);
    return entry;
  };

  return (agent) => {
    const entry = entryForAgent(agent);

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
