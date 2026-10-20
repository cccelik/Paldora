'use server';

import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import { mediaContentTypeSchema } from '@paldora/validation';
import { z } from 'zod';
import type { ActionOutcome } from '../lib/action-result';
import { reservePhotoUpload } from '../lib/media-asset-action';
import { apiClient } from '../lib/session';
import type { PreparedUpload } from './avatar';

const fileSchema = z.object({
  contentType: mediaContentTypeSchema,
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(MEDIA_PURPOSE_POLICIES.life_update_image.maxBytes),
});

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
    return {
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: 'Choose a JPEG, PNG, or WebP photo up to 10 MB.',
      tone: 'attention',
    };
  }
  const api = await apiClient();
  return reservePhotoUpload(() =>
    api.createMediaUpload({ purpose: 'life_update_image', ...parsed.data }),
  );
}
