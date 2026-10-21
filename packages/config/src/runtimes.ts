import { z } from 'zod';
import {
  baseEnvironmentShape,
  enforceDeployedRules,
  httpUrl,
  optional,
  parseEnvironment,
  protocolUrl,
  type EnvironmentInput,
} from './environment.js';

const databaseShape = {
  DATABASE_URL: protocolUrl(['postgresql:', 'postgres:']),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
};

const redisShape = {
  REDIS_URL: protocolUrl(['redis:', 'rediss:']),
  JOB_QUEUE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('paldora-jobs'),
};

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/** Private S3-compatible storage. Server-only: never exposed to clients. */
const storageShape = {
  S3_ENDPOINT: optional(httpUrl),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFlag,
};

const apiEnvironmentSchema = z
  .object({
    ...baseEnvironmentShape,
    ...databaseShape,
    ...redisShape,
    ...storageShape,
    ROOM_CUSTOM_CSS_ENABLED: booleanFlag,
    ROOM_CUSTOM_WIDGETS_ENABLED: booleanFlag,
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    WEB_ORIGIN: httpUrl,
    SUPABASE_URL: httpUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  })
  .superRefine((values, context) =>
    enforceDeployedRules(
      values,
      ['WEB_ORIGIN', 'SUPABASE_URL', 'S3_ENDPOINT'],
      ['DATABASE_URL', 'REDIS_URL', 'S3_SECRET_ACCESS_KEY'],
      context,
    ),
  );

const workerEnvironmentSchema = z
  .object({
    ...baseEnvironmentShape,
    ...databaseShape,
    ...redisShape,
    ...storageShape,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
    /** How often the outbox dispatcher polls for pending rows. */
    OUTBOX_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(1_000),
    SUPABASE_URL: httpUrl.optional(),
    SUPABASE_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(20).optional(),
    ),
    SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(20).optional(),
    ),
  })
  .superRefine((values, context) => {
    enforceDeployedRules(
      values,
      ['S3_ENDPOINT'],
      ['DATABASE_URL', 'REDIS_URL', 'S3_SECRET_ACCESS_KEY'],
      context,
    );
    if (
      values.PALDORA_ENV === 'production' &&
      (!values.SUPABASE_URL ||
        !(values.SUPABASE_SECRET_KEY ?? values.SUPABASE_SERVICE_ROLE_KEY))
    )
      context.addIssue({
        code: 'custom',
        message:
          'Worker account erasure requires SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
      });
  });

/**
 * The trusted administrative provisioning script. It alone holds the
 * Supabase service-role key; deployed services never receive it.
 */
const provisioningEnvironmentSchema = z
  .object({
    ...baseEnvironmentShape,
    ...databaseShape,
    SUPABASE_URL: httpUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  })
  .superRefine((values, context) =>
    enforceDeployedRules(values, ['SUPABASE_URL'], ['DATABASE_URL'], context),
  );

/**
 * Only values that are safe to ship to browsers. Server secrets must never be
 * added here: everything in this schema is inlined into client bundles.
 */
const webPublicEnvironmentSchema = z
  .object({
    PALDORA_ENV: baseEnvironmentShape.PALDORA_ENV,
    NEXT_PUBLIC_API_URL: httpUrl,
    NEXT_PUBLIC_WEB_URL: httpUrl,
    NEXT_PUBLIC_SUPABASE_URL: httpUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_MEDIA_ORIGIN: optional(httpUrl),
  })
  .superRefine((values, context) =>
    enforceDeployedRules(
      values,
      [
        'NEXT_PUBLIC_API_URL',
        'NEXT_PUBLIC_WEB_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_MEDIA_ORIGIN',
      ],
      [],
      context,
    ),
  );

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type ProvisioningEnvironment = z.infer<
  typeof provisioningEnvironmentSchema
>;
export type StorageEnvironment = Pick<
  ApiEnvironment,
  keyof typeof storageShape
>;
export type WebPublicEnvironment = z.infer<typeof webPublicEnvironmentSchema>;

export const webPublicEnvironmentKeys = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WEB_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_MEDIA_ORIGIN',
] as const satisfies readonly (keyof WebPublicEnvironment)[];

export const parseApiEnvironment = (input: EnvironmentInput) =>
  parseEnvironment(apiEnvironmentSchema, input);

export const parseWorkerEnvironment = (input: EnvironmentInput) =>
  parseEnvironment(workerEnvironmentSchema, input);

export const parseProvisioningEnvironment = (input: EnvironmentInput) =>
  parseEnvironment(provisioningEnvironmentSchema, input);

export const parseWebPublicEnvironment = (input: EnvironmentInput) =>
  parseEnvironment(webPublicEnvironmentSchema, input);
