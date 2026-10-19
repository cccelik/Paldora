'use server';

import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import {
  mediaContentTypeSchema,
  uuidSchema,
  type MediaAssetView,
} from '@paldora/validation';
import { z } from 'zod';
import { actionError, type ActionOutcome } from '../lib/action-result';
import { apiClient } from '../lib/session';
import type { PreparedUpload } from './avatar';

const fileSchema = z.object({
  boxId: uuidSchema,
  contentType: mediaContentTypeSchema,
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(MEDIA_PURPOSE_POLICIES.post_image.maxBytes),
});

const copy = {
  MEDIA_UPLOAD_MISMATCH: 'That photo didn’t upload completely. Try again.',
  MEDIA_UPLOAD_EXPIRED: 'The upload took too long. Try again.',
  STORAGE_UNAVAILABLE: 'Photos are unavailable right now. Try again shortly.',
  BOX_ARCHIVED: 'This Box is archived, so it can’t take new photos.',
};

/** Reserves a signed upload for one photo in a Box the person belongs to. */
export async function preparePostPhoto(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: 'Choose a JPEG, PNG, or WebP photo up to 10 MB.',
      tone: 'attention',
    };
  }
  try {
    const { mediaAsset, upload } = await (
      await apiClient()
    ).createMediaUpload({ purpose: 'post_image', ...parsed.data });
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

async function withAsset(
  mediaAssetId: unknown,
  call: (id: string) => Promise<MediaAssetView>,
): Promise<ActionOutcome<MediaAssetView['status']>> {
  const id = uuidSchema.safeParse(mediaAssetId);
  if (!id.success) return actionError(new Error('invalid id'));
  try {
    const asset = await call(id.data);
    return { status: 'success', message: asset.status, data: asset.status };
  } catch (error) {
    return actionError(error, copy);
  }
}

export async function completePostPhoto(mediaAssetId: unknown) {
  const api = await apiClient();
  return withAsset(mediaAssetId, (id) => api.completeMediaUpload(id));
}

export async function postPhotoStatus(mediaAssetId: unknown) {
  const api = await apiClient();
  return withAsset(mediaAssetId, (id) => api.mediaAsset(id));
}
