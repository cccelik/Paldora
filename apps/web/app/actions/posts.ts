'use server';

import type { BoxId, PostId } from '@paldora/domain';
import { authenticatedApiClient } from '../lib/api';
import { mutateAndRedirect } from '../lib/action-result';

export async function createPostAction(boxId: string, formData: FormData) {
  return mutateAndRedirect(`/boxes/${boxId}`, 'Post shared.', async () =>
    (await authenticatedApiClient()).createPost(boxId as BoxId, {
      content: String(formData.get('content') ?? ''),
    }),
  );
}

export async function updatePostAction(
  postId: string,
  returnPath: string,
  formData: FormData,
) {
  return mutateAndRedirect(returnPath, 'Post updated.', async () =>
    (await authenticatedApiClient()).updatePost(postId as PostId, {
      content: String(formData.get('content') ?? ''),
    }),
  );
}

export async function deletePostAction(postId: string, returnPath: string) {
  return mutateAndRedirect(returnPath, 'Post deleted.', async () =>
    (await authenticatedApiClient()).deletePost(postId as PostId),
  );
}
