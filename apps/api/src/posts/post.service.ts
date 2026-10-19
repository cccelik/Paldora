import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxes,
  mediaAssets,
  postMedia,
  posts,
  type DatabaseExecutor,
  type PaldoraDatabase,
} from '@paldora/database';
import type { NewPost, PostView } from '@paldora/validation';
import { and, eq, inArray } from 'drizzle-orm';
import { boxArchived } from '../boxes/box-errors.js';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { erasePostInteractions } from '../interactions/interaction-erasure.js';
import { mediaNotFound, mediaNotReady } from '../media/media-errors.js';
import { retireAssets } from '../media/media-retirement.js';
import { ApiError } from '../platform/api-error.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { loadPostContext } from './post-context.js';
import { postAccessDenied, postNotFound } from './post-errors.js';
import { PostQueryService } from './post-query.service.js';
import { toPostView } from './post-views.js';

const needsSomething = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'content: Write something or add a photo first.',
  );

@Injectable()
export class PostService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /**
   * The Box row is locked `FOR SHARE`, so archiving cannot slip in between.
   * Photos are claimed here, in the same transaction: each must be ready,
   * yours, from this Box, and not used by another post (a unique index makes
   * single use final, even against a race).
   */
  public async create(
    authorId: string,
    boxId: string,
    input: NewPost,
  ): Promise<PostView> {
    const text = input.content.trim();
    if (text.length === 0 && input.mediaAssetIds.length === 0) {
      throw needsSomething();
    }
    const created = await this.database
      .transaction(async (transaction) => {
        await this.policy.membership(authorId, boxId, transaction);
        const [box] = await transaction
          .select({ status: boxes.status })
          .from(boxes)
          .where(eq(boxes.id, boxId))
          .for('share')
          .limit(1);
        if (box?.status !== 'active') throw boxArchived();
        await this.assertPhotosUsable(
          transaction,
          authorId,
          boxId,
          input.mediaAssetIds,
        );
        const [post] = await transaction
          .insert(posts)
          .values({ boxId, authorUserId: authorId, content: text || null })
          .returning({ id: posts.id });
        if (!post) throw new Error('Post insert returned no row.');
        if (input.mediaAssetIds.length > 0) {
          await transaction.insert(postMedia).values(
            input.mediaAssetIds.map((mediaAssetId, position) => ({
              postId: post.id,
              mediaAssetId,
              position,
            })),
          );
        }
        return post;
      })
      .catch((error: unknown) => {
        // Two posts racing for one photo: the unique index picks the winner.
        if (isUniqueViolation(error, 'post_media_asset_unique'))
          throw mediaNotFound();
        throw error;
      });
    await this.announce('post.created', boxId, created.id);
    return this.view(authorId, created.id);
  }

  /** Every unusable photo looks the same: not yours, not here, or already used. */
  private async assertPhotosUsable(
    executor: DatabaseExecutor,
    authorId: string,
    boxId: string,
    ids: readonly string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const assets = await executor
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, [...ids]))
      .for('update');
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const attached = await executor
      .select({ id: postMedia.mediaAssetId })
      .from(postMedia)
      .where(inArray(postMedia.mediaAssetId, [...ids]));
    const used = new Set(attached.map((row) => row.id));
    const usable = ids.map((id) => {
      const asset = byId.get(id);
      const valid =
        asset !== undefined &&
        asset.ownerUserId === authorId &&
        asset.purpose === 'post_image' &&
        asset.boxId === boxId &&
        (asset.status === 'ready' ||
          asset.status === 'pending' ||
          asset.status === 'processing') &&
        !used.has(id);
      return valid ? asset : undefined;
    });
    if (usable.some((asset) => asset === undefined)) throw mediaNotFound();
    if (usable.some((asset) => asset?.status !== 'ready'))
      throw mediaNotReady();
  }

  public async update(
    viewerId: string,
    postId: string,
    content: string,
  ): Promise<PostView> {
    const { context, media } = await this.queries.get(viewerId, postId);
    this.assertMayChange(
      context.post.authorUserId,
      viewerId,
      context.boxStatus,
    );
    const text = content.trim();
    // A post may drop its text only if photos remain.
    if (text.length === 0 && media.length === 0) throw needsSomething();
    const changed = await this.database
      .update(posts)
      .set({
        content: text || null,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.authorUserId, viewerId),
          eq(posts.status, 'active'),
        ),
      )
      .returning({ id: posts.id });
    // Deleted between the read and the write: the post is gone.
    if (changed.length === 0) throw postNotFound();
    await this.announce('post.updated', context.post.boxId, postId);
    return this.view(viewerId, postId);
  }

  private async view(viewerId: string, postId: string): Promise<PostView> {
    const fresh = await this.queries.get(viewerId, postId);
    return toPostView(
      fresh.context,
      fresh.author,
      viewerId,
      fresh.media,
      fresh.interactions,
    );
  }

  /**
   * Idempotent for the author. The text is erased, the photos are retired,
   * and every comment, reaction, camera image, and notification on the post
   * is erased in one transaction, so nothing outlives its post.
   */
  public async remove(viewerId: string, postId: string): Promise<void> {
    const context = await loadPostContext(this.database, viewerId, postId);
    if (!context || context.hidden) throw postNotFound();
    if (context.post.status === 'deleted') {
      if (context.post.authorUserId === viewerId) return;
      throw postNotFound();
    }
    this.assertMayChange(
      context.post.authorUserId,
      viewerId,
      context.boxStatus,
    );
    await this.database.transaction(async (transaction) => {
      const [deleted] = await transaction
        .update(posts)
        .set({
          status: 'deleted',
          content: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(posts.id, postId), eq(posts.status, 'active')))
        .returning({ id: posts.id });
      if (!deleted) return;
      const photos = await transaction
        .select({ asset: mediaAssets })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
        .where(eq(postMedia.postId, postId))
        .for('update');
      await transaction.delete(postMedia).where(eq(postMedia.postId, postId));
      await retireAssets(
        transaction,
        photos.map((row) => row.asset),
      );
      await erasePostInteractions(transaction, postId);
    });
    await this.announce('post.deleted', context.post.boxId, postId);
  }

  /** After commit and best effort: the hint carries IDs, never content. */
  private announce(
    type: 'post.created' | 'post.updated' | 'post.deleted',
    boxId: string,
    postId: string,
  ): Promise<void> {
    return this.bus.publish(boxChannel(boxId), { type, boxId, postId });
  }

  private assertMayChange(
    authorId: string,
    viewerId: string,
    boxStatus: string,
  ): void {
    if (authorId !== viewerId) throw postAccessDenied();
    if (boxStatus !== 'active') throw boxArchived();
  }
}
