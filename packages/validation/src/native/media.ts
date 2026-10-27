import { MEDIA_STATUSES } from '@paldora/domain';
import { z } from 'zod';
import {
  createMediaUploadSchema,
  mediaContentTypeSchema,
  mediaPurposeSchema,
} from '../media.js';
import { nativeString, nativeTimestampSchema } from './primitives.js';

/**
 * ADR 021 decision 8 (media). Native clients reserve and complete uploads with
 * callables and move the bytes through two authenticated HTTP Functions
 * (`mediaUpload`, `mediaRead`; see `http.ts`). No signed URL, Storage path or
 * Firebase download URL ever appears in this contract.
 */

/** Same validation as the web adapter: exact purpose policy, MIME and length. */
export const createMediaUploadInputSchema = createMediaUploadSchema;

export const nativeMediaAssetSchema = z.object({
  id: z.string(),
  purpose: mediaPurposeSchema,
  status: z.enum(MEDIA_STATUSES),
  contentType: mediaContentTypeSchema,
  contentLength: z.number().int().positive(),
  createdAt: nativeTimestampSchema,
});

export const createMediaUploadOutputSchema = z.object({
  mediaAsset: nativeMediaAssetSchema,
  /**
   * Where to send the bytes: `PUT` to the `mediaUpload` HTTP Function, path
   * `/{mediaAsset.id}`, with exactly these headers plus the Firebase ID token.
   */
  upload: z.object({
    method: z.literal('PUT'),
    function: z.literal('mediaUpload'),
    path: z.string(),
    headers: z.object({ 'Content-Type': mediaContentTypeSchema }),
    expiresAt: nativeTimestampSchema,
  }),
});

export const completeMediaUploadInputSchema = z.object({
  assetId: nativeString(64),
});
export const completeMediaUploadOutputSchema = nativeMediaAssetSchema;

export const getMediaAssetInputSchema = completeMediaUploadInputSchema;
/**
 * Owner-only. `available` is true once the asset is `ready`; `width` and
 * `height` describe the master derivative (null until ready). Avatar display
 * and thumbnail variants are square crops.
 */
export const getMediaAssetOutputSchema = nativeMediaAssetSchema.extend({
  available: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
