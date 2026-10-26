import { z } from 'zod';
import { nativeIdSchema } from './primitives.js';

/**
 * The three Firestore paths a signed-in native client may touch directly
 * (see `firebase/firestore.native.rules`). Everything else is closed and is
 * reached through callables.
 */
export const nativeBoxRefDocSchema = z.object({ boxId: nativeIdSchema });

export const nativeBoxDocSchema = z.object({
  id: nativeIdSchema,
  name: z.string().min(1).max(80),
  ownerUid: nativeIdSchema,
  status: z.enum(['active', 'archived']),
  version: z.number().int().positive(),
});

/** Trusted code also stores `joinedAt`; direct client writes omit it. */
export const nativeMemberDocSchema = z.object({
  uid: nativeIdSchema,
  role: z.enum(['owner', 'admin', 'member']),
  status: z.enum(['active', 'left', 'removed']),
  joinedAt: z.number().int().nonnegative().optional(),
});
