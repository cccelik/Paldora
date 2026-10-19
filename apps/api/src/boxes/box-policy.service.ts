import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  type DatabaseExecutor,
} from '@paldora/database';
import {
  canManageMembers,
  type BoxRole,
  type BoxStatus,
} from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxAccessDenied, boxNotFound } from './box-errors.js';

export interface BoxMembership {
  readonly boxId: string;
  readonly userId: string;
  readonly role: BoxRole;
  readonly boxStatus: BoxStatus;
}

/**
 * The only place Box access is decided. Every Box route starts here, so
 * "not a member" is one code path that answers BOX_NOT_FOUND, whether the Box
 * never existed, was deleted, or the caller left, was removed, or was never in.
 */
@Injectable()
export class BoxPolicyService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
  ) {}

  /** The caller’s active membership, or BOX_NOT_FOUND. */
  public async membership(
    userId: string,
    boxId: string,
    executor: DatabaseExecutor = this.infrastructure.database,
  ): Promise<BoxMembership> {
    const [row] = await executor
      .select({ role: boxMemberships.role, boxStatus: boxes.status })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) throw boxNotFound();
    return { boxId, userId, role: row.role, boxStatus: row.boxStatus };
  }

  public async requireManager(
    userId: string,
    boxId: string,
    message: string,
    executor?: DatabaseExecutor,
  ): Promise<BoxMembership> {
    const membership = await this.membership(userId, boxId, executor);
    if (!canManageMembers(membership.role)) throw boxAccessDenied(message);
    return membership;
  }

  public async requireOwner(
    userId: string,
    boxId: string,
    message: string,
    executor?: DatabaseExecutor,
  ): Promise<BoxMembership> {
    const membership = await this.membership(userId, boxId, executor);
    if (membership.role !== 'owner') throw boxAccessDenied(message);
    return membership;
  }
}
