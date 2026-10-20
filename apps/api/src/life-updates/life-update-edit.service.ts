import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  posts,
  type DatabaseExecutor,
  type DatabaseTransaction,
  type LifeUpdateRow,
  type PaldoraDatabase,
} from '@paldora/database';
import type { LifeUpdateChanges, LifeUpdateView } from '@paldora/validation';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { boxArchived } from '../boxes/box-errors.js';
import { mediaNotFound } from '../media/media-errors.js';
import { retireAssets } from '../media/media-retirement.js';
import { assertPhotosUsable } from '../media/photo-claim.js';
import { ApiError } from '../platform/api-error.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { mayEdit } from './life-update-access.js';
import { lifeUpdateNotFound } from './life-update-errors.js';
import { LifeUpdatePolicyService } from './life-update-policy.service.js';
import type { Delivery } from './life-update-publish.service.js';
import { LifeUpdateViewService } from './life-update-view.service.js';

const needsSomething = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'sections: Keep at least one section or photo.',
  );

/** Photos some other Life Update already claimed (this one's are fine). */
const usedElsewhere =
  (lifeUpdateId: string) =>
  async (
    executor: DatabaseExecutor,
    ids: readonly string[],
  ): Promise<ReadonlySet<string>> => {
    const rows = await executor
      .select({ id: lifeUpdateMedia.mediaAssetId })
      .from(lifeUpdateMedia)
      .where(
        and(
          inArray(lifeUpdateMedia.mediaAssetId, [...ids]),
          ne(lifeUpdateMedia.lifeUpdateId, lifeUpdateId),
        ),
      );
    return new Set(rows.map((row) => row.id));
  };

/**
 * Editing a published Life Update (plan decision 1): the author replaces
 * its sections, its photos, or both, and because the content is stored
 * once the change shows in every delivery. The audience and the publish
 * time never change (no field for them; triggers as a backstop). The row
 * lock taken by the policy serializes an edit with a delete or another
 * edit, so each sees the other's result.
 */
@Injectable()
export class LifeUpdateEditService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(LifeUpdatePolicyService)
    private readonly policy: LifeUpdatePolicyService,
    @Inject(LifeUpdateViewService)
    private readonly views: LifeUpdateViewService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public async update(
    viewerId: string,
    lifeUpdateId: string,
    changes: LifeUpdateChanges,
  ): Promise<LifeUpdateView> {
    const deliveries = await this.database
      .transaction(async (transaction) => {
        const access = await this.policy.forAuthorWrite(
          transaction,
          viewerId,
          lifeUpdateId,
        );
        // A deleted Life Update cannot be edited, even by its author.
        if (access.kind === 'deleted') throw lifeUpdateNotFound();
        // Decision 2: open while Only Me or one of its Boxes is not archived.
        if (!mayEdit(access.update, viewerId, access.contexts)) {
          throw boxArchived();
        }
        await this.assertSomethingLeft(transaction, access.update, changes);
        if (changes.mediaAssetIds !== undefined) {
          await this.replacePhotos(
            transaction,
            access.update,
            changes.mediaAssetIds,
          );
        }
        const now = new Date();
        await transaction
          .update(lifeUpdates)
          .set({
            ...(changes.sections !== undefined
              ? { sections: changes.sections }
              : {}),
            editedAt: now,
            updatedAt: now,
          })
          .where(eq(lifeUpdates.id, lifeUpdateId));
        return this.deliveriesOf(transaction, lifeUpdateId);
      })
      .catch((error: unknown) => {
        // Two edits or publishes racing for one photo: the index decides.
        if (isUniqueViolation(error, 'life_update_media_asset_unique'))
          throw mediaNotFound();
        throw error;
      });
    await this.announce(deliveries);
    const view = (await this.views.byIds(viewerId, [lifeUpdateId])).views.get(
      lifeUpdateId,
    );
    // Only if the author lost every Box between commit and this read.
    if (!view) throw lifeUpdateNotFound();
    return view;
  }

  /** The result must keep at least one section or photo. */
  private async assertSomethingLeft(
    transaction: DatabaseTransaction,
    update: LifeUpdateRow,
    changes: LifeUpdateChanges,
  ): Promise<void> {
    const sections = changes.sections ?? update.sections;
    if (Object.keys(sections).length > 0) return;
    if (changes.mediaAssetIds !== undefined) {
      if (changes.mediaAssetIds.length > 0) return;
      throw needsSomething();
    }
    const [linked] = await transaction
      .select({ value: count() })
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, update.id));
    if ((linked?.value ?? 0) === 0) throw needsSomething();
  }

  /**
   * The photo list becomes `next`, in order. Every photo in it (kept or new)
   * is locked and checked like at publish time; photos dropped from it are
   * locked, unlinked, and retired with their storage cleanup queued. All
   * positions are rewritten (delete, then insert, because of the PK).
   */
  private async replacePhotos(
    transaction: DatabaseTransaction,
    update: LifeUpdateRow,
    next: readonly string[],
  ): Promise<void> {
    await assertPhotosUsable(transaction, {
      ownerId: update.authorUserId,
      purpose: 'life_update_image',
      boxId: null,
      ids: next,
      findUsed: usedElsewhere(update.id),
    });
    const current = await transaction
      .select({ id: lifeUpdateMedia.mediaAssetId })
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, update.id));
    const keep = new Set(next);
    const dropped = current.map((row) => row.id).filter((id) => !keep.has(id));
    const retiring =
      dropped.length === 0
        ? []
        : await transaction
            .select()
            .from(mediaAssets)
            .where(inArray(mediaAssets.id, dropped))
            .orderBy(mediaAssets.id)
            .for('update');
    await transaction
      .delete(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, update.id));
    if (next.length > 0) {
      await transaction.insert(lifeUpdateMedia).values(
        next.map((mediaAssetId, position) => ({
          lifeUpdateId: update.id,
          mediaAssetId,
          position,
        })),
      );
    }
    await retireAssets(
      transaction,
      retiring.filter((asset) => asset.status !== 'deleted'),
    );
  }

  /** Every Box delivery still live, whoever can see it. */
  private deliveriesOf(
    transaction: DatabaseTransaction,
    lifeUpdateId: string,
  ): Promise<Delivery[]> {
    return transaction
      .select({ boxId: posts.boxId, postId: posts.id })
      .from(lifeUpdateDeliveries)
      .innerJoin(
        posts,
        and(
          eq(posts.id, lifeUpdateDeliveries.postId),
          eq(posts.status, 'active'),
        ),
      )
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId));
  }

  /** After commit and best effort; IDs only. Only Me publishes nothing. */
  private async announce(deliveries: readonly Delivery[]): Promise<void> {
    await Promise.all(
      deliveries.map(({ boxId, postId }) =>
        this.bus.publish(boxChannel(boxId), {
          type: 'post.updated',
          boxId,
          postId,
        }),
      ),
    );
  }
}
