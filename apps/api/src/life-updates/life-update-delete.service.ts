import { Inject, Injectable } from '@nestjs/common';
import {
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  posts,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { erasePostInteractions } from '../interactions/interaction-erasure.js';
import { retireAssets } from '../media/media-retirement.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { LifeUpdatePolicyService } from './life-update-policy.service.js';
import type { Delivery } from './life-update-publish.service.js';

/**
 * Deleting removes the Life Update from every Box at once (there is no
 * per-delivery removal: that would be a back-door audience change). One
 * transaction tombstones every backing post, erases each delivery's
 * comments, reactions, camera images, and notifications, retires the photos
 * once, and tombstones the Life Update with its sections erased. A retry by
 * the author is a success.
 */
@Injectable()
export class LifeUpdateDeleteService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(LifeUpdatePolicyService)
    private readonly policy: LifeUpdatePolicyService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public async remove(viewerId: string, lifeUpdateId: string): Promise<void> {
    const removed = await this.database.transaction(async (transaction) => {
      const access = await this.policy.forAuthorWrite(
        transaction,
        viewerId,
        lifeUpdateId,
      );
      if (access.kind === 'deleted') return [];
      const deliveries = await this.tombstonePosts(transaction, lifeUpdateId);
      await erasePostInteractions(
        transaction,
        deliveries.map((delivery) => delivery.postId),
      );
      await this.retirePhotos(transaction, lifeUpdateId);
      const now = new Date();
      await transaction
        .update(lifeUpdates)
        .set({
          status: 'deleted',
          sections: {},
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(lifeUpdates.id, lifeUpdateId));
      return deliveries;
    });
    await Promise.all(
      removed.map(({ boxId, postId }) =>
        this.bus.publish(boxChannel(boxId), {
          type: 'post.deleted',
          boxId,
          postId,
        }),
      ),
    );
  }

  /**
   * Locks every backing post `FOR UPDATE` before tombstoning it, so a
   * comment or reaction being written right now (which holds the post
   * `FOR SHARE`) either commits first and is erased below, or waits and
   * then finds the post gone.
   */
  private async tombstonePosts(
    transaction: DatabaseTransaction,
    lifeUpdateId: string,
  ): Promise<Delivery[]> {
    const backing = transaction
      .select({ postId: lifeUpdateDeliveries.postId })
      .from(lifeUpdateDeliveries)
      .where(
        and(
          eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId),
          isNotNull(lifeUpdateDeliveries.postId),
        ),
      );
    const rows = await transaction
      .select({ postId: posts.id, boxId: posts.boxId })
      .from(posts)
      .where(and(inArray(posts.id, backing), eq(posts.status, 'active')))
      .orderBy(posts.id)
      .for('update');
    if (rows.length === 0) return [];
    const now = new Date();
    await transaction
      .update(posts)
      .set({ status: 'deleted', content: null, deletedAt: now, updatedAt: now })
      .where(
        inArray(
          posts.id,
          rows.map((row) => row.postId),
        ),
      );
    return rows;
  }

  /** Each photo is stored once, so it is retired once for every Box. */
  private async retirePhotos(
    transaction: DatabaseTransaction,
    lifeUpdateId: string,
  ): Promise<void> {
    const linked = transaction
      .select({ id: lifeUpdateMedia.mediaAssetId })
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, lifeUpdateId));
    const photos = await transaction
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, linked))
      .for('update');
    await transaction
      .delete(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, lifeUpdateId));
    await retireAssets(transaction, photos);
  }
}
