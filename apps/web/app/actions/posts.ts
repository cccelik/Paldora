'use server';

import { postContentSchema, uuidSchema } from '@paldora/validation';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionResult } from '../lib/action-result';
import { runForm } from '../lib/action-runner';

const feedPaths = ['/home', '/boxes/[boxId]', '/posts/[postId]'];

export async function createPostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, content: postContentSchema }),
    (api, { boxId, content }) => api.createPost(boxId, { content }),
    { success: 'Posted.', paths: feedPaths },
  );
}

export async function updatePostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ postId: uuidSchema, content: postContentSchema }),
    (api, { postId, content }) => api.updatePost(postId, { content }),
    { success: 'Saved.', paths: feedPaths },
  );
}

export async function deletePostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ postId: uuidSchema }),
    (api, { postId }) => api.deletePost(postId),
    { success: 'Post deleted.', paths: feedPaths },
  );
}

/** Deleting from a post’s own page leaves it for Home, since it is gone. */
export async function deletePostAndLeaveAction(
  previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await deletePostAction(previous, formData);
  if (result.status !== 'success') return result;
  redirect('/home');
}
