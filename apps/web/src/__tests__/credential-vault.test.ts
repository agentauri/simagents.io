import { expect, test } from 'bun:test';
import { CredentialVault, encryptCredentials, decryptCredentials, LEGACY_KEYS_KEY, VAULT_KEY } from '../services/credential-vault';
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  return { values, storage, vault: new CredentialVault(() => storage) };
}
const passphrase = 'correct horse fixture only';

test('credentials are memory-only by default, cloned and cleared on lock', () => {
  const { vault, values } = fixture();
  vault.set({ codex: 'fixture-secret' });
  vault.read().codex = 'changed';
  expect(vault.read().codex).toBe('fixture-secret');
  expect(values.size).toBe(0);
  vault.lock();
  expect(vault.read()).toEqual({});
});
test('randomized authenticated encryption roundtrips without storing secrets or passphrase', async () => {
  const a = await encryptCredentials({ codex: 'fixture-secret' }, passphrase);
  const b = await encryptCredentials({ codex: 'fixture-secret' }, passphrase);
  expect(a).not.toBe(b);
  expect(a).not.toContain('fixture-secret');
  expect(a).not.toContain(passphrase);
  expect(await decryptCredentials(a, passphrase)).toEqual({ codex: 'fixture-secret' });
  await expect(decryptCredentials(a, 'wrong passphrase here')).rejects.toThrow('Unable to unlock');
  const tampered = JSON.parse(a);
  tampered.ciphertext = (tampered.ciphertext[0] === 'A' ? 'B' : 'A') + tampered.ciphertext.slice(1);
  await expect(decryptCredentials(JSON.stringify(tampered), passphrase)).rejects.toThrow('Unable to unlock');
  tampered.iterations = 999999999;
  await expect(decryptCredentials(JSON.stringify(tampered), passphrase)).rejects.toThrow('Unsupported');
});
test('reload keeps vault locked and failed unlock preserves existing memory', async () => {
  const { vault, storage } = fixture();
  vault.set({ codex: 'saved-secret' });
  await vault.save(passphrase);
  const reloaded = new CredentialVault(() => storage);
  expect(reloaded.hasSaved()).toBe(true);
  expect(reloaded.read()).toEqual({});
  reloaded.set({ claude: 'new-secret' });
  await expect(reloaded.unlock('wrong passphrase here')).rejects.toThrow();
  expect(reloaded.read()).toEqual({ claude: 'new-secret' });
  await reloaded.unlock(passphrase);
  expect(reloaded.read()).toEqual({ codex: 'saved-secret', claude: 'new-secret' });
});
test('legacy credentials require explicit migration and are removed only after successful encrypted write', async () => {
  const { vault, values, storage } = fixture();
  const legacy = JSON.stringify({ codex: 'old-secret' });
  values.set(LEGACY_KEYS_KEY, legacy);
  expect(vault.hasLegacy()).toBe(true);
  expect(vault.read()).toEqual({});
  const write = storage.setItem;
  storage.setItem = () => { throw new Error('storage full'); };
  await expect(vault.migrate(passphrase)).rejects.toThrow('storage full');
  expect(values.get(LEGACY_KEYS_KEY)).toBe(legacy);
  expect(vault.read()).toEqual({});
  storage.setItem = write;
  await vault.migrate(passphrase);
  expect(values.has(LEGACY_KEYS_KEY)).toBe(false);
  expect(await decryptCredentials(values.get(VAULT_KEY)!, passphrase)).toEqual({ codex: 'old-secret' });
});
test('session-only migration and malformed legacy input preserve explicit intent', async () => {
  const { vault, values } = fixture();
  values.set(LEGACY_KEYS_KEY, '{invalid secret content');
  await expect(vault.migrate()).rejects.toThrow('original data was preserved');
  expect(values.has(LEGACY_KEYS_KEY)).toBe(true);
  values.set(LEGACY_KEYS_KEY, JSON.stringify({ codex: 'old-secret' }));
  await vault.migrate();
  expect(values.size).toBe(0);
  expect(vault.read()).toEqual({ codex: 'old-secret' });
});
test('locking while encryption is pending cannot restore or persist credentials', async () => {
  const { vault, values } = fixture();
  vault.set({ codex: 'secret' });
  const saving = vault.save(passphrase);
  vault.lock();
  await expect(saving).rejects.toThrow('changed during');
  expect(vault.read()).toEqual({});
  expect(values.size).toBe(0);
});

test('saving refuses to overwrite a vault changed by another tab during encryption', async () => {
  const { vault, values } = fixture();
  vault.set({ codex: 'secret' });
  const pending = vault.save(passphrase);
  values.set(VAULT_KEY, 'changed-in-another-tab');
  await expect(pending).rejects.toThrow('another tab');
  expect(values.get(VAULT_KEY)).toBe('changed-in-another-tab');
});
test('migration cannot overwrite a locked existing vault', async () => {
  const { vault, values } = fixture();
  values.set(VAULT_KEY, 'existing-vault');
  values.set(LEGACY_KEYS_KEY, JSON.stringify({ codex: 'old-secret' }));
  await expect(vault.migrate(passphrase)).rejects.toThrow('Unlock the existing');
  expect(values.get(VAULT_KEY)).toBe('existing-vault');
  expect(values.has(LEGACY_KEYS_KEY)).toBe(true);
});
