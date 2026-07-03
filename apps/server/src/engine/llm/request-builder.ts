import {
  getModelCatalogEntry,
  getProviderCatalogEntry,
  type LLMType,
  type ReasoningCapability,
  type ReasoningLevel,
} from '@simagents/shared';

export interface ProviderPrompt {
  system: string;
  user: string;
}

export interface ProviderRequestOptions {
  provider: LLMType;
  modelId: string;
  reasoningLevel?: ReasoningLevel;
  apiKey: string;
  prompt: ProviderPrompt;
  maxTokens: number;
  temperature?: number;
  proxyUrl?: string;
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type ProviderUnavailableReason = 'no-key' | 'needs-proxy';

export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: LLMType,
    readonly reason: ProviderUnavailableReason
  ) {
    super(`Provider ${provider} unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * Effort-style reasoning (OpenAI, Grok) spends reasoning tokens INSIDE the
 * completion budget: at 1024 tokens the hidden reasoning can exhaust the cap
 * and return empty content. Raise the ceiling whenever effort is enabled.
 */
const EFFORT_REASONING_MIN_TOKENS = 4096;

export function buildProviderRequest(opts: ProviderRequestOptions): ProviderRequest {
  const catalog = getProviderCatalogEntry(opts.provider);
  if (!catalog) {
    throw new Error(`Unknown LLM provider: ${opts.provider}`);
  }
  if (!opts.apiKey.trim()) {
    throw new ProviderUnavailableError(opts.provider, 'no-key');
  }

  const url = providerUrl(catalog.endpoint, opts);
  const headers = authHeaders(opts.provider, catalog.authStyle, opts.apiKey);

  switch (opts.provider) {
    case 'claude':
      return {
        url,
        headers: {
          ...headers,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: buildClaudeBody(opts),
      };
    case 'gemini':
      return {
        url: providerUrl(`${catalog.endpoint}/${encodeURIComponent(opts.modelId)}:generateContent`, opts),
        headers,
        body: buildGeminiBody(opts),
      };
    case 'codex':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'openai') };
    case 'deepseek':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'deepseek') };
    case 'qwen':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'qwen') };
    case 'glm':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'glm') };
    case 'grok':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'grok') };
    case 'mistral':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'mistral') };
    case 'minimax':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'minimax') };
    case 'kimi':
      return { url, headers, body: buildOpenAICompatibleBody(opts, 'kimi') };
    default:
      return unreachable(opts.provider);
  }
}

function authHeaders(
  provider: LLMType,
  authStyle: 'bearer' | 'x-api-key' | 'google-key',
  apiKey: string
): Record<string, string> {
  const common = { 'Content-Type': 'application/json' };
  switch (authStyle) {
    case 'bearer':
      return { ...common, Authorization: `Bearer ${apiKey}` };
    case 'x-api-key':
      return { ...common, 'x-api-key': apiKey };
    case 'google-key':
      return { ...common, 'x-goog-api-key': apiKey };
    default:
      return unreachable(authStyle, provider);
  }
}

function providerUrl(originalUrl: string, opts: ProviderRequestOptions): string {
  const catalog = getProviderCatalogEntry(opts.provider);
  if (!catalog) throw new Error(`Unknown LLM provider: ${opts.provider}`);
  if (catalog.cors === 'direct') return originalUrl;
  if (!opts.proxyUrl) {
    throw new ProviderUnavailableError(opts.provider, 'needs-proxy');
  }

  const proxy = opts.proxyUrl.replace(/\/+$/, '');
  const withoutScheme = originalUrl.replace(/^https?:\/\//, '');
  return `${proxy}/${withoutScheme}`;
}

function buildClaudeBody(opts: ProviderRequestOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.modelId,
    max_tokens: opts.maxTokens,
    system: opts.prompt.system,
    messages: [{ role: 'user', content: opts.prompt.user }],
  };

  const budget = reasoningBudget(opts);
  if (budget !== undefined) {
    body.thinking = { type: 'enabled', budget_tokens: budget };
    body.max_tokens = Math.max(opts.maxTokens, budget + 1024);
    return body;
  }

  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  return body;
}

function buildGeminiBody(opts: ProviderRequestOptions): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens,
    responseMimeType: 'application/json',
  };
  if (opts.temperature !== undefined) {
    generationConfig.temperature = opts.temperature;
  }

  const budget = reasoningBudget(opts);
  if (budget !== undefined) {
    generationConfig.thinkingConfig = { thinkingBudget: budget };
    generationConfig.maxOutputTokens = Math.max(opts.maxTokens, budget + 1024);
  }

  return {
    contents: [{ role: 'user', parts: [{ text: opts.prompt.user }] }],
    systemInstruction: { parts: [{ text: opts.prompt.system }] },
    generationConfig,
  };
}

type OpenAICompatibleProvider =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'grok'
  | 'mistral'
  | 'minimax'
  | 'kimi';

function buildOpenAICompatibleBody(
  opts: ProviderRequestOptions,
  provider: OpenAICompatibleProvider
): Record<string, unknown> {
  const model = modelForRequest(opts);
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: opts.prompt.system },
      { role: 'user', content: opts.prompt.user },
    ],
  };

  if (provider === 'openai') {
    if (isReasoningEnabled(opts.reasoningLevel)) {
      body.max_completion_tokens = Math.max(opts.maxTokens, EFFORT_REASONING_MIN_TOKENS);
      body.reasoning_effort = String(opts.reasoningLevel);
    } else {
      body.max_completion_tokens = opts.maxTokens;
      if (opts.temperature !== undefined) {
        body.temperature = opts.temperature;
      }
    }
    return body;
  }

  body.max_tokens = opts.maxTokens;

  if (provider === 'qwen' && isReasoningEnabled(opts.reasoningLevel)) {
    // DashScope exposes Qwen thinking mode as a non-standard OpenAI-compatible field.
    body.enable_thinking = true;
  }

  if (provider === 'glm') {
    body.thinking = { type: isReasoningEnabled(opts.reasoningLevel) ? 'enabled' : 'disabled' };
  }

  if (provider === 'grok' && isReasoningEnabled(opts.reasoningLevel)) {
    body.reasoning_effort = String(opts.reasoningLevel);
    body.max_tokens = Math.max(opts.maxTokens, EFFORT_REASONING_MIN_TOKENS);
  }

  if (provider === 'kimi') {
    body.thinking = { type: isReasoningEnabled(opts.reasoningLevel) ? 'enabled' : 'disabled' };
  }

  const omitsTemperature =
    (provider === 'grok' && isReasoningEnabled(opts.reasoningLevel)) ||
    isReasoningModelSwap(opts, provider);
  if (!omitsTemperature && opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }

  return body;
}

function modelForRequest(opts: ProviderRequestOptions): string {
  if (!isReasoningEnabled(opts.reasoningLevel)) return opts.modelId;

  // Swap only when the CONFIGURED id is a known model-swap catalog entry:
  // a user-supplied custom model id must never be silently replaced.
  const model = getModelCatalogEntry(opts.provider, opts.modelId);
  if (model?.reasoning.kind === 'model-swap') {
    return model.reasoning.reasoningModelId;
  }
  return opts.modelId;
}

function reasoningBudget(opts: ProviderRequestOptions): number | undefined {
  if (!isReasoningEnabled(opts.reasoningLevel)) return undefined;

  const capability = reasoningCapabilityFor(opts.provider, opts.modelId);
  if (capability?.kind !== 'budget') return undefined;

  const raw =
    typeof opts.reasoningLevel === 'number'
      ? opts.reasoningLevel
      : typeof opts.reasoningLevel === 'string'
        ? Number(opts.reasoningLevel)
        : NaN;
  const requested = Number.isFinite(raw) ? raw : capability.default;
  return clamp(Math.floor(requested), capability.min, capability.max);
}

function reasoningCapabilityFor(
  provider: LLMType,
  modelId: string
): ReasoningCapability | undefined {
  const model = getModelCatalogEntry(provider, modelId);
  if (model) return model.reasoning;
  const catalog = getProviderCatalogEntry(provider);
  const defaultModel = catalog?.models.find((entry) => entry.id === catalog.defaultModelId);
  return defaultModel?.reasoning;
}

function isReasoningModelSwap(
  opts: ProviderRequestOptions,
  provider: OpenAICompatibleProvider
): boolean {
  if (provider !== 'deepseek' && provider !== 'mistral') return false;
  return modelForRequest(opts) !== opts.modelId;
}

export function isReasoningEnabled(level: ReasoningLevel | undefined): boolean {
  if (level === undefined || level === null || level === false) return false;
  if (typeof level === 'string') {
    const normalized = level.trim().toLowerCase();
    return normalized !== '' && normalized !== 'none' && normalized !== 'false' && normalized !== 'disabled';
  }
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unreachable(value: never, context?: unknown): never {
  throw new Error(`Unhandled provider request case: ${String(value)} ${String(context ?? '')}`.trim());
}
