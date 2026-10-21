import { requireEnvironmentVariables } from '@paldora/config';
import { afterAll } from 'vitest';
import { createDatabaseConnection } from '../index.js';

/**
 * Connects a schema suite to the test database and closes the pool after the
 * file. Throws (never skips) when `DATABASE_URL` is unset.
 */
export function connectTestDatabase(applicationName: string, poolMax = 4) {
  const { DATABASE_URL } = requireEnvironmentVariables(
    ['DATABASE_URL'],
    process.env,
  );
  const connection = createDatabaseConnection({
    connectionString: DATABASE_URL ?? '',
    poolMax,
    applicationName,
  });
  afterAll(() => connection.close());
  return { connection, database: connection.database };
}

/** SQLSTATE codes the schema suites expect. */
export const PG_ERROR = {
  CHECK: '23514',
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  /** Raised by Paldora's trigger guards (`integrity_constraint_violation`). */
  INTEGRITY: '23000',
} as const;

export interface PostgresFailure {
  readonly code: string | undefined;
  readonly constraint: string | undefined;
}

/** The PostgreSQL error behind a rejected write (Drizzle wraps it). */
export async function failureOf(
  write: Promise<unknown>,
): Promise<PostgresFailure> {
  try {
    await write;
  } catch (error) {
    let current: unknown = error;
    while (typeof current === 'object' && current !== null) {
      const candidate = current as {
        code?: unknown;
        constraint?: unknown;
        cause?: unknown;
      };
      if (typeof candidate.code === 'string') {
        return {
          code: candidate.code,
          constraint:
            typeof candidate.constraint === 'string'
              ? candidate.constraint
              : undefined,
        };
      }
      current = candidate.cause;
    }
    throw error;
  }
  throw new Error('The write was expected to fail.');
}
