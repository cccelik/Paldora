'use server';

import { revalidatePath } from 'next/cache';
import {
  actionError,
  invalidOutcome,
  type ActionOutcome,
} from '../lib/action-result';
import {
  assetStatusOutcome,
  reservePhotoUpload,
} from '../lib/media-asset-action';
import { apiClient } from '../lib/session';
import {
  PHOTO_FILE_MESSAGE,
  uploadFileSchema,
  type PreparedUpload,
} from '../lib/upload';
const fileSchema = uploadFileSchema('avatar');

const uploadCopy = {
  MEDIA_UPLOAD_MISMATCH: 'That photo didn’t upload completely. Try again.',
  MEDIA_UPLOAD_EXPIRED: 'The upload took too long. Try again.',
  STORAGE_UNAVAILABLE: 'Photos are unavailable right now. Try again shortly.',
};

/**
 * Server Actions are public endpoints, so every argument is validated here
 * even though the API validates it again.
 */
export async function prepareAvatarUpload(
  file: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = fileSchema.safeParse(file);
  if (!parsed.success) {
    return invalidOutcome(PHOTO_FILE_MESSAGE);
  }
  return reservePhotoUpload(
    async () =>
      (await apiClient()).createMediaUpload({
        purpose: 'avatar',
        ...parsed.data,
      }),
    uploadCopy,
  );
}

export async function completeAvatarUpload(mediaAssetId: unknown) {
  const api = await apiClient();
  return assetStatusOutcome(
    mediaAssetId,
    (id) => api.completeMediaUpload(id),
    uploadCopy,
  );
}

export async function avatarUploadStatus(mediaAssetId: unknown) {
  const api = await apiClient();
  const result = await assetStatusOutcome(
    mediaAssetId,
    (id) => api.mediaAsset(id),
    uploadCopy,
  );
  if (result.status === 'success' && result.data === 'ready') {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function removeAvatarAction(): Promise<ActionOutcome> {
  try {
    await (await apiClient()).deleteAvatar();
  } catch (error) {
    return actionError(error);
  }
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Photo removed.', data: undefined };
}
