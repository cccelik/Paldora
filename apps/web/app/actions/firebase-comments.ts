'use server';

import {
  actionError,
  invalidOutcome,
  type ActionOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { runForm } from '@/lib/actions/action-runner';
import {
  firebaseWebData,
  type FirebaseThreadItem,
} from '@/lib/server/firebase/data';

import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import { commentContentSchema, uuidSchema } from '@paldora/validation';
import { z } from 'zod';

const commentForm = z.object({
  boxId: uuidSchema,
  postId: uuidSchema,
  content: commentContentSchema,
  parentId: z.union([uuidSchema, z.literal('')]),
});

export async function createFirebaseCommentAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    commentForm,
    (data, { boxId, postId, content, parentId }) =>
      data.createComment(boxId, postId, content, parentId || null),
    {
      success: 'Comment posted.',
      paths: ['/posts/[postId]'],
    },
  );
}

export async function deleteFirebaseCommentAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, postId: uuidSchema, commentId: uuidSchema }),
    (data, { boxId, postId, commentId }) =>
      data.deleteComment(boxId, postId, commentId),
    {
      success: 'Comment deleted.',
      paths: ['/posts/[postId]'],
    },
  );
}

export async function editFirebaseCommentAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({
      boxId: uuidSchema,
      postId: uuidSchema,
      commentId: uuidSchema,
      content: commentContentSchema,
    }),
    (data, { boxId, postId, commentId, content }) =>
      data.editComment(boxId, postId, commentId, content),
    {
      success: 'Comment saved.',
      paths: ['/posts/[postId]'],
    },
  );
}

const repliesInput = z.object({
  boxId: uuidSchema,
  postId: uuidSchema,
  rootId: uuidSchema,
  cursor: uuidSchema.optional(),
});

export async function moreFirebaseRepliesAction(
  input: unknown,
): Promise<
  ActionOutcome<{ items: FirebaseThreadItem[]; nextCursor: string | null }>
> {
  const parsed = repliesInput.safeParse(input);
  if (!parsed.success) return invalidOutcome('Reload this conversation.');
  try {
    await requireFirebaseActionOrigin();
    const data = await firebaseWebData();
    const result = await data.moreCommentReplies(
      parsed.data.boxId,
      parsed.data.postId,
      parsed.data.rootId,
      parsed.data.cursor,
    );
    return { status: 'success', message: 'Replies loaded.', data: result };
  } catch (error) {
    return actionError(error);
  }
}
