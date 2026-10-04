/** Browser credentials: memory by default, explicitly encrypted storage only. */
import { LLM_CATALOG, type LLMType as SharedLLMType } from '@simagents/shared';
import { create } from 'zustand';
import { withRelayAuthorization } from '../services/relay-access';
import { useConnectionsStore } from './connections';
import { abortCredentialRequests } from '../services/credential-requests';
import { CredentialVault } from '../services/credential-vault';
import { useEditorStore } from './editor';
import { getEngineClient } from '../engine-host/engine-client';

export type LLMType = SharedLLMType;
export interface LLMProviderInfo { type: LLMType; displayName: string; docsUrl: string; costInfo: string }
export interface ProviderKeyStatus { type: LLMType; source: 'user' | 'none'; disabled: boolean; maskedKey?: string }
export interface ApiKeysState {
  providers: LLMProviderInfo[];
  status: Record<LLMType, ProviderKeyStatus>;
  pendingKeys: Partial<Record<LLMType, string>>;
  isLoading: boolean;
  error: string | null;
  isSynced: boolean;
  hasSavedVault: boolean;
  vaultUnlocked: boolean;
  hasLegacyKeys: boolean;
  fetchStatus: () => Promise<void>;
  setPendingKey: (type: LLMType, key: string) => void;
  applyKeys: () => Promise<void>;
  clearKey: (type: LLMType) => Promise<void>;
  toggleDisabled: (type: LLMType) => Promise<void>;
  discardPendingKeys: () => void;
  hasPendingChanges: () => boolean;
  hasAnyActiveKey: () => boolean;
  getActiveKeys: () => Record<string, string>;
  setCredential: (reference: string, key: string) => Promise<void>;
  credentialRevision: number;
  saveVault: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  migrateLegacy: (passphrase?: string) => Promise<void>;
  lockVault: () => Promise<void>;
  forgetVault: () => Promise<void>;
}
const DISABLED_STORAGE_KEY = 'simagents_disabled_keys';
const ALL_TYPES = LLM_CATALOG.map((provider) => provider.id);
const vault = new CredentialVault(() => localStorage);
function disabledTypes(): LLMType[] {
  try {
    const value = JSON.parse(localStorage.getItem(DISABLED_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is LLMType => ALL_TYPES.includes(id)) : [];
  } catch { return []; }
}
function stateFromMemory() {
  const keys = vault.read();
  const disabled = new Set(disabledTypes());
  return Object.fromEntries(ALL_TYPES.map((type) => [type, {
    type, source: keys[type] ? 'user' : 'none', disabled: disabled.has(type),
    maskedKey: keys[type] ? (keys[type].length <= 8 ? '****' : `****${keys[type].slice(-4)}`) : undefined,
  }])) as Record<LLMType, ProviderKeyStatus>;
}
export function getActiveApiKeys(): Record<string, string> {
  const keys = vault.read();
  const disabled = new Set(disabledTypes());
  return withRelayAuthorization(Object.fromEntries(Object.entries(keys).filter(([id]) => !disabled.has(id as LLMType))), useConnectionsStore.getState().profiles);
}
async function stopCredentialSession(): Promise<void> {
  abortCredentialRequests();
  const client = getEngineClient();
  if (client.getStatus() !== 'disconnected') {
    // Pause flushes a snapshot; termination also destroys credentials held in the Worker.
    try { await client.pause(); } catch { /* A failed Worker must still be terminated. */ }
    client.resetHard();
    if (typeof window !== 'undefined') {
      useEditorStore.getState().setPaused(true);
      useEditorStore.getState().setMode('editor');
    }
  }
}
export const useApiKeysStore = create<ApiKeysState>((set, get) => {
  const refresh = () => {
    set({ status: stateFromMemory(), isSynced: true });
    set({ hasSavedVault: vault.hasSaved(), vaultUnlocked: vault.isUnlocked(), hasLegacyKeys: vault.hasLegacy() });
  };
  const run = async (operation: () => void | Promise<void>) => {
    if (get().isLoading) { set({ error: 'A credential operation is already running' }); return; }
    set({ isLoading: true, error: null });
    try { await operation(); refresh(); set({ credentialRevision: get().credentialRevision + 1 }); }
    catch (error) {
      set({ error: error instanceof Error ? error.message : 'Credential operation failed' });
      // Callers inspect store.error; never log secret-bearing input or exceptions.
    } finally { set({ isLoading: false }); }
  };
  return {
    providers: LLM_CATALOG.map((p) => ({ type: p.id, displayName: p.displayName, docsUrl: p.docsUrl, costInfo: `Default: ${p.defaultModelId}` })),
    credentialRevision: 0,
    status: stateFromMemory(), pendingKeys: {}, isLoading: false, error: null, isSynced: false,
    hasSavedVault: false, vaultUnlocked: false, hasLegacyKeys: false,
    fetchStatus: async () => {
      try { refresh(); } catch { set({ error: 'Device storage is unavailable. Session keys still work.' }); }
    },
    setPendingKey: (type, key) => set({ pendingKeys: { ...get().pendingKeys, [type]: key } }),
    applyKeys: () => run(async () => {
      const next = vault.read();
      for (const [type, key] of Object.entries(get().pendingKeys)) {
        if (key?.trim()) next[type] = key.trim(); else delete next[type];
      }
      await stopCredentialSession();
      vault.set(next);
      set({ pendingKeys: {} });
    }),
    clearKey: (type) => run(async () => {
      await stopCredentialSession();
      const keys = vault.read(); delete keys[type]; vault.set(keys);
      const pendingKeys = { ...get().pendingKeys }; delete pendingKeys[type]; set({ pendingKeys });
    }),
    toggleDisabled: (type) => run(async () => {
      await stopCredentialSession();
      const disabled = new Set(disabledTypes());
      if (disabled.has(type)) disabled.delete(type); else disabled.add(type);
      localStorage.setItem(DISABLED_STORAGE_KEY, JSON.stringify([...disabled]));
    }),
    discardPendingKeys: () => set({ pendingKeys: {} }),
    hasPendingChanges: () => Object.keys(get().pendingKeys).length > 0,
    hasAnyActiveKey: () => Object.keys(getActiveApiKeys()).length > 0,
    getActiveKeys: getActiveApiKeys,
    setCredential: (reference, key) => run(async () => {
      await stopCredentialSession();
      const next = vault.read();
      if (key.trim()) next[reference] = key.trim(); else delete next[reference];
      vault.set(next);
    }),
    saveVault: (passphrase) => run(() => vault.save(passphrase)),
    unlockVault: (passphrase) => run(async () => { await stopCredentialSession(); await vault.unlock(passphrase); }),
    migrateLegacy: (passphrase) => run(async () => { await stopCredentialSession(); await vault.migrate(passphrase); }),
    lockVault: () => run(async () => { await stopCredentialSession(); vault.lock(); set({ pendingKeys: {} }); }),
    forgetVault: () => run(() => vault.forgetSaved()),
  };
});
export const useProviders = () => useApiKeysStore((state) => state.providers);
export const useKeyStatus = (type: LLMType) => useApiKeysStore((state) => state.status[type]);
export const useAllKeyStatus = () => useApiKeysStore((state) => state.status);
export const usePendingKeys = () => useApiKeysStore((state) => state.pendingKeys);
export const useApiKeysLoading = () => useApiKeysStore((state) => state.isLoading);
export const useApiKeysError = () => useApiKeysStore((state) => state.error);
export const useIsSynced = () => useApiKeysStore((state) => state.isSynced);
