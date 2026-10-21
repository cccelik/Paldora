'use server';

import {
  invalidOutcome,
  type ActionOutcome,
} from '@/lib/actions/action-result';
import { reservePhotoUpload } from '@/lib/media/media-asset-action';
import {
  PHOTO_FILE_MESSAGE,
  uploadFileSchema,
  type PreparedUpload,
} from '@/lib/media/upload';
import { apiClient } from '@/lib/server/session';
const fileSchema = uploadFileSchema('life_update_image');

/**
 * Reserves a signed upload for one Life Update photo. It is the person's
 * own (user-scoped), so one stored photo serves every Box it is shared to.
 * Completion and status reuse `completePostPhoto` and `postPhotoStatus`.
 */
export async function prepareLifeUpdatePhoto(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) {
    return invalidOutcome(PHOTO_FILE_MESSAGE);
  }
  const api = await apiClient();
  return reservePhotoUpload(() =>
    api.createMediaUpload({ purpose: 'life_update_image', ...parsed.data }),
  );
}
