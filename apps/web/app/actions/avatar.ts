'use server';

import {
  actionError,
  invalidOutcome,
  type ActionOutcome,
} from '@/lib/actions/action-result';
import {
  assetStatusOutcome,
  reservePhotoUpload,
} from '@/lib/media/media-asset-action';
import {
  PHOTO_FILE_MESSAGE,
  uploadFileSchema,
  type PreparedUpload,
} from '@/lib/media/upload';
import { mediaActionClient } from '@/lib/media/media-service';
import { revalidatePath } from 'next/cache';
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
      (await mediaActionClient()).createMediaUpload({
        purpose: 'avatar',
        ...parsed.data,
      }),
    uploadCopy,
  );
}

export async function completeAvatarUpload(mediaAssetId: unknown) {
  const api = await mediaActionClient();
  return assetStatusOutcome(
    mediaAssetId,
    (id) => api.completeMediaUpload(id),
    uploadCopy,
  );
}

export async function avatarUploadStatus(mediaAssetId: unknown) {
  const api = await mediaActionClient();
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
    await (await mediaActionClient()).deleteAvatar();
  } catch (error) {
    return actionError(error);
  }
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Photo removed.', data: undefined };
}
