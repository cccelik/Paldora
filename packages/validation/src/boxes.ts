import {
  BOX_MEMBERSHIP_STATUSES,
  BOX_NAME_MAX_LENGTH,
  BOX_ROLES,
  BOX_STATUSES,
} from '@paldora/domain';
import { z } from 'zod';
import { usernameSchema } from './identity.js';
import { userSummarySchema } from './people.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

export const boxNameSchema = z
  .string()
  .trim()
  .min(1, 'Give your Box a name.')
  .max(BOX_NAME_MAX_LENGTH, 'Use 80 characters or fewer.');

export const createBoxSchema = z
  .object({ name: boxNameSchema })
  .strict()
  .meta({ id: 'CreateBoxRequest' });

export const updateBoxSchema = z
  .object({
    name: boxNameSchema.optional(),
    status: z.enum(BOX_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one Box field.',
  })
  .meta({ id: 'UpdateBoxRequest' });

/**
 * Typing the exact name is the server-side half of the delete confirmation.
 * It travels as a query value because DELETE bodies have no defined meaning
 * across HTTP clients and OpenAPI generators.
 */
export const deleteBoxQuerySchema = z.object({
  confirmName: z.string().max(BOX_NAME_MAX_LENGTH * 2),
});

export const boxSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    status: z.enum(BOX_STATUSES),
    currentUserRole: z.enum(BOX_ROLES),
    memberCount: z.number().int().nonnegative(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: 'Box' });

export const boxPageSchema = cursorPageSchema(boxSchema).meta({
  id: 'BoxPage',
});

export const boxMemberSchema = z
  .object({
    user: userSummarySchema,
    role: z.enum(BOX_ROLES),
    status: z.enum(BOX_MEMBERSHIP_STATUSES),
    joinedAt: isoTimestampSchema,
  })
  .meta({ id: 'BoxMember' });

export const boxMemberPageSchema = cursorPageSchema(boxMemberSchema).meta({
  id: 'BoxMemberPage',
});

export const updateBoxMemberSchema = z
  .object({ role: z.enum(['admin', 'member']) })
  .strict()
  .meta({ id: 'UpdateBoxMemberRequest' });

export const boxMemberRoleSchema = z
  .object({ role: z.enum(['admin', 'member']) })
  .meta({ id: 'BoxMemberRole' });

export const transferBoxOwnershipSchema = z
  .object({ userId: uuidSchema })
  .strict()
  .meta({ id: 'TransferBoxOwnershipRequest' });

export const createBoxInvitationSchema = z
  .object({ username: usernameSchema })
  .strict()
  .meta({ id: 'CreateBoxInvitationRequest' });

export const boxInvitationSchema = z
  .object({
    id: uuidSchema,
    box: z.object({ id: uuidSchema, name: z.string() }),
    inviter: userSummarySchema,
    invitee: userSummarySchema,
    expiresAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'BoxInvitation' });

export const boxInvitationPageSchema = cursorPageSchema(
  boxInvitationSchema,
).meta({
  id: 'BoxInvitationPage',
});

export const boxParamsSchema = z.object({ boxId: uuidSchema });
export const boxMemberParamsSchema = z.object({
  boxId: uuidSchema,
  userId: uuidSchema,
});
export const boxInvitationParamsSchema = z.object({ invitationId: uuidSchema });
export const boxBoxInvitationParamsSchema = z.object({
  boxId: uuidSchema,
  invitationId: uuidSchema,
});

export type CreateBoxInput = z.output<typeof createBoxSchema>;
export type UpdateBoxInput = z.output<typeof updateBoxSchema>;
export type BoxView = z.infer<typeof boxSchema>;
export type BoxMemberView = z.infer<typeof boxMemberSchema>;
export type BoxInvitationView = z.infer<typeof boxInvitationSchema>;
