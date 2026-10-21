import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

export const accountDeletionPasswordSchema = z
  .object({
    password: z.string().min(1).max(256),
  })
  .strict()
  .meta({ id: 'AccountDeletionPassword' });

export const accountDeletionSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(['pending', 'blocked', 'cancelled']),
    requestedAt: isoTimestampSchema,
    dueAt: isoTimestampSchema,
    cancelledAt: isoTimestampSchema.nullable(),
  })
  .meta({ id: 'AccountDeletion' });

export const accountDeletionLatestSchema = z
  .object({
    deletion: accountDeletionSchema.nullable(),
  })
  .meta({ id: 'AccountDeletionLatest' });

export type AccountDeletionPassword = z.infer<
  typeof accountDeletionPasswordSchema
>;
