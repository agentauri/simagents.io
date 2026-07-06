/**
 * Configuration Store
 *
 * Manages simulation configuration state.
 * Syncs with backend API and persists user preferences to localStorage.
 */

import { create } from 'zustand';
import { CONFIG } from '@simagents/engine/config';
import { getEngineClient } from '../engine-host/engine-client';

// =============================================================================
// Types
// =============================================================================

export interface SimulationConfig {
  tickIntervalMs: number;
  gridSize: number;
  visibilityRadius: number;
  testMode: boolean;
  randomSeed: number;
  maxTicks: number;
}

export interface AgentConfig {
  startingBalance: number;
  startingHunger: number;
  startingEnergy: number;
  startingHealth: number;
}

export interface NeedsConfig {
  hungerDecay: number;
  energyDecay: number;
  lowHungerThreshold: number;
  criticalHungerThreshold: number;
  lowEnergyThreshold: number;
  criticalEnergyThreshold: number;
  hungerEnergyDrain: number;
  criticalHungerHealthDamage: number;
  criticalEnergyHealthDamage: number;
}

export interface ExperimentConfig {
  enablePersonalities: boolean;
  useEmergentPrompt: boolean;
  safetyLevel: 'standard' | 'minimal' | 'none';
  includeBaselineAgents: boolean;
  normalizeCapabilities: boolean;
  useSyntheticVocabulary: boolean;
}

export interface LLMCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
}

export interface ActionsConfig {
  move: { energyCost: number; hungerCost: number; consecutivePenalty: number };
  gather: { energyCostPerUnit: number; maxPerAction: number };
  work: { basePayPerTick: number; energyCostPerTick: number };
  sleep: { energyRestoredPerTick: number };
}

export interface EconomyConfig {
  currencyDecayRate: number;
  currencyDecayInterval: number;
  currencyDecayThreshold: number;
}

// Phase 4-6: Cooperation Config (emergent cooperation incentives)
export interface CooperationConfig {
  enabled: boolean;
  gather: {
    efficiencyMultiplierPerAgent: number;
    maxEfficiencyMultiplier: number;
    cooperationRadius: number;
  };
  groupGather: {
    enabled: boolean;
    richSpawnThreshold: number;
    minAgentsForRich: number;
    soloMaxFromRich: number;
    groupBonus: number;
  };
  forage: {
    nearbyAgentBonus: number;
    maxCooperationBonus: number;
    cooperationRadius: number;
  };
  buy: {
    trustPriceModifier: number;
    minTrustDiscount: number;
    maxTrustPenalty: number;
  };
  solo: {
    gatherEfficiencyModifier: number;
  };
}

// Phase 6: Spoilage Config (item decay over time)
export interface SpoilageConfig {
  enabled: boolean;
  rates: {
    food: number;
    water: number;
    medicine: number;
    battery: number;
    material: number;
    tool: number;
  };
  removalThreshold: number;
}

export type LLMType = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'qwen' | 'glm' | 'grok' | 'mistral' | 'minimax' | 'kimi';

export interface GenesisConfig {
  enabled: boolean;
  childrenPerMother: number; // 5-100
  mothers: LLMType[];
  mode: 'single' | 'evolutionary'; // single: one-shot, evolutionary: multi-generation
  diversityThreshold: number; // 0-1
  requiredArchetypes: string[];
  useConfiguredPersonalities: boolean; // Use user-configured weights instead of LLM-generated
}

export type PersonalityTrait = 'aggressive' | 'cooperative' | 'cautious' | 'explorer' | 'social' | 'neutral';

export interface PersonalityConfig {
  enabled: boolean;
  weights: Record<PersonalityTrait, number>;
}

export interface ConfigResponse {
  simulation: SimulationConfig;
  agent: AgentConfig;
  needs: NeedsConfig;
  experiment: ExperimentConfig;
  llmCache: LLMCacheConfig;
  actions: ActionsConfig;
  economy: EconomyConfig;
  cooperation: CooperationConfig;
  spoilage: SpoilageConfig;
}

// Section-specific update types
type SimulationUpdate = Partial<SimulationConfig>;
type AgentUpdate = Partial<AgentConfig>;
type NeedsUpdate = Partial<NeedsConfig>;
type ExperimentUpdate = Partial<ExperimentConfig>;
type LLMCacheUpdate = Partial<LLMCacheConfig>;
type ActionsUpdate = Partial<ActionsConfig>;
type EconomyUpdate = Partial<EconomyConfig>;
type CooperationUpdate = Partial<CooperationConfig>;
type SpoilageUpdate = Partial<SpoilageConfig>;

export interface ConfigState {
  // State
  config: ConfigResponse | null;
  isLoading: boolean;
  error: string | null;
  pendingChanges: Partial<ConfigResponse>;
  runtimeModifiable: string[];
  genesisConfig: GenesisConfig;
  personalityConfig: PersonalityConfig;

  // Actions
  fetchConfig: () => Promise<void>;
  _updateSection: <K extends keyof ConfigResponse>(
    section: K,
    updates: Partial<ConfigResponse[K]>
  ) => void;
  updateSimulation: (updates: SimulationUpdate) => void;
  updateAgent: (updates: AgentUpdate) => void;
  updateNeeds: (updates: NeedsUpdate) => void;
  updateExperiment: (updates: ExperimentUpdate) => void;
  updateLLMCache: (updates: LLMCacheUpdate) => void;
  updateActions: (updates: ActionsUpdate) => void;
  updateEconomy: (updates: EconomyUpdate) => void;
  updateCooperation: (updates: CooperationUpdate) => void;
  updateSpoilage: (updates: SpoilageUpdate) => void;
  setGenesisConfig: (updates: Partial<GenesisConfig>) => void;
  fetchGenesisConfig: () => Promise<void>;
  saveGenesisConfig: () => Promise<void>;
  setPersonalityConfig: (updates: Partial<PersonalityConfig>) => void;
  setPersonalityWeight: (trait: PersonalityTrait, weight: number) => void;
  fetchPersonalityConfig: () => Promise<void>;
  savePersonalityConfig: () => Promise<void>;
  resetPersonalityWeights: () => Promise<void>;
  applyChanges: () => Promise<{ appliedImmediately: string[]; requiresRestart: string[] }>;
  resetConfig: () => Promise<void>;
  discardChanges: () => void;
  hasPendingChanges: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const CONFIG_STORAGE_KEY = 'simagents_config_overrides';
const GENESIS_STORAGE_KEY = 'simagents_genesis_config';

// Default genesis configuration
const DEFAULT_GENESIS_CONFIG: GenesisConfig = {
  enabled: false,
  childrenPerMother: 25,
  mothers: ['claude', 'gemini', 'codex'],
  mode: 'single',
  diversityThreshold: 0.3,
  requiredArchetypes: ['high_risk', 'low_risk', 'high_cooperation'],
  useConfiguredPersonalities: false,
};

// Default personality configuration
const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  enabled: false,
  weights: {
    aggressive: 0.12,
    cooperative: 0.15,
    cautious: 0.12,
    explorer: 0.10,
    social: 0.11,
    neutral: 0.40,
  },
};

const PERSONALITY_STORAGE_KEY = 'simagents_personality_config';

function loadGenesisFromStorage(): GenesisConfig {
  try {
    const saved = localStorage.getItem(GENESIS_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_GENESIS_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load genesis from localStorage:', e);
  }
  return DEFAULT_GENESIS_CONFIG;
}

function saveGenesisToStorage(config: GenesisConfig): void {
  try {
    localStorage.setItem(GENESIS_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[ConfigStore] Failed to save genesis to localStorage:', e);
  }
}

function loadPersonalityFromStorage(): PersonalityConfig {
  try {
    const saved = localStorage.getItem(PERSONALITY_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_PERSONALITY_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load personality from localStorage:', e);
  }
  return DEFAULT_PERSONALITY_CONFIG;
}

function savePersonalityToStorage(config: PersonalityConfig): void {
  try {
    localStorage.setItem(PERSONALITY_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[ConfigStore] Failed to save personality to localStorage:', e);
  }
}

function loadPendingFromStorage(): Partial<ConfigResponse> {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load from localStorage:', e);
  }
  return {};
}

function savePendingToStorage(pending: Partial<ConfigResponse>): void {
  try {
    if (Object.keys(pending).length === 0) {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(pending));
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to save to localStorage:', e);
  }
}

const RUNTIME_MODIFIABLE = [
  'agent.startingBalance',
  'agent.startingHunger',
  'agent.startingEnergy',
  'agent.startingHealth',
  'needs.hungerDecay',
  'needs.energyDecay',
  'needs.lowHungerThreshold',
  'needs.criticalHungerThreshold',
  'needs.lowEnergyThreshold',
  'needs.criticalEnergyThreshold',
  'experiment.enablePersonalities',
  'experiment.useEmergentPrompt',
  'experiment.safetyLevel',
  'experiment.normalizeCapabilities',
  'experiment.useSyntheticVocabulary',
  'actions.move.energyCost',
  'actions.move.hungerCost',
  'actions.gather.energyCostPerUnit',
  'actions.gather.maxPerAction',
  'actions.work.basePayPerTick',
  'actions.work.energyCostPerTick',
  'actions.sleep.energyRestoredPerTick',
  'economy.currencyDecayRate',
  'economy.currencyDecayInterval',
  'economy.currencyDecayThreshold',
] as const;

function buildDefaultConfig(): ConfigResponse {
  return {
    simulation: {
      tickIntervalMs: CONFIG.simulation.tickIntervalMs,
      gridSize: CONFIG.simulation.gridSize,
      visibilityRadius: CONFIG.simulation.visibilityRadius,
      testMode: CONFIG.simulation.testMode,
      randomSeed: CONFIG.simulation.randomSeed,
      maxTicks: CONFIG.simulation.maxTicks,
    },
    agent: { ...CONFIG.agent },
    needs: { ...CONFIG.needs },
    experiment: {
      enablePersonalities: CONFIG.experiment.enablePersonalities,
      useEmergentPrompt: CONFIG.experiment.useEmergentPrompt,
      safetyLevel: CONFIG.experiment.safetyLevel,
      includeBaselineAgents: CONFIG.experiment.includeBaselineAgents,
      normalizeCapabilities: CONFIG.experiment.normalizeCapabilities,
      useSyntheticVocabulary: CONFIG.experiment.useSyntheticVocabulary,
    },
    llmCache: { ...CONFIG.llm.cache },
    actions: {
      move: { ...CONFIG.actions.move },
      gather: { ...CONFIG.actions.gather },
      work: { ...CONFIG.actions.work },
      sleep: { ...CONFIG.actions.sleep },
    },
    economy: { ...CONFIG.economy },
    cooperation: {
      enabled: CONFIG.cooperation.enabled,
      gather: { ...CONFIG.cooperation.gather },
      groupGather: { ...CONFIG.cooperation.groupGather },
      forage: { ...CONFIG.cooperation.forage },
      buy: { ...CONFIG.cooperation.buy },
      solo: {
        gatherEfficiencyModifier: CONFIG.cooperation.solo.gatherEfficiencyModifier,
      },
    },
    spoilage: {
      enabled: CONFIG.spoilage.enabled,
      rates: { ...CONFIG.spoilage.rates } as SpoilageConfig['rates'],
      removalThreshold: CONFIG.spoilage.removalThreshold,
    },
  };
}

function mergeConfig(base: ConfigResponse, overrides: Partial<ConfigResponse>): ConfigResponse {
  return {
    ...base,
    ...overrides,
    simulation: { ...base.simulation, ...overrides.simulation },
    agent: { ...base.agent, ...overrides.agent },
    needs: { ...base.needs, ...overrides.needs },
    experiment: { ...base.experiment, ...overrides.experiment },
    llmCache: { ...base.llmCache, ...overrides.llmCache },
    actions: {
      ...base.actions,
      ...overrides.actions,
      move: { ...base.actions.move, ...overrides.actions?.move },
      gather: { ...base.actions.gather, ...overrides.actions?.gather },
      work: { ...base.actions.work, ...overrides.actions?.work },
      sleep: { ...base.actions.sleep, ...overrides.actions?.sleep },
    },
    economy: { ...base.economy, ...overrides.economy },
    cooperation: {
      ...base.cooperation,
      ...overrides.cooperation,
      gather: { ...base.cooperation.gather, ...overrides.cooperation?.gather },
      groupGather: { ...base.cooperation.groupGather, ...overrides.cooperation?.groupGather },
      forage: { ...base.cooperation.forage, ...overrides.cooperation?.forage },
      buy: { ...base.cooperation.buy, ...overrides.cooperation?.buy },
      solo: { ...base.cooperation.solo, ...overrides.cooperation?.solo },
    },
    spoilage: {
      ...base.spoilage,
      ...overrides.spoilage,
      rates: { ...base.spoilage.rates, ...overrides.spoilage?.rates },
    },
  };
}

function loadEffectiveConfig(): { config: ConfigResponse; pendingChanges: Partial<ConfigResponse> } {
  const pendingChanges = loadPendingFromStorage();
  return {
    config: mergeConfig(buildDefaultConfig(), pendingChanges),
    pendingChanges,
  };
}

// =============================================================================
// Store
// =============================================================================

const initialEffectiveConfig = loadEffectiveConfig();

export const useConfigStore = create<ConfigState>((set, get) => ({
  // Initial state
  config: initialEffectiveConfig.config,
  isLoading: false,
  error: null,
  pendingChanges: initialEffectiveConfig.pendingChanges,
  runtimeModifiable: [],
  genesisConfig: loadGenesisFromStorage(),
  personalityConfig: loadPersonalityFromStorage(),

  // Fetch configuration from local defaults plus localStorage overrides
  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const effectiveConfig = loadEffectiveConfig();
      set({
        config: effectiveConfig.config,
        pendingChanges: effectiveConfig.pendingChanges,
        runtimeModifiable: [...RUNTIME_MODIFIABLE],
        isLoading: false,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Fetch error:', e);
    }
  },

  // Generic section updater (reduces code duplication)
  _updateSection: <K extends keyof ConfigResponse>(
    section: K,
    updates: Partial<ConfigResponse[K]>
  ) => {
    const { pendingChanges } = get();
    const newPending: Partial<ConfigResponse> = {
      ...pendingChanges,
      [section]: { ...pendingChanges[section], ...updates },
    };
    set({ pendingChanges: newPending });
    savePendingToStorage(newPending);
  },

  // Typed section update helpers (for type safety in components)
  updateSimulation: (updates: SimulationUpdate) => get()._updateSection('simulation', updates),
  updateAgent: (updates: AgentUpdate) => get()._updateSection('agent', updates),
  updateNeeds: (updates: NeedsUpdate) => get()._updateSection('needs', updates),
  updateExperiment: (updates: ExperimentUpdate) => get()._updateSection('experiment', updates),
  updateLLMCache: (updates: LLMCacheUpdate) => get()._updateSection('llmCache', updates),
  updateActions: (updates: ActionsUpdate) => get()._updateSection('actions', updates),
  updateEconomy: (updates: EconomyUpdate) => get()._updateSection('economy', updates),
  updateCooperation: (updates: CooperationUpdate) => get()._updateSection('cooperation', updates),
  updateSpoilage: (updates: SpoilageUpdate) => get()._updateSection('spoilage', updates),

  // Genesis configuration
  setGenesisConfig: (updates: Partial<GenesisConfig>) => {
    const { genesisConfig } = get();
    const newConfig = { ...genesisConfig, ...updates };
    set({ genesisConfig: newConfig });
    saveGenesisToStorage(newConfig);
  },

  fetchGenesisConfig: async () => {
    set({ isLoading: true, error: null });
    const genesisConfig = loadGenesisFromStorage();
    set({ genesisConfig, isLoading: false });
  },

  saveGenesisConfig: async () => {
    const { genesisConfig } = get();
    set({ isLoading: true, error: null });
    saveGenesisToStorage(genesisConfig);
    set({ isLoading: false });
  },

  // Personality configuration
  setPersonalityConfig: (updates: Partial<PersonalityConfig>) => {
    const { personalityConfig } = get();
    const newConfig = { ...personalityConfig, ...updates };
    set({ personalityConfig: newConfig });
    savePersonalityToStorage(newConfig);
  },

  setPersonalityWeight: (trait: PersonalityTrait, weight: number) => {
    const { personalityConfig } = get();
    const safeWeight = Number.isFinite(weight) ? weight : 0;
    const newWeights = { ...personalityConfig.weights, [trait]: safeWeight };

    // Normalize to sum to 1.0
    const total = Object.values(newWeights).reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0);
    if (total > 0) {
      for (const t of Object.keys(newWeights) as PersonalityTrait[]) {
        newWeights[t] = (Number.isFinite(newWeights[t]) ? newWeights[t] : 0) / total;
      }
    }

    const newConfig = { ...personalityConfig, weights: newWeights };
    set({ personalityConfig: newConfig });
    savePersonalityToStorage(newConfig);
  },

  fetchPersonalityConfig: async () => {
    set({ isLoading: true, error: null });
    const personalityConfig = loadPersonalityFromStorage();
    set({ personalityConfig, isLoading: false });
  },

  savePersonalityConfig: async () => {
    const { personalityConfig } = get();
    set({ isLoading: true, error: null });
    savePersonalityToStorage(personalityConfig);
    set({ isLoading: false });
  },

  resetPersonalityWeights: async () => {
    set({ isLoading: true, error: null });
    const newConfig = { ...get().personalityConfig, weights: DEFAULT_PERSONALITY_CONFIG.weights };
    set({ personalityConfig: newConfig, isLoading: false });
    savePersonalityToStorage(newConfig);
  },

  // Apply pending changes to the local worker runtime
  applyChanges: async () => {
    const { pendingChanges } = get();
    if (Object.keys(pendingChanges).length === 0) {
      return { appliedImmediately: [], requiresRestart: [] };
    }

    set({ isLoading: true, error: null });
    try {
      await getEngineClient().setRuntimeConfig(pendingChanges as Record<string, unknown>);
      const config = mergeConfig(buildDefaultConfig(), pendingChanges);
      set({
        config,
        pendingChanges: {},
        isLoading: false,
      });
      savePendingToStorage({});
      return {
        appliedImmediately: Object.keys(pendingChanges),
        requiresRestart: [],
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to update config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Update error:', e);
      throw e;
    }
  },

  // Reset to defaults
  resetConfig: async () => {
    set({ isLoading: true, error: null });
    set({
      config: buildDefaultConfig(),
      pendingChanges: {},
      isLoading: false,
    });
    savePendingToStorage({});
  },

  // Discard pending changes
  discardChanges: () => {
    savePendingToStorage({});
    set({
      config: buildDefaultConfig(),
      pendingChanges: {},
    });
  },

  // Check if there are pending changes
  hasPendingChanges: () => {
    const { pendingChanges } = get();
    return Object.keys(pendingChanges).length > 0;
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useConfig = () => useConfigStore((state) => state.config);
export const useConfigLoading = () => useConfigStore((state) => state.isLoading);
export const useConfigError = () => useConfigStore((state) => state.error);
export const usePendingChanges = () => useConfigStore((state) => state.pendingChanges);
export const useRuntimeModifiable = () => useConfigStore((state) => state.runtimeModifiable);
export const useGenesisConfig = () => useConfigStore((state) => state.genesisConfig);
export const usePersonalityConfig = () => useConfigStore((state) => state.personalityConfig);

// Helper to check if a field is runtime modifiable
export const useIsRuntimeModifiable = (path: string) =>
  useConfigStore((state) => state.runtimeModifiable.includes(path));

// Export default configs for reference
export { DEFAULT_GENESIS_CONFIG, DEFAULT_PERSONALITY_CONFIG };
