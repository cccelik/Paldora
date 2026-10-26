import { z } from 'zod';
import {
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

export const inviteBoxInputSchema = z.object({
  boxId: nativeIdSchema,
  username: nativeString(30),
});
export const inviteBoxOutputSchema = z.object({ invitationId: z.string() });

export const acceptBoxInvitationInputSchema = z.object({
  invitationId: nativeString(64),
});
export const acceptBoxInvitationOutputSchema = z.object({ boxId: z.string() });

export const declineBoxInvitationInputSchema = acceptBoxInvitationInputSchema;
export const declineBoxInvitationOutputSchema = nativeOkSchema;

export const revokeBoxInvitationInputSchema = z.object({
  invitationId: nativeString(64),
  boxId: nativeIdSchema,
});
export const revokeBoxInvitationOutputSchema = nativeOkSchema;

/** Only this callable pins a cursor to a 64-character lowercase hex string. */
export const listMyBoxInvitationsInputSchema = z.object({
  cursor: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const myBoxInvitationSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  boxName: z.string(),
  inviterUid: z.string(),
  expiresAt: nativeTimestampSchema,
  createdAt: nativeTimestampSchema,
  inviterUsername: z.string(),
  inviterDisplayName: z.string(),
});
export const listMyBoxInvitationsOutputSchema = nativePageSchema(
  myBoxInvitationSchema,
);

export const listBoxInvitationsInputSchema = z.object({
  boxId: nativeIdSchema,
  cursor: nativeString(64).optional(),
});
export const boxInvitationSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  inviteeUid: z.string(),
  inviteeUsername: z.string().nullable(),
  inviteeDisplayName: z.string().nullable(),
  inviterUid: z.string(),
  inviterUsername: z.string().nullable(),
  inviterDisplayName: z.string().nullable(),
  expiresAt: nativeTimestampSchema,
  createdAt: nativeTimestampSchema,
});
export const listBoxInvitationsOutputSchema =
  nativePageSchema(boxInvitationSchema);
