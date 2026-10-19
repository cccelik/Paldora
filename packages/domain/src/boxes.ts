export const BOX_NAME_MAX_LENGTH = 80;
export const BOX_INVITATION_TTL_DAYS = 7;

export const BOX_ROLES = ['owner', 'admin', 'member'] as const;
export type BoxRole = (typeof BOX_ROLES)[number];

export const BOX_STATUSES = ['active', 'archived'] as const;
export type BoxStatus = (typeof BOX_STATUSES)[number];

export const BOX_MEMBERSHIP_STATUSES = ['active', 'left', 'removed'] as const;
export type BoxMembershipStatus = (typeof BOX_MEMBERSHIP_STATUSES)[number];

export const BOX_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
] as const;
export type BoxInvitationStatus = (typeof BOX_INVITATION_STATUSES)[number];

/** Roles that may invite people and manage ordinary members. */
export const canManageMembers = (role: BoxRole): boolean =>
  role === 'owner' || role === 'admin';

export interface MemberRoleChange {
  readonly actor: BoxRole;
  readonly target: BoxRole;
  readonly next: Exclude<BoxRole, 'owner'>;
}

/**
 * Role changes: the owner's role never changes here (ownership moves only by
 * transfer). Owners may promote and demote; admins may only promote members.
 */
export function mayChangeRole({
  actor,
  target,
  next,
}: MemberRoleChange): boolean {
  if (target === 'owner' || actor === 'member') return false;
  if (actor === 'owner') return target !== next;
  return target === 'member' && next === 'admin';
}

/** Removal: nobody removes the owner; owners and admins remove non-owners. */
export function mayRemoveMember(actor: BoxRole, target: BoxRole): boolean {
  return target !== 'owner' && canManageMembers(actor);
}

export const POST_CONTENT_MAX_LENGTH = 5_000;
