import { z } from 'zod';

const nodeEnvironment = z.enum(['development', 'test', 'production']);

const baseEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironment.default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

const serviceEnvironmentSchema = baseEnvironmentSchema.extend({
  DATABASE_URL: z.url().refine((url) => url.startsWith('postgresql://'), {
    message: 'DATABASE_URL must use the postgresql protocol',
  }),
  REDIS_URL: z
    .url()
    .refine(
      (url) => url.startsWith('redis://') || url.startsWith('rediss://'),
      {
        message: 'REDIS_URL must use the redis or rediss protocol',
      },
    ),
});

const apiEnvironmentSchema = serviceEnvironmentSchema.extend({
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  WEB_ORIGIN: z.url(),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type ServiceEnvironment = z.infer<typeof serviceEnvironmentSchema>;
export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

function formatEnvironmentError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid environment configuration: ${details}`);
}

export function parseApiEnvironment(input: EnvironmentInput): ApiEnvironment {
  const result = apiEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError(result.error);
  return result.data;
}

export function parseServiceEnvironment(
  input: EnvironmentInput,
): ServiceEnvironment {
  const result = serviceEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError(result.error);
  return result.data;
}
