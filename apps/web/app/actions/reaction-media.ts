'use server';

import { MEDIA_PURPOSE_POLICIES, REAL_REACTION_KIND } from '@paldora/domain';
import { uuidSchema, type PostInteractionSummary } from '@paldora/validation';
import { z } from 'zod';
import { actionError, type ActionOutcome } from '../lib/action-result';
import { assetStatusOutcome } from '../lib/media-asset-action';
import { apiClient } from '../lib/session';
import type { PreparedUpload } from './avatar';

const imageSchema = z.object({
  boxId: uuidSchema,
  contentType: z.literal('image/jpeg'),
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(MEDIA_PURPOSE_POLICIES.reaction_image.maxBytes),
});

const copy = {
  MEDIA_UPLOAD_MISMATCH: 'The photo didn’t upload completely.',
  MEDIA_UPLOAD_EXPIRED: 'The upload took too long.',
  MEDIA_NOT_FOUND: 'The photo is no longer available.',
  MEDIA_NOT_READY: 'The photo isn’t ready yet.',
  STORAGE_UNAVAILABLE: 'Photos are unavailable right now.',
  BOX_ARCHIVED: 'This Box is archived, so it’s read-only now.',
  POST_NOT_FOUND: 'This post is no longer here.',
  RATE_LIMITED: 'That’s a lot of camera reactions. Try again later.',
  RATE_LIMIT_UNAVAILABLE: 'Camera reactions are paused for a moment.',
};

const invalid = (message: string): ActionOutcome<never> => ({
  status: 'error',
  code: 'VALIDATION_FAILED',
  message,
  tone: 'attention',
});

/**
 * Reserves a signed upload for one camera frame, scoped to the post's Box
 * so exactly the people who see the post can see the image.
 */
export async function prepareReactionImage(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = imageSchema.safeParse(input);
  if (!parsed.success) return invalid('That photo is too large to send.');
  try {
    const { mediaAsset, upload } = await (
      await apiClient()
    ).createMediaUpload({ purpose: 'reaction_image', ...parsed.data });
    return {
      status: 'success',
      message: 'Upload ready.',
      data: {
        mediaAssetId: mediaAsset.id,
        url: upload.url,
        headers: upload.headers,
      },
    };
  } catch (error) {
    return actionError(error, copy);
  }
}

export async function completeReactionImage(mediaAssetId: unknown) {
  const api = await apiClient();
  return assetStatusOutcome(
    mediaAssetId,
    (id) => api.completeMediaUpload(id),
    copy,
  );
}

export async function reactionImageStatus(mediaAssetId: unknown) {
  const api = await apiClient();
  return assetStatusOutcome(mediaAssetId, (id) => api.mediaAsset(id), copy);
}

const cameraReaction = z.object({
  postId: uuidSchema,
  mediaAssetId: uuidSchema,
});

/**
 * Makes a ready camera image the person's one reaction on the post; any
 * emoji (or earlier camera image) is replaced. Set-state, so a retry is
 * harmless. Revalidates nothing, like the emoji action.
 */
export async function setCameraReactionAction(
  input: unknown,
): Promise<ActionOutcome<PostInteractionSummary>> {
  const parsed = cameraReaction.safeParse(input);
  if (!parsed.success) return invalid('That photo can’t be sent.');
  try {
    const { postId, mediaAssetId } = parsed.data;
    const summary = await (
      await apiClient()
    ).setPostReaction(postId, { kind: REAL_REACTION_KIND, mediaAssetId });
    return { status: 'success', message: 'Sent.', data: summary };
  } catch (error) {
    return actionError(error, copy);
  }
}
