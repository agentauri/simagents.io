/**
 * LLM Response Cache
 *
 * Caches LLM responses based on observation hash to reduce API costs.
 * Uses Redis as the backend with configurable TTL.
 */

import { redis } from './index';
import type { AgentObservation, AgentDecision } from '../llm/types';
import { createHash } from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

export interface LLMCacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Time-to-live in seconds (default: 300 = 5 minutes) */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
  /** Share cache entries across agents in equivalent states */
  shareAcrossAgents: boolean;
}

const DEFAULT_CONFIG: LLMCacheConfig = {
  enabled: true,
  ttlSeconds: 75,
  keyPrefix: 'llm-cache:',
  shareAcrossAgents: false,
};

let config: LLMCacheConfig = { ...DEFAULT_CONFIG };

// =============================================================================
// Cache Statistics
// =============================================================================

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
  lastReset: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  errors: 0,
  lastReset: Date.now(),
};

// =============================================================================
// Observation Hashing
// =============================================================================

/**
 * Extract cache-relevant fields from observation.
 * We hash a subset of the observation to balance cache hit rate with freshness.
 *
 * Included in hash:
 * - Agent state (hunger, energy, health, balance) - rounded to reduce variance
 * - Agent position (x, y)
 * - Nearby entities (sorted for consistency)
 * - Inventory
 *
 * Excluded from hash:
 * - Tick number (changes every tick)
 * - Timestamp (changes constantly)
 * - Recent events (too variable)
 * - Agent ID when `shareAcrossAgents` is enabled
 */
function extractCacheableObservation(obs: AgentObservation): object {
  // Round numeric values to reduce variance — granularity of 2 balances
  // cache hit rate with responsiveness to changing agent state
  const round = (n: number) => Math.round(n / 2) * 2;

  return {
    agentIdentity: config.shareAcrossAgents ? undefined : obs.self.id,

    // Self state (rounded for cache efficiency)
    self: {
      x: obs.self.x,
      y: obs.self.y,
      hunger: round(obs.self.hunger),
      energy: round(obs.self.energy),
      health: round(obs.self.health),
      balance: round(obs.self.balance),
      state: obs.self.state,
    },

    // Nearby agents (sorted by ID for consistency)
    nearbyAgents: obs.nearbyAgents
      .map((a) => ({
        x: a.x,
        y: a.y,
        state: a.state,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Nearby resource spawns (sorted)
    nearbyResourceSpawns: (obs.nearbyResourceSpawns || [])
      .map((r) => ({
        x: r.x,
        y: r.y,
        resourceType: r.resourceType,
        hasResources: r.currentAmount > 0,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Nearby shelters (sorted)
    nearbyShelters: (obs.nearbyShelters || [])
      .map((s) => ({
        x: s.x,
        y: s.y,
        canSleep: s.canSleep,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Inventory (sorted by type)
    inventory: (obs.inventory || [])
      .map((i) => ({
        type: i.type,
        quantity: i.quantity > 0 ? Math.min(i.quantity, 10) : 0, // Cap quantity for cache
      }))
      .sort((a, b) => a.type.localeCompare(b.type)),

    // ALL recent failed actions — the array grows with each new failure,
    // producing a different hash and preventing the "same hash → same bad decision" loop
    recentFailedActions: obs.recentEvents
      .filter((e) => e.type === 'action_failed')
      .map((e) => e.description),
  };
}

/**
 * Generate a hash key for an observation.
 * The hash is deterministic and based on cache-relevant fields only.
 */
export function hashObservation(obs: AgentObservation): string {
  const cacheable = extractCacheableObservation(obs);
  const json = JSON.stringify(cacheable);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * Generate the full Redis key for a cache entry.
 */
function getCacheKey(observationHash: string, llmType: string): string {
  return `${config.keyPrefix}${llmType}:${observationHash}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Check if a cached response exists for the given observation.
 * Returns the cached decision if found, null otherwise.
 */
export async function getCachedResponse(
  obs: AgentObservation,
  llmType: string
): Promise<AgentDecision | null> {
  if (!config.enabled) {
    return null;
  }

  try {
    const hash = hashObservation(obs);
    const key = getCacheKey(hash, llmType);
    const cached = await redis.get(key);

    if (cached) {
      const decision = JSON.parse(cached) as AgentDecision;

      // Check blocklist — if this action recently failed, treat as a miss
      // so the LLM is queried again for a fresh decision
      if (await isActionBlocked(hash, llmType, decision.action)) {
        stats.misses++;
        console.log(`[LLM-Cache] HIT but BLOCKED action "${decision.action}" for ${llmType} (hash: ${hash.substring(0, 8)}) — forcing re-query`);
        return null;
      }

      stats.hits++;
      console.log(`[LLM-Cache] HIT for ${llmType} (hash: ${hash.substring(0, 8)})`);
      return decision;
    }

    stats.misses++;
    console.log(`[LLM-Cache] MISS for ${llmType} (hash: ${hash.substring(0, 8)})`);
    return null;
  } catch (error) {
    stats.errors++;
    console.error('[LLM-Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Store a response in the cache.
 */
export async function cacheResponse(
  obs: AgentObservation,
  llmType: string,
  decision: AgentDecision
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  try {
    const hash = hashObservation(obs);

    // Skip caching if this action is on the blocklist (recently failed)
    if (await isActionBlocked(hash, llmType, decision.action)) {
      console.log(`[LLM-Cache] SKIP caching blocked action "${decision.action}" for ${llmType} (hash: ${hash.substring(0, 8)})`);
      return;
    }

    const key = getCacheKey(hash, llmType);
    const value = JSON.stringify(decision);

    await redis.setex(key, config.ttlSeconds, value);
    stats.writes++;
    console.log(`[LLM-Cache] STORED for ${llmType} (hash: ${hash.substring(0, 8)}, TTL: ${config.ttlSeconds}s)`);
  } catch (error) {
    stats.errors++;
    console.error('[LLM-Cache] Error writing cache:', error);
  }
}

// =============================================================================
// Configuration Management
// =============================================================================

/**
 * Update cache configuration at runtime.
 */
export function setLLMCacheConfig(newConfig: Partial<LLMCacheConfig>): void {
  config = { ...config, ...newConfig };
  console.log('[LLM-Cache] Configuration updated:', config);
}

/**
 * Get current cache configuration.
 */
export function getLLMCacheConfig(): LLMCacheConfig {
  return { ...config };
}

/**
 * Enable or disable the cache.
 */
export function setLLMCacheEnabled(enabled: boolean): void {
  config.enabled = enabled;
  console.log(`[LLM-Cache] Cache ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Set the TTL for cached entries.
 */
export function setLLMCacheTTL(ttlSeconds: number): void {
  config.ttlSeconds = ttlSeconds;
  console.log(`[LLM-Cache] TTL set to ${ttlSeconds}s`);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get cache statistics.
 */
export function getLLMCacheStats(): CacheStats & { hitRate: number; config: LLMCacheConfig } {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? stats.hits / total : 0;

  return {
    ...stats,
    hitRate,
    config,
  };
}

/**
 * Reset cache statistics.
 */
export function resetLLMCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.writes = 0;
  stats.errors = 0;
  stats.lastReset = Date.now();
  console.log('[LLM-Cache] Statistics reset');
}

/**
 * Invalidate a specific cached entry for an agent whose action failed.
 * Only removes the exact hash that produced the failed decision,
 * preserving valid cache entries for other states.
 */
export async function invalidateCacheEntry(
  obs: AgentObservation,
  llmType: string
): Promise<boolean> {
  try {
    const hash = hashObservation(obs);
    const key = getCacheKey(hash, llmType);
    const deleted = await redis.del(key);

    if (deleted > 0) {
      console.log(`[LLM-Cache] Invalidated hash ${hash.substring(0, 8)} for ${llmType} (action failed)`);
    }
    return deleted > 0;
  } catch (error) {
    console.error('[LLM-Cache] Error invalidating cache entry:', error);
    return false;
  }
}

// =============================================================================
// Failed Action Blocklist
// =============================================================================

/**
 * After an action fails, block re-caching the same action type for this
 * observation hash. This breaks the loop:
 *   cache → execute → fail → invalidate → LLM returns same action → re-cache → …
 *
 * The blocklist key lives for `blocklistTTLSeconds` (default: 3× cache TTL).
 */
const BLOCKLIST_SUFFIX = 'block:';
const BLOCKLIST_TTL_MULTIPLIER = 3;

function getBlocklistKey(observationHash: string, llmType: string, action: string): string {
  return `${config.keyPrefix}${BLOCKLIST_SUFFIX}${llmType}:${observationHash}:${action}`;
}

/**
 * Mark an action as failed for a given observation hash.
 * Subsequent `getCachedResponse` and `cacheResponse` calls will
 * ignore/skip entries whose action matches the blocklist.
 */
export async function markFailedAction(
  obs: AgentObservation,
  llmType: string,
  failedAction: string
): Promise<void> {
  try {
    const hash = hashObservation(obs);
    const key = getBlocklistKey(hash, llmType, failedAction);
    const ttl = config.ttlSeconds * BLOCKLIST_TTL_MULTIPLIER;
    await redis.setex(key, ttl, '1');
    console.log(`[LLM-Cache] Blocked action "${failedAction}" for ${llmType} (hash: ${hash.substring(0, 8)}, TTL: ${ttl}s)`);
  } catch (error) {
    console.error('[LLM-Cache] Error writing blocklist entry:', error);
  }
}

/**
 * Check whether a given action is currently blocked for this observation hash.
 */
async function isActionBlocked(
  observationHash: string,
  llmType: string,
  action: string
): Promise<boolean> {
  try {
    const key = getBlocklistKey(observationHash, llmType, action);
    const exists = await redis.exists(key);
    return exists === 1;
  } catch {
    return false;
  }
}

/**
 * Invalidate all cached entries for a specific LLM type.
 * Use only for systemic failures (adapter bugs, schema changes).
 */
export async function invalidateCacheForAgent(llmType: string): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}${llmType}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`[LLM-Cache] Invalidated ALL ${keys.length} entries for ${llmType}`);
    return keys.length;
  } catch (error) {
    console.error('[LLM-Cache] Error invalidating cache:', error);
    return 0;
  }
}

/**
 * Clear all cached LLM responses.
 */
export async function clearLLMCache(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`[LLM-Cache] Cleared ${keys.length} cached entries`);
    return keys.length;
  } catch (error) {
    console.error('[LLM-Cache] Error clearing cache:', error);
    return 0;
  }
}

/**
 * Get the number of cached entries.
 */
export async function getLLMCacheSize(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);
    return keys.length;
  } catch (error) {
    console.error('[LLM-Cache] Error getting cache size:', error);
    return 0;
  }
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the LLM cache from environment variables.
 */
export function initLLMCacheFromEnv(): void {
  const enabled = process.env.LLM_CACHE_ENABLED !== 'false';
  const ttlEnv = process.env.LLM_CACHE_TTL_SECONDS;
  const ttl = ttlEnv ? parseInt(ttlEnv, 10) : DEFAULT_CONFIG.ttlSeconds;
  const shareEnv = process.env.LLM_CACHE_SHARE_ACROSS_AGENTS;
  const shareAcrossAgents = shareEnv ? shareEnv === 'true' : DEFAULT_CONFIG.shareAcrossAgents;

  config = {
    enabled,
    ttlSeconds: isNaN(ttl) ? DEFAULT_CONFIG.ttlSeconds : ttl,
    keyPrefix: process.env.LLM_CACHE_PREFIX || 'llm-cache:',
    shareAcrossAgents,
  };

  console.log('[LLM-Cache] Initialized from environment:', config);
}

// Initialize on module load
initLLMCacheFromEnv();
