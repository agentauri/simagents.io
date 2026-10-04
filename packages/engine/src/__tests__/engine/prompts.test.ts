import { afterEach, expect, test } from 'bun:test';
import { buildFullPrompt } from '../../llm/prompt-builder';
import { setCustomSystemPrompt, getCustomSystemPrompt } from '../../llm/prompt-manager';
import { getRuntimeConfig, resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { hydrateWorld, serializeWorld } from '../../engine/persistence';

afterEach(() => { resetStore(); resetRuntimeConfig(); setCustomSystemPrompt(null); });
test('custom prompt reaches emergent decisions and persists with configuration', async () => {
  const agent = await createAgent({ llmType: 'fixture' });
  const observation = await buildObservation(agent, 0, [agent], [], []);
  setCustomSystemPrompt('CUSTOM_PROMPT_READING_CHECK {{PERSONALITY}}');
  setRuntimeConfig({ needs: { hungerDecay: 0.75 } });
  expect(buildFullPrompt(observation)).toContain('CUSTOM_PROMPT_READING_CHECK');
  expect(buildFullPrompt(observation)).not.toContain('{{PERSONALITY}}');
  const snapshot = serializeWorld({ savedAtSimTimeMs: 0, speed: 1, worldSeed: 'test' });
  setCustomSystemPrompt(null);
  resetRuntimeConfig();
  hydrateWorld(snapshot);
  expect(getCustomSystemPrompt()).toContain('CUSTOM_PROMPT_READING_CHECK');
  expect(getRuntimeConfig().needs.hungerDecay).toBe(0.75);
});

test('response parsing rejects truncated and malformed actions without repairing them', async () => {
  const { parseResponse } = await import('../../llm/response-parser');
  expect(parseResponse('{"action":"sleep","params":{"duration":1},"reasoning":"unfinished')).toBeNull();
  expect(parseResponse('{"action":"move","params":{"toX":0.5,"toY":0}}')).toBeNull();
  expect(parseResponse('{"action":"consume","params":{"itemType":"food","quantity":-1}}')).toBeNull();
  expect(parseResponse('```json\n{"action":"sleep","params":{"duration":1}}\n```')?.action).toBe('sleep');
});
