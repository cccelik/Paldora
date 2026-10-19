import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  hiddenByBlock,
  mediaAssets,
  postMedia,
  posts,
  type DatabaseExecutor,
} from '@paldora/database';
import type { FeedItemView, PostMediaView } from '@paldora/validation';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { MediaUrlService } from '../media/media-urls.service.js';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { postNotFound } from './post-errors.js';
import {
  toFeedItem,
  type MediaByPost,
  type PostContext,
} from './post-views.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/** A post with the viewer's membership; undefined when they have none. */
export async function loadPostContext(
  executor: DatabaseExecutor,
  viewerId: string,
  postId: string,
): Promise<PostContext | undefined> {
  const [row] = await executor
    .select({
      post: posts,
      boxName: boxes.name,
      boxStatus: boxes.status,
      hidden: hiddenByBlock(viewerId, posts.authorUserId).mapWith(Boolean),
    })
    .from(posts)
    .innerJoin(boxes, eq(boxes.id, posts.boxId))
    .innerJoin(
      boxMemberships,
      and(
        eq(boxMemberships.boxId, posts.boxId),
        eq(boxMemberships.userId, viewerId),
        eq(boxMemberships.status, 'active'),
      ),
    )
    .where(eq(posts.id, postId))
    .limit(1);
  return row;
}

/**
 * Feeds are fan-out-on-read and strictly chronological: the viewer's active
 * memberships joined to active posts, keyset on (created_at, id). No ranking.
 */
@Injectable()
export class PostQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  public async boxFeed(
    viewerId: string,
    boxId: string,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    await this.policy.membership(viewerId, boxId);
    return this.feed(viewerId, eq(posts.boxId, boxId), query);
  }

  public homeFeed(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    return this.feed(viewerId, undefined, query);
  }

  private async feed(
    viewerId: string,
    scope: SQL | undefined,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    const rows = await this.infrastructure.database
      .select({
        post: posts,
        boxName: boxes.name,
        boxStatus: boxes.status,
        hidden: hiddenByBlock(viewerId, posts.authorUserId).mapWith(Boolean),
        cursorAt: cursorTimestamp(posts.createdAt),
      })
      .from(posts)
      .innerJoin(boxes, eq(boxes.id, posts.boxId))
      .innerJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, posts.boxId),
          eq(boxMemberships.userId, viewerId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(posts.status, 'active'),
          scope,
          afterCursor(
            posts.createdAt,
            posts.id,
            decodeCursor(query.cursor),
            'desc',
          ),
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(query.limit + 1);
    // Authors are looked up only for rows the viewer may see.
    const authors = await this.summaries.summaries(
      rows.filter((row) => !row.hidden).map((row) => row.post.authorUserId),
    );
    const media = await this.mediaFor(
      rows.filter((row) => !row.hidden).map((row) => row.post.id),
    );
    const items = rows.flatMap((row) => {
      const item = toFeedItem(row, authors, media, viewerId);
      return item ? [{ row, item }] : [];
    });
    return pageOf(
      items,
      query.limit,
      ({ row }) => ({ at: row.cursorAt, id: row.post.id }),
      ({ item }) => item,
    );
  }

  public async get(viewerId: string, postId: string) {
    const context = await loadPostContext(
      this.infrastructure.database,
      viewerId,
      postId,
    );
    if (!context || context.hidden || context.post.status !== 'active') {
      throw postNotFound();
    }
    const author = (
      await this.summaries.summaries([context.post.authorUserId])
    ).get(context.post.authorUserId);
    if (!author) throw postNotFound();
    const media = (await this.mediaFor([postId])).get(postId) ?? [];
    return { context, author, media };
  }

  /**
   * Signed URLs for the photos of posts the caller has already authorized.
   * Only ready photos appear, and hidden (blocked) posts are never passed in.
   */
  public async mediaFor(postIds: readonly string[]): Promise<MediaByPost> {
    if (postIds.length === 0) return new Map();
    const rows = await this.infrastructure.database
      .select({ postId: postMedia.postId, asset: mediaAssets })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
      .where(
        and(
          inArray(postMedia.postId, [...postIds]),
          eq(mediaAssets.status, 'ready'),
        ),
      )
      .orderBy(asc(postMedia.postId), asc(postMedia.position));
    const grouped = new Map<string, PostMediaView[]>();
    const signed = await Promise.all(
      rows.map(async ({ postId, asset }) => ({
        postId,
        asset,
        urls: await this.mediaUrls.sign(asset),
      })),
    );
    for (const { postId, asset, urls } of signed) {
      if (!urls || !asset.width || !asset.height) continue;
      const list = grouped.get(postId) ?? [];
      list.push({
        id: asset.id,
        width: asset.width,
        height: asset.height,
        ...urls,
      });
      grouped.set(postId, list);
    }
    return grouped;
  }
}
