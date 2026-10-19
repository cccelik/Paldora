import {
  COMMENT_CONTENT_MAX_LENGTH,
  COMMENT_REPLY_PREVIEW_COUNT,
} from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';
import { commentInteractionSummarySchema } from './reactions.js';

export const commentContentSchema = z
  .string()
  .trim()
  .min(1, 'Write something first.')
  .max(COMMENT_CONTENT_MAX_LENGTH, 'Comments can be up to 2,000 characters.');

/**
 * Replying to a reply is allowed: the server attaches it to the root's
 * thread (one reply level) and remembers whom it answers.
 */
export const createCommentSchema = z
  .object({
    content: commentContentSchema,
    parentCommentId: uuidSchema
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict()
  .meta({ id: 'CreateCommentRequest' });

export const updateCommentSchema = z
  .object({ content: commentContentSchema })
  .strict()
  .meta({ id: 'UpdateCommentRequest' });

export const commentSchema = z
  .object({
    id: uuidSchema,
    postId: uuidSchema,
    /** The root this reply belongs to; null for a root. */
    parentCommentId: uuidSchema.nullable(),
    author: userSummarySchema,
    content: z.string(),
    createdAt: isoTimestampSchema,
    editedAt: isoTimestampSchema.nullable(),
    /** Replies the viewer will see in this thread (0 for replies). */
    replyCount: z.number().int().nonnegative(),
    interactions: commentInteractionSummarySchema,
    /** The viewer wrote it and its Box is still open. */
    canEdit: z.boolean(),
  })
  .meta({ id: 'Comment' });

/**
 * A deleted root kept only because replies remain. It carries no author and
 * no text.
 */
export const deletedCommentSchema = z
  .object({
    id: uuidSchema,
    postId: uuidSchema,
    parentCommentId: uuidSchema.nullable(),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'DeletedComment' });

/**
 * A comment by someone in a block relationship with the viewer (ADR 013): an
 * ID and a time, and nothing that says who wrote it or who blocked whom.
 */
export const hiddenCommentSchema = z
  .object({ id: uuidSchema, createdAt: isoTimestampSchema })
  .meta({ id: 'HiddenComment' });

export const commentItemSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('comment'), comment: commentSchema }),
    z.object({ kind: z.literal('deleted'), deleted: deletedCommentSchema }),
    z.object({ kind: z.literal('hidden'), hidden: hiddenCommentSchema }),
  ])
  .meta({ id: 'CommentItem' });

/** A root and the oldest few of its replies. */
export const commentThreadSchema = z
  .object({
    root: commentItemSchema,
    replies: z.array(commentItemSchema).max(COMMENT_REPLY_PREVIEW_COUNT),
    /** Every reply `listReplies` returns for this root. */
    replyCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'CommentThread' });

export const commentThreadPageSchema = cursorPageSchema(
  commentThreadSchema,
).meta({ id: 'CommentThreadPage' });

export const commentPageSchema = cursorPageSchema(commentItemSchema).meta({
  id: 'CommentPage',
});

/** For deep links: the comment and the root whose thread holds it. */
export const commentDetailSchema = z
  .object({ comment: commentSchema, rootId: uuidSchema })
  .meta({ id: 'CommentDetail' });

export type CommentView = z.infer<typeof commentSchema>;
export type CommentItemView = z.infer<typeof commentItemSchema>;
export type CommentThreadView = z.infer<typeof commentThreadSchema>;
export type CommentDetail = z.infer<typeof commentDetailSchema>;
export type CreateCommentInput = z.input<typeof createCommentSchema>;
export type NewComment = z.output<typeof createCommentSchema>;
