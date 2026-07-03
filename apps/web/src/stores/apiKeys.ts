/**
 * API Keys Store
 *
 * Manages browser-local LLM API key state.
 * - Keys are stored only in localStorage
 * - Provider metadata comes from the shared browser-safe catalog
 * - No key material is sent to the server
 */

import { LLM_CATALOG, type LLMType as SharedLLMType } from '@simagents/shared';
import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export type LLMType = SharedLLMType;

export interface LLMProviderInfo {
  type: LLMType;
  displayName: string;
  docsUrl: string;
  costInfo: string;
}

export interface ProviderKeyStatus {
  type: LLMType;
  source: 'user' | 'none';
  disabled: boolean;
  maskedKey?: string;
}

export interface ApiKeysState {
  // State
  providers: LLMProviderInfo[];
  status: Record<LLMType, ProviderKeyStatus>;
  pendingKeys: Record<LLMType, string>;
  isLoading: boolean;
  error: string | null;
  isSynced: boolean;

  // Actions
  fetchStatus: () => Promise<void>;
  setPendingKey: (type: LLMType, key: string) => void;
  applyKeys: () => Promise<void>;
  clearKey: (type: LLMType) => Promise<void>;
  toggleDisabled: (type: LLMType) => Promise<void>;
  discardPendingKeys: () => void;
  hasPendingChanges: () => boolean;
  hasAnyActiveKey: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const KEYS_STORAGE_KEY = 'simagents_api_keys';
const DISABLED_STORAGE_KEY = 'simagents_disabled_keys';
const ALL_TYPES = LLM_CATALOG.map((provider) => provider.id);

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function loadKeysFromStorage(): Partial<Record<LLMType, string>> {
  if (!canUseLocalStorage()) return {};

  try {
    const saved = localStorage.getItem(KEYS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to load keys from localStorage:', e);
    return {};
  }
}

function saveKeysToStorage(keys: Partial<Record<LLMType, string>>): void {
  if (!canUseLocalStorage()) return;

  try {
    if (Object.keys(keys).length === 0) {
      localStorage.removeItem(KEYS_STORAGE_KEY);
    } else {
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to save keys to localStorage:', e);
  }
}

function loadDisabledFromStorage(): LLMType[] {
  if (!canUseLocalStorage()) return [];

  try {
    const saved = localStorage.getItem(DISABLED_STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((type): type is LLMType =>
      ALL_TYPES.includes(type as LLMType)
    );
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to load disabled from localStorage:', e);
    return [];
  }
}

function saveDisabledToStorage(disabled: LLMType[]): void {
  if (!canUseLocalStorage()) return;

  try {
    if (disabled.length === 0) {
      localStorage.removeItem(DISABLED_STORAGE_KEY);
    } else {
      localStorage.setItem(DISABLED_STORAGE_KEY, JSON.stringify(disabled));
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to save disabled to localStorage:', e);
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `****${key.slice(-4)}`;
}

function getProvidersFromCatalog(): LLMProviderInfo[] {
  return LLM_CATALOG.map((provider) => {
    const defaultModel = provider.models.find((model) => model.id === provider.defaultModelId);
    return {
      type: provider.id,
      displayName: provider.displayName,
      docsUrl: provider.docsUrl,
      costInfo: `Default: ${defaultModel?.label ?? provider.defaultModelId}`,
    };
  });
}

function createStatusFromStorage(): Record<LLMType, ProviderKeyStatus> {
  const keys = loadKeysFromStorage();
  const disabled = new Set(loadDisabledFromStorage());
  const status: Partial<Record<LLMType, ProviderKeyStatus>> = {};

  for (const type of ALL_TYPES) {
    const key = keys[type];
    status[type] = {
      type,
      source: key ? 'user' : 'none',
      disabled: disabled.has(type),
      maskedKey: key ? maskKey(key) : undefined,
    };
  }

  return status as Record<LLMType, ProviderKeyStatus>;
}

// =============================================================================
// Store
// =============================================================================

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  // Initial state
  providers: getProvidersFromCatalog(),
  status: createStatusFromStorage(),
  pendingKeys: {} as Record<LLMType, string>,
  isLoading: false,
  error: null,
  isSynced: false,

  // Refresh localStorage-backed status.
  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      set({
        providers: getProvidersFromCatalog(),
        status: createStatusFromStorage(),
        isLoading: false,
        isSynced: true,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load keys status';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Fetch error:', e);
    }
  },

  // Set a pending key (not yet applied).
  setPendingKey: (type: LLMType, key: string) => {
    const { pendingKeys } = get();
    if (key === '') {
      const { [type]: _, ...rest } = pendingKeys;
      set({ pendingKeys: rest as Record<LLMType, string> });
      return;
    }

    set({ pendingKeys: { ...pendingKeys, [type]: key } });
  },

  // Apply pending keys to localStorage.
  applyKeys: async () => {
    const { pendingKeys, status } = get();
    if (Object.keys(pendingKeys).length === 0) return;

    set({ isLoading: true, error: null });
    try {
      const storedKeys = loadKeysFromStorage();
      const newKeys = { ...storedKeys, ...pendingKeys };
      saveKeysToStorage(newKeys);

      const newStatus = { ...status };
      for (const type of Object.keys(pendingKeys) as LLMType[]) {
        newStatus[type] = {
          ...newStatus[type],
          source: 'user',
          maskedKey: maskKey(pendingKeys[type]),
        };
      }

      set({
        status: newStatus,
        pendingKeys: {} as Record<LLMType, string>,
        isLoading: false,
        isSynced: true,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to apply keys';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Apply error:', e);
    }
  },

  // Clear a user-provided key.
  clearKey: async (type: LLMType) => {
    const { status } = get();
    if (status[type].source !== 'user') return;

    set({ isLoading: true, error: null });
    try {
      const storedKeys = loadKeysFromStorage();
      delete storedKeys[type];
      saveKeysToStorage(storedKeys);

      const disabled = loadDisabledFromStorage().filter((entry) => entry !== type);
      saveDisabledToStorage(disabled);

      const newStatus = { ...status };
      newStatus[type] = { type, source: 'none', disabled: false };

      set({ status: newStatus, isLoading: false, isSynced: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to clear key';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Clear error:', e);
    }
  },

  // Toggle disabled state.
  toggleDisabled: async (type: LLMType) => {
    const { status } = get();
    const newDisabled = !status[type].disabled;

    set({ isLoading: true, error: null });
    try {
      const storedDisabled = loadDisabledFromStorage();
      const nextDisabled = newDisabled
        ? Array.from(new Set([...storedDisabled, type]))
        : storedDisabled.filter((entry) => entry !== type);

      saveDisabledToStorage(nextDisabled);

      const newStatus = { ...status };
      newStatus[type] = { ...newStatus[type], disabled: newDisabled };
      set({ status: newStatus, isLoading: false, isSynced: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to toggle key';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Toggle error:', e);
    }
  },

  // Discard pending changes.
  discardPendingKeys: () => {
    set({ pendingKeys: {} as Record<LLMType, string> });
  },

  // Check if there are pending changes.
  hasPendingChanges: () => {
    const { pendingKeys } = get();
    return Object.keys(pendingKeys).length > 0;
  },

  // Check if any user key is active.
  hasAnyActiveKey: () => {
    const { status } = get();
    return Object.values(status).some((s) => s.source === 'user' && !s.disabled);
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useProviders = () => useApiKeysStore((state) => state.providers);
export const useKeyStatus = (type: LLMType) =>
  useApiKeysStore((state) => state.status[type]);
export const useAllKeyStatus = () => useApiKeysStore((state) => state.status);
export const usePendingKeys = () => useApiKeysStore((state) => state.pendingKeys);
export const useApiKeysLoading = () => useApiKeysStore((state) => state.isLoading);
export const useApiKeysError = () => useApiKeysStore((state) => state.error);
export const useIsSynced = () => useApiKeysStore((state) => state.isSynced);
