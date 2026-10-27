import { z } from 'zod';
import {
  nativeOkSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/** The caller's UID comes from the auth token; there is no input. */
export const provisionMyAccountInputSchema = z.object({});
export const provisionMyAccountOutputSchema = nativeOkSchema;

/** Length is checked here; characters and reserved names by the service. */
export const reserveUsernameInputSchema = z.object({
  username: nativeString(30),
});
export const reserveUsernameOutputSchema = z.object({ normalized: z.string() });

/**
 * Password and session control (ADR 021 slice: account safety). Passwords are
 * request-only secrets: never echoed, logged or stored by the callables.
 * `newPassword` follows the web rule (10 to 1024 characters); the current
 * password only needs to be non-empty because the server decides.
 */
export const changeMyPasswordInputSchema = z.object({
  currentPassword: nativeString(1_024),
  newPassword: z.string().min(10).max(1_024),
});
/** Every earlier ID token and refresh token is refused; sign in again. */
export const sessionEndedOutputSchema = z.object({
  ok: z.literal(true),
  signInRequired: z.literal(true),
});
export const changeMyPasswordOutputSchema = sessionEndedOutputSchema;
export const signOutEverywhereInputSchema = z.object({});
export const signOutEverywhereOutputSchema = sessionEndedOutputSchema;

/** Account export (`paldora-json-v1`); the bytes come from `accountExportDownload`. */
export const nativeAccountExportSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'ready', 'expired']),
  createdAt: nativeTimestampSchema,
  readyAt: nativeTimestampSchema.nullable(),
  expiresAt: nativeTimestampSchema.nullable(),
});
export const requestAccountExportInputSchema = z.object({});
export const requestAccountExportOutputSchema = z.object({
  export: nativeAccountExportSchema,
});
export const getAccountExportInputSchema = z.object({});
export const getAccountExportOutputSchema = z.object({
  export: nativeAccountExportSchema.nullable(),
});

/** `id` is the deletion generation; `blocked` waits on an operator. */
export const nativeAccountDeletionSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'blocked', 'cancelled']),
  requestedAt: nativeTimestampSchema,
  dueAt: nativeTimestampSchema,
  cancelledAt: nativeTimestampSchema.nullable(),
});
export const getAccountDeletionInputSchema = z.object({});
export const getAccountDeletionOutputSchema = z.object({
  deletion: nativeAccountDeletionSchema.nullable(),
});
export const requestAccountDeletionInputSchema = z.object({
  password: nativeString(256),
});
export const requestAccountDeletionOutputSchema = z.object({
  deletion: nativeAccountDeletionSchema,
});
export const cancelAccountDeletionInputSchema = z.object({
  password: nativeString(256),
});
export const cancelAccountDeletionOutputSchema = z.object({
  deletion: nativeAccountDeletionSchema,
});
