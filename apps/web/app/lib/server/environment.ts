/** Validated web origin. Firebase Admin credentials remain server-only. */
export function publicEnvironment(): { NEXT_PUBLIC_WEB_URL: string } {
  const value = process.env.NEXT_PUBLIC_WEB_URL;
  if (!value) throw new Error('NEXT_PUBLIC_WEB_URL is required.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('NEXT_PUBLIC_WEB_URL must use HTTP or HTTPS.');
  return { NEXT_PUBLIC_WEB_URL: parsed.toString().replace(/\/$/, '') };
}

/** A plain mailbox address: no display name, no whitespace, no angle brackets. */
const CONTACT_EMAIL =
  /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;

/**
 * The public reports-and-appeals address shown on /contact. Optional locally;
 * `assertHostedEnvironment` requires it for staging and production. A set but
 * malformed value always throws, so a typo is never shown as a contact channel.
 */
export function contactEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (!value) return undefined;
  if (value.length > 254 || !CONTACT_EMAIL.test(value))
    throw new Error('NEXT_PUBLIC_CONTACT_EMAIL must be a plain email address.');
  return value;
}

export type DeploymentEnvironment = 'local' | 'staging' | 'production';

const EMULATOR_HOSTS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_FUNCTIONS_EMULATOR_HOST',
] as const;

/**
 * The deployment tier. A missing or misspelled value fails closed, so a typo
 * can never silently relax the hosted checks below.
 */
export function deploymentEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentEnvironment {
  const value = env.PALDORA_ENV;
  if (value === 'local' || value === 'staging' || value === 'production')
    return value;
  throw new Error('PALDORA_ENV must be local, staging, or production.');
}

/**
 * Staging and production must be a real HTTPS project: no emulators, no demo
 * project, no development credentials. Local is checked by the session module.
 */
export function assertHostedEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (deploymentEnvironment(env) === 'local') return;
  if (EMULATOR_HOSTS.some((name) => env[name]))
    throw new Error(
      'Firebase emulators must not be configured for hosted web.',
    );
  const webUrl = env.NEXT_PUBLIC_WEB_URL;
  if (!webUrl || new URL(webUrl).protocol !== 'https:')
    throw new Error('Hosted web requires an HTTPS NEXT_PUBLIC_WEB_URL.');
  const projectId = env.FIREBASE_PROJECT_ID ?? '';
  if (!projectId || projectId.startsWith('demo-'))
    throw new Error('Hosted web requires a real FIREBASE_PROJECT_ID.');
  const apiKey = env.FIREBASE_WEB_API_KEY ?? '';
  if (!apiKey || /demo|dev_only/i.test(apiKey))
    throw new Error('Hosted web rejects development Firebase credentials.');
  if (contactEmail(env) === undefined)
    throw new Error('Hosted web requires NEXT_PUBLIC_CONTACT_EMAIL.');
}
