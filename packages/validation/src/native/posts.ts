import { z } from 'zod';
import {
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/** `listBoxPosts`, `listBoxComments` and `listModerationReports` share it. */
export const nativeUuidCursorSchema = z.string().regex(/^[a-f0-9-]{36}$/);

export const createBoxPostInputSchema = z.object({
  boxId: nativeIdSchema,
  text: nativeString(5_000),
});
export const createBoxPostOutputSchema = z.object({ postId: z.string() });

export const getBoxPostInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
});
export const nativePostSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  authorUid: z.string(),
  text: z.string(),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
  kind: z.enum(['post', 'life_update']),
  lifeUpdateId: z.string().nullable(),
  mediaAssetIds: z.array(z.string()),
});
export const getBoxPostOutputSchema = nativePostSchema;

export const listBoxPostsInputSchema = z.object({
  boxId: nativeIdSchema,
  cursor: nativeUuidCursorSchema.optional(),
});
export const listBoxPostsOutputSchema = nativePageSchema(nativePostSchema);

export const editBoxPostInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  text: nativeString(5_000),
});
export const editBoxPostOutputSchema = nativeOkSchema;

export const deleteBoxPostInputSchema = getBoxPostInputSchema;
export const deleteBoxPostOutputSchema = nativeOkSchema;
