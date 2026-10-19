import { uuidSchema } from '@paldora/validation';
import { ZodPipe } from './zod.pipe.js';

/**
 * Path parameters as lowercase UUIDs. PostgreSQL treats `ABC…` and `abc…` as
 * the same UUID but JavaScript compares them differently, which would break
 * pair ordering, so every ID is normalized at the boundary.
 */
export const uuidParam = new ZodPipe(
  uuidSchema.transform((value) => value.toLowerCase()),
);
