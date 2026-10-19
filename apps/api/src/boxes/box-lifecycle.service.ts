import { Inject, Injectable } from '@nestjs/common';
import { boxMemberships, boxes, type PaldoraDatabase } from '@paldora/database';
import type { BoxView, UpdateBoxInput } from '@paldora/validation';
import { eq } from 'drizzle-orm';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxNotFound, deleteConfirmationMismatch } from './box-errors.js';
import { BoxPolicyService } from './box-policy.service.js';
import { loadBoxView, toBoxView } from './box-views.js';

@Injectable()
export class BoxLifecycleService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /** The Box and its owner membership appear together or not at all. */
  public create(ownerId: string, name: string): Promise<BoxView> {
    return this.database.transaction(async (transaction) => {
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
    await this.database.transaction(async (transaction) => {
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
      await transaction.delete(boxes).where(eq(boxes.id, boxId));
    });
  }
}
