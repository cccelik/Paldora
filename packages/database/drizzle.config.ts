import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const rootEnvironmentPath = fileURLToPath(
  new URL('../../.env', import.meta.url),
);
if (existsSync(rootEnvironmentPath)) loadEnvFile(rootEnvironmentPath);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database tooling.');
}

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/schema.ts',
  schemaFilter: ['paldora'],
  migrations: { schema: 'paldora', table: '__drizzle_migrations' },
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
