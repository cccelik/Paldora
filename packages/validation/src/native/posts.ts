import { z } from 'zod';
import {
  nativeIdempotencyKeySchema,
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/** `listBoxPosts`, `listBoxComments` and `listModerationReports` share it. */
export const nativeUuidCursorSchema = z.string().regex(/^[a-f0-9-]{36}$/);

/**
 * `text` may be empty only when `mediaAssetIds` is non-empty. Each asset must
 * be a `ready` `post_image` the caller reserved for this Box and has not
 * attached yet (single use); the trusted service enforces it.
 */
export const createBoxPostInputSchema = z
  .object({
    boxId: nativeIdSchema,
    text: z.string().max(5_000),
    mediaAssetIds: z.array(nativeString(64)).max(4).optional(),
    /** A retry with the same key returns the original `postId`. */
    idempotencyKey: nativeIdempotencyKeySchema.optional(),
  })
  .refine(
    ({ text, mediaAssetIds }) =>
      text.trim().length > 0 || (mediaAssetIds?.length ?? 0) > 0,
    { message: 'Write something or attach a photo.' },
  );
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
