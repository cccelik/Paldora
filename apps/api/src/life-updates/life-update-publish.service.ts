import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  posts,
  type DatabaseExecutor,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import type { LifeUpdateView, NewLifeUpdate } from '@paldora/validation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { boxArchived, boxNotFound } from '../boxes/box-errors.js';
import { mediaNotFound } from '../media/media-errors.js';
import { assertPhotosUsable } from '../media/photo-claim.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { lifeUpdateNotFound } from './life-update-errors.js';
import { LifeUpdateViewService } from './life-update-view.service.js';

export interface Delivery {
  readonly boxId: string;
  readonly postId: string;
}

/** Photos another Life Update already claimed. */
export const usedByLifeUpdates = async (
  executor: DatabaseExecutor,
  ids: readonly string[],
): Promise<ReadonlySet<string>> => {
  const rows = await executor
    .select({ id: lifeUpdateMedia.mediaAssetId })
    .from(lifeUpdateMedia)
    .where(inArray(lifeUpdateMedia.mediaAssetId, [...ids]));
  return new Set(rows.map((row) => row.id));
};

/**
 * Publishing, in one transaction: audience check, photo claim, the Life
 * Update, one backing post and delivery per Box, and the photo links. Every
 * row takes its `created_at` from the transaction timestamp (`now()`), so
 * the update and all its backing posts share one instant, which keeps feed
 * dedupe and Memories buckets exact. Nothing is partly published.
 */
@Injectable()
export class LifeUpdatePublishService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(LifeUpdateViewService)
    private readonly views: LifeUpdateViewService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public async create(
    authorId: string,
    input: NewLifeUpdate,
  ): Promise<LifeUpdateView> {
    const boxIds = input.audience.type === 'boxes' ? input.audience.boxIds : [];
    const published = await this.database
      .transaction(async (transaction) => {
        await this.lockAudience(transaction, authorId, boxIds);
        await assertPhotosUsable(transaction, {
          ownerId: authorId,
          purpose: 'life_update_image',
          boxId: null,
          ids: input.mediaAssetIds,
          findUsed: usedByLifeUpdates,
        });
        const id = await this.insertUpdate(transaction, authorId, input);
        const deliveries = await this.insertDeliveries(
          transaction,
          { id, authorId },
          boxIds,
        );
        await this.insertMedia(transaction, id, input.mediaAssetIds);
        return { id, deliveries };
      })
      .catch((error: unknown) => {
        // Two publishes racing for one photo: the unique index decides.
        if (isUniqueViolation(error, 'life_update_media_asset_unique'))
          throw mediaNotFound();
        throw error;
      });
    await this.announce(published.deliveries);
    const view = (await this.views.byIds(authorId, [published.id])).views.get(
      published.id,
    );
    // Only if every Box was lost between commit and this read.
    if (!view) throw lifeUpdateNotFound();
    return view;
  }

  /**
   * Every Box must be one the author belongs to now (else BOX_NOT_FOUND,
   * never saying which), then all are locked `FOR SHARE` in ascending ID
   * order (no deadlock between concurrent publishes), so none can be
   * archived before commit. One archived Box fails the whole publish.
   */
  private async lockAudience(
    transaction: DatabaseTransaction,
    authorId: string,
    boxIds: readonly string[],
  ): Promise<void> {
    if (boxIds.length === 0) return;
    const memberships = await transaction
      .select({ boxId: boxMemberships.boxId })
      .from(boxMemberships)
      .where(
        and(
          inArray(boxMemberships.boxId, [...boxIds]),
          eq(boxMemberships.userId, authorId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    if (memberships.length !== boxIds.length) throw boxNotFound();
    const locked = await transaction
      .select({ id: boxes.id, status: boxes.status })
      .from(boxes)
      .where(inArray(boxes.id, [...boxIds]))
      .orderBy(asc(boxes.id))
      .for('share');
    if (locked.length !== boxIds.length) throw boxNotFound();
    if (locked.some((box) => box.status !== 'active')) throw boxArchived();
  }

  private async insertUpdate(
    transaction: DatabaseTransaction,
    authorId: string,
    input: NewLifeUpdate,
  ): Promise<string> {
    const [update] = await transaction
      .insert(lifeUpdates)
      .values({
        authorUserId: authorId,
        audience: input.audience.type,
        sections: input.sections,
      })
      .returning({ id: lifeUpdates.id });
    if (!update) throw new Error('Life Update insert returned no row.');
    return update.id;
  }

  /** One backing post per Box (no text of its own), then the deliveries. */
  private async insertDeliveries(
    transaction: DatabaseTransaction,
    update: { readonly id: string; readonly authorId: string },
    boxIds: readonly string[],
  ): Promise<Delivery[]> {
    if (boxIds.length === 0) {
      await transaction.insert(lifeUpdateDeliveries).values({
        lifeUpdateId: update.id,
        audience: 'only_me',
        authorUserId: update.authorId,
        position: 0,
      });
      return [];
    }
    const created = await transaction
      .insert(posts)
      .values(
        boxIds.map((boxId) => ({
          boxId,
          authorUserId: update.authorId,
          kind: 'life_update',
        })),
      )
      .returning({ id: posts.id, boxId: posts.boxId });
    const postByBox = new Map(created.map((post) => [post.boxId, post.id]));
    const deliveries = boxIds.map((boxId) => {
      const postId = postByBox.get(boxId);
      if (!postId) throw new Error('Backing post insert lost a Box.');
      return { boxId, postId };
    });
    await transaction.insert(lifeUpdateDeliveries).values(
      deliveries.map(({ boxId, postId }, position) => ({
        lifeUpdateId: update.id,
        audience: 'boxes' as const,
        authorUserId: update.authorId,
        position,
        boxId,
        postId,
      })),
    );
    return deliveries;
  }

  private async insertMedia(
    transaction: DatabaseTransaction,
    lifeUpdateId: string,
    mediaAssetIds: readonly string[],
  ): Promise<void> {
    if (mediaAssetIds.length === 0) return;
    await transaction.insert(lifeUpdateMedia).values(
      mediaAssetIds.map((mediaAssetId, position) => ({
        lifeUpdateId,
        mediaAssetId,
        position,
      })),
    );
  }

  /** After commit and best effort; IDs only. Only Me publishes nothing. */
  private async announce(deliveries: readonly Delivery[]): Promise<void> {
    await Promise.all(
      deliveries.map(({ boxId, postId }) =>
        this.bus.publish(boxChannel(boxId), {
          type: 'post.created',
          boxId,
          postId,
        }),
      ),
    );
  }
}
