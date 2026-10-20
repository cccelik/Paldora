import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  hiddenByBlock,
  mediaAssets,
  postMedia,
  posts,
} from '@paldora/database';
import type { FeedItemView } from '@paldora/validation';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { InteractionSummaryService } from '../interactions/interaction-summary.service.js';
import { MediaUrlService } from '../media/media-urls.service.js';
import { signPhotos } from '../media/signed-photos.js';
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
import { isReadable, loadPostContext } from './post-context.js';
import { postNotFound } from './post-errors.js';
import { toFeedItem, type MediaByPost } from './post-views.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
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
    @Inject(InteractionSummaryService)
    private readonly interactions: InteractionSummaryService,
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
    // Authors, photos, and interactions only for rows the viewer may see.
    const visible = rows.filter((row) => !row.hidden);
    const [authors, media, interactions] = await Promise.all([
      this.summaries.summaries(visible.map((row) => row.post.authorUserId)),
      this.mediaFor(visible.map((row) => row.post.id)),
      this.interactions.forPosts(
        viewerId,
        visible.map((row) => ({ id: row.post.id, boxStatus: row.boxStatus })),
      ),
    ]);
    const page = { viewerId, authors, media, interactions };
    const items = rows.flatMap((row) => {
      const item = toFeedItem(row, page);
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
    if (!isReadable(context)) throw postNotFound();
    const [authors, media, interactions] = await Promise.all([
      this.summaries.summaries([context.post.authorUserId]),
      this.mediaFor([postId]),
      this.interactions.forPosts(viewerId, [
        { id: postId, boxStatus: context.boxStatus },
      ]),
    ]);
    const author = authors.get(context.post.authorUserId);
    if (!author) throw postNotFound();
    return {
      context,
      author,
      media: media.get(postId) ?? [],
      interactions: interactions.get(postId),
    };
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
    return signPhotos(
      this.mediaUrls,
      rows.map(({ postId, asset }) => ({ ownerId: postId, asset })),
    );
  }
}
