/**
 * Genesis Cache - Redis Caching for LLM Meta-Generation
 *
 * Caches genesis generation results to avoid repeated LLM calls
 * for the same configuration. This significantly reduces API costs
 * for experiments that reuse the same mother/children setup.
 *
 * Features:
 * - Configuration-based cache keys
 * - Long TTL (7 days default) since genesis results are stable
 * - Cache invalidation by mother type
 * - Statistics tracking
 *
 * @module genesis-cache
 */

import { redis } from './index';
import { createHash } from 'crypto';
import type { LLMType } from '../llm/types';
import type {
  GenesisConfig,
  GenesisResult,
  ChildSpecification,
} from '../agents/genesis-types';

// =============================================================================
// Configuration
// =============================================================================

export interface GenesisCacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Time-to-live in seconds (default: 604800 = 7 days) */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
}

const DEFAULT_CONFIG: GenesisCacheConfig = {
  enabled: true,
  ttlSeconds: 604800, // 7 days
  keyPrefix: 'genesis-cache:',
};

let config: GenesisCacheConfig = { ...DEFAULT_CONFIG };

// =============================================================================
// Cache Statistics
// =============================================================================

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
  lastReset: number;
  hitsByMother: Record<string, number>;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  errors: 0,
  lastReset: Date.now(),
  hitsByMother: {},
};

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Extract cache-relevant fields from genesis config.
 * These fields uniquely identify a genesis generation request.
 */
function extractCacheableConfig(
  motherType: LLMType,
  genesisConfig: GenesisConfig
): object {
  return {
    motherType,
    childrenPerMother: genesisConfig.childrenPerMother,
    mode: genesisConfig.mode,
    diversityThreshold: genesisConfig.diversityThreshold,
    requiredArchetypes: (genesisConfig.requiredArchetypes ?? []).sort(),
    temperature: genesisConfig.temperature ?? 0.8,
    seed: genesisConfig.seed,
  };
}

/**
 * Generate a hash key for a genesis configuration.
 * The hash is deterministic and based on cache-relevant fields only.
 */
export function hashGenesisConfig(
  motherType: LLMType,
  genesisConfig: GenesisConfig
): string {
  const cacheable = extractCacheableConfig(motherType, genesisConfig);
  const json = JSON.stringify(cacheable);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * Generate the full Redis key for a cache entry.
 */
function getCacheKey(motherType: LLMType, configHash: string): string {
  return `${config.keyPrefix}${motherType}:${configHash}`;
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialized format for cached genesis results.
 * Includes metadata for debugging and validation.
 */
interface CachedGenesisEntry {
  version: number;
  cachedAt: number;
  motherType: LLMType;
  configHash: string;
  result: GenesisResult;
}

const CACHE_VERSION = 1;

/**
 * Serialize a genesis result for caching.
 */
function serializeResult(
  result: GenesisResult,
  configHash: string
): string {
  const entry: CachedGenesisEntry = {
    version: CACHE_VERSION,
    cachedAt: Date.now(),
    motherType: result.motherType,
    configHash,
    result,
  };
  return JSON.stringify(entry);
}

/**
 * Deserialize a cached genesis result.
 * Returns null if the cache entry is invalid or incompatible.
 */
function deserializeResult(cached: string): GenesisResult | null {
  try {
    const entry = JSON.parse(cached) as CachedGenesisEntry;

    // Version check
    if (entry.version !== CACHE_VERSION) {
      console.log(`[Genesis-Cache] Cache version mismatch: ${entry.version} != ${CACHE_VERSION}`);
      return null;
    }

    return entry.result;
  } catch (error) {
    console.error('[Genesis-Cache] Failed to deserialize:', error);
    return null;
  }
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Check if a cached genesis result exists for the given configuration.
 * Returns the cached result if found, null otherwise.
 */
export async function getCachedGenesis(
  motherType: LLMType,
  genesisConfig: GenesisConfig
): Promise<GenesisResult | null> {
  if (!config.enabled) {
    return null;
  }

  try {
    const hash = hashGenesisConfig(motherType, genesisConfig);
    const key = getCacheKey(motherType, hash);
    const cached = await redis.get(key);

    if (cached) {
      const result = deserializeResult(cached);
      if (result) {
        stats.hits++;
        stats.hitsByMother[motherType] = (stats.hitsByMother[motherType] ?? 0) + 1;
        console.log(`[Genesis-Cache] HIT for ${motherType} (hash: ${hash.substring(0, 8)})`);
        return result;
      }
    }

    stats.misses++;
    console.log(`[Genesis-Cache] MISS for ${motherType} (hash: ${hash.substring(0, 8)})`);
    return null;
  } catch (error) {
    stats.errors++;
    console.error('[Genesis-Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Store a genesis result in the cache.
 */
export async function cacheGenesisResult(
  motherType: LLMType,
  genesisConfig: GenesisConfig,
  result: GenesisResult
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  try {
    const hash = hashGenesisConfig(motherType, genesisConfig);
    const key = getCacheKey(motherType, hash);
    const value = serializeResult(result, hash);

    await redis.setex(key, config.ttlSeconds, value);
    stats.writes++;
    console.log(
      `[Genesis-Cache] STORED for ${motherType} (hash: ${hash.substring(0, 8)}, ` +
      `children: ${result.children.length}, TTL: ${config.ttlSeconds}s)`
    );
  } catch (error) {
    stats.errors++;
    console.error('[Genesis-Cache] Error writing cache:', error);
  }
}

/**
 * Get cached result or generate using provided function.
 * This is the main entry point for cache-aware genesis generation.
 */
export async function getCachedOrGenerate(
  motherType: LLMType,
  genesisConfig: GenesisConfig,
  generateFn: () => Promise<GenesisResult>
): Promise<GenesisResult> {
  // Check cache first
  const cached = await getCachedGenesis(motherType, genesisConfig);
  if (cached) {
    return cached;
  }

  // Generate new result
  const result = await generateFn();

  // Cache the result
  await cacheGenesisResult(motherType, genesisConfig, result);

  return result;
}

// =============================================================================
// Cache Invalidation
// =============================================================================

/**
 * Invalidate all cached results for a specific mother type.
 */
export async function invalidateByMother(motherType: LLMType): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}${motherType}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`[Genesis-Cache] Invalidated ${keys.length} entries for ${motherType}`);
    return keys.length;
  } catch (error) {
    console.error('[Genesis-Cache] Error invalidating cache:', error);
    return 0;
  }
}

/**
 * Clear all cached genesis results.
 */
export async function clearGenesisCache(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`[Genesis-Cache] Cleared ${keys.length} cached entries`);
    return keys.length;
  } catch (error) {
    console.error('[Genesis-Cache] Error clearing cache:', error);
    return 0;
  }
}

// =============================================================================
// Configuration Management
// =============================================================================

/**
 * Update cache configuration at runtime.
 */
export function setGenesisCacheConfig(newConfig: Partial<GenesisCacheConfig>): void {
  config = { ...config, ...newConfig };
  console.log('[Genesis-Cache] Configuration updated:', config);
}

/**
 * Get current cache configuration.
 */
export function getGenesisCacheConfig(): GenesisCacheConfig {
  return { ...config };
}

/**
 * Enable or disable the cache.
 */
export function setGenesisCacheEnabled(enabled: boolean): void {
  config.enabled = enabled;
  console.log(`[Genesis-Cache] Cache ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Set the TTL for cached entries.
 */
export function setGenesisCacheTTL(ttlSeconds: number): void {
  config.ttlSeconds = ttlSeconds;
  console.log(`[Genesis-Cache] TTL set to ${ttlSeconds}s`);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get cache statistics.
 */
export function getGenesisCacheStats(): CacheStats & {
  hitRate: number;
  config: GenesisCacheConfig;
} {
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
export function resetGenesisCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.writes = 0;
  stats.errors = 0;
  stats.lastReset = Date.now();
  stats.hitsByMother = {};
  console.log('[Genesis-Cache] Statistics reset');
}

/**
 * Get the number of cached entries.
 */
export async function getGenesisCacheSize(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);
    return keys.length;
  } catch (error) {
    console.error('[Genesis-Cache] Error getting cache size:', error);
    return 0;
  }
}

/**
 * Get cache entries summary by mother type.
 */
export async function getGenesisCacheSummary(): Promise<Record<LLMType, number>> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);

    const summary: Record<string, number> = {};
    for (const key of keys) {
      // Key format: genesis-cache:motherType:hash
      const parts = key.split(':');
      if (parts.length >= 2) {
        const motherType = parts[1];
        summary[motherType] = (summary[motherType] ?? 0) + 1;
      }
    }

    return summary as Record<LLMType, number>;
  } catch (error) {
    console.error('[Genesis-Cache] Error getting cache summary:', error);
    return {} as Record<LLMType, number>;
  }
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the genesis cache from environment variables.
 */
export function initGenesisCacheFromEnv(): void {
  const enabled = process.env.GENESIS_CACHE_ENABLED !== 'false';
  const ttl = parseInt(process.env.GENESIS_CACHE_TTL_SECONDS || '604800', 10);

  config = {
    enabled,
    ttlSeconds: isNaN(ttl) ? 604800 : ttl,
    keyPrefix: process.env.GENESIS_CACHE_PREFIX || 'genesis-cache:',
  };

  console.log('[Genesis-Cache] Initialized from environment:', config);
}

// Initialize on module load
initGenesisCacheFromEnv();
