import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxInvitations,
  boxMemberships,
  boxes,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  UserId,
} from '@paldora/domain';
import { and, eq, gt, sql } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { BoxAuthorizationPolicy } from './box-authorization-policy.service.js';
import { mapBoxInvitation } from './box-mappers.js';
import { isUniqueViolation } from './database-errors.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class BoxInvitationService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(BoxAuthorizationPolicy)
    private readonly policy: BoxAuthorizationPolicy,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async invite(
    userId: UserId,
    boxId: BoxId,
    username: string,
  ): Promise<BoxInvitation> {
    const membership = await this.policy.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(membership.role)) {
      this.policy.forbidden('Only Box owners and admins can invite members.');
    }
    const [box] = await this.database
      .select()
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .limit(1);
    if (!box) this.policy.notFound();
    if (box.status !== 'active') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'BOX_ARCHIVED',
        'Archived Boxes cannot accept new invitations.',
      );
    }
    const invitee = await this.policy.userByUsername(username);
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
    await this.policy.requireInteractionAllowed(userId, invitee.userId);
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
      if (!invitation) {
        throw new Error('Invitation insert did not return a row.');
      }
      return mapBoxInvitation(invitation, box.name);
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
    const membership = await this.policy.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(membership.role)) {
      this.policy.forbidden('Only Box owners and admins can view invitations.');
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
      mapBoxInvitation(invitation, boxName),
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
      await this.policy.requireInteractionAllowed(
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
      if (!updated) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'INVITATION_ALREADY_HANDLED',
          'That invitation was already handled.',
        );
      }
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
}
