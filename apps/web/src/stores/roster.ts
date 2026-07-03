import {
  DEFAULT_AGENT_ROSTER,
  getDefaultModelId,
  isLLMProviderId,
  isRosterProvider,
  type AgentRosterEntry,
  type AgentRosterProvider,
} from '@simagents/shared';
import { create } from 'zustand';

const ROSTER_STORAGE_KEY = 'simagents_agent_roster';
const DEFAULT_COLOR = '#6b7280';

type AddRosterEntry = Partial<AgentRosterEntry> & { provider: AgentRosterProvider };

interface RosterState {
  roster: AgentRosterEntry[];
  addEntry: (entry: AddRosterEntry) => void;
  removeEntry: (index: number) => void;
  updateEntry: (index: number, patch: Partial<AgentRosterEntry>) => void;
  setRoster: (roster: AgentRosterEntry[]) => void;
  resetRoster: () => void;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function cloneDefaultRoster(): AgentRosterEntry[] {
  return DEFAULT_AGENT_ROSTER.map((entry) => ({ ...entry }));
}

function defaultName(provider: AgentRosterProvider, index: number): string {
  const label = provider.replace(/^baseline_/, '').replace(/_/g, '-');
  return `${label}-${index + 1}`;
}

function defaultModelId(provider: AgentRosterProvider): string {
  return isLLMProviderId(provider) ? getDefaultModelId(provider) : provider;
}

function normalizeEntry(
  entry: Partial<AgentRosterEntry> & { provider?: string },
  index: number
): AgentRosterEntry | null {
  if (!entry.provider || !isRosterProvider(entry.provider)) return null;

  const provider = entry.provider;
  const modelId = entry.modelId?.trim() || defaultModelId(provider);
  const name = entry.name?.trim() || defaultName(provider, index);
  const color = entry.color?.trim() || DEFAULT_COLOR;

  return {
    name,
    provider,
    modelId,
    ...(entry.reasoningLevel !== undefined ? { reasoningLevel: entry.reasoningLevel } : {}),
    color,
    personality: entry.personality ?? null,
  };
}

function normalizeRoster(value: unknown): AgentRosterEntry[] {
  if (!Array.isArray(value)) return cloneDefaultRoster();

  const normalized = value
    .map((entry, index) => normalizeEntry(entry as Partial<AgentRosterEntry>, index))
    .filter((entry): entry is AgentRosterEntry => entry !== null);

  return normalized.length > 0 ? normalized : cloneDefaultRoster();
}

function loadRosterFromStorage(): AgentRosterEntry[] {
  if (!canUseLocalStorage()) return cloneDefaultRoster();

  try {
    const saved = localStorage.getItem(ROSTER_STORAGE_KEY);
    return saved ? normalizeRoster(JSON.parse(saved)) : cloneDefaultRoster();
  } catch (e) {
    console.warn('[RosterStore] Failed to load roster from localStorage:', e);
    return cloneDefaultRoster();
  }
}

function saveRosterToStorage(roster: AgentRosterEntry[]): void {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  } catch (e) {
    console.warn('[RosterStore] Failed to save roster to localStorage:', e);
  }
}

export const useRosterStore = create<RosterState>((set, get) => ({
  roster: loadRosterFromStorage(),

  addEntry: (entry) => {
    const roster = get().roster;
    const normalized = normalizeEntry(entry, roster.length);
    if (!normalized) return;

    const nextRoster = [...roster, normalized];
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  removeEntry: (index) => {
    const nextRoster = get().roster.filter((_, currentIndex) => currentIndex !== index);
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  updateEntry: (index, patch) => {
    const roster = get().roster;
    const current = roster[index];
    if (!current) return;

    const providerChanged = patch.provider !== undefined && patch.provider !== current.provider;
    const merged = {
      ...current,
      ...patch,
      modelId: providerChanged && patch.modelId === undefined
        ? undefined
        : patch.modelId ?? current.modelId,
    };
    const normalized = normalizeEntry(merged, index);
    if (!normalized) return;

    const nextRoster = roster.map((entry, currentIndex) =>
      currentIndex === index ? normalized : entry
    );
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  setRoster: (roster) => {
    const normalized = normalizeRoster(roster);
    saveRosterToStorage(normalized);
    set({ roster: normalized });
  },

  resetRoster: () => {
    const roster = cloneDefaultRoster();
    saveRosterToStorage(roster);
    set({ roster });
  },
}));

export const useAgentRoster = () => useRosterStore((state) => state.roster);
