/**
 * Configuration API Routes
 *
 * Exposes simulation configuration to the frontend.
 * Allows viewing and modifying configuration parameters.
 */

import type { FastifyInstance } from 'fastify';
import {
  CONFIG,
  isTestMode,
  setTestMode,
  isEmergentPromptEnabled,
  setEmergentPromptMode,
  getRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
} from '../config';

// =============================================================================
// Types
// =============================================================================

interface ConfigResponse {
  simulation: {
    tickIntervalMs: number;
    gridSize: number;
    visibilityRadius: number;
    testMode: boolean;
    randomSeed: number;
  };
  agent: {
    startingBalance: number;
    startingHunger: number;
    startingEnergy: number;
    startingHealth: number;
  };
  needs: {
    hungerDecay: number;
    energyDecay: number;
    lowHungerThreshold: number;
    criticalHungerThreshold: number;
    lowEnergyThreshold: number;
    criticalEnergyThreshold: number;
    hungerEnergyDrain: number;
    criticalHungerHealthDamage: number;
    criticalEnergyHealthDamage: number;
  };
  experiment: {
    enablePersonalities: boolean;
    useEmergentPrompt: boolean;
    safetyLevel: 'standard' | 'minimal' | 'none';
    includeBaselineAgents: boolean;
    normalizeCapabilities: boolean;
    useSyntheticVocabulary: boolean;
  };
  llmCache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  actions: {
    move: { energyCost: number };
    gather: { energyCostPerUnit: number; maxPerAction: number };
    work: { basePayPerTick: number; energyCostPerTick: number };
    sleep: { energyRestoredPerTick: number };
  };
}

interface ConfigUpdateRequest {
  simulation?: Partial<ConfigResponse['simulation']>;
  agent?: Partial<ConfigResponse['agent']>;
  needs?: Partial<ConfigResponse['needs']>;
  experiment?: Partial<ConfigResponse['experiment']>;
  llmCache?: Partial<ConfigResponse['llmCache']>;
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildConfigResponse(): ConfigResponse {
  const runtime = getRuntimeConfig();

  return {
    simulation: {
      tickIntervalMs: runtime.simulation.tickIntervalMs,
      gridSize: runtime.simulation.gridSize,
      visibilityRadius: runtime.simulation.visibilityRadius,
      testMode: isTestMode(),
      randomSeed: runtime.simulation.randomSeed,
    },
    agent: {
      startingBalance: runtime.agent.startingBalance,
      startingHunger: runtime.agent.startingHunger,
      startingEnergy: runtime.agent.startingEnergy,
      startingHealth: runtime.agent.startingHealth,
    },
    needs: {
      hungerDecay: runtime.needs.hungerDecay,
      energyDecay: runtime.needs.energyDecay,
      lowHungerThreshold: runtime.needs.lowHungerThreshold,
      criticalHungerThreshold: runtime.needs.criticalHungerThreshold,
      lowEnergyThreshold: runtime.needs.lowEnergyThreshold,
      criticalEnergyThreshold: runtime.needs.criticalEnergyThreshold,
      hungerEnergyDrain: runtime.needs.hungerEnergyDrain,
      criticalHungerHealthDamage: runtime.needs.criticalHungerHealthDamage,
      criticalEnergyHealthDamage: runtime.needs.criticalEnergyHealthDamage,
    },
    experiment: {
      enablePersonalities: runtime.experiment.enablePersonalities,
      useEmergentPrompt: isEmergentPromptEnabled(),
      safetyLevel: runtime.experiment.safetyLevel,
      includeBaselineAgents: runtime.experiment.includeBaselineAgents,
      normalizeCapabilities: runtime.experiment.normalizeCapabilities,
      useSyntheticVocabulary: runtime.experiment.useSyntheticVocabulary,
    },
    llmCache: {
      enabled: runtime.llm.cache.enabled,
      ttlSeconds: runtime.llm.cache.ttlSeconds,
    },
    actions: {
      move: { energyCost: runtime.actions.move.energyCost },
      gather: {
        energyCostPerUnit: runtime.actions.gather.energyCostPerUnit,
        maxPerAction: runtime.actions.gather.maxPerAction,
      },
      work: {
        basePayPerTick: runtime.actions.work.basePayPerTick,
        energyCostPerTick: runtime.actions.work.energyCostPerTick,
      },
      sleep: {
        energyRestoredPerTick: runtime.actions.sleep.energyRestoredPerTick,
      },
    },
  };
}

function buildDefaultsResponse(): ConfigResponse {
  return {
    simulation: {
      tickIntervalMs: CONFIG.simulation.tickIntervalMs,
      gridSize: CONFIG.simulation.gridSize,
      visibilityRadius: CONFIG.simulation.visibilityRadius,
      testMode: CONFIG.simulation.testMode,
      randomSeed: CONFIG.simulation.randomSeed,
    },
    agent: {
      startingBalance: CONFIG.agent.startingBalance,
      startingHunger: CONFIG.agent.startingHunger,
      startingEnergy: CONFIG.agent.startingEnergy,
      startingHealth: CONFIG.agent.startingHealth,
    },
    needs: {
      hungerDecay: CONFIG.needs.hungerDecay,
      energyDecay: CONFIG.needs.energyDecay,
      lowHungerThreshold: CONFIG.needs.lowHungerThreshold,
      criticalHungerThreshold: CONFIG.needs.criticalHungerThreshold,
      lowEnergyThreshold: CONFIG.needs.lowEnergyThreshold,
      criticalEnergyThreshold: CONFIG.needs.criticalEnergyThreshold,
      hungerEnergyDrain: CONFIG.needs.hungerEnergyDrain,
      criticalHungerHealthDamage: CONFIG.needs.criticalHungerHealthDamage,
      criticalEnergyHealthDamage: CONFIG.needs.criticalEnergyHealthDamage,
    },
    experiment: {
      enablePersonalities: CONFIG.experiment.enablePersonalities,
      useEmergentPrompt: CONFIG.experiment.useEmergentPrompt,
      safetyLevel: CONFIG.experiment.safetyLevel,
      includeBaselineAgents: CONFIG.experiment.includeBaselineAgents,
      normalizeCapabilities: CONFIG.experiment.normalizeCapabilities,
      useSyntheticVocabulary: CONFIG.experiment.useSyntheticVocabulary,
    },
    llmCache: {
      enabled: CONFIG.llm.cache.enabled,
      ttlSeconds: CONFIG.llm.cache.ttlSeconds,
    },
    actions: {
      move: { energyCost: CONFIG.actions.move.energyCost },
      gather: {
        energyCostPerUnit: CONFIG.actions.gather.energyCostPerUnit,
        maxPerAction: CONFIG.actions.gather.maxPerAction,
      },
      work: {
        basePayPerTick: CONFIG.actions.work.basePayPerTick,
        energyCostPerTick: CONFIG.actions.work.energyCostPerTick,
      },
      sleep: {
        energyRestoredPerTick: CONFIG.actions.sleep.energyRestoredPerTick,
      },
    },
  };
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerConfigRoutes(server: FastifyInstance): Promise<void> {
  // Get current configuration
  server.get('/api/config', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            config: { type: 'object', additionalProperties: true },
            runtimeModifiable: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async () => {
    return {
      config: buildConfigResponse(),
      runtimeModifiable: [
        'simulation.testMode',
        'experiment.useEmergentPrompt',
        'llmCache.enabled',
      ],
    };
  });

  // Get default configuration values
  server.get('/api/config/defaults', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  }, async () => {
    return {
      config: buildDefaultsResponse(),
    };
  });

  // Update configuration
  server.post<{ Body: ConfigUpdateRequest }>('/api/config', {
    schema: {
      body: {
        type: 'object',
        properties: {
          simulation: {
            type: 'object',
            properties: {
              tickIntervalMs: { type: 'number' },
              testMode: { type: 'boolean' },
            },
          },
          agent: {
            type: 'object',
            properties: {
              startingBalance: { type: 'number' },
              startingHunger: { type: 'number' },
              startingEnergy: { type: 'number' },
              startingHealth: { type: 'number' },
            },
          },
          needs: {
            type: 'object',
            properties: {
              hungerDecay: { type: 'number' },
              energyDecay: { type: 'number' },
              lowHungerThreshold: { type: 'number' },
              criticalHungerThreshold: { type: 'number' },
              lowEnergyThreshold: { type: 'number' },
              criticalEnergyThreshold: { type: 'number' },
            },
          },
          experiment: {
            type: 'object',
            properties: {
              enablePersonalities: { type: 'boolean' },
              useEmergentPrompt: { type: 'boolean' },
              safetyLevel: { type: 'string', enum: ['standard', 'minimal', 'none'] },
              includeBaselineAgents: { type: 'boolean' },
            },
          },
          llmCache: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              ttlSeconds: { type: 'number' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            config: { type: 'object', additionalProperties: true },
            appliedImmediately: {
              type: 'array',
              items: { type: 'string' },
            },
            requiresRestart: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request) => {
    const updates = request.body;
    const appliedImmediately: string[] = [];
    const requiresRestart: string[] = [];

    // Handle runtime-modifiable parameters
    if (updates.simulation?.testMode !== undefined) {
      setTestMode(updates.simulation.testMode);
      appliedImmediately.push('simulation.testMode');
      delete updates.simulation.testMode;
    }

    if (updates.experiment?.useEmergentPrompt !== undefined) {
      setEmergentPromptMode(updates.experiment.useEmergentPrompt);
      appliedImmediately.push('experiment.useEmergentPrompt');
      delete updates.experiment.useEmergentPrompt;
    }

    // Apply other updates to runtime config (will take effect on restart or for new agents)
    const runtimeUpdates: Parameters<typeof setRuntimeConfig>[0] = {};

    if (updates.simulation && Object.keys(updates.simulation).length > 0) {
      runtimeUpdates.simulation = updates.simulation;
      Object.keys(updates.simulation).forEach((key) => {
        requiresRestart.push(`simulation.${key}`);
      });
    }

    if (updates.agent && Object.keys(updates.agent).length > 0) {
      runtimeUpdates.agent = updates.agent;
      Object.keys(updates.agent).forEach((key) => {
        requiresRestart.push(`agent.${key}`);
      });
    }

    if (updates.needs && Object.keys(updates.needs).length > 0) {
      runtimeUpdates.needs = updates.needs;
      Object.keys(updates.needs).forEach((key) => {
        requiresRestart.push(`needs.${key}`);
      });
    }

    if (updates.llmCache && Object.keys(updates.llmCache).length > 0) {
      // LLM cache enabled is runtime modifiable
      if (updates.llmCache.enabled !== undefined) {
        runtimeUpdates.llmCache = { enabled: updates.llmCache.enabled };
        appliedImmediately.push('llmCache.enabled');
      }
      if (updates.llmCache.ttlSeconds !== undefined) {
        runtimeUpdates.llmCache = {
          ...runtimeUpdates.llmCache,
          ttlSeconds: updates.llmCache.ttlSeconds,
        };
        requiresRestart.push('llmCache.ttlSeconds');
      }
    }

    if (Object.keys(runtimeUpdates).length > 0) {
      setRuntimeConfig(runtimeUpdates);
    }

    console.log('[Config] Updated configuration:', {
      appliedImmediately,
      requiresRestart,
    });

    return {
      success: true,
      config: buildConfigResponse(),
      appliedImmediately,
      requiresRestart,
    };
  });

  // Reset configuration to defaults
  server.post('/api/config/reset', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  }, async () => {
    resetRuntimeConfig();
    console.log('[Config] Reset configuration to defaults');

    return {
      success: true,
      config: buildConfigResponse(),
    };
  });
}
