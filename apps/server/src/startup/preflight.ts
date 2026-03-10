import { CONFIG } from '../config';
import { checkDatabaseConnection, checkDatabaseSchema } from '../db';
import { checkRedisConnection } from '../cache';

function formatConnectionTarget(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    const database = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `${parsed.protocol}//${host}${database}`;
  } catch {
    return '[configured]';
  }
}

function logBootstrapInstructions(): void {
  console.error('[Startup] Start local infrastructure with `docker compose up -d`.');
  console.error('[Startup] Apply the schema with `pnpm db:push` or `bun run db:push`.');
  console.error('[Startup] Then restart with `pnpm dev` or `bun dev`.\n');
}

export async function assertLocalInfrastructureReady(): Promise<void> {
  const [databaseReachable, redisReachable] = await Promise.all([
    checkDatabaseConnection({ logFailure: false }),
    checkRedisConnection({ logFailure: false }),
  ]);

  const missingServices: string[] = [];
  if (!databaseReachable) {
    missingServices.push('PostgreSQL');
  }
  if (!redisReachable) {
    missingServices.push('Redis');
  }

  if (missingServices.length > 0) {
    console.error('\n[Startup] Local infrastructure is not ready.');
    console.error(`[Startup] Missing or unreachable services: ${missingServices.join(', ')}`);
    console.error(`[Startup] DATABASE_URL -> ${formatConnectionTarget(CONFIG.database.connectionString)}`);
    console.error(`[Startup] REDIS_URL -> ${formatConnectionTarget(CONFIG.redis.url)}`);
    logBootstrapInstructions();
    throw new Error(`Missing local dependencies: ${missingServices.join(', ')}`);
  }

  const schemaReady = await checkDatabaseSchema({ logFailure: false });
  if (!schemaReady) {
    console.error('\n[Startup] PostgreSQL is reachable, but the schema is not initialized.');
    console.error(`[Startup] DATABASE_URL -> ${formatConnectionTarget(CONFIG.database.connectionString)}`);
    console.error('[Startup] Run `pnpm db:push` or `bun run db:push` to create/update the schema.\n');
    throw new Error('Database schema not initialized');
  }
}
