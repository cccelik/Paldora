import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { userPreferences } from './index.js';
import { connectTestDatabase, failureOf } from './test-support/connection.js';
import { contentFixtures } from './test-support/content.js';

const { connection, database } = connectTestDatabase(
  'paldora-migrations-test',
  2,
);
const { newUser } = contentFixtures(database);

describe('migrated database', () => {
  it('is reachable', async () => {
    await expect(connection.check()).resolves.toBeUndefined();
  });

  it('contains the paldora schema and the migration journal', async () => {
    const result = await database.execute<{ name: string }>(sql`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_schema = 'paldora' and table_name = '__drizzle_migrations'
    `);
    expect(result.rows).toEqual([{ name: 'paldora.__drizzle_migrations' }]);
  });

  it('applies the migrations again as a no-op', async () => {
    const count = async () =>
      (
        await database.execute<{ count: number }>(
          sql`select count(*)::int as count from paldora.__drizzle_migrations`,
        )
      ).rows[0]?.count;
    const before = await count();
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
      migrationsSchema: 'paldora',
      migrationsTable: '__drizzle_migrations',
    });
    expect(await count()).toBe(before);
    expect(before).toBeGreaterThanOrEqual(8);
  });
});

describe('reaction presets', () => {
  it('default to five emoji and must stay at five', async () => {
    const userId = await newUser();
    const [row] = await database
      .insert(userPreferences)
      .values({ userId })
      .returning({ presets: userPreferences.reactionPresets });
    expect(row?.presets).toEqual(['👍', '❤️', '😂', '😮', '😢']);
    const failure = await failureOf(
      database
        .update(userPreferences)
        .set({ reactionPresets: ['👍'] })
        .where(eq(userPreferences.userId, userId)),
    );
    expect(failure.constraint).toBe('user_preferences_reaction_presets_check');
  });
});
