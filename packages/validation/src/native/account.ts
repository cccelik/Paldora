import { z } from 'zod';
import { nativeOkSchema, nativeString } from './primitives.js';

/** The caller's UID comes from the auth token; there is no input. */
export const provisionMyAccountInputSchema = z.object({});
export const provisionMyAccountOutputSchema = nativeOkSchema;

/** Length is checked here; characters and reserved names by the service. */
export const reserveUsernameInputSchema = z.object({
  username: nativeString(30),
});
export const reserveUsernameOutputSchema = z.object({ normalized: z.string() });
