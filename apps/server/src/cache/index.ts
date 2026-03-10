/**
 * Redis client for Sim Agents
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function checkRedisConnection(
  { logFailure = true }: { logFailure?: boolean } = {}
): Promise<boolean> {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  probe.on('error', (error) => {
    if (logFailure) {
      console.error('Redis connection failed:', error);
    }
  });

  try {
    await probe.connect();
    await probe.ping();
    await probe.quit();
    return true;
  } catch (error) {
    probe.disconnect();
    if (logFailure && !(error instanceof Error && error.message.includes('Failed to connect'))) {
      console.error('Redis connection failed:', error);
    }
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redis.status === 'wait' || redis.status === 'end') {
    redis.disconnect();
    return;
  }

  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
