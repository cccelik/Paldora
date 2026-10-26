import { z } from 'zod';
import {
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
