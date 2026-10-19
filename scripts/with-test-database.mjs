// Runs a command against a dedicated `<name>_test` database so integration and
// full-stack tests never touch development data. Locally it creates the
// database if needed and applies every migration first. In CI (`CI=true`) the
// job already provides a clean database, so the command runs unchanged.
//
//   node scripts/with-test-database.mjs <command> [args...]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error(
    'Usage: node scripts/with-test-database.mjs <command> [args...]',
  );
  process.exit(2);
}

function run(file, fileArgs, env) {
  const result = spawnSync(file, fileArgs, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.CI === 'true') {
  run(command, args, process.env);
  process.exit(0);
}

if (existsSync(new URL('../.env', import.meta.url))) {
  // Values already in the environment win over the file.
  process.loadEnvFile(new URL('../.env', import.meta.url));
}
const source = process.env.DATABASE_URL;
if (!source) {
  console.error(
    'DATABASE_URL is required (set it in .env or the environment).',
  );
  process.exit(1);
}

const url = new URL(source);
const current = decodeURIComponent(url.pathname.slice(1));
const testName = current.endsWith('_test') ? current : `${current}_test`;
if (!/^[a-z0-9_]{1,50}$/.test(testName)) {
  console.error('Refusing to create a database with an unexpected name.');
  process.exit(1);
}

const { Client } = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
)('pg');
const admin = new Client({ connectionString: source });
await admin.connect();
const { rowCount } = await admin.query(
  'select 1 from pg_database where datname = $1',
  [testName],
);
if (rowCount === 0) {
  // Identifiers cannot be parameters; the name was validated above.
  await admin.query(`create database "${testName}"`);
  console.log(`Created database ${testName}.`);
}
await admin.end();

url.pathname = `/${testName}`;
const env = { ...process.env, DATABASE_URL: url.toString() };
console.log(`Using database ${testName} (migrating first).`);
run('pnpm', ['db:migrate'], env);
run(command, args, env);
