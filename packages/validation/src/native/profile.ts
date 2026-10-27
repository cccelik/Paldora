import {
  APPEARANCES,
  ONBOARDING_STATES,
  REACTION_PRESET_COUNT,
} from '@paldora/domain';
import { z } from 'zod';
import {
  nativeEmptyInputSchema,
  nativeOkSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/**
 * The signed-in member's own profile. No avatar field yet: avatars are served
 * by the Storage design, and this contract never carries object keys or URLs.
 */
export const nativePreferencesSchema = z.object({
  appearance: z.enum(APPEARANCES),
  reactionPresets: z.array(z.string()).length(REACTION_PRESET_COUNT),
});

export const nativeMyProfileSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    status: z.literal('active'),
    createdAt: nativeTimestampSchema,
  }),
  profile: z.object({
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    bio: z.string().nullable(),
    /** Opaque media id for `mediaRead` thumbnail, or null. Never a URL. */
    avatarMediaId: z.string().nullable(),
    onboardingState: z.enum(ONBOARDING_STATES),
    updatedAt: nativeTimestampSchema,
  }),
  preferences: nativePreferencesSchema,
});

export const getMyProfileInputSchema = z.object({});
export const getMyProfileOutputSchema = nativeMyProfileSchema;

/** Partial; the trusted service re-parses with the shared strict schema. */
export const updateMyProfileInputSchema = z
  .object({
    username: nativeString(30).optional(),
    displayName: nativeString(80).optional(),
    bio: z.string().max(500).nullable().optional(),
    onboardingState: z.enum(ONBOARDING_STATES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const updateMyProfileOutputSchema = nativeMyProfileSchema;

export const updateMyPreferencesInputSchema = z
  .object({
    appearance: z.enum(APPEARANCES).optional(),
    reactionPresets: z
      .array(nativeString(32))
      .length(REACTION_PRESET_COUNT)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const updateMyPreferencesOutputSchema = nativePreferencesSchema;

/** Clears the avatar and any pending avatar upload; the assets are retired. */
export const deleteAvatarInputSchema = nativeEmptyInputSchema;
export const deleteAvatarOutputSchema = nativeOkSchema;
