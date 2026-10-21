import {
  currentUserSchema,
  preferencesSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  usernameAvailabilityQuerySchema,
  usernameAvailabilitySchema,
} from '../identity.js';
import { defineRoute } from '../route.js';

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
