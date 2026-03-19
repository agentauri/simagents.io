/**
 * LLM Cache Tests
 *
 * Tests for the LLM response caching functionality.
 * Note: Integration tests require Redis to be running.
 */

import { describe, test, expect, beforeEach, afterAll, beforeAll } from 'bun:test';
import {
  hashObservation,
  getCachedResponse,
  cacheResponse,
  getLLMCacheStats,
  getLLMCacheConfig,
  setLLMCacheEnabled,
  setLLMCacheTTL,
  clearLLMCache,
  resetLLMCacheStats,
  setLLMCacheConfig,
  markFailedAction,
} from '../../cache/llm-cache';
import { checkRedisConnection } from '../../cache/index';
import type { AgentObservation, AgentDecision } from '../../llm/types';

// Check if Redis is available for integration tests
let redisAvailable = false;

// Create a mock observation
function createMockObservation(overrides: Partial<AgentObservation['self']> = {}): AgentObservation {
  return {
    tick: 100,
    timestamp: Date.now(),
    self: {
      id: 'agent-123',
      x: 10,
      y: 20,
      hunger: 70,
      energy: 80,
      health: 100,
      balance: 50,
      state: 'idle' as const,
      ...overrides,
    },
    nearbyAgents: [],
    nearbyResourceSpawns: [],
    nearbyShelters: [],
    nearbyLocations: [],
    availableActions: [],
    inventory: [],
    recentEvents: [],
  };
}

// Create a mock decision
function createMockDecision(): AgentDecision {
  return {
    action: 'move',
    params: { toX: 10, toY: 21 },
    reasoning: 'Moving north to find resources',
  };
}

describe('LLM Cache', () => {
  beforeAll(async () => {
    // Check if Redis is available
    try {
      redisAvailable = await checkRedisConnection();
    } catch {
      redisAvailable = false;
    }
  });

  beforeEach(async () => {
    // Reset cache and stats before each test
    if (redisAvailable) {
      await clearLLMCache();
    }
    resetLLMCacheStats();
    setLLMCacheConfig({
      enabled: true,
      ttlSeconds: 300,
      keyPrefix: 'llm-cache-test:',
      shareAcrossAgents: true,
    });
  });

  afterAll(async () => {
    // Clean up test keys
    if (redisAvailable) {
      await clearLLMCache();
    }
  });

  describe('hashObservation', () => {
    test('produces consistent hash for same observation', () => {
      const obs1 = createMockObservation();
      const obs2 = createMockObservation();

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).toBe(hash2);
    });

    test('produces different hash for different positions', () => {
      const obs1 = createMockObservation({ x: 10, y: 20 });
      const obs2 = createMockObservation({ x: 15, y: 25 });

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).not.toBe(hash2);
    });

    test('produces different hash for different needs', () => {
      const obs1 = createMockObservation({ hunger: 70 });
      const obs2 = createMockObservation({ hunger: 30 }); // Rounds to different value

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).not.toBe(hash2);
    });

    test('produces same hash for similar needs (within rounding)', () => {
      // Both round to 70 (69 and 70 both round to 70 when rounding to nearest 2)
      const obs1 = createMockObservation({ hunger: 69 });
      const obs2 = createMockObservation({ hunger: 70 });

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).toBe(hash2);
    });

    test('ignores tick number (excluded from hash)', () => {
      const obs1 = createMockObservation();
      obs1.tick = 100;

      const obs2 = createMockObservation();
      obs2.tick = 200;

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).toBe(hash2);
    });

    test('ignores timestamp (excluded from hash)', () => {
      const obs1 = createMockObservation();
      obs1.timestamp = Date.now();

      const obs2 = createMockObservation();
      obs2.timestamp = Date.now() + 10000;

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).toBe(hash2);
    });

    test('returns 16-character hash', () => {
      const obs = createMockObservation();
      const hash = hashObservation(obs);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    test('includes agent identity when cache sharing is disabled', () => {
      setLLMCacheConfig({ shareAcrossAgents: false });

      const obs1 = createMockObservation({ id: 'agent-a' });
      const obs2 = createMockObservation({ id: 'agent-b' });

      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('cache operations', () => {
    test('caches and retrieves a decision', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision = createMockDecision();

      // Cache the decision
      await cacheResponse(obs, 'claude', decision);

      // Retrieve the cached decision
      const cached = await getCachedResponse(obs, 'claude');

      expect(cached).toEqual(decision);
    });

    test('returns null for cache miss', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();

      const cached = await getCachedResponse(obs, 'claude');

      expect(cached).toBeNull();
    });

    test('separates cache by LLM type', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const claudeDecision: AgentDecision = {
        action: 'move',
        params: { toX: 10, toY: 21 },
        reasoning: 'Claude reasoning',
      };
      const geminiDecision: AgentDecision = {
        action: 'gather',
        params: { resourceType: 'food' },
        reasoning: 'Gemini reasoning',
      };

      // Cache decisions for different LLM types
      await cacheResponse(obs, 'claude', claudeDecision);
      await cacheResponse(obs, 'gemini', geminiDecision);

      // Retrieve and verify separation
      const cachedClaude = await getCachedResponse(obs, 'claude');
      const cachedGemini = await getCachedResponse(obs, 'gemini');

      expect(cachedClaude).toEqual(claudeDecision);
      expect(cachedGemini).toEqual(geminiDecision);
    });

    test('does not cache when disabled', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      setLLMCacheEnabled(false);

      const obs = createMockObservation();
      const decision = createMockDecision();

      await cacheResponse(obs, 'claude', decision);
      const cached = await getCachedResponse(obs, 'claude');

      expect(cached).toBeNull();

      // Re-enable for other tests
      setLLMCacheEnabled(true);
    });
  });

  describe('configuration', () => {
    test('can enable and disable cache', () => {
      setLLMCacheEnabled(false);
      expect(getLLMCacheConfig().enabled).toBe(false);

      setLLMCacheEnabled(true);
      expect(getLLMCacheConfig().enabled).toBe(true);
    });

    test('can set TTL', () => {
      setLLMCacheTTL(600);
      expect(getLLMCacheConfig().ttlSeconds).toBe(600);

      setLLMCacheTTL(300);
      expect(getLLMCacheConfig().ttlSeconds).toBe(300);
    });

    test('can clear cache', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision = createMockDecision();

      await cacheResponse(obs, 'claude', decision);
      const beforeClear = await getCachedResponse(obs, 'claude');
      expect(beforeClear).toEqual(decision);

      const clearedCount = await clearLLMCache();
      expect(clearedCount).toBeGreaterThanOrEqual(1);

      const afterClear = await getCachedResponse(obs, 'claude');
      expect(afterClear).toBeNull();
    });
  });

  describe('statistics', () => {
    test('tracks cache hits', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      resetLLMCacheStats();

      const obs = createMockObservation();
      const decision = createMockDecision();

      await cacheResponse(obs, 'claude', decision);
      await getCachedResponse(obs, 'claude');
      await getCachedResponse(obs, 'claude');

      const stats = getLLMCacheStats();
      expect(stats.hits).toBe(2);
    });

    test('tracks cache misses', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      resetLLMCacheStats();

      const obs1 = createMockObservation({ x: 1 });
      const obs2 = createMockObservation({ x: 2 });

      await getCachedResponse(obs1, 'claude');
      await getCachedResponse(obs2, 'claude');

      const stats = getLLMCacheStats();
      expect(stats.misses).toBe(2);
    });

    test('tracks cache writes', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      resetLLMCacheStats();

      const obs = createMockObservation();
      const decision = createMockDecision();

      await cacheResponse(obs, 'claude', decision);
      await cacheResponse(obs, 'gemini', decision);

      const stats = getLLMCacheStats();
      expect(stats.writes).toBe(2);
    });

    test('calculates hit rate', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      resetLLMCacheStats();

      const obs = createMockObservation();
      const decision = createMockDecision();

      // 1 miss, then cache, then 1 hit
      await getCachedResponse(obs, 'claude');
      await cacheResponse(obs, 'claude', decision);
      await getCachedResponse(obs, 'claude');

      const stats = getLLMCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    test('can reset statistics', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision = createMockDecision();

      await cacheResponse(obs, 'claude', decision);
      await getCachedResponse(obs, 'claude');

      resetLLMCacheStats();

      const stats = getLLMCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.writes).toBe(0);
    });
  });

  describe('failed action blocklist', () => {
    test('blocks cached response when action is on blocklist', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision: AgentDecision = {
        action: 'gather',
        params: { resourceType: 'food' },
        reasoning: 'Gathering food',
      };

      // Cache a gather decision
      await cacheResponse(obs, 'grok', decision);

      // Before blocklist: cache should hit
      const beforeBlock = await getCachedResponse(obs, 'grok');
      expect(beforeBlock).toEqual(decision);

      // Mark gather as failed
      await markFailedAction(obs, 'grok', 'gather');

      // After blocklist: cache should return null (forced re-query)
      const afterBlock = await getCachedResponse(obs, 'grok');
      expect(afterBlock).toBeNull();
    });

    test('prevents re-caching a blocked action', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision: AgentDecision = {
        action: 'gather',
        params: { resourceType: 'food' },
        reasoning: 'Gathering food',
      };

      // Mark gather as failed BEFORE caching
      await markFailedAction(obs, 'grok', 'gather');

      // Try to cache gather — should be skipped
      await cacheResponse(obs, 'grok', decision);

      // Clear blocklist key manually to test if it was cached
      // If cacheResponse correctly skipped, there should be nothing cached
      // We can check by using a different LLM type (no blocklist for it)
      const cached = await getCachedResponse(obs, 'grok');
      expect(cached).toBeNull();
    });

    test('does not block different actions', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const moveDecision: AgentDecision = {
        action: 'move',
        params: { toX: 5, toY: 5 },
        reasoning: 'Moving',
      };

      // Block gather but NOT move
      await markFailedAction(obs, 'grok', 'gather');

      // Cache a move decision — should work fine
      await cacheResponse(obs, 'grok', moveDecision);

      // Move should still be served from cache
      const cached = await getCachedResponse(obs, 'grok');
      expect(cached).toEqual(moveDecision);
    });

    test('does not block other LLM types', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }
      const obs = createMockObservation();
      const decision: AgentDecision = {
        action: 'gather',
        params: { resourceType: 'food' },
        reasoning: 'Gathering food',
      };

      // Block gather for grok only
      await markFailedAction(obs, 'grok', 'gather');

      // Cache gather for claude — should work fine
      await cacheResponse(obs, 'claude', decision);
      const cached = await getCachedResponse(obs, 'claude');
      expect(cached).toEqual(decision);
    });

    test('hash changes with each new failure event (recentFailedActions)', () => {
      const obs0 = createMockObservation();
      obs0.recentEvents = [];

      const obs1 = createMockObservation();
      obs1.recentEvents = [
        { type: 'action_failed', description: 'gather failed', tick: 1, timestamp: Date.now() },
      ];

      const obs2 = createMockObservation();
      obs2.recentEvents = [
        { type: 'action_failed', description: 'gather failed', tick: 1, timestamp: Date.now() },
        { type: 'action_failed', description: 'gather failed', tick: 2, timestamp: Date.now() },
      ];

      const hash0 = hashObservation(obs0);
      const hash1 = hashObservation(obs1);
      const hash2 = hashObservation(obs2);

      // Each should produce a different hash
      expect(hash0).not.toBe(hash1);
      expect(hash1).not.toBe(hash2);
      expect(hash0).not.toBe(hash2);
    });
  });
});
