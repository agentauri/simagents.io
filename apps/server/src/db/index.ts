/**
 * Database connection for Sim Agents
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://dev:dev@localhost:5432/simagents';

interface HealthCheckOptions {
  logFailure?: boolean;
}

// Connection pool
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from './schema';

// Health check
export async function checkDatabaseConnection(
  { logFailure = true }: HealthCheckOptions = {}
): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    if (logFailure) {
      console.error('Database connection failed:', error);
    }
    return false;
  }
}

export async function checkDatabaseSchema(
  { logFailure = true }: HealthCheckOptions = {}
): Promise<boolean> {
  try {
    const result = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'world_state'
      ) AS exists
    `;

    return result[0]?.exists === true;
  } catch (error) {
    if (logFailure) {
      console.error('Database schema check failed:', error);
    }
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}
