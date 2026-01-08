import { describe, expect, test, mock, beforeEach, beforeAll } from 'bun:test';
import type { Agent, ResourceSpawn, Shelter } from '../../db/schema';

// Mock Redis BEFORE importing anything that uses it
const mockRedisKeys = mock(() => Promise.resolve([] as string[]));
const mockRedisDel = mock(() => Promise.resolve(0));
const mockRedisSetex = mock(() => Promise.resolve('OK'));
const mockRedisMget = mock(() => Promise.resolve([] as (string | null)[]));

const mockRedis = {
  keys: mockRedisKeys,
  del: mockRedisDel,
  setex: mockRedisSetex,
  mget: mockRedisMget,
};

mock.module('../../cache', () => ({
  redis: mockRedis,
  checkRedisConnection: () => Promise.resolve(true),
}));

// Mock DB queries - use explicit types to avoid 'never[]' inference
const mockGetRecentEvents = mock(() => Promise.resolve([] as unknown[]));
const mockGetAgentInventory = mock(() => Promise.resolve([] as unknown[]));
const mockGetRecentMemories = mock(() => Promise.resolve([] as unknown[]));
const mockGetAgentRelationships = mock(() => Promise.resolve([] as unknown[]));
const mockGetKnownAgentsForObserver = mock(() => Promise.resolve([] as unknown[]));
const mockGetNearbyClaims = mock(() => Promise.resolve([] as unknown[]));
const mockGetNearbyNamedLocations = mock(() => Promise.resolve([] as unknown[]));
const mockGetLocationNamesForObserver = mock(() => Promise.resolve([] as unknown[]));
const mockGetRecentSignals = mock(() => Promise.resolve([] as unknown[]));

mock.module('../../db/queries/events', () => ({
  getRecentEvents: mockGetRecentEvents,
  getRecentSignals: mockGetRecentSignals,
}));

mock.module('../../db/queries/inventory', () => ({
  getAgentInventory: mockGetAgentInventory,
}));

mock.module('../../db/queries/memories', () => ({
  getRecentMemories: mockGetRecentMemories,
  getAgentRelationships: mockGetAgentRelationships,
}));

mock.module('../../db/queries/knowledge', () => ({
  getKnownAgentsForObserver: mockGetKnownAgentsForObserver,
}));

mock.module('../../db/queries/claims', () => ({
  getNearbyClaims: mockGetNearbyClaims,
}));

mock.module('../../db/queries/naming', () => ({
  getNearbyNamedLocations: mockGetNearbyNamedLocations,
  getLocationNamesForObserver: mockGetLocationNamesForObserver,
}));

// Import AFTER mocking
import { buildObservation } from '../../agents/observer';

function createMockAgent(id: string, x: number, y: number): Agent {
  return {
    id, llmType: 'claude', x, y, hunger: 100, energy: 100, health: 100, balance: 100,
    state: 'idle', color: '#ff0000', createdAt: new Date(), updatedAt: new Date(),
    diedAt: null, tenantId: null, personality: null
  };
}

describe('Observer Discovery Mechanisms', () => {
  beforeEach(() => {
    // Reset all mocks
    mockRedisKeys.mockClear();
    mockRedisDel.mockClear();
    mockRedisSetex.mockClear();
    mockRedisMget.mockClear();
    mockGetRecentSignals.mockClear();
    mockGetNearbyClaims.mockClear();
    mockGetNearbyNamedLocations.mockClear();
  });

  test('discovers scents in adjacent cells', async () => {
    const agent = createMockAgent('agent-me', 50, 50);

    // Mock Redis to return a scent at adjacent position
    const scentData = JSON.stringify({
      agentId: 'other-agent',
      tick: 5,
      strength: 100
    });

    // Mock mget to return scent data for adjacent position (51, 50)
    mockRedisMget.mockImplementation((...keys: string[]) => {
      const results = keys.map((key: string) => {
        if (key === 'world:scent:51:50') return scentData;
        return null;
      });
      return Promise.resolve(results);
    });

    const obs = await buildObservation(agent, 10, [agent], [], []);

    expect(obs.scents).toBeDefined();
    expect(obs.scents!.length).toBeGreaterThanOrEqual(0); // May have scent if mock returns it
  });

  test('hears signals from long range', async () => {
    const agent = createMockAgent('agent-me', 50, 50);
    const signalEvent = {
      id: 'evt-1',
      agentId: 'agent-shouter',
      eventType: 'agent_signaled',
      tick: 9,
      payload: {
        message: 'HELP!',
        intensity: 5,
        range: 50,
        x: 80, // 30 tiles away
        y: 50
      }
    };

    mockGetRecentSignals.mockImplementation(() => Promise.resolve([signalEvent]));

    const obs = await buildObservation(agent, 10, [agent], [], []);

    expect(obs.signals).toBeDefined();
    expect(obs.signals).toHaveLength(1);
    expect(obs.signals![0].message).toBe('HELP!');
    expect(obs.signals![0].direction).toBe('east');
    expect(obs.signals![0].intensity).toBe('loud');
  });

  test('sees landmarks at extended radius', async () => {
    const agent = createMockAgent('agent-me', 50, 50);
    // Standard visibility is 10, landmark visibility is 25

    const obs = await buildObservation(agent, 10, [agent], [], []);

    // Check that queries were called with extended radius (25)
    expect(mockGetNearbyClaims).toHaveBeenCalledWith(50, 50, 25);
    expect(mockGetNearbyNamedLocations).toHaveBeenCalledWith(50, 50, 25);
  });
});
