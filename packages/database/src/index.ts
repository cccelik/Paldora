import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.js';

export type PaldoraDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  database: PaldoraDatabase;
  pool: Pool;
  close: () => Promise<void>;
  check: () => Promise<void>;
}

export function createDatabaseConnection(
  connectionString: string,
): DatabaseConnection {
  const poolConfig: PoolConfig = {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
  const pool = new Pool(poolConfig);
  return {
    database: drizzle(pool, { schema }),
    pool,
    close: async () => pool.end(),
    check: async () => {
      await pool.query('select 1');
    },
  };
}

export * from './schema.js';
