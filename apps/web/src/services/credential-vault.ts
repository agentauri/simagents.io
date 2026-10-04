/** Credentials stay in memory unless explicitly encrypted by the user. */
export const LEGACY_KEYS_KEY = 'simagents_api_keys';
export const VAULT_KEY = 'simagents_credential_vault_v1';
const ITERATIONS = 600_000;
const MAX_BYTES = 128 * 1024;
const AAD = new TextEncoder().encode('SimAgents credential vault v1');
export type Credentials = Record<string, string>;
export type VaultStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Envelope {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function credentials(value: unknown): Credentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credential data');
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error('Too many credentials');
  const result: Credentials = {};
  for (const [id, key] of entries) {
    if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) ||
        typeof key !== 'string' || !key.trim() || key.length > 16000) throw new Error('Invalid credential data');
    result[id] = key.trim();
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES / 2) throw new Error('Credential data exceeds the size limit');
  return result;
}
function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}
function decode(value: unknown, length?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > MAX_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid encrypted vault');
  const decoded = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (length !== undefined && decoded.length !== length) throw new Error('Invalid encrypted vault');
  return decoded;
}
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a passphrase of 12–1024 characters');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptCredentials(keys: Credentials, passphrase: string): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(credentials(keys)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await derive(passphrase, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plain);
    const envelope: Envelope = { version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
      salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
    return JSON.stringify(envelope);
  } finally { plain.fill(0); }
}
export async function decryptCredentials(raw: string, passphrase: string): Promise<Credentials> {
  if (raw.length > MAX_BYTES) throw new Error('Encrypted vault exceeds the size limit');
  let envelope: Envelope;
  try { envelope = JSON.parse(raw); } catch { throw new Error('Invalid encrypted vault'); }
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) {
    throw new Error('Unsupported encrypted vault format');
  }
  const salt = decode(envelope.salt, 16);
  const iv = decode(envelope.iv, 12);
  const ciphertext = decode(envelope.ciphertext);
  if (ciphertext.length < 16) throw new Error('Invalid encrypted vault');
  const key = await derive(passphrase, salt);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, ciphertext));
  } catch { throw new Error('Unable to unlock: incorrect passphrase or damaged vault'); }
  try { return credentials(JSON.parse(new TextDecoder().decode(plain))); }
  catch { throw new Error('Invalid credential data'); }
  finally { plain.fill(0); }
}

export class CredentialVault {
  private keys: Credentials = {};
  private revision = 0;
  private unlocked = false;
  constructor(private readonly storage: () => VaultStorage) {}
  read(): Credentials { return { ...this.keys }; }
  hasSaved(): boolean { return this.storage().getItem(VAULT_KEY) !== null; }
  hasLegacy(): boolean { return this.storage().getItem(LEGACY_KEYS_KEY) !== null; }
  isUnlocked(): boolean { return this.unlocked; }
  set(keys: Credentials): void { this.keys = credentials(keys); this.revision++; }
  lock(): void { this.keys = {}; this.unlocked = false; this.revision++; }
  forgetSaved(): void { this.storage().removeItem(VAULT_KEY); this.unlocked = false; this.revision++; }
  async save(passphrase: string): Promise<void> {
    if (this.hasSaved() && !this.unlocked) throw new Error('Unlock or remove the existing vault before replacing it');
    const previous = this.storage().getItem(VAULT_KEY);
    const revision = this.revision;
    const encrypted = await encryptCredentials(this.keys, passphrase);
    this.assertCurrent(revision);
    if (this.storage().getItem(VAULT_KEY) !== previous) throw new Error('The saved vault changed in another tab; unlock it again before saving');
    this.write(encrypted);
    this.unlocked = true;
    this.revision++;
  }
  async unlock(passphrase: string): Promise<void> {
    const raw = this.storage().getItem(VAULT_KEY);
    if (!raw) throw new Error('No encrypted vault found');
    const revision = this.revision;
    const loaded = await decryptCredentials(raw, passphrase);
    this.assertCurrent(revision);
    if (this.storage().getItem(VAULT_KEY) !== raw) throw new Error('The saved vault changed during unlock; try again explicitly');
    // Newly entered in-memory keys win over older saved versions.
    this.set({ ...loaded, ...this.keys });
    this.unlocked = true;
  }
  /** Explicit migration only. Never read legacy plaintext at application startup. */
  async migrate(passphrase?: string): Promise<void> {
    const raw = this.storage().getItem(LEGACY_KEYS_KEY);
    if (raw === null) throw new Error('No legacy credentials found');
    if (raw.length > MAX_BYTES) throw new Error('Legacy credential data exceeds the size limit');
    let legacy: Credentials;
    try { legacy = credentials(JSON.parse(raw)); } catch { throw new Error('Legacy credentials are invalid; original data was preserved'); }
    if (this.hasSaved() && !this.unlocked) throw new Error('Unlock the existing vault before migrating legacy credentials');
    const next = { ...legacy, ...this.keys };
    const previousVault = this.storage().getItem(VAULT_KEY);
    const revision = this.revision;
    if (passphrase !== undefined) {
      const encrypted = await encryptCredentials(next, passphrase);
      this.assertCurrent(revision);
      if (this.storage().getItem(VAULT_KEY) !== previousVault || this.storage().getItem(LEGACY_KEYS_KEY) !== raw) throw new Error('Stored credentials changed during migration; original data was preserved');
      this.write(encrypted);
    }
    this.assertCurrent(revision);
    if (this.storage().getItem(LEGACY_KEYS_KEY) !== raw) throw new Error('Legacy credentials changed during migration; original data was preserved');
    this.storage().removeItem(LEGACY_KEYS_KEY);
    this.set(next);
    if (passphrase !== undefined) this.unlocked = true;
  }
  private assertCurrent(revision: number): void {
    if (revision !== this.revision) throw new Error('Credentials changed during this operation; try again explicitly');
  }
  private write(encrypted: string): void {
    const storage = this.storage();
    storage.setItem(VAULT_KEY, encrypted);
    if (storage.getItem(VAULT_KEY) !== encrypted) throw new Error('Unable to verify the encrypted vault write');
  }
}
