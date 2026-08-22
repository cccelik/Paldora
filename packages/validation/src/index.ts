import { z } from 'zod';

export const uuidSchema = z.uuid();

export const cursorPageSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CursorPage = z.infer<typeof cursorPageSchema>;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

const reservedUsernames = new Set([
  'account',
  'admin',
  'api',
  'auth',
  'help',
  'home',
  'moderator',
  'paldora',
  'privacy',
  'root',
  'security',
  'settings',
  'support',
]);

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/ı/gu, 'i')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('en-US');
}

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[\p{Letter}\p{Number}_]+$/u, {
    message: 'Use only letters, numbers, and underscores.',
  });

export function isReservedUsername(value: string): boolean {
  return reservedUsernames.has(normalizeUsername(value));
}

export const usernameAvailabilitySchema = z.object({
  username: usernameSchema,
});

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(DISPLAY_NAME_MAX_LENGTH)
      .optional(),
    bio: z.string().trim().max(BIO_MAX_LENGTH).nullable().optional(),
    onboardingState: z
      .enum(['username', 'profile', 'avatar', 'complete'])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required.',
  });

export const avatarContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const createAvatarUploadSchema = z.object({
  contentType: avatarContentTypeSchema,
  contentLength: z.number().int().positive().max(AVATAR_MAX_BYTES),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type CreateAvatarUpload = z.infer<typeof createAvatarUploadSchema>;
