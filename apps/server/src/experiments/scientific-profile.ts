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

export type ExperimentProfileName = 'deterministic_baseline' | 'llm_exploratory';
export type BenchmarkWorldName = 'canonical_core' | 'full_surface';

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
    return schema.profile;
  }

  if (schema.mode === 'llm' || schema.genesis?.enabled) {
    return 'llm_exploratory';
  }

  return 'deterministic_baseline';
}

export function inferBenchmarkWorld(schema: ExperimentSchema): BenchmarkWorldName {
  return schema.benchmarkWorld ?? 'canonical_core';
}

export function resolveScientificProfile(schema: ExperimentSchema): ResolvedScientificProfile {
  const profile = inferExperimentProfile(schema);
  const benchmarkWorld = inferBenchmarkWorld(schema);
  const canonicalMinimalWorld = benchmarkWorld === 'canonical_core';
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
  } else {
    notes.push('External LLM providers remain a source of non-determinism even with fixed settings.');
    notes.push('Controlled prompt, token, and cache settings are frozen for comparability.');
  }

  if (canonicalMinimalWorld) {
    notes.push('Canonical benchmark world disables cooperation incentives, spoilage, puzzles, and personalities to reduce confounders.');
  }

  const runtimeConfig = {
    experiment: {
      enablePersonalities: canonicalMinimalWorld
        ? false
        : currentRuntime.experiment.enablePersonalities,
      normalizeCapabilities: profile === 'llm_exploratory',
      useSyntheticVocabulary: false,
      safetyLevel: 'standard' as const,
      llmDecisionTemperature: 0,
      llmDecisionMaxTokens: 512,
    },
    cooperation: canonicalMinimalWorld ? {
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
        : currentRuntime.spoilage.enabled,
    },
    puzzle: {
      enabled: canonicalMinimalWorld
        ? false
        : currentRuntime.puzzle.enabled,
    },
  };

  const llmCacheConfig = {
    enabled: false,
    shareAcrossAgents: false,
  };

  const scientificControls: ScientificControlsSummary = {
    canonicalMinimalWorld,
    cooperationIncentivesEnabled: canonicalMinimalWorld ? false : currentRuntime.cooperation.enabled,
    trustPricingEnabled: canonicalMinimalWorld ? false : currentRuntime.cooperation.enabled,
    tradeBonusesEnabled: canonicalMinimalWorld ? false : currentRuntime.cooperation.enabled,
    spoilageEnabled: runtimeConfig.spoilage.enabled,
    puzzleEnabled: runtimeConfig.puzzle.enabled,
    personalitiesEnabled: runtimeConfig.experiment.enablePersonalities,
    llmCacheEnabled: llmCacheConfig.enabled,
    cacheSharingEnabled: llmCacheConfig.shareAcrossAgents ?? false,
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
