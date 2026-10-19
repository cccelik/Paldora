import { requireEnvironmentVariables } from '@paldora/config';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './index.js';

const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 2,
  applicationName: 'paldora-schema-test',
});

afterAll(() => connection.close());

describe('migrated database', () => {
  it('is reachable', async () => {
    await expect(connection.check()).resolves.toBeUndefined();
  });

  it('contains the paldora schema and the migration journal', async () => {
    const result = await connection.database.execute<{ name: string }>(sql`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_schema = 'paldora' and table_name = '__drizzle_migrations'
    `);
    expect(result.rows).toEqual([{ name: 'paldora.__drizzle_migrations' }]);
  });
});
