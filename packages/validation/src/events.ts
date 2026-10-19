import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

/**
 * Realtime messages are invalidation hints: a type and IDs, never content.
 * Clients refetch through normal authorization, so a lost or spoofed message
 * can at worst cause a needless refetch.
 *
 * - `resync`: sent first on every connection. Anything may have changed.
 * - `post.created|updated|deleted`: in a Box the viewer belongs to.
 * - `memberships.changed`: the viewer joined, left, or was removed from a Box.
 * - `ping`: keeps the connection alive; ignore it.
 */
export const REALTIME_EVENT_TYPES = [
  'resync',
  'ping',
  'post.created',
  'post.updated',
  'post.deleted',
  'memberships.changed',
] as const;

export const realtimeEventSchema = z
  .object({
    type: z.enum(REALTIME_EVENT_TYPES),
    boxId: uuidSchema.optional(),
    postId: uuidSchema.optional(),
    at: isoTimestampSchema,
  })
  .meta({ id: 'RealtimeEvent' });

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
