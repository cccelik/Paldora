import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

/**
 * Realtime messages are invalidation hints: a type and IDs, never content.
 * Clients refetch through normal authorization, so a lost or spoofed message
 * can at worst cause a needless refetch.
 *
 * - `resync`: sent first on every connection. Anything may have changed.
 * - `post.created|updated|deleted`: in a Box the viewer belongs to.
 * - `comment.created|updated|deleted`, `reaction.changed`: on a post in a Box
 *   the viewer belongs to (Box channel; `commentId` when a comment is meant).
 * - `memberships.changed`: the viewer joined, left, or was removed from a Box.
 * - `notification.created`: the viewer has a new notification (user channel).
 * - `notifications.changed`: the viewer read notifications in another tab.
 * - `ping`: keeps the connection alive; ignore it.
 */
export const REALTIME_EVENT_TYPES = [
  'resync',
  'ping',
  'post.created',
  'post.updated',
  'post.deleted',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'reaction.changed',
  'memberships.changed',
  'notification.created',
  'notifications.changed',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

/**
 * Every optional ID must be declared here: the bus parses each message with
 * this schema, and unknown keys are stripped in transit.
 */
export const realtimeEventSchema = z
  .object({
    type: z.enum(REALTIME_EVENT_TYPES),
    boxId: uuidSchema.optional(),
    postId: uuidSchema.optional(),
    commentId: uuidSchema.optional(),
    notificationId: uuidSchema.optional(),
    at: isoTimestampSchema,
  })
  .meta({ id: 'RealtimeEvent' });

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

/**
 * Redis channel names, shared by the API and the worker so both publish to
 * the same place. Box hints reach current members; user hints one person.
 */
export const boxChannel = (boxId: string) => `paldora:box:${boxId}`;
export const userChannel = (userId: string) => `paldora:user:${userId}`;
