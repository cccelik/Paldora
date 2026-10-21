import {
  createMediaUploadSchema,
  mediaAssetSchema,
  mediaUploadSchema,
} from '../media.js';
import { defineRoute } from '../route.js';

export const createMediaUpload = defineRoute({
  operationId: 'createMediaUpload',
  method: 'POST',
  path: '/media/uploads',
  summary:
    'Reserve an upload and return a signed PUT bound to the exact type and size. Expires after 300 seconds.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 201,
  response: mediaUploadSchema,
  body: createMediaUploadSchema,
  errors: ['STORAGE_UNAVAILABLE'],
});

export const completeMediaUpload = defineRoute({
  operationId: 'completeMediaUpload',
  method: 'POST',
  path: '/media/uploads/{mediaAssetId}/complete',
  summary:
    'Verify the stored object against the reservation and queue processing. Single use.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 200,
  response: mediaAssetSchema,
  errors: [
    'MEDIA_NOT_FOUND',
    'MEDIA_UPLOAD_ALREADY_HANDLED',
    'MEDIA_UPLOAD_EXPIRED',
    'MEDIA_UPLOAD_MISMATCH',
    'STORAGE_UNAVAILABLE',
  ],
});

export const getMediaAsset = defineRoute({
  operationId: 'getMediaAsset',
  method: 'GET',
  path: '/media/{mediaAssetId}',
  summary: 'Processing status of one of your own uploads.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 200,
  response: mediaAssetSchema,
  errors: ['MEDIA_NOT_FOUND'],
});
