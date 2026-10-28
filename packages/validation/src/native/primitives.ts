import { z } from 'zod';

/**
 * Wire primitives for the Firebase callable contract (`europe-west4`).
 * These mirror what `apps/firebase-functions` accepts and returns today;
 * they do not describe the retired REST API.
 */

/** Trusted services emit epoch milliseconds, never ISO strings. */
export const nativeTimestampSchema = z.number().int().nonnegative();

/**
 * Cursors are opaque to clients. Each list callable additionally pins the
 * exact shape it accepts (see the per-callable input schemas).
 */
export const NATIVE_CURSOR_MAX_LENGTH = 128;
export const nativeCursorSchema = z
  .string()
  .min(1)
  .max(NATIVE_CURSOR_MAX_LENGTH);

/** Mirrors the server's `field()` helper: a non-empty string up to `max`. */
export const nativeString = (max = 128) => z.string().min(1).max(max);

/** Documents and hints use plain Firestore IDs, so the length is the contract. */
export const nativeIdSchema = nativeString(128);

export const nativePageSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const nativeOkSchema = z.object({ ok: z.literal(true) });

/** Callables accept any object and ignore unknown keys. */
export const nativeEmptyInputSchema = z.object({});

export type NativePage<Item> = { items: Item[]; nextCursor: string | null };

/**
 * Optional client-generated UUID that makes a create safe to retry: the same
 * (caller, key) within 24 hours returns the original result and creates
 * nothing new. Scoped by the authenticated uid; the payload is not compared.
 */
export const nativeIdempotencyKeySchema = z.uuid();
