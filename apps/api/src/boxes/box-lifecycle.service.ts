import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  mediaAssets,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BoxView, UpdateBoxInput } from '@paldora/validation';
import { and, eq, ne } from 'drizzle-orm';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { retireAssets } from '../media/media-retirement.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { RealtimeBus } from '../realtime/realtime-bus.js';
import { boxNotFound, deleteConfirmationMismatch } from './box-errors.js';
import { BoxPolicyService } from './box-policy.service.js';
import { loadBoxView, toBoxView } from './box-views.js';

@Injectable()
export class BoxLifecycleService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /** The Box and its owner membership appear together or not at all. */
  public async create(ownerId: string, name: string): Promise<BoxView> {
    const view = await this.database.transaction(async (transaction) => {
      const [box] = await transaction
        .insert(boxes)
        .values({ name })
        .returning();
      if (!box) throw new Error('Box insert returned no row.');
      await transaction
        .insert(boxMemberships)
        .values({ boxId: box.id, userId: ownerId, role: 'owner' });
      return toBoxView(box, 'owner', 1);
    });
    await this.bus.membershipsChanged([ownerId]);
    return view;
  }

  public async update(
    ownerId: string,
    boxId: string,
    input: UpdateBoxInput,
  ): Promise<BoxView> {
    await this.policy.requireOwner(
      ownerId,
      boxId,
      'Only the owner can change this Box.',
    );
    await this.database
      .update(boxes)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(boxes.id, boxId));
    const view = await loadBoxView(this.database, boxId, 'owner');
    if (!view) throw boxNotFound();
    return view;
  }

  /**
   * Permanent. The owner must type the exact name. Phases that attach Box
   * content (posts, media) add their own cleanup here, writing storage
   * deletions to the media outbox in this same transaction.
   */
  public async remove(
    ownerId: string,
    boxId: string,
    confirmName: string,
  ): Promise<void> {
    const members = await this.database.transaction(async (transaction) => {
      await this.policy.requireOwner(
        ownerId,
        boxId,
        'Only the owner can delete this Box.',
        transaction,
      );
      const [box] = await transaction
        .select({ name: boxes.name })
        .from(boxes)
        .where(eq(boxes.id, boxId))
        .for('update')
        .limit(1);
      if (!box) throw boxNotFound();
      if (box.name !== confirmName) throw deleteConfirmationMismatch();
      const affected = await transaction
        .select({ userId: boxMemberships.userId })
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.boxId, boxId),
            eq(boxMemberships.status, 'active'),
          ),
        );
      // Photos live outside the database: queue their deletion first, while
      // the keys are still reachable, then let the Box cascade its rows.
      const photos = await transaction
        .select()
        .from(mediaAssets)
        .where(
          and(eq(mediaAssets.boxId, boxId), ne(mediaAssets.status, 'deleted')),
        )
        .for('update');
      await retireAssets(transaction, photos);
      await transaction.delete(boxes).where(eq(boxes.id, boxId));
      return affected.map((row) => row.userId);
    });
    // Everyone who was in the Box recomputes where they belong.
    await this.bus.membershipsChanged(members);
  }
}
