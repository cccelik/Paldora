import { POST_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

export const postContentSchema = z
  .string()
  .trim()
  .min(1, 'Write something first.')
  .max(POST_CONTENT_MAX_LENGTH, 'Posts can be up to 5,000 characters.');

export const createPostSchema = z
  .object({ content: postContentSchema })
  .strict()
  .meta({ id: 'CreatePostRequest' });

export const updatePostSchema = createPostSchema.meta({
  id: 'UpdatePostRequest',
});

export const postSchema = z
  .object({
    id: uuidSchema,
    box: z.object({ id: uuidSchema, name: z.string() }),
    author: userSummarySchema,
    content: z.string(),
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
export type CreatePostInput = z.output<typeof createPostSchema>;
