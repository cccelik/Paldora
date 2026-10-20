'use server';

import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import { mediaContentTypeSchema, uuidSchema } from '@paldora/validation';
import { z } from 'zod';
import type { ActionOutcome } from '../lib/action-result';
import {
  assetStatusOutcome,
  photoCopy,
  reservePhotoUpload,
} from '../lib/media-asset-action';
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

const badFile = {
  status: 'error',
  code: 'VALIDATION_FAILED',
  message: 'Choose a JPEG, PNG, or WebP photo up to 10 MB.',
  tone: 'attention',
} as const;

/** Reserves a signed upload for one photo in a Box the person belongs to. */
export async function preparePostPhoto(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return badFile;
  const api = await apiClient();
  return reservePhotoUpload(() =>
    api.createMediaUpload({ purpose: 'post_image', ...parsed.data }),
  );
}

/** Completes any photo upload the person owns (posts and Life Updates). */
export async function completePostPhoto(mediaAssetId: unknown) {
  const api = await apiClient();
  return assetStatusOutcome(
    mediaAssetId,
    (id) => api.completeMediaUpload(id),
    photoCopy,
  );
}

/** Reads any owned photo's processing status (posts and Life Updates). */
export async function postPhotoStatus(mediaAssetId: unknown) {
  const api = await apiClient();
  return assetStatusOutcome(
    mediaAssetId,
    (id) => api.mediaAsset(id),
    photoCopy,
  );
}
