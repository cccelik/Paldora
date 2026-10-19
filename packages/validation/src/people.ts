import { FRIENDSHIP_DIRECTIONS } from '@paldora/domain';
import { z } from 'zod';
import { usernameSchema } from './identity.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/**
 * A person as another person sees them. Only people who already have a
 * relationship with the viewer (friends, request parties, Box members) are
 * ever returned, with a short-lived signed thumbnail rather than a storage key.
 */
export const userSummarySchema = z
  .object({
    id: uuidSchema,
    username: z.string(),
    /** Falls back to the username when the person set no display name. */
    displayName: z.string(),
    avatarUrl: z.url().nullable(),
  })
  .meta({ id: 'UserSummary' });

export const createFriendRequestSchema = z
  .object({ username: usernameSchema })
  .strict()
  .meta({ id: 'CreateFriendRequest' });

export const friendshipSchema = z
  .object({
    id: uuidSchema,
    user: userSummarySchema,
    status: z.enum(['pending', 'accepted']),
    direction: z.enum(FRIENDSHIP_DIRECTIONS),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: 'Friendship' });

export const friendshipPageSchema = cursorPageSchema(friendshipSchema).meta({
  id: 'FriendshipPage',
});

export const createBlockSchema = z
  .object({ username: usernameSchema })
  .strict()
  .meta({ id: 'CreateBlock' });

/** Blocked people carry no avatar: a block can target someone you never met. */
export const blockedUserSchema = z
  .object({
    userId: uuidSchema,
    username: z.string(),
    displayName: z.string(),
    blockedAt: isoTimestampSchema,
  })
  .meta({ id: 'BlockedUser' });

export const blockedUserPageSchema = cursorPageSchema(blockedUserSchema).meta({
  id: 'BlockedUserPage',
});

export const friendshipParamsSchema = z.object({ friendshipId: uuidSchema });
export const userParamsSchema = z.object({ userId: uuidSchema });

export type UserSummary = z.infer<typeof userSummarySchema>;
export type FriendshipView = z.infer<typeof friendshipSchema>;
export type BlockedUserView = z.infer<typeof blockedUserSchema>;
