import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  mediaJobOutbox,
  mediaAssets,
  postMedia,
  postReactions,
  posts,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  BoxId,
  MediaAssetId,
  Post,
  PostId,
  PostPage,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { and, desc, eq, exists, inArray, lt, or } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import { mediaDeletionOutboxEntry } from './media-job-outbox.js';
import { decodePostCursor, encodePostCursor } from './post-cursor.js';
import { ProfileAvatarService } from './profile-avatar.service.js';
import {
  emptyPostInteractionSummary,
  PostInteractionQueryService,
} from './post-interaction-query.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import {
  POST_EVENT_PUBLISHER,
  type PostEventPublisher,
} from './post-event.service.js';

@Injectable()
export class PostService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
    @Inject(POST_EVENT_PUBLISHER)
    private readonly events: PostEventPublisher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(PostInteractionQueryService)
    private readonly interactionQueries: PostInteractionQueryService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async create(
    userId: UserId,
    boxId: BoxId,
    content: string,
    mediaAssetIds: MediaAssetId[] = [],
  ): Promise<Post> {
    if (!content.trim() && mediaAssetIds.length === 0) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_POST',
        'Write something or add a photo before posting.',
      );
    }
    await this.assertBoxCanPost(userId, boxId);
    if (new Set(mediaAssetIds).size !== mediaAssetIds.length) {
      this.invalidMedia();
    }
    const created = await this.database.transaction(async (transaction) => {
      if (mediaAssetIds.length > 0) {
        const assets = await transaction
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(
            and(
              inArray(mediaAssets.id, mediaAssetIds),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.boxId, boxId),
              eq(mediaAssets.purpose, 'post_image'),
              inArray(mediaAssets.status, ['processing', 'ready']),
            ),
          )
          .for('update');
        const attached = await transaction
          .select({ id: postMedia.mediaAssetId })
          .from(postMedia)
          .where(inArray(postMedia.mediaAssetId, mediaAssetIds));
        if (assets.length !== mediaAssetIds.length || attached.length > 0) {
          this.invalidMedia();
        }
      }
      const [inserted] = await transaction
        .insert(posts)
        .values({ boxId, authorUserId: userId, content: content.trim() })
        .returning({ id: posts.id });
      if (!inserted) throw new Error('Post insert did not return a row.');
      if (mediaAssetIds.length > 0) {
        await transaction.insert(postMedia).values(
          mediaAssetIds.map((mediaAssetId, position) => ({
            mediaAssetId,
            postId: inserted.id,
            position,
          })),
        );
      }
      return inserted;
    });
    const post = await this.get(userId, created.id as PostId);
    await this.events.publish({ action: 'created', boxId, postId: post.id });
    return post;
  }

  public async listBox(
    userId: UserId,
    boxId: BoxId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<PostPage> {
    await this.requireBoxMembership(userId, boxId);
    return this.page(
      userId,
      and(eq(posts.boxId, boxId), eq(posts.status, 'active')),
      input,
    );
  }

  public feed(
    userId: UserId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<PostPage> {
    return this.page(
      userId,
      and(
        eq(posts.status, 'active'),
        exists(
          this.database
            .select({ userId: boxMemberships.userId })
            .from(boxMemberships)
            .where(
              and(
                eq(boxMemberships.boxId, posts.boxId),
                eq(boxMemberships.userId, userId),
                eq(boxMemberships.status, 'active'),
              ),
            ),
        ),
      ),
      input,
    );
  }

  public async assertBoxAccess(userId: UserId, boxId: BoxId): Promise<void> {
    await this.requireBoxMembership(userId, boxId);
  }

  public async assertBoxCanPost(userId: UserId, boxId: BoxId): Promise<void> {
    const [access] = await this.database
      .select({ status: boxes.status })
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
    if (!access) this.boxNotFound();
    if (access.status !== 'active') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'BOX_ARCHIVED',
        'Archived Boxes cannot accept new posts.',
      );
    }
  }

  public async canAccessBox(userId: UserId, boxId: BoxId): Promise<boolean> {
    const [membership] = await this.database
      .select({ userId: boxMemberships.userId })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(membership);
  }

  public async get(userId: UserId, postId: PostId): Promise<Post> {
    const rows = await this.selectPosts(
      userId,
      and(
        eq(posts.id, postId),
        eq(posts.status, 'active'),
        exists(
          this.database
            .select({ userId: boxMemberships.userId })
            .from(boxMemberships)
            .where(
              and(
                eq(boxMemberships.boxId, posts.boxId),
                eq(boxMemberships.userId, userId),
                eq(boxMemberships.status, 'active'),
              ),
            ),
        ),
      ),
      1,
    );
    const [post] = rows;
    if (!post) this.postNotFound();
    return post;
  }

  public async update(
    userId: UserId,
    postId: PostId,
    content: string,
  ): Promise<Post> {
    const now = new Date();
    const [updated] = await this.database
      .update(posts)
      .set({ content: content.trim(), editedAt: now, updatedAt: now })
      .where(this.authorMutationWhere(userId, postId))
      .returning({ id: posts.id });
    if (!updated) this.postNotFound();
    const post = await this.get(userId, postId);
    await this.events.publish({
      action: 'updated',
      boxId: post.boxId,
      postId,
    });
    return post;
  }

  public async delete(
    userId: UserId,
    postId: PostId,
  ): Promise<{ success: true }> {
    const now = new Date();
    const deleted = await this.database.transaction(async (transaction) => {
      const [removed] = await transaction
        .update(posts)
        .set({ content: '', status: 'deleted', deletedAt: now, updatedAt: now })
        .where(this.authorMutationWhere(userId, postId))
        .returning({ id: posts.id, boxId: posts.boxId });
      if (!removed) return undefined;
      const linkedMedia = await transaction
        .select({
          id: mediaAssets.id,
          objectKey: mediaAssets.objectKey,
          displayObjectKey: mediaAssets.displayObjectKey,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
        .where(eq(postMedia.postId, postId));
      const reactionMedia = await transaction
        .select({
          id: mediaAssets.id,
          objectKey: mediaAssets.objectKey,
          displayObjectKey: mediaAssets.displayObjectKey,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        })
        .from(postReactions)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
        .where(eq(postReactions.postId, postId));
      await transaction
        .delete(postReactions)
        .where(eq(postReactions.postId, postId));
      const removedMedia = [...linkedMedia, ...reactionMedia];
      if (removedMedia.length > 0) {
        await transaction
          .insert(mediaJobOutbox)
          .values(removedMedia.map(mediaDeletionOutboxEntry));
      }
      return removed;
    });
    if (!deleted) this.postNotFound();
    await this.events.publish({
      action: 'deleted',
      boxId: deleted.boxId as BoxId,
      postId,
    });
    return { success: true };
  }

  private async page(
    userId: UserId,
    baseCondition: ReturnType<typeof and>,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<PostPage> {
    const cursor = input.cursor ? decodePostCursor(input.cursor) : null;
    const cursorCondition = cursor
      ? or(
          lt(posts.createdAt, cursor.createdAt),
          and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
        )
      : undefined;
    const rows = await this.selectPosts(
      userId,
      and(baseCondition, cursorCondition),
      input.limit + 1,
    );
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodePostCursor(new Date(last.createdAt), last.id)
          : null,
    };
  }

  private async selectPosts(
    userId: UserId,
    condition: ReturnType<typeof and>,
    limit: number,
  ): Promise<Post[]> {
    const rows = await this.database
      .select({
        post: posts,
        boxName: boxes.name,
        profile: profiles,
      })
      .from(posts)
      .innerJoin(boxes, eq(boxes.id, posts.boxId))
      .innerJoin(profiles, eq(profiles.userId, posts.authorUserId))
      .where(condition)
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit);
    const avatarUrls = await this.avatars.forUsers(
      rows.map(({ post }) => post.authorUserId as UserId),
    );
    const postIds = rows.map(({ post }) => post.id);
    const interactionSummaries = await this.interactionQueries.load(
      userId,
      postIds as PostId[],
    );
    const mediaRows =
      postIds.length === 0
        ? []
        : await this.database
            .select({ attachment: postMedia, asset: mediaAssets })
            .from(postMedia)
            .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
            .where(inArray(postMedia.postId, postIds));
    const mappedMedia = new Map<string, Post['media']>();
    const mediaPositions = new Map(
      mediaRows.map(({ attachment }) => [
        attachment.mediaAssetId,
        attachment.position,
      ]),
    );
    await Promise.all(
      mediaRows.map(async ({ attachment, asset }) => {
        const ready = asset.status === 'ready' && asset.displayObjectKey;
        const [url, thumbnailUrl] = ready
          ? await Promise.all([
              this.signMedia(asset.displayObjectKey!),
              this.signMedia(
                asset.thumbnailObjectKey ?? asset.displayObjectKey!,
              ),
            ])
          : [null, null];
        const items = mappedMedia.get(attachment.postId) ?? [];
        items.push({
          id: asset.id as MediaAssetId,
          contentType:
            asset.contentType as Post['media'][number]['contentType'],
          status:
            asset.status === 'ready' || asset.status === 'failed'
              ? asset.status
              : 'processing',
          url,
          thumbnailUrl,
          width: asset.width,
          height: asset.height,
        });
        mappedMedia.set(attachment.postId, items);
      }),
    );
    for (const items of mappedMedia.values()) {
      items.sort(
        (left, right) =>
          (mediaPositions.get(left.id) ?? 0) -
          (mediaPositions.get(right.id) ?? 0),
      );
    }
    return rows.map(({ post, boxName, profile }) => ({
      id: post.id as PostId,
      boxId: post.boxId as BoxId,
      boxName,
      author: {
        userId: post.authorUserId as UserId,
        username: profile.username ?? '',
        displayName:
          profile.displayName ?? profile.username ?? 'Paldora member',
        avatarUrl: avatarUrls.get(post.authorUserId as UserId) ?? null,
      },
      content: post.content,
      media: mappedMedia.get(post.id) ?? [],
      interactions:
        interactionSummaries.get(post.id) ?? emptyPostInteractionSummary(),
      status: 'active' as const,
      editedAt: post.editedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }));
  }

  private authorMutationWhere(userId: UserId, postId: PostId) {
    return and(
      eq(posts.id, postId),
      eq(posts.authorUserId, userId),
      eq(posts.status, 'active'),
      exists(
        this.database
          .select({ userId: boxMemberships.userId })
          .from(boxMemberships)
          .where(
            and(
              eq(boxMemberships.boxId, posts.boxId),
              eq(boxMemberships.userId, userId),
              eq(boxMemberships.status, 'active'),
            ),
          ),
      ),
    );
  }

  private async requireBoxMembership(userId: UserId, boxId: BoxId) {
    if (!(await this.canAccessBox(userId, boxId))) this.boxNotFound();
  }

  private boxNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'BOX_NOT_FOUND',
      'That Box is unavailable.',
    );
  }

  private postNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'POST_NOT_FOUND',
      'That post is unavailable.',
    );
  }

  private invalidMedia(): never {
    throw new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_POST_MEDIA',
      'One or more photos are unavailable or already attached.',
    );
  }

  private signMedia(objectKey: string): Promise<string | null> {
    return this.storage.createSignedDownload(objectKey, 900).catch(() => null);
  }
}
