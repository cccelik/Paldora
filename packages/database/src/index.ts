import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

export interface DatabaseConnection {
  database: NodePgDatabase;
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
    database: drizzle(pool),
    pool,
    close: async () => pool.end(),
    check: async () => {
      await pool.query('select 1');
    },
  };
}

export { applicationSchemaName } from './schema.js';
