import {
  APPEARANCES,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  ONBOARDING_STATES,
  USER_STATUSES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@paldora/domain';
import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

const reservedUsernames = new Set([
  'account',
  'admin',
  'api',
  'auth',
  'help',
  'home',
  'me',
  'moderator',
  'paldora',
  'privacy',
  'root',
  'security',
  'settings',
  'support',
]);

/**
 * The comparison form of a username: NFKD, combining marks removed, dotless
 * `ı` folded to `i`, then `en-US` lowercase. Uniqueness is enforced on this
 * value by `profiles_username_normalized_unique`, so `Zoë` and `zoe` collide.
 */
export function normalizeUsername(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/ı/gu, 'i')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('en-US');
}

export function isReservedUsername(value: string): boolean {
  return reservedUsernames.has(normalizeUsername(value));
}

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, 'Use at least 3 characters.')
  .max(USERNAME_MAX_LENGTH, 'Use 30 characters or fewer.')
  .regex(/^[\p{Letter}\p{Number}_]+$/u, {
    message: 'Use only letters, numbers, and underscores.',
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Add a display name.')
  .max(DISPLAY_NAME_MAX_LENGTH, 'Use 80 characters or fewer.');

export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, 'Use 500 characters or fewer.')
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const onboardingStateSchema = z.enum(ONBOARDING_STATES);
export const appearanceSchema = z.enum(APPEARANCES);

/** Partial and server-authoritative; onboarding may only move forward. */
export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: displayNameSchema.optional(),
    bio: bioSchema.optional(),
    onboardingState: onboardingStateSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one profile field.',
  })
  .meta({ id: 'UpdateProfileRequest' });

export const usernameAvailabilityQuerySchema = z.object({
  // Raw input, so the answer can explain why a value is invalid.
  username: z.string().max(64),
});

export const usernameAvailabilitySchema = z
  .object({
    username: z.string(),
    available: z.boolean(),
    reason: z.enum(['invalid', 'reserved', 'taken']).nullable(),
  })
  .meta({ id: 'UsernameAvailability' });

export const updatePreferencesSchema = z
  .object({ appearance: appearanceSchema })
  .strict()
  .meta({ id: 'UpdatePreferencesRequest' });

export const preferencesSchema = z
  .object({ appearance: appearanceSchema })
  .meta({ id: 'Preferences' });

/** Short-lived signed derivative URLs; never storage keys. */
export const avatarSchema = z
  .object({
    url: z.url(),
    thumbnailUrl: z.url(),
  })
  .meta({ id: 'Avatar' });

export const currentUserSchema = z
  .object({
    user: z.object({
      id: uuidSchema,
      email: z.string(),
      status: z.enum(USER_STATUSES),
      createdAt: isoTimestampSchema,
    }),
    profile: z.object({
      username: z.string().nullable(),
      displayName: z.string().nullable(),
      bio: z.string().nullable(),
      avatar: avatarSchema.nullable(),
      /** A newer avatar upload is still being processed. */
      avatarProcessing: z.boolean(),
      onboardingState: onboardingStateSchema,
      updatedAt: isoTimestampSchema,
    }),
    preferences: preferencesSchema,
  })
  .meta({ id: 'CurrentUser' });

export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
