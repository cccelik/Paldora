import { z } from 'zod';
import {
  nativeCursorSchema,
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

export const nativeBoxSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'archived']),
  currentUserRole: z.enum(['owner', 'admin', 'member']),
  memberCount: z.number().int().nonnegative(),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
});

export const listMyBoxesInputSchema = z.object({
  cursor: nativeCursorSchema.optional(),
});
export const listMyBoxesOutputSchema = nativePageSchema(nativeBoxSchema);

export const createBoxInputSchema = z.object({ name: nativeString(80) });
export const createBoxOutputSchema = nativeBoxSchema;

export const getBoxInputSchema = z.object({ boxId: nativeIdSchema });
export const getBoxOutputSchema = nativeBoxSchema;
