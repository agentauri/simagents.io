import { afterEach, expect, test } from 'bun:test';
import { LLMDecisionProvider } from '../../engine/llm/llm-provider';
import { DEFAULT_SESSION_LIMITS, RequestBudget } from '../../engine/llm/request-budget';
import { boundedProviderJson, classifyProviderStatus } from '../../engine/llm/provider-error';
import { createAgent } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { buildObservation } from '../../agents/observer';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; resetStore(); });
async function context() {
  const agent = await createAgent({ llmType: 'claude' });
  return { agent, observation: await buildObservation(agent, 0, [agent], [], []), rng: () => 0.5 };
}
const answer = { content: [{ type: 'text', text: '{"action":"sleep","params":{"duration":1}}' }] };
test('the actual transport counts requests once and cannot exceed its budget', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json(answer); }) as unknown as typeof fetch;
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxRequests: 1 });
  try {
    const provider = new LLMDecisionProvider({ provider: 'claude', modelId: 'fixture', apiKey: 'fixture', budget });
    const ctx = await context();
    expect((await provider.decide(ctx, new AbortController().signal)).type).toBe('sleep');
    await expect(provider.decide(ctx, new AbortController().signal)).rejects.toThrow('request budget');
    expect(calls).toBe(1);
  } finally { budget.dispose(); }
});
test('quota failures are classified without leaking response content or retrying', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ error: { code: 'insufficient_quota', message: 'secret-provider-payload' } }, { status: 429 }); }) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'fixture' });
  try { await provider.decide(await context(), new AbortController().signal); throw new Error('Expected quota failure'); }
  catch (error) {
    expect((error as { code: string }).code).toBe('quota');
    expect(String(error)).not.toContain('secret-provider-payload');
  }
  expect(calls).toBe(1);
});
test('truncated responses are rejected even if the visible JSON looks valid', async () => {
  globalThis.fetch = (async () => Response.json({ ...answer, stop_reason: 'max_tokens' })) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'fixture' });
  await expect(provider.decide(await context(), new AbortController().signal)).rejects.toMatchObject({ code: 'incompatible' });
});
test('response reads are bounded, including responses without content-length', async () => {
  await expect(boundedProviderJson(new Response('x'.repeat(100)), 10)).rejects.toThrow('size limit');
  expect(classifyProviderStatus(401)).toBe('credentials');
  expect(classifyProviderStatus(429)).toBe('rate-limit');
  expect(classifyProviderStatus(503)).toBe('unavailable');
});
test('a queued inference reads the renewed relay token after admission and keeps provider credentials', async () => {
  let admit: (() => void) | undefined;
  let released = 0;
  let token = 'old-relay-token';
  const requests: Headers[] = [];
  globalThis.fetch = (async (_url, init) => { requests.push(new Headers(init?.headers)); return Response.json(answer); }) as typeof fetch;
  const budget = { acquire: () => new Promise<() => void>(resolve => { admit = () => resolve(() => { released++; }); }) } as unknown as RequestBudget;
  const provider = new LLMDecisionProvider({
    provider: 'claude', apiKey: 'provider-key', relayAccessToken: 'old-relay-token', getRelayAccessToken: () => token, budget,
    connection: { id: 'relay-profile', name: 'Claude', providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages',
      credentialRef: 'claude', transport: 'official-relay', relayUrl: 'https://relay.example.test', relayCredentialRef: 'relay:access' },
  });
  const pending = provider.decideWithPrompt({ system: 'fixture', user: 'fixture' }, new AbortController().signal);
  expect(requests).toHaveLength(0);
  token = 'new-relay-token'; admit!();
  expect((await pending).type).toBe('sleep');
  expect(requests[0].get('Authorization')).toBe('Bearer new-relay-token');
  expect(requests[0].get('X-Provider-Key')).toBe('provider-key');
  expect(requests).toHaveLength(1);
  expect(released).toBe(1);
});
test('relay authorization errors cross the Worker boundary as content-free codes without inference retries', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ error: { message: 'secret-relay-payload' } }, { status: 401, headers: { 'X-Simagents-Relay-Error': 'access-denied' } }); }) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'provider-key', relayAccessToken: 'access-token',
    connection: { id: 'relay-profile', name: 'Claude', providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages',
      credentialRef: 'claude', transport: 'official-relay', relayUrl: 'https://relay.example.test', relayCredentialRef: 'relay:access' } });
  await expect(provider.decideWithPrompt({ system: 'fixture', user: 'fixture' }, new AbortController().signal)).rejects.toMatchObject({ issue: { code: 'RELAY_ACCESS' } });
  expect(calls).toBe(1);
});
test('Gemini thinking usage is included where reported; missing totals and cache activity block cost eligibility', async () => {
  const { extractProviderResponse } = await import('../../engine/llm/response-extractor');
  const output = { candidates: [{ content: { parts: [{ text: '{"action":"sleep","params":{"duration":1}}' }] } }] };
  const complete = extractProviderResponse('gemini', { ...output, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6, totalTokenCount: 20 } });
  expect(complete.usage).toEqual({ inputTokens: 10, outputTokens: 10 }); expect(complete.costEligible).toBe(true);
  expect(extractProviderResponse('gemini', { ...output, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 } }).costEligible).toBe(false);
  expect(extractProviderResponse('claude', { content: [], usage: { input_tokens: 10, output_tokens: 4, cache_creation_input_tokens: 3 } }).costEligible).toBe(false);
  expect(extractProviderResponse('codex', { choices: [], usage: { prompt_tokens: 1.5, completion_tokens: -1 } }).usage).toBeUndefined();
});
test('contradictory usage metadata cannot turn output into a fabricated zero-price estimate', async () => {
  const { extractProviderResponse } = await import('../../engine/llm/response-extractor');
  const response = extractProviderResponse('gemini', { candidates: [], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 10 } });
  expect(response.usage?.outputTokens).toBe(4); expect(response.costEligible).toBe(false);
  expect(extractProviderResponse('claude', { content: [], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 'unknown' } }).costEligible).toBe(false);
});
