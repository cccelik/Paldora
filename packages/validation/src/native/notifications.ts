import { z } from 'zod';
import {
  nativeCursorSchema,
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeTimestampSchema,
} from './primitives.js';

export const NATIVE_NOTIFICATION_TYPES = [
  'post.comment',
  'comment.reply',
  'post.reaction',
  'comment.reaction',
] as const;

export const nativePersonSchema = z.object({
  uid: z.string(),
  username: z.string(),
  displayName: z.string(),
  /** Opaque media id for `mediaRead` thumbnail. Absent when not provided. */
  avatarMediaId: z.string().nullable().optional(),
});

/** Visibility is rechecked live on every read; hidden rows are never returned. */
export const nativeNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(NATIVE_NOTIFICATION_TYPES),
  actor: nativePersonSchema,
  boxId: z.string(),
  boxName: z.string(),
  postId: z.string(),
  lifeUpdateId: z.string().nullable(),
  commentId: z.string().nullable(),
  reaction: z.object({ kind: z.string() }).nullable(),
  read: z.boolean(),
  createdAt: nativeTimestampSchema,
});

export const nativeUnreadCountSchema = z.object({
  count: z.number().int().min(0).max(100),
  capped: z.boolean(),
});

export const listMyNotificationsInputSchema = z.object({
  cursor: nativeCursorSchema.optional(),
});
export const listMyNotificationsOutputSchema = nativePageSchema(
  nativeNotificationSchema,
).extend({ unreadCount: nativeUnreadCountSchema });

export const countMyUnreadNotificationsInputSchema = z.object({});
export const countMyUnreadNotificationsOutputSchema = nativeUnreadCountSchema;

export const markNotificationReadInputSchema = z.object({
  id: nativeIdSchema,
});
export const markNotificationReadOutputSchema = nativeNotificationSchema;

export const markAllNotificationsReadInputSchema = z.object({});
export const markAllNotificationsReadOutputSchema = nativeOkSchema;

export type NativeNotification = z.infer<typeof nativeNotificationSchema>;
