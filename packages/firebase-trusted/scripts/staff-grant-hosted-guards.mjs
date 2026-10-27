// Pure guard logic for the hosted break-glass staff grant (ADR 020). No I/O
// against any Firebase project happens here; the entrypoint does that only
// after every guard passes.
import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

// Same pattern as OPERATOR_LABEL in src/native-moderation.ts.
const OPERATOR_LABEL = /^[a-z0-9._-]{1,40}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const EMULATOR_VARS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_FUNCTIONS_EMULATOR_HOST',
];
const FLAGS = [
  '--project',
  '--confirm-project',
  '--operator-label',
  '--grant',
  '--role',
];

export const usage =
  'Usage: staff-grant-hosted.mjs --project <id> --confirm-project <id> --operator-label <label> --grant <uid> --role <moderator|administrator>';

export function parseFlags(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!FLAGS.includes(key) || value === undefined || flags.has(key))
      throw new Error(usage);
    flags.set(key, value);
  }
  if (flags.size !== FLAGS.length) throw new Error(usage);
  return Object.fromEntries(
    FLAGS.map((flag) => [
      flag.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase()),
      flags.get(flag),
    ]),
  );
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

/** Refuse key files: anything inside the repo, or any service-account key. */
export function assertCredentialsAreAdc(
  env,
  repoRoot,
  fs = { readFileSync, realpathSync },
) {
  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) return;
  let real;
  try {
    real = fs.realpathSync(resolve(file));
  } catch {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS points at an unreadable path; unset it and use gcloud ADC.',
    );
  }
  if (isInside(fs.realpathSync(repoRoot), real))
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS must not point inside the repository.',
    );
  let type;
  try {
    type = JSON.parse(fs.readFileSync(real, 'utf8')).type;
  } catch {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not a readable credentials file.',
    );
  }
  if (type === 'service_account')
    throw new Error(
      'Service-account key files are refused; use `gcloud auth application-default login`.',
    );
}

/** Validates arguments and environment; returns the parsed request. */
export function validateHostedGrant(argv, env, repoRoot, fs) {
  if (!['staging', 'production'].includes(env.PALDORA_ENV ?? ''))
    throw new Error('PALDORA_ENV must be staging or production.');
  const emulator = EMULATOR_VARS.find((name) => env[name]);
  if (emulator || env.FUNCTIONS_EMULATOR)
    throw new Error('Emulator variables must be unset for a hosted grant.');
  const request = parseFlags(argv);
  const { project, confirmProject, operatorLabel, role } = request;
  if (!PROJECT_ID.test(project) || project.startsWith('demo-'))
    throw new Error('--project must be a real, non-demo project id.');
  if (confirmProject !== project)
    throw new Error('--confirm-project must repeat --project exactly.');
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT'])
    if (env[name] && env[name] !== project)
      throw new Error(`${name} disagrees with --project.`);
  if (!OPERATOR_LABEL.test(operatorLabel))
    throw new Error('--operator-label must match /^[a-z0-9._-]{1,40}$/.');
  if (!['moderator', 'administrator'].includes(role))
    throw new Error('--role must be moderator or administrator.');
  assertCredentialsAreAdc(env, repoRoot, fs);
  return request;
}

export function confirmationPhrase({ role, grant, project }) {
  return `GRANT ${role} ${grant} ON ${project}`;
}
