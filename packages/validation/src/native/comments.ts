import { z } from 'zod';
import {
  nativeIdempotencyKeySchema,
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';
import { nativeUuidCursorSchema } from './posts.js';

export const createBoxCommentInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  text: nativeString(2_000),
  /** Absent or null for a top-level comment. */
  parentId: nativeUuidCursorSchema.nullable().optional(),
  /** A retry with the same key returns the original `commentId`. */
  idempotencyKey: nativeIdempotencyKeySchema.optional(),
});
export const createBoxCommentOutputSchema = z.object({ commentId: z.string() });

export const listBoxCommentsInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  cursor: nativeUuidCursorSchema.optional(),
});
export const nativeCommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  authorUid: z.string(),
  parentId: z.string().nullable(),
  text: z.string(),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
});
export const listBoxCommentsOutputSchema =
  nativePageSchema(nativeCommentSchema);

export const editBoxCommentInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  commentId: nativeString(64),
  text: nativeString(2_000),
});
export const editBoxCommentOutputSchema = nativeOkSchema;

export const deleteBoxCommentInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  commentId: nativeString(64),
});
export const deleteBoxCommentOutputSchema = nativeOkSchema;

/**
 * One entry of a thread. `deleted` and `hidden` are placeholders: a deleted
 * comment that still has replies, and one the viewer may not see (blocked or
 * unavailable author). Neither carries text or an author.
 */
export const nativeCommentItemSchema = z.union([
  z.object({ kind: z.literal('comment'), comment: nativeCommentSchema }),
  z.object({
    kind: z.enum(['deleted', 'hidden']),
    id: z.string(),
    createdAt: nativeTimestampSchema,
  }),
]);
export const nativeCommentThreadSchema = z.object({
  root: nativeCommentItemSchema,
  rootId: z.string(),
  /** At most the first three replies, oldest first. */
  replies: z.array(nativeCommentItemSchema),
  replyCount: z.number().int().nonnegative(),
});

/** Roots newest first, 20 a page, each with a reply preview and count. */
export const listBoxCommentThreadsInputSchema = listBoxCommentsInputSchema;
export const listBoxCommentThreadsOutputSchema = nativePageSchema(
  nativeCommentThreadSchema,
);

/** More replies of one root, oldest first, 20 a page. */
export const listBoxCommentRepliesInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  rootId: nativeString(64),
  cursor: nativeUuidCursorSchema.optional(),
});
export const listBoxCommentRepliesOutputSchema = nativePageSchema(
  nativeCommentItemSchema,
);

/** The thread containing a linked comment (a notification deep link). */
export const getBoxCommentThreadInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  commentId: nativeString(64),
});
export const getBoxCommentThreadOutputSchema = nativeCommentThreadSchema;

export type NativeComment = z.infer<typeof nativeCommentSchema>;
export type NativeCommentItem = z.infer<typeof nativeCommentItemSchema>;
export type NativeCommentThread = z.infer<typeof nativeCommentThreadSchema>;
