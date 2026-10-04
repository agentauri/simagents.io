import { expect, test } from 'bun:test';
import { defaultConnection } from '@simagents/shared';
import { byokPreflight, internalFixturesEnabled } from '../services/byok-preflight';
const profile = defaultConnection('claude');
const agent = { name: 'A', provider: 'claude' as const, modelId: 'custom-model', color: '#000000', connectionId: profile.id };
test('public sessions require profiles/keys and never accept internal baselines or the legacy bypass', () => {
  expect(internalFixturesEnabled()).toBe(false);
  expect(byokPreflight([], {}, '')).toContain('Add at least one');
  expect(byokPreflight([agent], {}, '', false, [profile])).toContain('enter or unlock');
  expect(byokPreflight([{ ...agent, connectionId: undefined }], { claude: 'fixture' }, '')).toContain('convert provider settings');
  expect(byokPreflight([{ ...agent, provider: 'baseline_rule' }], {}, '')).toContain('internal test');
  expect(byokPreflight([{ ...agent, provider: 'baseline_rule' }], {}, '', true)).toBeUndefined();
  expect(byokPreflight([agent], { claude: 'fixture' }, '', false, [profile])).toBeUndefined();
});
test('proxy routes cannot embed credentials or insecure URLs', () => {
  const profile = defaultConnection('codex', 'https://relay.example.com/v1');
  const roster = [{ ...agent, provider: 'codex' as const, connectionId: profile.id }];
  for (const relayUrl of ['', 'http://example.com', 'https://secret@example.com', 'https://example.com?key=secret']) {
    expect(byokPreflight(roster, { codex: 'fixture' }, '', false, [{ ...profile, relayUrl }])).toBeDefined();
  }
  expect(byokPreflight(roster, { codex: 'fixture' }, '', false, [profile])).toBeUndefined();
});
