import { z } from 'zod';

/** Every `FunctionsErrorCode` Firebase Functions can emit. */
export const FUNCTIONS_ERROR_CODES = [
  'ok',
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'unauthenticated',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
] as const;

export type FunctionsErrorCode = (typeof FUNCTIONS_ERROR_CODES)[number];

export const functionsErrorCodeSchema = z.enum(FUNCTIONS_ERROR_CODES);

/**
 * What a callable failure looks like to a client. `details.reason` is NOT
 * emitted today; it is a documented future field and must stay optional.
 */
export const nativeErrorSchema = z.object({
  code: functionsErrorCodeSchema,
  message: z.string(),
  details: z.object({ reason: z.string().optional() }).optional(),
});

export type NativeError = z.infer<typeof nativeErrorSchema>;
