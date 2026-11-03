import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type QueryResultRow } from "pg";
import { databaseUrl, poolConfig } from "../../lib/db-url";

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  pool ??= new Pool(poolConfig(await databaseUrl()));
  return pool;
}

// Queries per request, reported in the Server-Timing header.
export const requestStats = new AsyncLocalStorage<{ queries: number }>();

export async function transaction<T>(fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const stats = requestStats.getStore();
  if (stats) stats.queries++;
  const { rows } = await (await getPool()).query<T>(text, params);
  return rows;
}
