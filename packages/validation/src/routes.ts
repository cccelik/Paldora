import { livenessSchema, readinessSchema } from './health.js';
import {
  currentUserSchema,
  preferencesSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  usernameAvailabilityQuerySchema,
  usernameAvailabilitySchema,
} from './identity.js';
import {
  createMediaUploadSchema,
  mediaAssetSchema,
  mediaUploadSchema,
} from './media.js';
import { defineRoute, type RouteDefinition } from './route.js';

export const getLiveness = defineRoute({
  operationId: 'getLiveness',
  method: 'GET',
  path: '/health',
  summary: 'Liveness probe. Performs no network I/O.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: livenessSchema,
  errors: [],
});

export const getReadiness = defineRoute({
  operationId: 'getReadiness',
  method: 'GET',
  path: '/health/ready',
  summary: 'Readiness probe. Checks PostgreSQL and Redis.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: readinessSchema,
  errors: ['SERVICE_UNAVAILABLE'],
});

export const getCurrentUser = defineRoute({
  operationId: 'getCurrentUser',
  method: 'GET',
  path: '/me',
  summary: 'The signed-in account, profile, and preferences.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  errors: [],
});

export const updateProfile = defineRoute({
  operationId: 'updateProfile',
  method: 'PATCH',
  path: '/me/profile',
  summary:
    'Partially update the profile. Onboarding may only move forward, and only past steps whose data exists.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  body: updateProfileSchema,
  errors: [
    'USERNAME_UNAVAILABLE',
    'ONBOARDING_INCOMPLETE',
    'INVALID_ONBOARDING_TRANSITION',
  ],
});

export const getUsernameAvailability = defineRoute({
  operationId: 'getUsernameAvailability',
  method: 'GET',
  path: '/me/username-availability',
  summary:
    'Advisory availability check. The database decides on save; a later save can still fail with USERNAME_UNAVAILABLE.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: usernameAvailabilitySchema,
  query: usernameAvailabilityQuerySchema,
  errors: [],
});

export const updatePreferences = defineRoute({
  operationId: 'updatePreferences',
  method: 'PUT',
  path: '/me/preferences',
  summary: 'Replace the app preferences (idempotent).',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: preferencesSchema,
  body: updatePreferencesSchema,
  errors: [],
});

export const deleteAvatar = defineRoute({
  operationId: 'deleteAvatar',
  method: 'DELETE',
  path: '/me/avatar',
  summary:
    'Remove the profile photo and schedule its stored files for deletion (idempotent).',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  errors: [],
});

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

/** Every operation in the public contract. Add new routes here. */
export const apiRoutes = {
  getLiveness,
  getReadiness,
  getCurrentUser,
  updateProfile,
  getUsernameAvailability,
  updatePreferences,
  deleteAvatar,
  createMediaUpload,
  completeMediaUpload,
  getMediaAsset,
} as const satisfies Record<string, RouteDefinition>;
