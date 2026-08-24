import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  activityEvents,
  boxMemberships,
  boxes,
  friendships,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  mediaJobOutbox,
  posts,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  BoxId,
  CreateLifeUpdateInput,
  LifeUpdate,
  LifeUpdateId,
  LifeUpdatePage,
  MediaAssetId,
  PostId,
  UpdateLifeUpdateInput,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { normalizeUsername } from '@paldora/validation';
import { and, desc, eq, inArray, lt, notExists, or } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import { mediaDeletionOutboxEntry } from './media-job-outbox.js';
import { decodePostCursor, encodePostCursor } from './post-cursor.js';
import { ProfileAvatarService } from './profile-avatar.service.js';
import {
  PostInteractionQueryService,
  emptyPostInteractionSummary,
} from './post-interaction-query.js';
import {
  POST_EVENT_PUBLISHER,
  type PostEventPublisher,
} from './post-event.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';

@Injectable()
export class LifeUpdateService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
    @Inject(PostInteractionQueryService)
    private readonly interactions: PostInteractionQueryService,
    @Inject(POST_EVENT_PUBLISHER) private readonly events: PostEventPublisher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async create(
    userId: UserId,
    input: CreateLifeUpdateInput,
  ): Promise<LifeUpdate> {
    const boxIds = input.audience.type === 'boxes' ? input.audience.boxIds : [];
    const mediaIds = input.mediaAssetIds ?? [];
    const created = await this.database.transaction(async (tx) => {
      if (boxIds.length > 0) await this.assertWritableBoxes(tx, userId, boxIds);
      if (mediaIds.length > 0) await this.assertMedia(tx, userId, mediaIds);
      const [master] = await tx
        .insert(lifeUpdates)
        .values({ authorUserId: userId, sections: input.sections })
        .returning({ id: lifeUpdates.id });
      if (!master) throw new Error('Life Update insert returned no row.');
      const deliveries =
        input.audience.type === 'only_me'
          ? [{ audience: 'only_me' as const, boxId: null }]
          : boxIds.map((boxId) => ({ audience: 'box' as const, boxId }));
      const insertedPosts = await tx
        .insert(posts)
        .values(
          deliveries.map(({ boxId }) => ({
            boxId,
            authorUserId: userId,
            content: '',
          })),
        )
        .returning({ id: posts.id, boxId: posts.boxId });
      await tx.insert(lifeUpdateDeliveries).values(
        insertedPosts.map((post, index) => ({
          postId: post.id,
          lifeUpdateId: master.id,
          audience: deliveries[index]?.audience ?? 'box',
          boxId: post.boxId,
        })),
      );
      await tx.insert(activityEvents).values({
        type: 'life_update.published',
        actorUserId: userId,
        dedupeKey: `life-update:${master.id}:published`,
        payload: {
          lifeUpdateId: master.id,
          boxIds: boxIds,
        },
      });
      if (mediaIds.length > 0)
        await tx.insert(lifeUpdateMedia).values(
          mediaIds.map((mediaAssetId, position) => ({
            mediaAssetId,
            lifeUpdateId: master.id,
            position,
          })),
        );
      return { id: master.id as LifeUpdateId, deliveries: insertedPosts };
    });
    await Promise.all(
      created.deliveries
        .filter((item) => item.boxId)
        .map((item) =>
          this.events.publish({
            action: 'created',
            boxId: item.boxId as BoxId,
            postId: item.id as PostId,
          }),
        ),
    );
    return this.get(userId, created.id);
  }

  public async get(userId: UserId, id: LifeUpdateId): Promise<LifeUpdate> {
    const [master] = await this.database
      .select({ update: lifeUpdates, profile: profiles })
      .from(lifeUpdates)
      .innerJoin(profiles, eq(profiles.userId, lifeUpdates.authorUserId))
      .where(
        and(
          eq(lifeUpdates.id, id),
          eq(lifeUpdates.status, 'active'),
          this.notBlockedFromAuthor(userId),
        ),
      )
      .limit(1);
    if (!master) this.notFound();
    const allContexts = await this.database
      .select({ delivery: lifeUpdateDeliveries, boxName: boxes.name })
      .from(lifeUpdateDeliveries)
      .leftJoin(boxes, eq(boxes.id, lifeUpdateDeliveries.boxId))
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, id));
    const owned = master.update.authorUserId === userId;
    const boxIds = allContexts.flatMap(({ delivery }) =>
      delivery.boxId ? [delivery.boxId] : [],
    );
    const memberships =
      boxIds.length === 0
        ? []
        : await this.database
            .select({ boxId: boxMemberships.boxId })
            .from(boxMemberships)
            .where(
              and(
                eq(boxMemberships.userId, userId),
                eq(boxMemberships.status, 'active'),
                inArray(boxMemberships.boxId, boxIds),
              ),
            );
    const visible = new Set(memberships.map(({ boxId }) => boxId));
    const contexts = allContexts.filter(
      ({ delivery }) =>
        (delivery.audience === 'only_me' && owned) ||
        (delivery.boxId && visible.has(delivery.boxId)),
    );
    if (contexts.length === 0) this.notFound();
    const postIds = contexts
      .filter(({ delivery }) => delivery.audience === 'box')
      .map(({ delivery }) => delivery.postId as PostId);
    const summaries = await this.interactions.load(userId, postIds);
    const media = await this.loadMedia(id);
    const avatarUrl = await this.avatars.forUsers([
      master.update.authorUserId as UserId,
    ]);
    return {
      id,
      author: {
        userId: master.update.authorUserId as UserId,
        username: master.profile.username ?? '',
        displayName:
          master.profile.displayName ??
          master.profile.username ??
          'Paldora member',
        avatarUrl: avatarUrl.get(master.update.authorUserId as UserId) ?? null,
      },
      sections: master.update.sections,
      media,
      contexts: contexts
        .map(({ delivery, boxName }) => ({
          postId: delivery.postId as PostId,
          audience: delivery.audience,
          boxId: delivery.boxId as BoxId | null,
          boxName,
          interactions:
            delivery.audience === 'box'
              ? (summaries.get(delivery.postId) ??
                emptyPostInteractionSummary())
              : emptyPostInteractionSummary(),
        }))
        .sort((a, b) => (a.boxName ?? '').localeCompare(b.boxName ?? '')),
      createdAt: master.update.createdAt.toISOString(),
      updatedAt: master.update.updatedAt.toISOString(),
    };
  }

  public async listMine(
    userId: UserId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<LifeUpdatePage> {
    const cursorCondition = this.cursorCondition(input.cursor);
    const rows = await this.database
      .selectDistinct({ id: lifeUpdates.id, createdAt: lifeUpdates.createdAt })
      .from(lifeUpdates)
      .innerJoin(
        lifeUpdateDeliveries,
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
      )
      .leftJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, lifeUpdateDeliveries.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(lifeUpdates.authorUserId, userId),
          eq(lifeUpdates.status, 'active'),
          or(
            and(
              eq(lifeUpdateDeliveries.audience, 'only_me'),
              eq(lifeUpdates.authorUserId, userId),
            ),
            eq(boxMemberships.userId, userId),
          ),
          cursorCondition,
        ),
      )
      .orderBy(desc(lifeUpdates.createdAt), desc(lifeUpdates.id))
      .limit(input.limit + 1);
    return this.mapPage(userId, rows, input.limit);
  }

  public async listFeed(
    userId: UserId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<LifeUpdatePage> {
    const cursorCondition = this.cursorCondition(input.cursor);
    const rows = await this.database
      .selectDistinct({ id: lifeUpdates.id, createdAt: lifeUpdates.createdAt })
      .from(lifeUpdates)
      .innerJoin(
        lifeUpdateDeliveries,
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
      )
      .leftJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, lifeUpdateDeliveries.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(lifeUpdates.status, 'active'),
          or(
            and(
              eq(lifeUpdateDeliveries.audience, 'only_me'),
              eq(lifeUpdates.authorUserId, userId),
            ),
            eq(boxMemberships.userId, userId),
          ),
          this.notBlockedFromAuthor(userId),
          cursorCondition,
        ),
      )
      .orderBy(desc(lifeUpdates.createdAt), desc(lifeUpdates.id))
      .limit(input.limit + 1);
    return this.mapPage(userId, rows, input.limit);
  }

  public async listBox(
    userId: UserId,
    boxId: BoxId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<LifeUpdatePage> {
    await this.requireMembership(userId, boxId);
    const rows = await this.database
      .select({ id: lifeUpdates.id, createdAt: lifeUpdates.createdAt })
      .from(lifeUpdates)
      .innerJoin(
        lifeUpdateDeliveries,
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
      )
      .where(
        and(
          eq(lifeUpdateDeliveries.boxId, boxId),
          eq(lifeUpdates.status, 'active'),
          this.notBlockedFromAuthor(userId),
          this.cursorCondition(input.cursor),
        ),
      )
      .orderBy(desc(lifeUpdates.createdAt), desc(lifeUpdates.id))
      .limit(input.limit + 1);
    return this.mapPage(userId, rows, input.limit);
  }

  public async listUser(
    userId: UserId,
    username: string,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<LifeUpdatePage> {
    const [profile] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.usernameNormalized, normalizeUsername(username)))
      .limit(1);
    if (!profile) this.notFound();
    const rows = await this.database
      .selectDistinct({ id: lifeUpdates.id, createdAt: lifeUpdates.createdAt })
      .from(lifeUpdates)
      .innerJoin(
        lifeUpdateDeliveries,
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
      )
      .leftJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, lifeUpdateDeliveries.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(lifeUpdates.authorUserId, profile.userId),
          eq(lifeUpdates.status, 'active'),
          or(
            and(
              eq(lifeUpdateDeliveries.audience, 'only_me'),
              eq(lifeUpdates.authorUserId, userId),
            ),
            eq(boxMemberships.userId, userId),
          ),
          this.notBlockedFromAuthor(userId),
          this.cursorCondition(input.cursor),
        ),
      )
      .orderBy(desc(lifeUpdates.id))
      .limit(input.limit + 1);
    return this.mapPage(userId, rows, input.limit);
  }

  public async update(
    userId: UserId,
    id: LifeUpdateId,
    input: UpdateLifeUpdateInput,
  ): Promise<LifeUpdate> {
    const mediaIds = input.mediaAssetIds ?? [];
    const now = new Date();
    const result = await this.database.transaction(async (tx) => {
      const [master] = await tx
        .select({ id: lifeUpdates.id })
        .from(lifeUpdates)
        .where(
          and(
            eq(lifeUpdates.id, id),
            eq(lifeUpdates.authorUserId, userId),
            eq(lifeUpdates.status, 'active'),
          ),
        )
        .for('update');
      if (!master) return undefined;
      if (mediaIds.length > 0) await this.assertMedia(tx, userId, mediaIds, id);
      const old = await tx
        .select({ attachment: lifeUpdateMedia, asset: mediaAssets })
        .from(lifeUpdateMedia)
        .innerJoin(
          mediaAssets,
          eq(mediaAssets.id, lifeUpdateMedia.mediaAssetId),
        )
        .where(eq(lifeUpdateMedia.lifeUpdateId, id));
      const removed = old.filter(
        ({ attachment }) =>
          !mediaIds.includes(attachment.mediaAssetId as MediaAssetId),
      );
      await tx
        .delete(lifeUpdateMedia)
        .where(eq(lifeUpdateMedia.lifeUpdateId, id));
      if (mediaIds.length > 0)
        await tx.insert(lifeUpdateMedia).values(
          mediaIds.map((mediaAssetId, position) => ({
            mediaAssetId,
            lifeUpdateId: id,
            position,
          })),
        );
      if (removed.length > 0)
        await tx
          .insert(mediaJobOutbox)
          .values(removed.map(({ asset }) => mediaDeletionOutboxEntry(asset)));
      await tx
        .update(lifeUpdates)
        .set({ sections: input.sections, updatedAt: now })
        .where(eq(lifeUpdates.id, id));
      await tx
        .update(posts)
        .set({ editedAt: now, updatedAt: now })
        .where(
          inArray(
            posts.id,
            tx
              .select({ postId: lifeUpdateDeliveries.postId })
              .from(lifeUpdateDeliveries)
              .where(eq(lifeUpdateDeliveries.lifeUpdateId, id)),
          ),
        );
      return tx
        .select({
          postId: lifeUpdateDeliveries.postId,
          boxId: lifeUpdateDeliveries.boxId,
        })
        .from(lifeUpdateDeliveries)
        .where(eq(lifeUpdateDeliveries.lifeUpdateId, id));
    });
    if (!result) this.notFound();
    const deliveries = await result;
    await Promise.all(
      deliveries
        .filter(({ boxId }) => boxId)
        .map(({ postId, boxId }) =>
          this.events.publish({
            action: 'updated',
            boxId: boxId as BoxId,
            postId: postId as PostId,
          }),
        ),
    );
    return this.get(userId, id);
  }

  public async delete(
    userId: UserId,
    id: LifeUpdateId,
  ): Promise<{ success: true }> {
    const now = new Date();
    const deliveries = await this.database.transaction(async (tx) => {
      const [master] = await tx
        .update(lifeUpdates)
        .set({ status: 'deleted', deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(lifeUpdates.id, id),
            eq(lifeUpdates.authorUserId, userId),
            eq(lifeUpdates.status, 'active'),
          ),
        )
        .returning({ id: lifeUpdates.id });
      if (!master) return undefined;
      const rows = await tx
        .select({
          postId: lifeUpdateDeliveries.postId,
          boxId: lifeUpdateDeliveries.boxId,
        })
        .from(lifeUpdateDeliveries)
        .where(eq(lifeUpdateDeliveries.lifeUpdateId, id));
      await tx
        .update(posts)
        .set({ content: '', status: 'deleted', deletedAt: now, updatedAt: now })
        .where(
          inArray(
            posts.id,
            rows.map(({ postId }) => postId),
          ),
        );
      const media = await tx
        .select({ asset: mediaAssets })
        .from(lifeUpdateMedia)
        .innerJoin(
          mediaAssets,
          eq(mediaAssets.id, lifeUpdateMedia.mediaAssetId),
        )
        .where(eq(lifeUpdateMedia.lifeUpdateId, id));
      if (media.length > 0)
        await tx
          .insert(mediaJobOutbox)
          .values(media.map(({ asset }) => mediaDeletionOutboxEntry(asset)));
      await tx
        .delete(lifeUpdateMedia)
        .where(eq(lifeUpdateMedia.lifeUpdateId, id));
      return rows;
    });
    if (!deliveries) this.notFound();
    await Promise.all(
      deliveries
        .filter(({ boxId }) => boxId)
        .map(({ postId, boxId }) =>
          this.events.publish({
            action: 'deleted',
            boxId: boxId as BoxId,
            postId: postId as PostId,
          }),
        ),
    );
    return { success: true };
  }

  private async assertWritableBoxes(
    database: PaldoraDatabase,
    userId: UserId,
    boxIds: BoxId[],
  ): Promise<void> {
    const rows = await database
      .select({ id: boxes.id })
      .from(boxes)
      .innerJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, boxes.id),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(and(inArray(boxes.id, boxIds), eq(boxes.status, 'active')))
      .for('update');
    if (rows.length !== boxIds.length)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'BOX_NOT_FOUND',
        'One or more selected Boxes are unavailable.',
      );
  }

  private cursorCondition(cursorValue?: string) {
    if (!cursorValue) return undefined;
    const cursor = decodePostCursor(cursorValue);
    return or(
      lt(lifeUpdates.createdAt, cursor.createdAt),
      and(
        eq(lifeUpdates.createdAt, cursor.createdAt),
        lt(lifeUpdates.id, cursor.id),
      ),
    );
  }

  private notBlockedFromAuthor(userId: UserId) {
    return notExists(
      this.database
        .select({ id: friendships.id })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, 'blocked'),
            or(
              and(
                eq(friendships.userLowId, userId),
                eq(friendships.userHighId, lifeUpdates.authorUserId),
              ),
              and(
                eq(friendships.userHighId, userId),
                eq(friendships.userLowId, lifeUpdates.authorUserId),
              ),
            ),
          ),
        ),
    );
  }

  private async mapPage(
    userId: UserId,
    rows: { id: string; createdAt: Date }[],
    limit: number,
  ): Promise<LifeUpdatePage> {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      items: await Promise.all(
        page.map(({ id }) => this.get(userId, id as LifeUpdateId)),
      ),
      nextCursor:
        hasMore && last
          ? encodePostCursor(last.createdAt, last.id as PostId)
          : null,
    };
  }

  private async requireMembership(userId: UserId, boxId: BoxId): Promise<void> {
    const rows = await this.database
      .select({ id: boxMemberships.userId })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (rows.length === 0) this.notFound();
  }

  private async assertMedia(
    tx: PaldoraDatabase,
    userId: UserId,
    ids: MediaAssetId[],
    current?: LifeUpdateId,
  ): Promise<void> {
    const assets = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, ids),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.purpose, 'life_update_image'),
          inArray(mediaAssets.status, ['processing', 'ready']),
        ),
      )
      .for('update');
    const attached = await tx
      .select({
        id: lifeUpdateMedia.mediaAssetId,
        lifeUpdateId: lifeUpdateMedia.lifeUpdateId,
      })
      .from(lifeUpdateMedia)
      .where(inArray(lifeUpdateMedia.mediaAssetId, ids));
    if (
      assets.length !== ids.length ||
      attached.some((row) => row.lifeUpdateId !== current)
    )
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_LIFE_UPDATE_MEDIA',
        'One or more Life Update photos are unavailable or already attached.',
      );
  }

  private async loadMedia(id: LifeUpdateId): Promise<LifeUpdate['media']> {
    const rows = await this.database
      .select({ attachment: lifeUpdateMedia, asset: mediaAssets })
      .from(lifeUpdateMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, lifeUpdateMedia.mediaAssetId))
      .where(eq(lifeUpdateMedia.lifeUpdateId, id))
      .orderBy(lifeUpdateMedia.position);
    return Promise.all(
      rows.map(async ({ asset }) => {
        const ready = asset.status === 'ready' && asset.displayObjectKey;
        return {
          id: asset.id as MediaAssetId,
          contentType:
            asset.contentType as LifeUpdate['media'][number]['contentType'],
          status:
            asset.status === 'ready' || asset.status === 'failed'
              ? asset.status
              : 'processing',
          url: ready
            ? await this.storage
                .createSignedDownload(asset.displayObjectKey!, 900)
                .catch(() => null)
            : null,
          thumbnailUrl: ready
            ? await this.storage
                .createSignedDownload(
                  asset.thumbnailObjectKey ?? asset.displayObjectKey!,
                  900,
                )
                .catch(() => null)
            : null,
          width: asset.width,
          height: asset.height,
        };
      }),
    );
  }

  private notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'LIFE_UPDATE_NOT_FOUND',
      'That Life Update is unavailable.',
    );
  }
}
