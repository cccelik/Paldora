'use server';

import { type ActionResult } from '@/lib/actions/action-result';
import { runForm } from '@/lib/actions/action-runner';
import { POST_MEDIA_MAX_ITEMS } from '@paldora/domain';
import { postContentSchema, uuidSchema } from '@paldora/validation';
import { redirect } from 'next/navigation';
import { z } from 'zod';
const feedPaths = ['/home', '/boxes/[boxId]', '/posts/[postId]'];

/** The composer sends its ready photo IDs as one JSON field, in order. */
const photoIds = z.preprocess(
  (value) => {
    if (typeof value !== 'string' || value === '') return [];
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z
    .array(uuidSchema)
    .max(POST_MEDIA_MAX_ITEMS, 'A post can have up to 4 photos.'),
);

const createForm = z
  .object({
    boxId: uuidSchema,
    content: postContentSchema,
    mediaAssetIds: photoIds,
  })
  .refine(
    ({ content, mediaAssetIds }) =>
      content.length > 0 || mediaAssetIds.length > 0,
    {
      message: 'Write something or add a photo first.',
    },
  );

export async function createPostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    createForm,
    (data, { boxId, content, mediaAssetIds }) =>
      data.createPost(boxId, { content, mediaAssetIds }),
    {
      success: 'Posted.',
      paths: feedPaths,
      copy: {
        MEDIA_NOT_READY:
          'A photo is still being prepared. Try again in a moment.',
      },
    },
  );
}

export async function updatePostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ postId: uuidSchema, content: postContentSchema }),
    (data, { postId, content }) => data.updatePost(postId, { content }),
    {
      success: 'Saved.',
      paths: feedPaths,
    },
  );
}

export async function deletePostAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ postId: uuidSchema }),
    (data, { postId }) => data.deletePost(postId),
    {
      success: 'Post deleted.',
      paths: feedPaths,
    },
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
