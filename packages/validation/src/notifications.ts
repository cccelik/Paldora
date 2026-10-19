import { NOTIFICATION_TYPES } from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/** Unread counts stop at this number; the UI shows "99+" past 99. */
export const UNREAD_COUNT_CAP = 100;

/**
 * A notification as its recipient may see it now. Everything here is joined
 * from live rows at read time, and the row disappears once its target is
 * deleted, un-reacted, blocked, or outside the recipient's Boxes.
 */
export const notificationSchema = z
  .object({
    id: uuidSchema,
    type: z.enum(NOTIFICATION_TYPES),
    actor: userSummarySchema,
    postId: uuidSchema,
    commentId: uuidSchema.nullable(),
    box: z.object({ id: uuidSchema, name: z.string() }),
    reaction: z
      .object({ kind: z.string(), thumbnailUrl: z.url().optional() })
      .nullable(),
    read: z.boolean(),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'Notification' });

export const unreadCountSchema = z
  .object({
    count: z.number().int().min(0).max(UNREAD_COUNT_CAP),
    /** True when there may be more than `count`. */
    capped: z.boolean(),
  })
  .meta({ id: 'UnreadCount' });

export const notificationPageSchema = cursorPageSchema(notificationSchema)
  .extend({ unreadCount: unreadCountSchema })
  .meta({ id: 'NotificationPage' });

export const notificationParamsSchema = z.object({
  notificationId: uuidSchema,
});

export type NotificationView = z.infer<typeof notificationSchema>;
export type UnreadCount = z.infer<typeof unreadCountSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
