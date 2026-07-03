/**
 * Browser stub for the server's raw Drizzle/Postgres client (`db/index`).
 *
 * No handler registered in `actions/index.ts` imports the raw client (they go
 * through the aliased `db/queries/*` modules), so this stub should be
 * unreachable. It exists as regression insurance: if a future handler imports
 * `db` directly, the bundle stays free of the real Postgres client and any
 * accidental use fails loudly at runtime instead of silently doing nothing.
 */

function unavailable(): never {
  throw new Error(
    'The raw database client is not available in the browser engine. ' +
      'Use the db/queries/* modules (aliased to engine-memory) instead.'
  );
}

export const db = new Proxy(
  {},
  {
    get: unavailable,
    apply: unavailable,
  }
) as never;

export const inventory = new Proxy({}, { get: unavailable }) as never;
export const sql = unavailable as never;
