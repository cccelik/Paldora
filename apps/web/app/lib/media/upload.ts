import { MEDIA_PURPOSE_POLICIES, type MediaPurpose } from '@paldora/domain';
import { mediaContentTypeSchema } from '@paldora/validation';
import { z } from 'zod';
export interface PreparedUpload {
  readonly mediaAssetId: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}
export const PHOTO_FILE_MESSAGE =
  'Choose a JPEG, PNG, or WebP photo up to 10 MB.';

export const uploadFileSchema = (purpose: MediaPurpose) =>
  z.object({
    contentType: mediaContentTypeSchema,
    contentLength: z
      .number()
      .int()
      .min(1)
      .max(MEDIA_PURPOSE_POLICIES[purpose].maxBytes),
  });
