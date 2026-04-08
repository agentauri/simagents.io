import {
  getRuntimeConfig,
  getRuntimeOverrides,
  isEmergentPromptEnabled,
  isTestMode,
  resetRuntimeConfig,
  setEmergentPromptMode,
  setRuntimeConfig,
  setTestMode,
} from '../config';
import {
  getLLMCacheConfig,
  setLLMCacheConfig,
  type LLMCacheConfig,
} from '../cache/llm-cache';
import type { ExperimentSchema } from './schema';

export type ExperimentProfileName = 'deterministic_baseline' | 'llm_exploratory' | 'emergent_cooperation';
export type BenchmarkWorldName = 'canonical_core' | 'full_surface' | 'emergent_cooperation';

export interface ScientificControlsSummary {
  canonicalMinimalWorld: boolean;
  cooperationIncentivesEnabled: boolean;
  trustPricingEnabled: boolean;
  tradeBonusesEnabled: boolean;
  spoilageEnabled: boolean;
  puzzleEnabled: boolean;
  personalitiesEnabled: boolean;
  llmCacheEnabled: boolean;
  cacheSharingEnabled: boolean;
  biomeExclusivityEnabled: boolean;
  seasonsEnabled: boolean;
  resourceDepletionEnabled: boolean;
}

export interface ResolvedScientificProfile {
  profile: ExperimentProfileName;
  benchmarkWorld: BenchmarkWorldName;
  deterministic: boolean;
  resolvedMode: NonNullable<ExperimentSchema['mode']>;
  runtimeConfig: Parameters<typeof setRuntimeConfig>[0];
  emergentPromptEnabled: boolean;
  testModeEnabled: boolean;
  llmCacheConfig: Partial<LLMCacheConfig>;
  scientificControls: ScientificControlsSummary;
  notes: string[];
}

interface ScientificProfileSnapshot {
  runtimeOverrides: ReturnType<typeof getRuntimeOverrides>;
  emergentPromptEnabled: boolean;
  testModeEnabled: boolean;
  llmCacheConfig: LLMCacheConfig;
}

export function inferExperimentProfile(schema: ExperimentSchema): ExperimentProfileName {
  if (schema.profile) {
    return schema.profile as ExperimentProfileName;
  }

  if (schema.mode === 'llm' || schema.genesis?.enabled) {
    return 'llm_exploratory';
  }

  return 'deterministic_baseline';
}

export function inferBenchmarkWorld(schema: ExperimentSchema): BenchmarkWorldName {
  return (schema.benchmarkWorld ?? 'canonical_core') as BenchmarkWorldName;
}

export function resolveScientificProfile(schema: ExperimentSchema): ResolvedScientificProfile {
  const profile = inferExperimentProfile(schema);
  const benchmarkWorld = inferBenchmarkWorld(schema);
  const canonicalMinimalWorld = benchmarkWorld === 'canonical_core';
  const isEmergentCooperation = profile === 'emergent_cooperation';
  const currentRuntime = getRuntimeConfig();

  if (profile === 'deterministic_baseline' && schema.genesis?.enabled) {
    throw new Error('deterministic_baseline profile cannot be used with genesis-enabled experiments.');
  }

  if (profile === 'deterministic_baseline' && schema.mode === 'llm') {
    throw new Error('deterministic_baseline profile cannot execute in llm mode. Use fallback or random_walk.');
  }

  const resolvedMode: NonNullable<ExperimentSchema['mode']> =
    profile === 'deterministic_baseline'
      ? (schema.mode === 'random_walk' ? 'random_walk' : 'fallback')
      : (schema.mode ?? 'llm');

  const notes: string[] = [];
  if (profile === 'deterministic_baseline') {
    notes.push('Seeded execution only; external LLM sampling is disabled.');
    notes.push('LLM cache is disabled to avoid hidden cross-run state.');
  } else if (isEmergentCooperation) {
    notes.push('Emergent cooperation profile: zero cooperation bonuses, zero solo penalties.');
    notes.push('Cooperation must emerge from biome exclusivity, seasonal cycles, and natural resource complementarity.');
    notes.push('Puzzles disabled (forced cooperation). Spoilage enabled (natural trade urgency).');
    notes.push('Biome exclusivity and seasonal cycles enabled to create natural cooperation incentives.');
  } else {
    notes.push('External LLM providers remain a source of non-determinism even with fixed settings.');
    notes.push('Controlled prompt, token, and cache settings are frozen for comparability.');
  }

  if (canonicalMinimalWorld) {
    notes.push('Canonical benchmark world disables cooperation incentives, spoilage, puzzles, and personalities to reduce confounders.');
  }

  // Cooperation config: disabled for canonical_core AND emergent_cooperation
  // For emergent_cooperation: no bonuses, no penalties -- cooperation must emerge naturally
  const disableCooperationIncentives = canonicalMinimalWorld || isEmergentCooperation;

  const runtimeConfig = {
    experiment: {
      enablePersonalities: canonicalMinimalWorld
        ? false
        : isEmergentCooperation
          ? true  // Personalities create behavioral diversity
          : currentRuntime.experiment.enablePersonalities,
      normalizeCapabilities: profile === 'llm_exploratory',
      useSyntheticVocabulary: false,
      safetyLevel: 'standard' as const,
      llmDecisionTemperature: 0,
      llmDecisionMaxTokens: 512,
    },
    cooperation: disableCooperationIncentives ? {
      enabled: false,
      gather: {
        efficiencyMultiplierPerAgent: 1,
        maxEfficiencyMultiplier: 1,
      },
      groupGather: {
        enabled: false,
        groupBonus: 1,
      },
      work: {
        nearbyWorkerBonus: 0,
      },
      forage: {
        nearbyAgentBonus: 0,
        maxCooperationBonus: 0,
      },
      buy: {
        trustPriceModifier: 0,
        minTrustDiscount: 0,
        maxTrustPenalty: 0,
      },
      solo: {
        forageSuccessRateModifier: 1,
        publicWorkPaymentModifier: 1,
        gatherEfficiencyModifier: 1,
      },
    } : {
      enabled: currentRuntime.cooperation.enabled,
    },
    spoilage: {
      enabled: canonicalMinimalWorld
        ? false
        : isEmergentCooperation
          ? true  // Spoilage creates natural trade urgency
          : currentRuntime.spoilage.enabled,
    },
    puzzle: {
      enabled: (canonicalMinimalWorld || isEmergentCooperation)
        ? false  // Puzzles force cooperation -- not emergent
        : currentRuntime.puzzle.enabled,
    },
    // Emergent cooperation: enable biome exclusivity and seasonal cycles
    biomeExclusivity: {
      enabled: isEmergentCooperation,
    },
    seasons: {
      enabled: isEmergentCooperation,
    },
    resourceDepletion: {
      enabled: isEmergentCooperation,
    },
  };

  const llmCacheConfig = {
    enabled: false,
    shareAcrossAgents: false,
  };

  const scientificControls: ScientificControlsSummary = {
    canonicalMinimalWorld,
    cooperationIncentivesEnabled: disableCooperationIncentives ? false : currentRuntime.cooperation.enabled,
    trustPricingEnabled: disableCooperationIncentives ? false : currentRuntime.cooperation.enabled,
    tradeBonusesEnabled: disableCooperationIncentives ? false : currentRuntime.cooperation.enabled,
    spoilageEnabled: runtimeConfig.spoilage.enabled,
    puzzleEnabled: runtimeConfig.puzzle.enabled,
    personalitiesEnabled: runtimeConfig.experiment.enablePersonalities,
    llmCacheEnabled: llmCacheConfig.enabled,
    cacheSharingEnabled: llmCacheConfig.shareAcrossAgents ?? false,
    biomeExclusivityEnabled: runtimeConfig.biomeExclusivity.enabled,
    seasonsEnabled: runtimeConfig.seasons.enabled,
    resourceDepletionEnabled: runtimeConfig.resourceDepletion.enabled,
  };

  return {
    profile,
    benchmarkWorld,
    deterministic: profile === 'deterministic_baseline',
    resolvedMode,
    runtimeConfig,
    emergentPromptEnabled: true,
    testModeEnabled: resolvedMode !== 'llm',
    llmCacheConfig,
    scientificControls,
    notes,
  };
}

export function applyScientificProfile(profile: ResolvedScientificProfile): {
  snapshot: ScientificProfileSnapshot;
  restore: () => void;
} {
  const snapshot: ScientificProfileSnapshot = {
    runtimeOverrides: getRuntimeOverrides(),
    emergentPromptEnabled: isEmergentPromptEnabled(),
    testModeEnabled: isTestMode(),
    llmCacheConfig: getLLMCacheConfig(),
  };

  setTestMode(profile.testModeEnabled);
  setEmergentPromptMode(profile.emergentPromptEnabled);
  setRuntimeConfig(profile.runtimeConfig);
  setLLMCacheConfig(profile.llmCacheConfig);

  return {
    snapshot,
    restore: () => {
      resetRuntimeConfig();
      setTestMode(snapshot.testModeEnabled);
      setEmergentPromptMode(snapshot.emergentPromptEnabled);
      setRuntimeConfig(snapshot.runtimeOverrides);
      setLLMCacheConfig(snapshot.llmCacheConfig);
    },
  };
}
