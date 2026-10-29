// Static guard for hosted (staging/production) configuration. Local file work
// only: it never contacts a Firebase project. See docs/adr/023-web-hosting-app-hosting.md.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_REGION = 'europe-west4';
export const NEXT_PUBLIC_ALLOWLIST = [
  'NEXT_PUBLIC_WEB_URL',
  'NEXT_PUBLIC_CONTACT_EMAIL',
];
const FORBIDDEN_HOSTED_TEXT = [
  [/\blocalhost\b/i, 'localhost'],
  [/\b127\.0\.0\.1\b/, '127.0.0.1'],
  [/\b0\.0\.0\.0\b/, '0.0.0.0'],
  [/[A-Z_]*EMULATOR_HOST/, '*_EMULATOR_HOST'],
  [/\bdemo-[a-z0-9-]+/i, 'demo- identifier'],
  [/dev_only/i, 'dev_only value'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key material'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'API key literal'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'token literal'],
  [
    /\b[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/_-])/,
    'long token-like literal',
  ],
];

function read(path) {
  return readFileSync(path, 'utf8');
}

function stripYamlComments(text) {
  return text
    .split('\n')
    .map((line) => (/^\s*#/.test(line) ? '' : line.replace(/\s#.*$/, '')))
    .join('\n');
}

function scanText(label, text, failures) {
  for (const [pattern, name] of FORBIDDEN_HOSTED_TEXT)
    if (pattern.test(text)) failures.push(`${label}: contains ${name}`);
}

/** Entries of the top-level `env:` list as {variable, value, secret}. */
export function parseEnvEntries(yaml) {
  const entries = [];
  let current = null;
  for (const line of stripYamlComments(yaml).split('\n')) {
    const variable = /^\s*-\s*variable:\s*(\S+)\s*$/.exec(line);
    if (variable) {
      current = { variable: variable[1] };
      entries.push(current);
      continue;
    }
    const field = /^\s+(value|secret):\s*(.*?)\s*$/.exec(line);
    if (field && current)
      current[field[1]] = field[2].replace(/^['"]|['"]$/g, '');
  }
  return entries;
}

function checkRulesAndIndexes(root, failures) {
  const path = join(root, 'firebase.json');
  if (!existsSync(path)) {
    failures.push('firebase.json is missing');
    return null;
  }
  const raw = read(path);
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    failures.push('firebase.json is not valid JSON');
    return null;
  }
  if (/firebase\.native\.json|firestore\.native\.rules/.test(raw))
    failures.push('firebase.json references the native/local prototype config');
  for (const [service, key] of [
    ['firestore', 'rules'],
    ['storage', 'rules'],
  ]) {
    const file = config[service]?.[key];
    if (typeof file !== 'string') {
      failures.push(`firebase.json ${service}.${key} is missing`);
      continue;
    }
    const full = resolve(root, file);
    if (!existsSync(full)) {
      failures.push(`${file} does not exist`);
      continue;
    }
    const statements = [...read(full).matchAll(/\ballow\b[^;]*;/g)].map(
      (match) => match[0],
    );
    if (statements.length === 0)
      failures.push(`${file} has no allow statement`);
    for (const statement of statements)
      if (statement.replace(/\s+/g, '') !== 'allowread,write:iffalse;')
        failures.push(
          `${file} contains a non-deny allow: ${statement.replace(/\s+/g, ' ')}`,
        );
  }
  return config;
}

function checkFunctions(root, config, failures) {
  const functions = config?.functions;
  if (functions === undefined) {
    failures.push('firebase.json has no functions block');
    return;
  }
  const blocks = Array.isArray(functions) ? functions : [functions];
  for (const block of blocks) {
    scanText('firebase.json functions', JSON.stringify(block), failures);
    if (block.region !== undefined && block.region !== HOSTED_REGION)
      failures.push(`firebase.json functions region must be ${HOSTED_REGION}`);
  }
  // `source` is the generated bundle directory (apps/firebase-functions/deploy);
  // the TypeScript sources it is built from live in ../src.
  const declared = join(root, blocks[0]?.source ?? 'apps/firebase-functions');
  if (!/(^|[\\/])deploy$/.test(declared) && blocks[0]?.source !== undefined)
    failures.push(
      'firebase.json functions.source must be the generated bundle directory (apps/firebase-functions/deploy)',
    );
  const source = [join(declared, 'src'), join(declared, '..', 'src')].find(
    (dir) => existsSync(dir),
  );
  if (source === undefined) {
    failures.push('functions source directory src was not found');
    return;
  }
  for (const name of readdirSync(source)) {
    if (!/\.ts$/.test(name) || /\.test\.ts$/.test(name)) continue;
    for (const match of read(join(source, name)).matchAll(
      /\bregion:\s*['"]([^'"]+)['"]/g,
    ))
      if (match[1] !== HOSTED_REGION)
        failures.push(`functions source ${name} uses region ${match[1]}`);
  }
}

function checkAppHosting(root, failures) {
  const dir = join(root, 'apps/web');
  const files = existsSync(dir)
    ? readdirSync(dir).filter((n) =>
        /^apphosting(\.[a-z0-9-]+)?\.yaml$/.test(n),
      )
    : [];
  if (files.length === 0)
    failures.push('no apphosting*.yaml found in apps/web');
  for (const name of files) {
    const text = stripYamlComments(read(join(dir, name)));
    const label = `apps/web/${name}`;
    scanText(label, text, failures);
    for (const entry of parseEnvEntries(text)) {
      if (
        entry.variable.startsWith('NEXT_PUBLIC_') &&
        !NEXT_PUBLIC_ALLOWLIST.includes(entry.variable)
      )
        failures.push(
          `${label}: ${entry.variable} is not an allowed NEXT_PUBLIC_ variable`,
        );
      if (entry.variable.startsWith('NEXT_PUBLIC_') && entry.secret)
        failures.push(`${label}: ${entry.variable} must not be a secret`);
      if (
        entry.variable === 'PALDORA_ENV' &&
        !['staging', 'production'].includes(entry.value)
      )
        failures.push(`${label}: PALDORA_ENV must be staging or production`);
    }
    const overlay = /^apphosting\.(staging|production)\.yaml$/.exec(name);
    if (overlay) {
      const env = parseEnvEntries(text).find(
        (e) => e.variable === 'PALDORA_ENV',
      );
      if (env?.value !== overlay[1])
        failures.push(`${label}: PALDORA_ENV must equal ${overlay[1]}`);
    }
  }
}

function checkFirebaserc(root, failures) {
  const path = join(root, '.firebaserc');
  if (!existsSync(path)) return;
  let rc;
  try {
    rc = JSON.parse(read(path));
  } catch {
    failures.push('.firebaserc is not valid JSON');
    return;
  }
  for (const [alias, id] of Object.entries(rc.projects ?? {}))
    if (typeof id !== 'string' || id.startsWith('demo-'))
      failures.push(`.firebaserc alias ${alias} uses a demo- project`);
}

/** Returns a list of failure messages; empty means the hosted config passes. */
export function checkHostedConfig(root) {
  const failures = [];
  const config = checkRulesAndIndexes(root, failures);
  checkFunctions(root, config, failures);
  checkAppHosting(root, failures);
  checkFirebaserc(root, failures);
  return failures;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const failures = checkHostedConfig(root);
  if (failures.length > 0) {
    process.stderr.write(
      `Hosted config check failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write('Hosted config check passed.\n');
}
