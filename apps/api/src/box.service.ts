import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxInvitations,
  boxMemberships,
  boxes,
  friendships,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  Box,
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  BoxMember,
  BoxRole,
  UserId,
} from '@paldora/domain';
import { normalizeUsername } from '@paldora/validation';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error.js';
import { isUniqueViolation } from './database-errors.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class BoxService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async list(userId: UserId): Promise<Box[]> {
    const activeMembers = alias(boxMemberships, 'active_box_members');
    const rows = await this.database
      .select({
        box: boxes,
        role: boxMemberships.role,
        memberCount: count(activeMembers.userId),
      })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .leftJoin(
        activeMembers,
        and(
          eq(activeMembers.boxId, boxes.id),
          eq(activeMembers.status, 'active'),
        ),
      )
      .where(
        and(
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .groupBy(boxes.id, boxMemberships.role);
    return rows.map(({ box, role, memberCount }) =>
      this.mapBox(box, role, memberCount),
    );
  }

  public async create(userId: UserId, name: string): Promise<Box> {
    const cleanName = name.trim();
    const slug = this.createSlug(cleanName);
    const created = await this.database.transaction(async (transaction) => {
      const [box] = await transaction
        .insert(boxes)
        .values({ name: cleanName, slug, ownerUserId: userId })
        .returning();
      if (!box) throw new Error('Box insert did not return a row.');
      await transaction.insert(boxMemberships).values({
        boxId: box.id,
        userId,
        role: 'owner',
      });
      return box;
    });
    return this.mapBox(created, 'owner', 1);
  }

  public async get(userId: UserId, boxId: BoxId): Promise<Box> {
    const activeMembers = alias(boxMemberships, 'active_box_members');
    const [row] = await this.database
      .select({
        box: boxes,
        role: boxMemberships.role,
        memberCount: count(activeMembers.userId),
      })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .leftJoin(
        activeMembers,
        and(
          eq(activeMembers.boxId, boxes.id),
          eq(activeMembers.status, 'active'),
        ),
      )
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .groupBy(boxes.id, boxMemberships.role)
      .limit(1);
    if (!row) this.notFound();
    return this.mapBox(row.box, row.role, row.memberCount);
  }

  public async update(
    userId: UserId,
    boxId: BoxId,
    input: {
      name?: string | undefined;
      status?: 'active' | 'archived' | undefined;
    },
  ): Promise<Box> {
    const membership = await this.requireMembership(userId, boxId);
    if (membership.role !== 'owner')
      this.forbidden('Only the owner can edit this Box.');
    const [box] = await this.database
      .update(boxes)
      .set({
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(boxes.id, boxId))
      .returning();
    if (!box) this.notFound();
    const [{ value: memberCount } = { value: 0 }] = await this.database
      .select({ value: count() })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return this.mapBox(box, 'owner', memberCount);
  }

  public async deleteBox(
    userId: UserId,
    boxId: BoxId,
  ): Promise<{ success: true }> {
    const membership = await this.requireMembership(userId, boxId);
    if (membership.role !== 'owner') {
      this.forbidden('Only the Box owner can permanently delete this Box.');
    }
    const [deleted] = await this.database
      .delete(boxes)
      .where(and(eq(boxes.id, boxId), eq(boxes.ownerUserId, userId)))
      .returning({ id: boxes.id });
    if (!deleted) this.notFound();
    return { success: true };
  }

  public async members(userId: UserId, boxId: BoxId): Promise<BoxMember[]> {
    await this.requireMembership(userId, boxId);
    const rows = await this.database
      .select({ membership: boxMemberships, profile: profiles })
      .from(boxMemberships)
      .innerJoin(profiles, eq(profiles.userId, boxMemberships.userId))
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return rows.map(({ membership, profile }) => ({
      userId: membership.userId as UserId,
      username: profile.username ?? '',
      displayName: profile.displayName ?? profile.username ?? 'Paldora member',
      avatarUrl: null,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt.toISOString(),
    }));
  }

  public async invite(
    userId: UserId,
    boxId: BoxId,
    username: string,
  ): Promise<BoxInvitation> {
    const membership = await this.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(membership.role)) {
      this.forbidden('Only Box owners and admins can invite members.');
    }
    const [box] = await this.database
      .select()
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .limit(1);
    if (!box) this.notFound();
    if (box.status !== 'active') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'BOX_ARCHIVED',
        'Archived Boxes cannot accept new invitations.',
      );
    }
    const invitee = await this.userByUsername(username);
    if (invitee.userId === userId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_INVITE_SELF',
        'You are already in this Box.',
      );
    }
    const [existingMember] = await this.database
      .select({ status: boxMemberships.status })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, invitee.userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (existingMember) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ALREADY_BOX_MEMBER',
        'That person is already in this Box.',
      );
    }
    await this.requireInteractionAllowed(userId, invitee.userId);
    await this.database
      .update(boxInvitations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(boxInvitations.boxId, boxId),
          eq(boxInvitations.inviteeUserId, invitee.userId),
          eq(boxInvitations.status, 'pending'),
          sql`${boxInvitations.expiresAt} <= now()`,
        ),
      );
    try {
      const [invitation] = await this.database
        .insert(boxInvitations)
        .values({
          boxId,
          inviterUserId: userId,
          inviteeUserId: invitee.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
        })
        .returning();
      if (!invitation)
        throw new Error('Invitation insert did not return a row.');
      return this.mapInvitation(invitation, box.name);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'INVITATION_ALREADY_PENDING',
          'An invitation is already pending.',
        );
      }
      throw error;
    }
  }

  public async pendingInviteeIds(
    userId: UserId,
    boxId: BoxId,
  ): Promise<{ inviteeUserIds: UserId[] }> {
    const membership = await this.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(membership.role)) {
      this.forbidden('Only Box owners and admins can view invitations.');
    }
    const invitations = await this.database
      .select({ inviteeUserId: boxInvitations.inviteeUserId })
      .from(boxInvitations)
      .where(
        and(
          eq(boxInvitations.boxId, boxId),
          eq(boxInvitations.status, 'pending'),
          gt(boxInvitations.expiresAt, new Date()),
        ),
      );
    return {
      inviteeUserIds: invitations.map(
        ({ inviteeUserId }) => inviteeUserId as UserId,
      ),
    };
  }

  public async invitations(userId: UserId): Promise<BoxInvitation[]> {
    const rows = await this.database
      .select({ invitation: boxInvitations, boxName: boxes.name })
      .from(boxInvitations)
      .innerJoin(boxes, eq(boxes.id, boxInvitations.boxId))
      .where(
        and(
          eq(boxInvitations.inviteeUserId, userId),
          eq(boxInvitations.status, 'pending'),
          gt(boxInvitations.expiresAt, new Date()),
          eq(boxes.status, 'active'),
        ),
      );
    return rows.map(({ invitation, boxName }) =>
      this.mapInvitation(invitation, boxName),
    );
  }

  public async respondToInvitation(
    userId: UserId,
    invitationId: BoxInvitationId,
    response: 'accepted' | 'declined',
  ): Promise<{ status: 'accepted' | 'declined' }> {
    const [invitation] = await this.database
      .select()
      .from(boxInvitations)
      .where(
        and(
          eq(boxInvitations.id, invitationId),
          eq(boxInvitations.inviteeUserId, userId),
          eq(boxInvitations.status, 'pending'),
        ),
      )
      .limit(1);
    if (!invitation) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'INVITATION_NOT_FOUND',
        'That invitation is unavailable.',
      );
    }
    if (invitation.expiresAt <= new Date()) {
      await this.database
        .update(boxInvitations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(boxInvitations.id, invitation.id));
      throw new ApiError(
        HttpStatus.GONE,
        'INVITATION_EXPIRED',
        'That invitation has expired.',
      );
    }
    if (response === 'accepted') {
      const [box] = await this.database
        .select({ status: boxes.status })
        .from(boxes)
        .where(eq(boxes.id, invitation.boxId))
        .limit(1);
      if (!box || box.status !== 'active') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'BOX_ARCHIVED',
          'That Box is not accepting members.',
        );
      }
      await this.requireInteractionAllowed(
        invitation.inviterUserId as UserId,
        userId,
      );
    }
    await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(boxInvitations)
        .set({
          status: response,
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(boxInvitations.id, invitation.id),
            eq(boxInvitations.status, 'pending'),
          ),
        )
        .returning({ id: boxInvitations.id });
      if (!updated)
        throw new ApiError(
          HttpStatus.CONFLICT,
          'INVITATION_ALREADY_HANDLED',
          'That invitation was already handled.',
        );
      if (response === 'accepted') {
        await transaction
          .insert(boxMemberships)
          .values({
            boxId: invitation.boxId,
            userId,
            role: 'member',
            status: 'active',
          })
          .onConflictDoUpdate({
            target: [boxMemberships.boxId, boxMemberships.userId],
            set: {
              role: 'member',
              status: 'active',
              joinedAt: new Date(),
              updatedAt: new Date(),
            },
          });
      }
    });
    return { status: response };
  }

  public async updateMemberRole(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
    role: 'admin' | 'member',
  ): Promise<{ role: 'admin' | 'member' }> {
    const actor = await this.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(actor.role)) {
      this.forbidden('Only Box owners and admins can promote members.');
    }
    const [target] = await this.database
      .select({ role: boxMemberships.role })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, memberUserId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!target) this.memberNotFound();
    if (target.role === 'owner') {
      this.forbidden('The Box creator role cannot be changed.');
    }
    if (
      actor.role === 'admin' &&
      (role !== 'admin' || target.role !== 'member')
    ) {
      this.forbidden('Admins can promote members but cannot demote admins.');
    }
    const [updated] = await this.database
      .update(boxMemberships)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, memberUserId),
          eq(boxMemberships.status, 'active'),
          eq(boxMemberships.role, target.role),
        ),
      )
      .returning({ role: boxMemberships.role });
    if (!updated) this.memberNotFound();
    return { role };
  }

  public async transferOwnership(
    userId: UserId,
    boxId: BoxId,
    newOwnerUserId: UserId,
  ): Promise<{ ownerUserId: UserId }> {
    if (userId === newOwnerUserId) {
      this.forbidden('You already own this Box.');
    }
    await this.database.transaction(async (transaction) => {
      const [actor] = await transaction
        .select({ role: boxMemberships.role })
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, userId),
            eq(boxMemberships.status, 'active'),
          ),
        )
        .limit(1);
      if (actor?.role !== 'owner') {
        this.forbidden('Only the Box owner can transfer ownership.');
      }
      const [target] = await transaction
        .select({ role: boxMemberships.role })
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, newOwnerUserId),
            eq(boxMemberships.status, 'active'),
          ),
        )
        .limit(1);
      if (!target || target.role === 'owner') this.memberNotFound();

      const [formerOwner] = await transaction
        .update(boxMemberships)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, userId),
            eq(boxMemberships.status, 'active'),
            eq(boxMemberships.role, 'owner'),
          ),
        )
        .returning({ userId: boxMemberships.userId });
      if (!formerOwner) {
        this.forbidden('Box ownership changed before this request completed.');
      }
      const [newOwner] = await transaction
        .update(boxMemberships)
        .set({ role: 'owner', updatedAt: new Date() })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, newOwnerUserId),
            eq(boxMemberships.status, 'active'),
            eq(boxMemberships.role, target.role),
          ),
        )
        .returning({ userId: boxMemberships.userId });
      if (!newOwner) this.memberNotFound();
      const [box] = await transaction
        .update(boxes)
        .set({ ownerUserId: newOwnerUserId, updatedAt: new Date() })
        .where(and(eq(boxes.id, boxId), eq(boxes.ownerUserId, userId)))
        .returning({ id: boxes.id });
      if (!box) this.notFound();
    });
    return { ownerUserId: newOwnerUserId };
  }

  public async removeMember(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
  ): Promise<{ success: true; status: 'left' | 'removed' }> {
    const actor = await this.requireMembership(userId, boxId);
    const [target] = await this.database
      .select({ role: boxMemberships.role })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, memberUserId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!target) this.memberNotFound();
    const leaving = userId === memberUserId;
    if (target.role === 'owner') {
      this.forbidden(
        leaving
          ? 'Transfer ownership to another member before leaving this Box.'
          : 'The Box creator cannot be removed.',
      );
    }
    if (!leaving && !['owner', 'admin'].includes(actor.role)) {
      this.forbidden('Only Box owners and admins can remove members.');
    }
    const status = leaving ? 'left' : 'removed';
    const [updated] = await this.database
      .update(boxMemberships)
      .set({ status, role: 'member', updatedAt: new Date() })
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, memberUserId),
          eq(boxMemberships.status, 'active'),
          eq(boxMemberships.role, target.role),
        ),
      )
      .returning({ userId: boxMemberships.userId });
    if (!updated) this.memberNotFound();
    return { success: true, status };
  }

  private async requireMembership(userId: UserId, boxId: BoxId) {
    const [membership] = await this.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!membership) this.notFound();
    return membership;
  }

  private async requireInteractionAllowed(first: UserId, second: UserId) {
    const low = first < second ? first : second;
    const high = first < second ? second : first;
    const [friendship] = await this.database
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      )
      .limit(1);
    if (friendship?.status === 'blocked')
      this.forbidden('This interaction is not available.');
  }

  private async userByUsername(username: string): Promise<{ userId: UserId }> {
    const [profile] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(profiles.usernameNormalized, normalizeUsername(username)),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    if (!profile)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'No person with that username was found.',
      );
    return { userId: profile.userId as UserId };
  }

  private mapBox(
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

  private mapInvitation(
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

  private createSlug(name: string): string {
    const base =
      name
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'box';
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'BOX_NOT_FOUND',
      'That Box is unavailable.',
    );
  }

  private forbidden(message: string): never {
    throw new ApiError(HttpStatus.FORBIDDEN, 'BOX_ACCESS_DENIED', message);
  }

  private memberNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'BOX_MEMBER_NOT_FOUND',
      'That member is unavailable.',
    );
  }
}
