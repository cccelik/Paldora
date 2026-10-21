import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  canManageMembers,
  mayChangeRole,
  mayRemoveMember,
  type BoxRole,
} from '@paldora/domain';
import type { BoxView } from '@paldora/validation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DATABASE } from '../platform/config/tokens.js';
import { RealtimeBus } from '../realtime/realtime-bus.js';
import {
  boxAccessDenied,
  boxMemberNotFound,
  boxNotFound,
  ownerCannotLeave,
} from './box-errors.js';
import { loadBoxView } from './box-views.js';

interface LockedMember {
  readonly userId: string;
  readonly role: BoxRole;
}

/**
 * Role changes, ownership transfer, and removal. Each decision happens after
 * locking the affected membership rows (in user-ID order, so two requests
 * cannot deadlock), which means two admins acting at once, or an owner
 * transferring while someone leaves, are decided one after the other.
 */
@Injectable()
export class BoxMemberService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private async lockActive(
    transaction: DatabaseTransaction,
    boxId: string,
    userIds: readonly string[],
  ): Promise<Map<string, LockedMember>> {
    const rows = await transaction
      .select({ userId: boxMemberships.userId, role: boxMemberships.role })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          inArray(boxMemberships.userId, [...userIds]),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .orderBy(asc(boxMemberships.userId))
      .for('update');
    return new Map(rows.map((row) => [row.userId, row]));
  }

  public changeRole(
    actorId: string,
    boxId: string,
    targetId: string,
    next: 'admin' | 'member',
  ): Promise<'admin' | 'member'> {
    return this.database.transaction(async (transaction) => {
      const members = await this.lockActive(transaction, boxId, [
        actorId,
        targetId,
      ]);
      const actor = members.get(actorId);
      if (!actor) throw boxNotFound();
      if (!canManageMembers(actor.role)) {
        throw boxAccessDenied('Only owners and admins can change roles.');
      }
      const target = members.get(targetId);
      if (!target) throw boxMemberNotFound();
      if (!mayChangeRole({ actor: actor.role, target: target.role, next })) {
        throw boxAccessDenied(
          target.role === 'owner'
            ? 'The owner’s role changes only by transferring ownership.'
            : 'Admins can promote members, but only the owner can demote admins.',
        );
      }
      await transaction
        .update(boxMemberships)
        .set({ role: next, updatedAt: new Date() })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, targetId),
          ),
        );
      return next;
    });
  }

  /** Atomic: the previous owner becomes an admin in the same transaction. */
  public transferOwnership(
    actorId: string,
    boxId: string,
    newOwnerId: string,
  ): Promise<BoxView> {
    return this.database.transaction(async (transaction) => {
      const members = await this.lockActive(transaction, boxId, [
        actorId,
        newOwnerId,
      ]);
      const actor = members.get(actorId);
      if (!actor) throw boxNotFound();
      if (actor.role !== 'owner') {
        throw boxAccessDenied('Only the owner can transfer ownership.');
      }
      if (newOwnerId === actorId) {
        throw boxAccessDenied('You already own this Box.');
      }
      if (!members.has(newOwnerId)) throw boxMemberNotFound();
      const now = new Date();
      // Demote first: the partial unique index allows one active owner.
      await transaction
        .update(boxMemberships)
        .set({ role: 'admin', updatedAt: now })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, actorId),
          ),
        );
      await transaction
        .update(boxMemberships)
        .set({ role: 'owner', updatedAt: now })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, newOwnerId),
          ),
        );
      const view = await loadBoxView(transaction, boxId, 'admin');
      if (!view) throw boxNotFound();
      return view;
    });
  }

  /** Leaving is removing yourself; the owner must transfer first. */
  public leave(userId: string, boxId: string): Promise<void> {
    return this.remove(userId, boxId, userId);
  }

  public async remove(
    actorId: string,
    boxId: string,
    targetId: string,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const members = await this.lockActive(transaction, boxId, [
        actorId,
        targetId,
      ]);
      const actor = members.get(actorId);
      if (!actor) throw boxNotFound();
      const leaving = actorId === targetId;
      if (leaving) {
        if (actor.role === 'owner') throw ownerCannotLeave();
      } else {
        const target = members.get(targetId);
        if (!canManageMembers(actor.role)) {
          throw boxAccessDenied('Only owners and admins can remove members.');
        }
        if (!target) throw boxMemberNotFound();
        if (!mayRemoveMember(actor.role, target.role)) {
          throw boxAccessDenied('The owner can’t be removed.');
        }
      }
      await transaction
        .update(boxMemberships)
        .set({
          status: leaving ? 'left' : 'removed',
          role: 'member',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.userId, targetId),
          ),
        );
    });
    await this.bus.membershipsChanged([targetId]);
  }
}
