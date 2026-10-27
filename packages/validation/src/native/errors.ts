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
 * Stable reasons on `HttpsError.details.reason` (ADR 021 decision 7). Each
 * reason is derivable from the error code and the caller's own request, so it
 * never separates "does not exist" from "not allowed": no reason names a
 * resource, a membership, a block or a moderation state. Clients must tolerate
 * unknown reasons and must not require one.
 */
export const NATIVE_ERROR_REASONS = [
  'SIGN_IN_REQUIRED',
  'SESSION_ENDED',
  'INVALID_INPUT',
  'RATE_LIMITED',
] as const;

export type NativeErrorReason = (typeof NATIVE_ERROR_REASONS)[number];

export const nativeErrorReasonSchema = z.enum(NATIVE_ERROR_REASONS);

/** What a callable failure looks like to a client. */
export const nativeErrorSchema = z.object({
  code: functionsErrorCodeSchema,
  message: z.string(),
  details: z.object({ reason: z.string().optional() }).optional(),
});

export type NativeError = z.infer<typeof nativeErrorSchema>;
