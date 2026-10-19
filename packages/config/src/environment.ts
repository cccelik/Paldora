import { z } from 'zod';

/**
 * Deployment environment, independent of NODE_ENV. A local production build
 * (`NODE_ENV=production`) is still `local`; only `staging` and `production`
 * enforce deployed-environment rules such as HTTPS origins.
 */
export const paldoraEnvironments = [
  'local',
  'test',
  'staging',
  'production',
] as const;
export type PaldoraEnvironment = (typeof paldoraEnvironments)[number];

export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export const isDeployedEnvironment = (environment: PaldoraEnvironment) =>
  environment === 'staging' || environment === 'production';

export const baseEnvironmentShape = {
  PALDORA_ENV: z.enum(paldoraEnvironments).default('local'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
};

/** Treats empty strings as absent so `.env` placeholders behave as unset. */
export const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

export const httpUrl = z
  .url({ protocol: /^https?$/ })
  .transform((value) => value.replace(/\/$/, ''));

export const protocolUrl = (protocols: readonly string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), {
    message: `must use ${protocols.join(' or ')}`,
  });

const developmentCredentialMarker = 'dev_only';

/**
 * Rules that apply only to deployed environments: HTTPS for every listed URL
 * and no local-development credentials.
 */
export function enforceDeployedRules(
  values: Record<string, unknown> & { PALDORA_ENV: PaldoraEnvironment },
  httpsKeys: readonly string[],
  secretKeys: readonly string[],
  context: z.RefinementCtx,
): void {
  if (!isDeployedEnvironment(values.PALDORA_ENV)) return;
  for (const key of httpsKeys) {
    const value = values[key];
    if (typeof value === 'string' && !value.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: 'must use https in deployed environments',
      });
    }
  }
  for (const key of secretKeys) {
    const value = values[key];
    if (
      typeof value === 'string' &&
      value.includes(developmentCredentialMarker)
    ) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: 'must not use local development credentials',
      });
    }
  }
}

/**
 * Parses an environment and throws one error naming every invalid key. Values
 * are never included in the message, so secrets cannot leak into logs.
 */
export function parseEnvironment<Schema extends z.ZodType>(
  schema: Schema,
  input: EnvironmentInput,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

/**
 * Integration suites call this before connecting. Missing infrastructure is a
 * failure, never a silent skip: a skipped authorization suite reads as green.
 */
export function requireEnvironmentVariables(
  names: readonly string[],
  input: EnvironmentInput,
): Record<string, string> {
  const missing = names.filter((name) => !input[name]);
  if (missing.length > 0) {
    throw new Error(
      `Integration tests require ${missing.join(', ')}. Start local infrastructure (see docs/development.md) or run unit tests with \`pnpm test\`.`,
    );
  }
  return Object.fromEntries(names.map((name) => [name, input[name] ?? '']));
}
