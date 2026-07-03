import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { getDefaultModelId, type LLMType } from '@simagents/shared';
import type { DecisionContext } from '../../../engine/decision';
import type { AgentObservation } from '../../../llm/types';

mock.module('../../../db/queries/world', () => import('../../../engine-memory/queries/world'));
mock.module('../../../db/queries/agents', () => import('../../../engine-memory/queries/agents'));
mock.module('../../../db/queries/inventory', () => import('../../../engine-memory/queries/inventory'));
mock.module('../../../db/queries/events', () => import('../../../engine-memory/queries/events'));
mock.module('../../../db/queries/memories', () => import('../../../engine-memory/queries/memories'));
mock.module('../../../db/queries/employment', () => import('../../../engine-memory/queries/employment'));
mock.module('../../../db/queries/reproduction', () => import('../../../engine-memory/queries/reproduction'));
mock.module('../../../db/queries/gossip', () => import('../../../engine-memory/queries/gossip'));
mock.module('../../../db/queries/credentials', () => import('../../../engine-memory/queries/credentials'));
mock.module('../../../db/queries/beliefs', () => import('../../../engine-memory/queries/beliefs'));
mock.module('../../../db/queries/roles', () => import('../../../engine-memory/queries/roles'));
mock.module('../../../db/queries/claims', () => import('../../../engine-memory/queries/claims'));
mock.module('../../../db/queries/knowledge', () => import('../../../engine-memory/queries/knowledge'));
mock.module('../../../db/queries/naming', () => import('../../../engine-memory/queries/naming'));
mock.module('../../../db/queries/puzzles', () => import('../../../engine-memory/queries/puzzles'));
mock.module('../../../ledger', () => import('../../../engine-memory/ledger'));
mock.module('../../../ledger/index', () => import('../../../engine-memory/ledger'));
mock.module('../../../cache/projections', () => import('../../../engine-memory/projections'));
mock.module('../../../cache', () => ({ redis: {} }));
mock.module('../../../cache/index', () => ({ redis: {} }));
mock.module('../../../world/scent', () => import('../../../engine-memory/scent'));
mock.module('../../../simulation/shocks', () => ({ isBlackoutActive: () => false }));

type RequestBuilderModule = typeof import('../../../engine/llm/request-builder');
type ResponseExtractorModule = typeof import('../../../engine/llm/response-extractor');
type LLMProviderModule = typeof import('../../../engine/llm/llm-provider');
type KeysModule = typeof import('../../../engine/llm/keys');

let buildProviderRequest: RequestBuilderModule['buildProviderRequest'];
let ProviderUnavailableError: RequestBuilderModule['ProviderUnavailableError'];
let extractProviderResponse: ResponseExtractorModule['extractProviderResponse'];
let LLMDecisionProvider: LLMProviderModule['LLMDecisionProvider'];
let providerAvailability: KeysModule['providerAvailability'];

beforeAll(async () => {
  ({ buildProviderRequest, ProviderUnavailableError } = await import('../../../engine/llm/request-builder'));
  ({ extractProviderResponse } = await import('../../../engine/llm/response-extractor'));
  ({ LLMDecisionProvider } = await import('../../../engine/llm/llm-provider'));
  ({ providerAvailability } = await import('../../../engine/llm/keys'));
});

const prompt = {
  system: 'System instructions',
  user: 'Observation prompt',
};
const proxyUrl = 'https://proxy.example.com/llm';
const actionJson = JSON.stringify({
  action: 'signal',
  params: { message: 'hello', intensity: 2 },
  reasoning: 'valid action',
});

function request(
  provider: LLMType,
  overrides: Partial<Parameters<typeof buildProviderRequest>[0]> = {}
) {
  return buildProviderRequest({
    provider,
    modelId: getDefaultModelId(provider),
    apiKey: 'test-key',
    prompt,
    maxTokens: 1024,
    temperature: 0.25,
    proxyUrl,
    ...overrides,
  });
}

function expectUnavailableNeedsProxy(fn: () => unknown): void {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }

  expect(error).toBeInstanceOf(ProviderUnavailableError);
  expect((error as InstanceType<typeof ProviderUnavailableError>).reason).toBe('needs-proxy');
}

describe('buildProviderRequest', () => {
  test('builds Anthropic direct requests with thinking budget and browser header', () => {
    const req = request('claude', {
      modelId: 'claude-sonnet-5',
      reasoningLevel: 4096,
      maxTokens: 1024,
      temperature: 0.25,
    });

    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(req.body).toMatchObject({
      model: 'claude-sonnet-5',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      thinking: { type: 'enabled', budget_tokens: 4096 },
      max_tokens: 5120,
    });
    expect(req.body.temperature).toBeUndefined();
  });

  test('maps OpenAI reasoning effort and omits temperature', () => {
    const req = request('codex', {
      modelId: 'gpt-5.4',
      reasoningLevel: 'high',
      temperature: 0.25,
    });

    expect(req.url).toBe('https://proxy.example.com/llm/api.openai.com/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer test-key');
    expect(req.body).toMatchObject({
      model: 'gpt-5.4',
      // Effort reasoning spends tokens inside the completion budget, so the
      // cap is raised above the 1024 default to leave room for the JSON output.
      max_completion_tokens: 4096,
      reasoning_effort: 'high',
    });
    expect(req.body.temperature).toBeUndefined();
  });

  test('keeps temperature on OpenAI non-reasoning requests', () => {
    const req = request('codex', {
      modelId: 'gpt-5.4-mini',
      reasoningLevel: 'none',
      temperature: 0.4,
    });

    expect(req.body).toMatchObject({
      model: 'gpt-5.4-mini',
      max_completion_tokens: 1024,
      temperature: 0.4,
    });
    expect(req.body.reasoning_effort).toBeUndefined();
  });

  test('builds Gemini direct requests with thinkingConfig and raised output tokens', () => {
    const req = request('gemini', {
      modelId: 'gemini-3.5-flash',
      reasoningLevel: 5000,
      maxTokens: 1024,
    });

    expect(req.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(req.headers['x-goog-api-key']).toBe('test-key');
    expect(req.body.generationConfig).toMatchObject({
      maxOutputTokens: 6024,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 5000 },
    });
    expect(req.body).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      systemInstruction: { parts: [{ text: prompt.system }] },
    });
  });

  test('swaps DeepSeek chat to reasoner when reasoning is enabled', () => {
    const req = request('deepseek', {
      modelId: 'deepseek-chat',
      reasoningLevel: true,
    });

    expect(req.body.model).toBe('deepseek-reasoner');
    expect(req.body.temperature).toBeUndefined();
  });

  test('enables Qwen thinking mode with the DashScope compatibility flag', () => {
    const req = request('qwen', {
      modelId: 'qwen3.7-max',
      reasoningLevel: true,
    });

    expect(req.body).toMatchObject({
      model: 'qwen3.7-max',
      enable_thinking: true,
      temperature: 0.25,
    });
  });

  test('maps GLM thinking.type from toggle reasoning', () => {
    const req = request('glm', {
      modelId: 'glm-5.1',
      reasoningLevel: true,
    });

    expect(req.body).toMatchObject({
      model: 'glm-5.1',
      thinking: { type: 'enabled' },
    });
  });

  test('maps Grok reasoning effort and omits temperature', () => {
    const req = request('grok', {
      modelId: 'grok-4.3',
      reasoningLevel: 'low',
      temperature: 0.25,
    });

    expect(req.body).toMatchObject({
      model: 'grok-4.3',
      reasoning_effort: 'low',
    });
    expect(req.body.temperature).toBeUndefined();
  });

  test('keeps temperature on Grok when effort is disabled', () => {
    const req = request('grok', {
      modelId: 'grok-4.3',
      reasoningLevel: false,
      temperature: 0.25,
    });

    expect(req.body).toMatchObject({
      model: 'grok-4.3',
      temperature: 0.25,
    });
    expect(req.body.reasoning_effort).toBeUndefined();
  });

  test('swaps Mistral large to Magistral when reasoning is enabled', () => {
    const req = request('mistral', {
      modelId: 'mistral-large-latest',
      reasoningLevel: true,
    });

    expect(req.body.model).toBe('magistral-medium-latest');
    expect(req.body.temperature).toBeUndefined();
  });

  test('builds MiniMax as OpenAI-compatible without reasoning controls', () => {
    const req = request('minimax', {
      modelId: 'MiniMax-M2.7',
      reasoningLevel: true,
    });

    expect(req.body).toMatchObject({
      model: 'MiniMax-M2.7',
      max_tokens: 1024,
      temperature: 0.25,
    });
    expect(req.body.reasoning_effort).toBeUndefined();
    expect(req.body.thinking).toBeUndefined();
  });

  test('maps Kimi toggle reasoning to thinking.type', () => {
    const req = request('kimi', {
      modelId: 'kimi-k2.6',
      reasoningLevel: true,
    });

    expect(req.body).toMatchObject({
      model: 'kimi-k2.6',
      thinking: { type: 'enabled' },
    });
  });

  test('rewrites proxy-provider URLs through the configured proxy', () => {
    const req = request('grok', {
      modelId: 'grok-4.3',
      proxyUrl: 'https://proxy.example.com/api/',
    });

    expect(req.url).toBe('https://proxy.example.com/api/api.x.ai/v1/chat/completions');
  });

  test('marks proxy providers unavailable without a proxy URL', () => {
    expectUnavailableNeedsProxy(() =>
      request('codex', {
        modelId: 'gpt-5.4',
        proxyUrl: undefined,
      })
    );
  });
});

describe('extractProviderResponse', () => {
  test('skips Anthropic thinking blocks when extracting action text', () => {
    const extracted = extractProviderResponse('claude', {
      content: [
        { type: 'thinking', thinking: 'internal chain' },
        { type: 'text', text: actionJson },
      ],
      usage: { input_tokens: 12, output_tokens: 9 },
    });

    expect(extracted).toEqual({
      text: actionJson,
      usage: { inputTokens: 12, outputTokens: 9 },
      thinkingText: 'internal chain',
    });
  });

  test('extracts OpenAI-compatible choice content and usage', () => {
    const extracted = extractProviderResponse('codex', {
      choices: [{ message: { content: actionJson } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    });

    expect(extracted).toEqual({
      text: actionJson,
      usage: { inputTokens: 20, outputTokens: 10 },
      thinkingText: undefined,
    });
  });

  test('captures DeepSeek reasoning_content separately from action text', () => {
    const extracted = extractProviderResponse('deepseek', {
      choices: [
        {
          message: {
            content: actionJson,
            reasoning_content: 'reasoner notes',
          },
        },
      ],
      usage: { prompt_tokens: 22, completion_tokens: 11 },
    });

    expect(extracted).toEqual({
      text: actionJson,
      usage: { inputTokens: 22, outputTokens: 11 },
      thinkingText: 'reasoner notes',
    });
  });

  test('extracts Gemini candidate part text and usage', () => {
    const extracted = extractProviderResponse('gemini', {
      candidates: [{ content: { parts: [{ text: actionJson }] } }],
      usageMetadata: { promptTokenCount: 18, candidatesTokenCount: 8 },
    });

    expect(extracted).toEqual({
      text: actionJson,
      usage: { inputTokens: 18, outputTokens: 8 },
    });
  });
});

describe('LLMDecisionProvider', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; init: RequestInit | undefined }>;

  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchJson(json: unknown, init: ResponseInit = { status: 200 }): void {
    globalThis.fetch = (async (url, requestInit) => {
      fetchCalls.push({ url: String(url), init: requestInit });
      return new Response(JSON.stringify(json), {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
    }) as typeof fetch;
  }

  function mockFetchText(text: string, init: ResponseInit): void {
    globalThis.fetch = (async (url, requestInit) => {
      fetchCalls.push({ url: String(url), init: requestInit });
      return new Response(text, init);
    }) as typeof fetch;
  }

  test('returns parsed decisions with model and token telemetry', async () => {
    mockFetchJson({
      choices: [{ message: { content: actionJson } }],
      usage: { prompt_tokens: 31, completion_tokens: 12 },
    });
    const provider = new LLMDecisionProvider({
      provider: 'codex',
      modelId: 'gpt-5.4',
      reasoningLevel: 'medium',
      apiKey: 'openai-key',
      proxyUrl,
    });

    const decision = await provider.decide(decisionContext(), new AbortController().signal);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://proxy.example.com/llm/api.openai.com/v1/chat/completions');
    expect(decision).toMatchObject({
      type: 'signal',
      params: { message: 'hello', intensity: 2 },
      reasoning: 'valid action',
      telemetry: {
        modelId: 'gpt-5.4',
        tokens: { input: 31, output: 12 },
      },
    });
  });

  test('throws on non-OK provider responses', async () => {
    mockFetchText('bad gateway', { status: 502, statusText: 'Bad Gateway' });
    const provider = new LLMDecisionProvider({
      provider: 'codex',
      modelId: 'gpt-5.4',
      apiKey: 'openai-key',
      proxyUrl,
    });

    await expect(provider.decide(decisionContext(), new AbortController().signal)).rejects.toThrow(
      'codex request failed: 502 Bad Gateway bad gateway'
    );
  });

  test('throws when extracted text cannot be parsed into an action', async () => {
    mockFetchJson({
      choices: [{ message: { content: 'no action JSON here' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = new LLMDecisionProvider({
      provider: 'codex',
      modelId: 'gpt-5.4',
      apiKey: 'openai-key',
      proxyUrl,
    });

    await expect(provider.decide(decisionContext(), new AbortController().signal)).rejects.toThrow(
      'response did not contain a valid action JSON object'
    );
  });
});

describe('providerAvailability', () => {
  test('reports no-key and needs-proxy independently', () => {
    const keySource = {
      getKey(provider: LLMType) {
        return provider === 'claude' || provider === 'codex' ? `${provider}-key` : undefined;
      },
    };

    const withoutProxy = providerAvailability(keySource);
    expect(withoutProxy.claude).toEqual({ available: true });
    expect(withoutProxy.codex).toEqual({ available: false, reason: 'needs-proxy' });
    expect(withoutProxy.gemini).toEqual({ available: false, reason: 'no-key' });

    const withProxy = providerAvailability(keySource, proxyUrl);
    expect(withProxy.codex).toEqual({ available: true });
  });
});

describe('review follow-ups: effort headroom, custom ids, no-key, budget clamping', () => {
  test('raises the Grok token cap when effort reasoning is enabled', () => {
    const req = buildProviderRequest({
      provider: 'grok' as LLMType,
      modelId: getDefaultModelId('grok' as LLMType),
      reasoningLevel: 'high',
      apiKey: 'k',
      prompt,
      maxTokens: 1024,
      proxyUrl: 'https://proxy.example.com',
    });

    expect(req.body.max_tokens as number).toBeGreaterThanOrEqual(4096);
  });

  test('never swaps a custom (non-catalog) model id, even with reasoning enabled', () => {
    const req = buildProviderRequest({
      provider: 'deepseek' as LLMType,
      modelId: 'my-custom-deepseek-finetune',
      reasoningLevel: true,
      apiKey: 'k',
      prompt,
      maxTokens: 1024,
      proxyUrl: 'https://proxy.example.com',
    });

    expect(req.body.model).toBe('my-custom-deepseek-finetune');
  });

  test('throws no-key when the API key is blank', () => {
    expect(() =>
      buildProviderRequest({
        provider: 'claude' as LLMType,
        modelId: getDefaultModelId('claude' as LLMType),
        apiKey: '   ',
        prompt,
        maxTokens: 1024,
      })
    ).toThrow(ProviderUnavailableError);
  });

  test('clamps Anthropic thinking budgets into the catalog range and keeps max_tokens above them', () => {
    const below = buildProviderRequest({
      provider: 'claude' as LLMType,
      modelId: getDefaultModelId('claude' as LLMType),
      reasoningLevel: 1,
      apiKey: 'k',
      prompt,
      maxTokens: 1024,
    });
    const above = buildProviderRequest({
      provider: 'claude' as LLMType,
      modelId: getDefaultModelId('claude' as LLMType),
      reasoningLevel: 10_000_000,
      apiKey: 'k',
      prompt,
      maxTokens: 1024,
    });

    const belowThinking = below.body.thinking as { budget_tokens: number };
    const aboveThinking = above.body.thinking as { budget_tokens: number };
    expect(belowThinking.budget_tokens).toBe(1024);
    expect(aboveThinking.budget_tokens).toBe(64000);
    expect(above.body.max_tokens as number).toBeGreaterThan(aboveThinking.budget_tokens);
  });
});

describe('createRosterProviderFactory', () => {
  const mkAgent = (id: string) =>
    ({
      id,
      llmType: 'claude',
      x: 0,
      y: 0,
      hunger: 100,
      energy: 100,
      health: 100,
      balance: 100,
      state: 'idle',
    }) as unknown as import('../../../db/schema').Agent;

  const tools = {
    sleepWall: () => Promise.resolve(),
  };

  test('maps baseline roster entries to baseline providers', async () => {
    const { createRosterProviderFactory } = await import('../../../engine/llm/roster-factory');
    const factory = createRosterProviderFactory(
      [{ name: 'Bot', provider: 'baseline_random', modelId: '', color: '#111111' }],
      { getKey: () => undefined }
    );

    expect(factory(mkAgent('a1'), tools).kind).toBe('baseline_random');
  });

  test('returns an unavailable provider that throws no-key when the key is missing', async () => {
    const { createRosterProviderFactory } = await import('../../../engine/llm/roster-factory');
    const factory = createRosterProviderFactory(
      [{ name: 'Claudia', provider: 'claude', modelId: 'claude-sonnet-5', color: '#222222' }],
      { getKey: () => undefined }
    );

    const provider = factory(mkAgent('a1'), tools);
    expect(provider.decide({} as never, new AbortController().signal)).rejects.toThrow(
      /unavailable: no-key/
    );
  });

  test('assigns roster entries round-robin and keeps assignments stable per agent', async () => {
    const { createRosterProviderFactory } = await import('../../../engine/llm/roster-factory');
    const factory = createRosterProviderFactory(
      [
        { name: 'A', provider: 'baseline_random', modelId: '', color: '#111111' },
        { name: 'B', provider: 'baseline_rule', modelId: '', color: '#222222' },
      ],
      { getKey: () => undefined }
    );

    const first = factory(mkAgent('agent-1'), tools).kind;
    const second = factory(mkAgent('agent-2'), tools).kind;
    const firstAgain = factory(mkAgent('agent-1'), tools).kind;

    expect([first, second].sort()).toEqual(['baseline_random', 'baseline_rule']);
    expect(firstAgain).toBe(first);
  });

  test('falls back to the rule-based baseline for an empty roster', async () => {
    const { createRosterProviderFactory } = await import('../../../engine/llm/roster-factory');
    const factory = createRosterProviderFactory([], { getKey: () => 'unused' });

    expect(factory(mkAgent('a1'), tools).kind).toBe('baseline_rule');
  });
});

describe('engine LLM import boundary', () => {
  test('does not load server-only database, cache, queue, telemetry, or legacy adapter modules', () => {
    const loaded = Object.keys(require.cache ?? {});
    const offenders = loaded.filter(
      (path) =>
        path.includes('/db/index') ||
        path.includes('/cache/index') ||
        path.includes('/cache/pubsub') ||
        path.includes('/queue/index') ||
        path.includes('/telemetry/index') ||
        path.includes('/llm/adapters/') ||
        /node_modules\/postgres\//.test(path) ||
        /node_modules\/ioredis\//.test(path)
    );

    expect(offenders).toEqual([]);
  });
});

function decisionContext(): DecisionContext {
  return {
    agent: {
      id: '00000000-0000-4000-8000-0000000000aa',
      tenantId: null,
      llmType: 'codex',
      x: 3,
      y: 4,
      hunger: 80,
      energy: 90,
      health: 100,
      balance: 10,
      state: 'idle',
      color: '#888888',
      personality: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      diedAt: null,
    },
    observation: observation(),
    rng: () => 0.5,
  };
}

function observation(): AgentObservation {
  return {
    tick: 1,
    timestamp: Date.now(),
    self: {
      id: '00000000-0000-4000-8000-0000000000aa',
      x: 3,
      y: 4,
      hunger: 80,
      energy: 90,
      health: 100,
      balance: 10,
      state: 'idle',
      personality: null,
    },
    nearbyAgents: [],
    nearbyLocations: [],
    availableActions: [{ type: 'signal', description: 'Broadcast a signal' }],
    recentEvents: [],
    inventory: [],
  };
}
