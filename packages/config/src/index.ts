import { z } from 'zod';

const nodeEnvironment = z.enum(['development', 'test', 'production']);
const optionalEnvironmentValue = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
const booleanEnvironmentValue = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

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
  MEDIA_JOB_QUEUE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('paldora-jobs'),
});

const objectStorageEnvironmentShape = {
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanEnvironmentValue.default(false),
};

const apiEnvironmentSchema = serviceEnvironmentSchema.extend({
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  WEB_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  ...objectStorageEnvironmentShape,
});

const workerEnvironmentSchema = serviceEnvironmentSchema.extend({
  ...objectStorageEnvironmentShape,
});

const demoSeedEnvironmentSchema = serviceEnvironmentSchema
  .extend({
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    DEMO_USER_EMAIL: z.email(),
    DEMO_USER_PASSWORD: z.string().min(8),
    DEMO_USERNAME: z.string().min(3).max(30),
    DEMO_DISPLAY_NAME: z.string().min(1).max(80),
    DEMO_FRIEND_EMAIL: optionalEnvironmentValue(z.email()),
    DEMO_FRIEND_PASSWORD: optionalEnvironmentValue(z.string().min(8)),
    DEMO_FRIEND_USERNAME: optionalEnvironmentValue(z.string().min(3).max(30)),
    DEMO_FRIEND_DISPLAY_NAME: optionalEnvironmentValue(
      z.string().min(1).max(80),
    ),
  })
  .superRefine((value, context) => {
    const friendValues = [
      value.DEMO_FRIEND_EMAIL,
      value.DEMO_FRIEND_PASSWORD,
      value.DEMO_FRIEND_USERNAME,
      value.DEMO_FRIEND_DISPLAY_NAME,
    ];
    if (friendValues.some(Boolean) && !friendValues.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['DEMO_FRIEND_EMAIL'],
        message:
          'All DEMO_FRIEND_* values are required when provisioning a second demo account',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type ServiceEnvironment = z.infer<typeof serviceEnvironmentSchema>;
export type DemoSeedEnvironment = z.infer<typeof demoSeedEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
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

export function parseDemoSeedEnvironment(
  input: EnvironmentInput,
): DemoSeedEnvironment {
  const result = demoSeedEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError(result.error);
  return result.data;
}

export function parseWorkerEnvironment(
  input: EnvironmentInput,
): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError(result.error);
  return result.data;
}
