import { POST_CONTENT_MAX_LENGTH, POST_MEDIA_MAX_ITEMS } from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/** Text may be empty when photos carry the post; the service enforces that. */
export const postContentSchema = z
  .string()
  .trim()
  .max(POST_CONTENT_MAX_LENGTH, 'Posts can be up to 5,000 characters.');

export const createPostSchema = z
  .object({
    content: postContentSchema.default(''),
    /** Ready `post_image` uploads, in display order. */
    mediaAssetIds: z
      .array(uuidSchema)
      .max(POST_MEDIA_MAX_ITEMS, 'A post can have up to 4 photos.')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Each photo can be attached once.',
      })
      .default([]),
  })
  .strict()
  .refine(
    ({ content, mediaAssetIds }) =>
      content.length > 0 || mediaAssetIds.length > 0,
    { path: ['content'], message: 'Write something or add a photo first.' },
  )
  .meta({ id: 'CreatePostRequest' });

/** Photos cannot change after posting; only the text can. */
export const updatePostSchema = z
  .object({ content: postContentSchema })
  .strict()
  .meta({ id: 'UpdatePostRequest' });

/** One photo as the viewer may see it: short-lived signed URLs, no keys. */
export const postMediaSchema = z
  .object({
    id: uuidSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    url: z.url(),
    thumbnailUrl: z.url(),
  })
  .meta({ id: 'PostMedia' });

export const postSchema = z
  .object({
    id: uuidSchema,
    box: z.object({ id: uuidSchema, name: z.string() }),
    author: userSummarySchema,
    content: z.string(),
    media: z.array(postMediaSchema).max(POST_MEDIA_MAX_ITEMS),
    createdAt: isoTimestampSchema,
    editedAt: isoTimestampSchema.nullable(),
    /** The viewer wrote it and its Box is still open for edits. */
    canEdit: z.boolean(),
  })
  .meta({ id: 'Post' });

/**
 * A post from someone in a block relationship with the viewer (ADR 013). It
 * carries no author and no text, and nothing says who blocked whom.
 */
export const hiddenPostSchema = z
  .object({ id: uuidSchema, boxId: uuidSchema, createdAt: isoTimestampSchema })
  .meta({ id: 'HiddenPost' });

export const feedItemSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('post'), post: postSchema }),
    z.object({ kind: z.literal('hidden'), hidden: hiddenPostSchema }),
  ])
  .meta({ id: 'FeedItem' });

export const feedPageSchema = cursorPageSchema(feedItemSchema).meta({
  id: 'FeedPage',
});

export type PostView = z.infer<typeof postSchema>;
export type FeedItemView = z.infer<typeof feedItemSchema>;
export type CreatePostInput = z.input<typeof createPostSchema>;
/** After defaults are applied: what the service receives. */
export type NewPost = z.output<typeof createPostSchema>;
export type PostMediaView = z.infer<typeof postMediaSchema>;
