import type { boxInvitations, boxes } from '@paldora/database';
import type {
  Box,
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  BoxRole,
  UserId,
} from '@paldora/domain';

export function mapBox(
  row: typeof boxes.$inferSelect,
  role: BoxRole,
  memberCount: number,
): Box {
  return {
    id: row.id as BoxId,
    name: row.name,
    slug: row.slug,
    ownerUserId: row.ownerUserId as UserId,
    privacyMode: 'private',
    status: row.status,
    currentUserRole: role,
    memberCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapBoxInvitation(
  row: typeof boxInvitations.$inferSelect,
  boxName: string,
): BoxInvitation {
  return {
    id: row.id as BoxInvitationId,
    boxId: row.boxId as BoxId,
    boxName,
    inviterUserId: row.inviterUserId as UserId,
    inviteeUserId: row.inviteeUserId as UserId,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
