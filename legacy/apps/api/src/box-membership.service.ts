import { Inject, Injectable } from '@nestjs/common';
import { boxMemberships, boxes, type PaldoraDatabase } from '@paldora/database';
import type { BoxId, UserId } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import { BoxAuthorizationPolicy } from './box-authorization-policy.service.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class BoxMembershipService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(BoxAuthorizationPolicy)
    private readonly policy: BoxAuthorizationPolicy,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async updateMemberRole(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
    role: 'admin' | 'member',
  ): Promise<{ role: 'admin' | 'member' }> {
    const actor = await this.policy.requireMembership(userId, boxId);
    if (!['owner', 'admin'].includes(actor.role)) {
      this.policy.forbidden('Only Box owners and admins can promote members.');
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
    if (!target) this.policy.memberNotFound();
    if (target.role === 'owner') {
      this.policy.forbidden('The Box creator role cannot be changed.');
    }
    if (
      actor.role === 'admin' &&
      (role !== 'admin' || target.role !== 'member')
    ) {
      this.policy.forbidden(
        'Admins can promote members but cannot demote admins.',
      );
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
    if (!updated) this.policy.memberNotFound();
    return { role };
  }

  public async transferOwnership(
    userId: UserId,
    boxId: BoxId,
    newOwnerUserId: UserId,
  ): Promise<{ ownerUserId: UserId }> {
    if (userId === newOwnerUserId) {
      this.policy.forbidden('You already own this Box.');
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
        this.policy.forbidden('Only the Box owner can transfer ownership.');
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
      if (!target || target.role === 'owner') this.policy.memberNotFound();

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
        this.policy.forbidden(
          'Box ownership changed before this request completed.',
        );
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
      if (!newOwner) this.policy.memberNotFound();
      const [box] = await transaction
        .update(boxes)
        .set({ ownerUserId: newOwnerUserId, updatedAt: new Date() })
        .where(and(eq(boxes.id, boxId), eq(boxes.ownerUserId, userId)))
        .returning({ id: boxes.id });
      if (!box) this.policy.notFound();
    });
    return { ownerUserId: newOwnerUserId };
  }

  public async removeMember(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
  ): Promise<{ success: true; status: 'left' | 'removed' }> {
    const actor = await this.policy.requireMembership(userId, boxId);
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
    if (!target) this.policy.memberNotFound();
    const leaving = userId === memberUserId;
    if (target.role === 'owner') {
      this.policy.forbidden(
        leaving
          ? 'Transfer ownership to another member before leaving this Box.'
          : 'The Box creator cannot be removed.',
      );
    }
    if (!leaving && !['owner', 'admin'].includes(actor.role)) {
      this.policy.forbidden('Only Box owners and admins can remove members.');
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
    if (!updated) this.policy.memberNotFound();
    return { success: true, status };
  }
}
