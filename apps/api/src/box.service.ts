import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxInvitations,
  boxMemberships,
  boxes,
  friendships,
  profiles,
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
import { and, count, eq, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error.js';
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
    const rows = await this.database
      .select({ box: boxes, membership: boxMemberships })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .where(
        and(
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return Promise.all(
      rows.map(async ({ box, membership }) =>
        this.mapBox(box, membership.role, await this.memberCount(box.id)),
      ),
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
    const membership = await this.requireMembership(userId, boxId);
    const [box] = await this.database
      .select()
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .limit(1);
    if (!box) this.notFound();
    return this.mapBox(box, membership.role, await this.memberCount(boxId));
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
    return this.mapBox(box, 'owner', await this.memberCount(boxId));
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
    await this.requireAcceptedFriendship(userId, invitee.userId);
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
    const [box] = await this.database
      .select()
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .limit(1);
    if (!box) this.notFound();
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
      if (this.isUniqueViolation(error)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'INVITATION_ALREADY_PENDING',
          'An invitation is already pending.',
        );
      }
      throw error;
    }
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
    if (actor.role !== 'owner')
      this.forbidden('Only the owner can change member roles.');
    const [updated] = await this.database
      .update(boxMemberships)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, memberUserId),
          eq(boxMemberships.status, 'active'),
          or(
            eq(boxMemberships.role, 'admin'),
            eq(boxMemberships.role, 'member'),
          ),
        ),
      )
      .returning({ role: boxMemberships.role });
    if (!updated)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'BOX_MEMBER_NOT_FOUND',
        'That member is unavailable.',
      );
    return { role };
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

  private async requireAcceptedFriendship(first: UserId, second: UserId) {
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
    if (friendship?.status !== 'accepted') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'FRIENDSHIP_REQUIRED',
        'Add this person as a friend before inviting them.',
      );
    }
  }

  private async userByUsername(username: string): Promise<{ userId: UserId }> {
    const [profile] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.usernameNormalized, normalizeUsername(username)))
      .limit(1);
    if (!profile)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'No person with that username was found.',
      );
    return { userId: profile.userId as UserId };
  }

  private async memberCount(boxId: string): Promise<number> {
    const [result] = await this.database
      .select({ value: count() })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return result?.value ?? 0;
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

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    if ('code' in error && error.code === '23505') return true;
    return (
      'cause' in error &&
      typeof error.cause === 'object' &&
      error.cause !== null &&
      'code' in error.cause &&
      error.cause.code === '23505'
    );
  }
}
