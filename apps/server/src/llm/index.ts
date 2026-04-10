/**
 * LLM Adapter Registry
 */

import type { LLMAdapter, LLMType } from './types';
import { CONFIG } from '../config';

// Adapter registry (lazy-initialized to break circular dependency at module load)
const adapters: Map<LLMType, LLMAdapter> = new Map();
let initialized = false;

// Initialize adapters lazily - dynamic requires break the circular import cycle
function ensureAdapters(): void {
  if (initialized) return;
  initialized = true;

  const timeout = CONFIG.llm.defaultTimeoutMs;
  // Extended timeout for China-based API providers (GLM, MiniMax, Kimi)
  const extendedTimeout = Math.max(timeout, 60000);

  const { ClaudeAPIAdapter } = require('./adapters/claude-api');
  const { OpenAIAPIAdapter } = require('./adapters/openai-api');
  const { GeminiAPIAdapter } = require('./adapters/gemini-api');
  const { DeepSeekAPIAdapter } = require('./adapters/deepseek-api');
  const { QwenAPIAdapter } = require('./adapters/qwen-api');
  const { GLMAPIAdapter } = require('./adapters/glm-api');
  const { GrokAPIAdapter } = require('./adapters/grok-api');
  const { MistralAPIAdapter } = require('./adapters/mistral-api');
  const { MiniMaxAPIAdapter } = require('./adapters/minimax-api');
  const { KimiAPIAdapter } = require('./adapters/kimi-api');

  // Primary LLMs via API (reliable)
  adapters.set('claude', new ClaudeAPIAdapter(timeout));
  adapters.set('codex', new OpenAIAPIAdapter(timeout));
  adapters.set('gemini', new GeminiAPIAdapter(timeout));
  // Additional LLMs via API
  adapters.set('deepseek', new DeepSeekAPIAdapter(timeout));
  adapters.set('qwen', new QwenAPIAdapter(timeout));
  adapters.set('glm', new GLMAPIAdapter(extendedTimeout));
  adapters.set('grok', new GrokAPIAdapter(timeout));
  adapters.set('mistral', new MistralAPIAdapter(timeout));
  adapters.set('minimax', new MiniMaxAPIAdapter(extendedTimeout));
  adapters.set('kimi', new KimiAPIAdapter(extendedTimeout));
}

/**
 * Get adapter by type
 */
export function getAdapter(type: LLMType): LLMAdapter | undefined {
  ensureAdapters();
  return adapters.get(type);
}

/**
 * Get all adapters
 */
export function getAllAdapters(): LLMAdapter[] {
  ensureAdapters();
  return Array.from(adapters.values());
}

/**
 * Check which adapters are available
 */
export async function getAvailableAdapters(): Promise<LLMAdapter[]> {
  ensureAdapters();
  const results = await Promise.all(
    Array.from(adapters.values()).map(async (adapter) => ({
      adapter,
      available: await adapter.isAvailable(),
    }))
  );

  return results.filter((r) => r.available).map((r) => r.adapter);
}

/**
 * Log adapter availability
 */
export async function logAdapterStatus(): Promise<void> {
  ensureAdapters();
  console.log('\n📡 LLM Adapter Status:');

  for (const [type, adapter] of adapters) {
    const available = await adapter.isAvailable();
    const status = available ? '✅' : '❌';
    console.log(`  ${status} ${adapter.name} (${type})`);
  }

  console.log('');
}

// Export types and utilities
export * from './types';
export { buildFullPrompt, buildFinalPrompt, buildAvailableActions, getActiveTransformations } from './prompt-builder';
export { parseResponse, getFallbackDecision } from './response-parser';

// Export Capability Normalization (for experiments)
export {
  MODEL_CAPABILITIES,
  getNormalizationConfig,
  normalizePrompt,
  normalizeLatency,
  getNormalizedMaxTokens,
  getCapabilitySummary,
  getLatencyStats,
  resetLatencyStats,
  type ModelCapabilities,
  type NormalizationConfig,
} from './capability-normalizer';

// Export Synthetic Vocabulary (for experiments)
export {
  SYNTHETIC_VOCABULARY,
  applySyntheticVocabulary,
  reverseSyntheticVocabulary,
  isSyntheticVocabularyEnabled,
  getVocabularyByCategory,
  getVocabularyStats,
  generateVocabularyDocumentation,
  type VocabularyMapping,
} from './prompts/synthetic-vocabulary';

// Export external agent adapter (Phase 3: A2A Protocol)
export { ExternalAgentAdapter, createExternalAgentAdapter } from './adapters/external-api';

// Export scientific experiment decision generators
export { getRandomWalkDecision, getRandomExplorerDecision } from './random-walk';

// Export Lizard Brain (heuristic decision system)
export {
  tryLizardBrain,
  wouldUseLizardBrain,
  recordLizardBrain,
  recordWizardBrain,
  getLizardBrainStats,
  resetLizardBrainStats,
} from './lizard-brain';

// Export Decision Cache
export {
  getCachedDecision,
  cacheDecision,
  clearCache,
  getCacheStats,
  resetCacheStats,
  isCacheEnabled,
} from './decision-cache';
