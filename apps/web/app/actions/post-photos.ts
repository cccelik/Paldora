'use server';

import { uuidSchema } from '@paldora/validation';
import { invalidOutcome, type ActionOutcome } from '../lib/action-result';
import {
  assetStatusOutcome,
  photoCopy,
  reservePhotoUpload,
} from '../lib/media-asset-action';
import { apiClient } from '../lib/session';
import {
  PHOTO_FILE_MESSAGE,
  uploadFileSchema,
  type PreparedUpload,
} from '../lib/upload';
const fileSchema = uploadFileSchema('post_image').extend({ boxId: uuidSchema });

/** Reserves a signed upload for one photo in a Box the person belongs to. */
export async function preparePostPhoto(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return invalidOutcome(PHOTO_FILE_MESSAGE);
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
