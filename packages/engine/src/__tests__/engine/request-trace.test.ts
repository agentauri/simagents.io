import { afterEach, expect, test } from 'bun:test';
import { LLMDecisionProvider } from '../../engine/llm/llm-provider';
import { MAX_TRACE_TEXT_CHARS, type RequestTrace } from '../../engine/llm/request-trace';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const context = { agentId: 'agent', tick: 7 };
const answer = JSON.stringify({ content: [{ type: 'text', text: '{"action":"sleep","params":{"duration":1}}' }] });
test('opt-in captures the actual serialized body and response, without URL or authentication headers', async () => {
  const traces: RequestTrace[] = [];
  let sent = '';
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => { sent = String(init?.body); return new Response(answer); }) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', modelId: 'exact-model', apiKey: 'secret-key', onTrace: trace => traces.push(trace) });
  await provider.decideWithPrompt({ system: 'custom system', user: 'actual observation' }, new AbortController().signal, context);
  expect(traces).toHaveLength(1);
  expect(traces[0].requestBody).toBe(sent);
  expect(traces[0].responseBody).toBe(answer);
  expect(traces[0].outcome).toBe('success');
  expect(JSON.stringify(traces)).not.toContain('secret-key');
  expect(traces[0]).not.toHaveProperty('headers');
  expect(traces[0]).not.toHaveProperty('url');
});
test('connection probes and default transports do not capture content', async () => {
  let count = 0;
  globalThis.fetch = (async () => new Response(answer)) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'key', onTrace: () => count++ });
  await provider.decideWithPrompt({ system: 's', user: 'u' }, new AbortController().signal);
  expect(count).toBe(0);
  await new LLMDecisionProvider({ provider: 'claude', apiKey: 'key' }).decideWithPrompt({ system: 's', user: 'u' }, new AbortController().signal, context);
  expect(count).toBe(0);
});
test('known credentials are redacted before truncation, including escaped content, on invalid responses', async () => {
  const traces: RequestTrace[] = [];
  const secret = 'quoted-"key';
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: secret + 'x'.repeat(30000) } }), { status: 429 })) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: secret, traceSecrets: ['other-key'], onTrace: trace => traces.push(trace) });
  await expect(provider.decideWithPrompt({ system: 's', user: secret + ' other-key' }, new AbortController().signal, context)).rejects.toThrow();
  expect(traces[0].outcome).toBe('failed');
  expect(traces[0].errorCode).toBe('rate-limit');
  expect(traces[0].redacted).toBe(true);
  expect(traces[0].truncated).toBe(true);
  expect(traces[0].responseBody!.length).toBe(MAX_TRACE_TEXT_CHARS);
  expect(JSON.stringify(traces)).not.toContain('other-key');
  expect(JSON.stringify(traces)).not.toContain('quoted-');
});
test('invalid JSON is captured verbatim and collector errors do not cause retries or alter failures', async () => {
  let calls = 0;
  const traces: RequestTrace[] = [];
  globalThis.fetch = (async () => { calls++; return new Response('not JSON'); }) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'key', onTrace: trace => { traces.push(trace); throw new Error('collector failed'); } });
  await expect(provider.decideWithPrompt({ system: 's', user: 'u' }, new AbortController().signal, context)).rejects.toMatchObject({ code: 'incompatible' });
  expect(traces[0].responseBody).toBe('not JSON');
  expect(calls).toBe(1);
});

test('aborted requests are recorded once as ambiguous, without a replacement request', async () => {
  const controller = new AbortController();
  const traces: RequestTrace[] = [];
  let calls = 0;
  globalThis.fetch = (async () => { calls++; controller.abort(); throw new DOMException('Aborted', 'AbortError'); }) as unknown as typeof fetch;
  const provider = new LLMDecisionProvider({ provider: 'claude', apiKey: 'key', onTrace: trace => traces.push(trace) });
  await expect(provider.decideWithPrompt({ system: 's', user: 'u' }, controller.signal, context)).rejects.toThrow();
  expect(traces[0].outcome).toBe('aborted');
  expect(traces[0].responseBody).toBeUndefined();
  expect(calls).toBe(1);
});
