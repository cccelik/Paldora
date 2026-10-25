'use server';

import {
  actionError,
  invalidOutcome,
  type ActionOutcome,
} from '@/lib/actions/action-result';
import { firebaseWebData } from '@/lib/server/firebase/data';

import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import {
  emojiSchema,
  uuidSchema,
  type CommentInteractionSummary,
  type PostInteractionSummary,
} from '@paldora/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const inputSchema = z.object({
  boxId: uuidSchema,
  postId: uuidSchema,
  kind: emojiSchema.nullable(),
});

export async function setFirebasePostReactionAction(
  input: unknown,
): Promise<ActionOutcome<PostInteractionSummary>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalidOutcome('Choose a single emoji.');
  try {
    await requireFirebaseActionOrigin();
    const data = await firebaseWebData();
    await data.setPostReaction(
      parsed.data.boxId,
      parsed.data.postId,
      parsed.data.kind,
    );
    const result = await data.postInteractionSummary(
      parsed.data.boxId,
      parsed.data.postId,
    );
    revalidatePath('/boxes/[boxId]', 'page');
    revalidatePath('/posts/[postId]', 'page');
    return { status: 'success', message: 'Reaction saved.', data: result };
  } catch (error) {
    return actionError(error);
  }
}

const commentInputSchema = inputSchema.extend({ commentId: uuidSchema });

export async function setFirebaseCommentReactionAction(
  input: unknown,
): Promise<ActionOutcome<CommentInteractionSummary>> {
  const parsed = commentInputSchema.safeParse(input);
  if (!parsed.success) return invalidOutcome('Choose a single emoji.');
  try {
    await requireFirebaseActionOrigin();
    const data = await firebaseWebData();
    const result = await data.setCommentReaction(
      parsed.data.boxId,
      parsed.data.postId,
      parsed.data.commentId,
      parsed.data.kind,
    );
    revalidatePath('/posts/[postId]', 'page');
    revalidatePath('/life-updates/[lifeUpdateId]', 'page');
    return { status: 'success', message: 'Reaction saved.', data: result };
  } catch (error) {
    return actionError(error);
  }
}
