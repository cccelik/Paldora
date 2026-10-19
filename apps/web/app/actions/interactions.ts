'use server';

import {
  commentContentSchema,
  emojiSchema,
  uuidSchema,
  type CommentInteractionSummary,
  type CommentItemView,
  type CommentView,
  type PostInteractionSummary,
} from '@paldora/validation';
import { z } from 'zod';
import {
  actionError,
  type ActionOutcome,
  type ActionResult,
} from '../lib/action-result';
import { runForm, runFormWithData } from '../lib/action-runner';
import { apiClient } from '../lib/session';

/** Comments change the permalink page only; feeds learn from realtime hints. */
const threadPaths = ['/posts/[postId]'];

const copy = {
  BOX_ARCHIVED: 'This Box is archived, so it’s read-only now.',
  COMMENT_NOT_FOUND: 'That comment is no longer here.',
  POST_NOT_FOUND: 'This post is no longer here.',
  COMMENT_ACCESS_DENIED: 'Only the person who wrote it can change it.',
  RATE_LIMITED: 'That’s a lot at once. Try again in a little while.',
};

const invalid = (message: string): ActionOutcome<never> => ({
  status: 'error',
  code: 'VALIDATION_FAILED',
  message,
  tone: 'attention',
});

/** Validates `unknown` input, then runs one API call for a button. */
async function call<Schema extends z.ZodType, Output>(
  schema: Schema,
  input: unknown,
  work: (input: z.output<Schema>) => Promise<Output>,
): Promise<ActionOutcome<Output>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid('Choose a single emoji.');
  try {
    return {
      status: 'success',
      message: 'Done.',
      data: await work(parsed.data),
    };
  } catch (error) {
    return actionError(error, copy);
  }
}

const postReaction = z.object({
  postId: uuidSchema,
  kind: emojiSchema.nullable(),
});

/**
 * Set-state, so a retry is harmless. Revalidates nothing: the card shows the
 * returned summary, and other viewers hear about it through a hint.
 */
export async function setPostReactionAction(
  input: unknown,
): Promise<ActionOutcome<PostInteractionSummary>> {
  const api = await apiClient();
  return call(postReaction, input, ({ postId, kind }) =>
    api.setPostReaction(postId, { kind }),
  );
}

const commentReaction = z.object({
  commentId: uuidSchema,
  kind: emojiSchema.nullable(),
});

export async function setCommentReactionAction(
  input: unknown,
): Promise<ActionOutcome<CommentInteractionSummary>> {
  const api = await apiClient();
  return call(commentReaction, input, ({ commentId, kind }) =>
    api.setCommentReaction(commentId, kind),
  );
}

/** One card's fresh summary, after a hint said it changed. */
export async function postSummaryAction(
  postId: unknown,
): Promise<ActionOutcome<PostInteractionSummary>> {
  const api = await apiClient();
  return call(
    uuidSchema,
    postId,
    async (id) => (await api.post(id)).interactions,
  );
}

const repliesInput = z.object({
  commentId: uuidSchema,
  cursor: z.string().min(1).max(512).optional(),
});

export async function moreRepliesAction(
  input: unknown,
): Promise<
  ActionOutcome<{ items: CommentItemView[]; nextCursor: string | null }>
> {
  const api = await apiClient();
  return call(repliesInput, input, ({ commentId, cursor }) =>
    api.commentReplies(commentId, { limit: 20, cursor }),
  );
}

const createForm = z.object({
  postId: uuidSchema,
  content: commentContentSchema,
  parentCommentId: z.union([uuidSchema, z.literal('')]),
});

export async function createCommentAction(
  _previous: ActionResult<CommentView | undefined>,
  formData: FormData,
): Promise<ActionResult<CommentView | undefined>> {
  return runFormWithData(
    formData,
    createForm,
    (api, { postId, content, parentCommentId }) =>
      api.createComment(postId, {
        content,
        ...(parentCommentId ? { parentCommentId } : {}),
      }),
    { success: 'Comment posted.', paths: threadPaths, copy },
  );
}

export async function updateCommentAction(
  _previous: ActionResult<CommentView | undefined>,
  formData: FormData,
): Promise<ActionResult<CommentView | undefined>> {
  return runFormWithData(
    formData,
    z.object({ commentId: uuidSchema, content: commentContentSchema }),
    (api, { commentId, content }) => api.updateComment(commentId, content),
    { success: 'Saved.', paths: threadPaths, copy },
  );
}

export async function deleteCommentAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ commentId: uuidSchema }),
    (api, { commentId }) => api.deleteComment(commentId),
    { success: 'Comment deleted.', paths: threadPaths, copy },
  );
}
