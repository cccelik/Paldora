import {
  MEDIA_CONTENT_TYPES,
  MEDIA_PURPOSE_POLICIES,
  MEDIA_PURPOSES,
  MEDIA_STATUSES,
} from '@paldora/domain';
import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

const largestUpload = Math.max(
  ...Object.values(MEDIA_PURPOSE_POLICIES).map((policy) => policy.maxBytes),
);

export const mediaPurposeSchema = z.enum(MEDIA_PURPOSES);
export const mediaContentTypeSchema = z.enum(MEDIA_CONTENT_TYPES);

export const createMediaUploadSchema = z
  .object({
    purpose: mediaPurposeSchema,
    /** Required for Box-scoped purposes (post photos), forbidden otherwise. */
    boxId: uuidSchema.optional(),
    contentType: mediaContentTypeSchema,
    contentLength: z.number().int().min(1).max(largestUpload),
  })
  .strict()
  .refine(
    ({ purpose, contentType }) =>
      MEDIA_PURPOSE_POLICIES[purpose].contentTypes.includes(contentType),
    { path: ['contentType'], message: 'This image type is not supported.' },
  )
  .refine(
    ({ purpose, boxId }) =>
      (MEDIA_PURPOSE_POLICIES[purpose].scope === 'box') ===
      (boxId !== undefined),
    {
      path: ['boxId'],
      message: 'Name a Box for post photos, and only for post photos.',
    },
  )
  .refine(
    ({ purpose, contentLength }) =>
      contentLength <= MEDIA_PURPOSE_POLICIES[purpose].maxBytes,
    { path: ['contentLength'], message: 'This image is too large.' },
  )
  .meta({ id: 'CreateMediaUploadRequest' });

export const mediaAssetSchema = z
  .object({
    id: uuidSchema,
    purpose: mediaPurposeSchema,
    status: z.enum(MEDIA_STATUSES),
    contentType: mediaContentTypeSchema,
    contentLength: z.number().int().positive(),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'MediaAsset' });

export const mediaUploadSchema = z
  .object({
    mediaAsset: mediaAssetSchema,
    upload: z.object({
      method: z.literal('PUT'),
      url: z.url(),
      /** Send exactly these headers; the signature covers them. */
      headers: z.record(z.string(), z.string()),
      expiresAt: isoTimestampSchema,
    }),
  })
  .meta({ id: 'MediaUpload' });

export const mediaAssetParamsSchema = z.object({ mediaAssetId: uuidSchema });

export type CreateMediaUploadInput = z.output<typeof createMediaUploadSchema>;
export type MediaAssetView = z.infer<typeof mediaAssetSchema>;
export type MediaUpload = z.infer<typeof mediaUploadSchema>;
