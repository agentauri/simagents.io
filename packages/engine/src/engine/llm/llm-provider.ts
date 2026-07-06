import { getDefaultModelId, type LLMType, type ReasoningLevel } from '@simagents/shared';
import { buildFinalPromptWithMemories } from '../../llm/prompt-builder';
import { parseResponse } from '../../llm/response-parser';
import type { AgentObservation } from '../../llm/types';
import { toActionDecision, type ActionDecision, type DecisionContext, type DecisionProvider } from '../decision';
import { buildProviderRequest } from './request-builder';
import { extractProviderResponse } from './response-extractor';

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;
const DECISION_SYSTEM_PROMPT =
  'You are choosing one simulation action. Return only the JSON object requested by the simulation prompt.';

export interface LLMDecisionProviderConfig {
  provider: LLMType;
  modelId?: string;
  reasoningLevel?: ReasoningLevel;
  apiKey: string;
  proxyUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export class LLMDecisionProvider implements DecisionProvider {
  readonly kind: LLMType;

  constructor(private readonly config: LLMDecisionProviderConfig) {
    this.kind = config.provider;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');

    const observation = ctx.observation as AgentObservation;
    const personality = observation.self?.personality ?? ctx.agent.personality ?? null;
    const userPrompt = await buildFinalPromptWithMemories(
      ctx.agent.id,
      observation,
      personality as AgentObservation['self']['personality']
    );

    const request = buildProviderRequest({
      provider: this.config.provider,
      modelId: this.config.modelId ?? getDefaultModelId(this.config.provider),
      reasoningLevel: this.config.reasoningLevel,
      apiKey: this.config.apiKey,
      prompt: {
        system: DECISION_SYSTEM_PROMPT,
        user: userPrompt,
      },
      maxTokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: this.config.temperature ?? DEFAULT_TEMPERATURE,
      proxyUrl: this.config.proxyUrl,
    });

    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `${this.config.provider} request failed: ${response.status} ${response.statusText} ${errorText}`.trim()
      );
    }

    const json = await response.json();
    const extracted = extractProviderResponse(this.config.provider, json);
    const parsed = parseResponse(extracted.text);
    if (!parsed) {
      throw new Error(`${this.config.provider} response did not contain a valid action JSON object`);
    }

    const decision = toActionDecision(parsed);
    decision.telemetry = {
      modelId: usedModelId(request.body, this.config.modelId ?? getDefaultModelId(this.config.provider)),
      tokens: extracted.usage
        ? {
            input: extracted.usage.inputTokens,
            output: extracted.usage.outputTokens,
          }
        : undefined,
    };
    return decision;
  }
}

function usedModelId(body: Record<string, unknown>, fallback: string): string {
  return typeof body.model === 'string' ? body.model : fallback;
}
