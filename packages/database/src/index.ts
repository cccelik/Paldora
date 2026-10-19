import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type PaldoraDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly database: PaldoraDatabase;
  check(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseConnectionOptions {
  connectionString: string;
  /** Per-process ceiling. Size it against the server's connection budget. */
  poolMax: number;
  applicationName: string;
}

export function createDatabaseConnection(
  options: DatabaseConnectionOptions,
): DatabaseConnection {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.poolMax,
    application_name: options.applicationName,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Bounds runaway queries; long migrations run through drizzle-kit instead.
    statement_timeout: 15_000,
  });
  return {
    database: drizzle(pool, { schema }),
    check: async () => {
      await pool.query('select 1');
    },
    close: () => pool.end(),
  };
}

export * from './schema.js';
export * from './media-outbox.js';
