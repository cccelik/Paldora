import { z } from 'zod';
import {
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

export const sendFriendRequestInputSchema = z.object({
  username: nativeString(30),
});
export const sendFriendRequestOutputSchema = z.object({
  requestId: z.string(),
});

export const acceptFriendRequestInputSchema = z.object({
  requestId: nativeString(64),
});
export const acceptFriendRequestOutputSchema = nativeOkSchema;

export const closeFriendshipInputSchema = acceptFriendRequestInputSchema;
export const closeFriendshipOutputSchema = nativeOkSchema;

export const FRIENDSHIP_LISTINGS = ['pending', 'sent', 'accepted'] as const;

export const listMyFriendshipsInputSchema = z.object({
  status: z.enum(FRIENDSHIP_LISTINGS),
  cursor: nativeString(64).optional(),
});
export const nativeFriendshipSchema = z.object({
  id: z.string(),
  otherUid: z.string(),
  status: z.enum(FRIENDSHIP_LISTINGS),
  requesterUid: z.string(),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
  username: z.string(),
  displayName: z.string(),
});
export const listMyFriendshipsOutputSchema = nativePageSchema(
  nativeFriendshipSchema,
);

export const setUserBlockInputSchema = z.object({
  targetUid: nativeIdSchema,
  blocked: z.boolean(),
});
export const setUserBlockOutputSchema = nativeOkSchema;

/** The members you blocked, as the web "Blocked people" list. Never the other direction. */
export const listMyBlocksInputSchema = z.object({
  cursor: nativeString(128).optional(),
});
export const nativeBlockedUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  blockedAt: nativeTimestampSchema,
});
export const listMyBlocksOutputSchema = nativePageSchema(
  nativeBlockedUserSchema,
);
