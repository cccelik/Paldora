'use server';

import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import {
  mediaContentTypeSchema,
  uuidSchema,
  type MediaAssetView,
} from '@paldora/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionError, type ActionOutcome } from '../lib/action-result';
import { apiClient } from '../lib/session';

export interface PreparedUpload {
  readonly mediaAssetId: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

const fileSchema = z.object({
  contentType: mediaContentTypeSchema,
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(MEDIA_PURPOSE_POLICIES.avatar.maxBytes),
});

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
    ).createMediaUpload({ purpose: 'avatar', ...parsed.data });
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
    return actionError(error, uploadCopy);
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
    return actionError(error, uploadCopy);
  }
}

export async function completeAvatarUpload(mediaAssetId: unknown) {
  const api = await apiClient();
  return withAsset(mediaAssetId, (id) => api.completeMediaUpload(id));
}

export async function avatarUploadStatus(mediaAssetId: unknown) {
  const api = await apiClient();
  const result = await withAsset(mediaAssetId, (id) => api.mediaAsset(id));
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
