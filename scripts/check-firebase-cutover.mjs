import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const active = [
  'apps/web',
  'apps/firebase-functions',
  'packages/firebase-trusted',
  'packages/firebase-native',
  'packages/firebase-prototype',
  'packages/domain',
  'packages/personalization',
  'packages/tokens',
  'packages/validation',
];
const forbidden =
  /@paldora\/(?:api-client|config|database|observability|storage)|@supabase\/|\b(?:PaldoraApiClient|apiClient|NEXT_PUBLIC_API_URL|PALDORA_WEB_BACKEND)\b/;
const failures = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next', '.turbo'].includes(entry.name))
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(?:ts|tsx|js|mjs|json)$/.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (forbidden.test(content)) failures.push(path.slice(root.length));
    }
  }
}
for (const directory of active) scan(join(root, directory));
for (const directory of [
  'apps/api',
  'apps/worker',
  'packages/api-client',
  'packages/config',
  'packages/database',
  'packages/observability',
  'packages/storage',
]) {
  if (existsSync(join(root, directory))) failures.push(directory);
}
if (failures.length)
  throw new Error(`Legacy runtime references remain:\n${failures.join('\n')}`);
console.log('Firebase-only active workspace verified.');
