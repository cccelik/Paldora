import { z } from 'zod';
import {
  nativeIdSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

export const beginBoxDeletionInputSchema = z.object({
  boxId: nativeIdSchema,
  confirmName: nativeString(80),
});
export const beginBoxDeletionOutputSchema = z.object({ jobId: z.string() });

export const BOX_DELETION_PHASES = [
  'blockers',
  'derived_refs',
  'deliveries',
  'reports',
  'invitations',
  'members',
  'post_pointers',
  'tree',
  'complete',
] as const;

export const boxDeletionStatusInputSchema = z.object({
  boxId: nativeIdSchema,
});
export const boxDeletionStatusOutputSchema = z.object({
  boxId: z.string(),
  generation: z.string(),
  phase: z.enum(BOX_DELETION_PHASES),
  updatedAt: nativeTimestampSchema,
});

export const listBoxMembersInputSchema = z.object({
  boxId: nativeIdSchema,
  cursor: nativeString(128).optional(),
});
export const nativeBoxMemberSchema = z.object({
  uid: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  role: z.enum(['owner', 'admin', 'member']),
  joinedAt: nativeTimestampSchema,
});
export const listBoxMembersOutputSchema = nativePageSchema(
  nativeBoxMemberSchema,
);
