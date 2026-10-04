import { expect, test } from 'bun:test';
import { migrateLegacyProfiles, LEGACY_ROSTER_BACKUP_KEY } from '../services/legacy-profile-migration';
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage };
}
const entry = { id: 'stable-agent', name: 'Renamable', provider: 'codex' as const, modelId: 'exact-old-model', color: '#123456', reasoningLevel: 'low' };
test('conversion preserves exact roster identity/model/parameters, legacy protocol and credential references', () => {
  const { storage, values } = fixture();
  const original = JSON.stringify([entry]); values.set('simagents_agent_roster', original); values.set('simagents_proxy_url', 'https://self-relay.example');
  values.set('simagents_api_keys', 'DO NOT READ OR CHANGE');
  const result = migrateLegacyProfiles(storage, []);
  expect(result.roster[0]).toEqual({ ...entry, connectionId: 'migrated:codex' });
  expect(result.profiles[0].protocol).toBe('chat-completions');
  expect(result.profiles[0].credentialRef).toBe('codex');
  expect(result.profiles[0].relayUrl).toBe('https://self-relay.example');
  expect(values.get(LEGACY_ROSTER_BACKUP_KEY)).toBe(original);
  expect(values.get('simagents_api_keys')).toBe('DO NOT READ OR CHANGE');
  expect(migrateLegacyProfiles(storage, []).changed).toBe(false);
});
test('failed metadata writes preserve the old roster and malformed storage is not overwritten', () => {
  const { storage, values } = fixture();
  const original = JSON.stringify([{ ...entry, provider: 'claude' }]); values.set('simagents_agent_roster', original);
  storage.setItem = (key, value) => { if (key === 'simagents_connections_v1') throw new Error('quota'); values.set(key, value); };
  expect(() => migrateLegacyProfiles(storage, [])).toThrow('quota');
  expect(values.get('simagents_agent_roster')).toBe(original);
  values.set('simagents_connections_v1', '{broken');
  expect(() => migrateLegacyProfiles(storage, [])).toThrow('Original data was preserved');
  expect(values.get('simagents_connections_v1')).toBe('{broken');
});
test('incomplete relay settings stay blocked and never become a direct connection silently', () => {
  const { storage, values } = fixture(); values.set('simagents_agent_roster', JSON.stringify([entry]));
  const result = migrateLegacyProfiles(storage, []);
  expect(result.changed).toBe(false); expect(result.profiles).toHaveLength(0); expect(result.notices).toHaveLength(1);
});
test('existing profile IDs are never overwritten and fresh users receive a verifiable profile', () => {
  const { storage } = fixture();
  const result = migrateLegacyProfiles(storage, [{ ...entry, provider: 'claude' }]);
  expect(result.roster[0].connectionId).toBe('migrated:claude');
  expect(result.profiles[0].transport).toBe('direct');
});
