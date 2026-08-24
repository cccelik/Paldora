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
export const BOX_NAME_MAX_LENGTH = 80;
export const POST_CONTENT_MAX_LENGTH = 5_000;
export const POST_MEDIA_MAX_ITEMS = 4;
export const COMMENT_CONTENT_MAX_LENGTH = 2_000;
export const REACTION_EMOJI_MAX_LENGTH = 64;

const emojiSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const emojiCodePoint =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3/u;

export function isSingleEmoji(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= REACTION_EMOJI_MAX_LENGTH &&
    value.trim() === value &&
    value !== 'real' &&
    emojiCodePoint.test(value) &&
    Array.from(emojiSegmenter.segment(value)).length === 1
  );
}
export const reactionEmojiSchema = z
  .string()
  .refine(isSingleEmoji, 'Choose one emoji.');

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
    reactionPresets: z
      .tuple([
        reactionEmojiSchema,
        reactionEmojiSchema,
        reactionEmojiSchema,
        reactionEmojiSchema,
        reactionEmojiSchema,
      ])
      .refine((items) => new Set(items).size === items.length, {
        message: 'Each preset reaction must be different.',
      })
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

export const boxNameSchema = z
  .string()
  .trim()
  .min(1, 'Give your Box a name.')
  .max(BOX_NAME_MAX_LENGTH, 'Box names must be 80 characters or fewer.');

export const createBoxSchema = z.object({ name: boxNameSchema });

export const updateBoxSchema = z
  .object({
    name: boxNameSchema.optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Box field is required.',
  });

export const createBoxInvitationSchema = z.object({
  username: usernameSchema,
});

export const updateBoxMemberSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const transferBoxOwnershipSchema = z.object({
  userId: uuidSchema,
});

export const createFriendRequestSchema = z.object({
  username: usernameSchema,
});

export const createBlockSchema = z.object({ username: usernameSchema });

export const postContentSchema = z
  .string()
  .trim()
  .max(POST_CONTENT_MAX_LENGTH, 'Posts must be 5,000 characters or fewer.');

export const createPostSchema = z
  .object({
    content: postContentSchema,
    mediaAssetIds: z
      .array(uuidSchema)
      .max(POST_MEDIA_MAX_ITEMS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Each photo can only be attached once.',
      })
      .default([]),
  })
  .refine(
    ({ content, mediaAssetIds }) =>
      content.length > 0 || mediaAssetIds.length > 0,
    { message: 'Write something or add a photo before posting.' },
  );
export const updatePostSchema = z.object({
  content: postContentSchema.min(1, 'Post text cannot be empty.'),
});
export const createPostMediaUploadSchema = createAvatarUploadSchema;

export const commentContentSchema = z
  .string()
  .trim()
  .min(1, 'Comments cannot be empty.')
  .max(
    COMMENT_CONTENT_MAX_LENGTH,
    `Comments must be ${COMMENT_CONTENT_MAX_LENGTH.toLocaleString('en-US')} characters or fewer.`,
  );
export const createCommentSchema = z.object({
  content: commentContentSchema,
  parentCommentId: uuidSchema.optional(),
});
export const updateCommentSchema = z.object({ content: commentContentSchema });

export const setPostReactionSchema = z
  .object({
    kind: z.union([reactionEmojiSchema, z.literal('real')]).nullable(),
    mediaAssetId: uuidSchema.optional(),
  })
  .superRefine(({ kind, mediaAssetId }, context) => {
    if ((kind === 'real') !== Boolean(mediaAssetId)) {
      context.addIssue({
        code: 'custom',
        message: 'Camera reactions require exactly one captured photo.',
        path: ['mediaAssetId'],
      });
    }
  });
export const setCommentReactionSchema = z.object({
  kind: reactionEmojiSchema.nullable(),
});
export const createReactionPhotoUploadSchema = createAvatarUploadSchema;

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type CreateAvatarUpload = z.infer<typeof createAvatarUploadSchema>;
export type CreateBox = z.infer<typeof createBoxSchema>;
export type UpdateBox = z.infer<typeof updateBoxSchema>;
export type CreateBoxInvitation = z.infer<typeof createBoxInvitationSchema>;
export type UpdateBoxMember = z.infer<typeof updateBoxMemberSchema>;
export type TransferBoxOwnership = z.infer<typeof transferBoxOwnershipSchema>;
export type CreateFriendRequest = z.infer<typeof createFriendRequestSchema>;
export type CreatePost = z.infer<typeof createPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;
export type CreatePostMediaUpload = z.infer<typeof createPostMediaUploadSchema>;
export type CreateComment = z.infer<typeof createCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type SetPostReaction = z.infer<typeof setPostReactionSchema>;
export type SetCommentReaction = z.infer<typeof setCommentReactionSchema>;
export type CreateReactionPhotoUpload = z.infer<
  typeof createReactionPhotoUploadSchema
>;
