import { z } from 'zod';
import { lifeUpdateSchema } from './life-updates.js';
import { hiddenPostSchema, postSchema } from './posts.js';
import { cursorPageSchema } from './primitives.js';

/**
 * One item of a Box feed or the Home feed, newest first.
 *
 * - `post`: an ordinary post.
 * - `life_update`: a Life Update. On Home it appears once, however many of
 *   the viewer's Boxes it was delivered to, with one context (tab) per such
 *   Box; in a Box feed it carries only that Box's context.
 * - `hidden`: a post or Life Update by someone in a block relationship with
 *   the viewer (ADR 013). For a Life Update the ID is one backing post's, so
 *   nothing reveals the author, the content, or the other Boxes.
 */
export const feedItemSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('post'), post: postSchema }),
    z.object({
      kind: z.literal('life_update'),
      lifeUpdate: lifeUpdateSchema,
    }),
    z.object({ kind: z.literal('hidden'), hidden: hiddenPostSchema }),
  ])
  .meta({ id: 'FeedItem' });

export const feedPageSchema = cursorPageSchema(feedItemSchema).meta({
  id: 'FeedPage',
});

export type FeedItemView = z.infer<typeof feedItemSchema>;
