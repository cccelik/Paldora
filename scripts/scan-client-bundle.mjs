#!/usr/bin/env node
// Fails when a built browser bundle contains server-only configuration names
// or credential-shaped values. Run after `next build`:
//   node scripts/scan-client-bundle.mjs apps/web/.next/static
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Usage: scan-client-bundle.mjs <directory>');
  process.exit(2);
}

const forbidden = [
  [
    'server-only variable name',
    /SUPABASE_SERVICE_ROLE_KEY|S3_SECRET_ACCESS_KEY|DATABASE_URL|REDIS_URL/,
  ],
  [
    'Supabase service-role JWT claim',
    /"role"\s*:\s*"service_role"|service_role/,
  ],
  ['database connection string', /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/],
  ['Redis connection string', /rediss?:\/\/[^\s"'`]*@/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['local development credential', /_dev_only/],
];

function* files(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(?:js|mjs|css|html|json|map)$/.test(entry)) yield path;
  }
}

const findings = [];
for (const path of files(root)) {
  const content = readFileSync(path, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(content)) findings.push(`${path}: ${label}`);
  }
}

if (findings.length > 0) {
  // Report locations and categories only, never the matched values.
  console.error(`Client bundle secret scan failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Client bundle secret scan passed (${root}).`);
