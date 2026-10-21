import { requireEnvironmentVariables } from '@paldora/config';
import { createDatabaseConnection } from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { afterAll } from 'vitest';

/**
 * Connects an integration suite to the test database and closes the pool
 * after the file. Throws (never skips) when `required` variables are unset.
 */
export function connectTestDatabase(
  applicationName: string,
  options: { poolMax?: number; required?: readonly string[] } = {},
) {
  const env = requireEnvironmentVariables(
    options.required ?? ['DATABASE_URL'],
    process.env,
  );
  const connection = createDatabaseConnection({
    connectionString: env.DATABASE_URL ?? '',
    poolMax: options.poolMax ?? 6,
    applicationName,
  });
  afterAll(() => connection.close());
  return { database: connection.database, env };
}

export const silentLogger = () =>
  createLogger({ service: 'worker', environment: 'test', level: 'silent' });
