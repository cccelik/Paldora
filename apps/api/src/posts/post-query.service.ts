import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  hiddenByBlock,
  lifeUpdateDeliveries,
  posts,
  representativeDelivery,
} from '@paldora/database';
import type { FeedItemView } from '@paldora/validation';
import { and, desc, eq } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { LifeUpdateViewService } from '../life-updates/life-update-view.service.js';
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
import { PostPageService } from './post-page.service.js';
import { toFeedItem } from './post-views.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/**
 * Feeds are fan-out-on-read and strictly chronological: the viewer's active
 * memberships joined to active posts, keyset on (created_at, id). No ranking.
 * A Life Update reaches a feed through its backing posts: a Box feed has the
 * one delivery for that Box; Home keeps one representative delivery per
 * Life Update (`representativeDelivery`), so it appears once with a context
 * per Box the viewer is in. Only Me has no backing post, so it is never in a
 * feed. Each page costs a fixed number of queries, whatever its size.
 */
@Injectable()
export class PostQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(PostPageService) private readonly pages: PostPageService,
    @Inject(LifeUpdateViewService)
    private readonly lifeUpdates: LifeUpdateViewService,
  ) {}

  public async boxFeed(
    viewerId: string,
    boxId: string,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    await this.policy.membership(viewerId, boxId);
    return this.feed(viewerId, boxId, query);
  }

  public homeFeed(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    return this.feed(viewerId, undefined, query);
  }

  /** `boxId` for a Box feed; undefined for Home (all the viewer's Boxes). */
  private async feed(
    viewerId: string,
    boxId: string | undefined,
    query: PageQuery,
  ): Promise<Page<FeedItemView>> {
    const rows = await this.infrastructure.database
      .select({
        post: posts,
        boxName: boxes.name,
        boxStatus: boxes.status,
        hidden: hiddenByBlock(viewerId, posts.authorUserId).mapWith(Boolean),
        lifeUpdateId: lifeUpdateDeliveries.lifeUpdateId,
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
      .leftJoin(lifeUpdateDeliveries, eq(lifeUpdateDeliveries.postId, posts.id))
      .where(
        and(
          eq(posts.status, 'active'),
          boxId === undefined
            ? representativeDelivery(viewerId)
            : eq(posts.boxId, boxId),
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
    // Authors, photos, and interactions only for rows the viewer may see;
    // Life Updates are assembled (batched) by their own read side.
    const visible = rows.filter((row) => !row.hidden);
    const ordinary = visible.filter((row) => row.post.kind === 'post');
    const lifeUpdateIds = visible.flatMap((row) =>
      row.lifeUpdateId === null ? [] : [row.lifeUpdateId],
    );
    const [ordinaryData, lifeUpdates] = await Promise.all([
      this.pages.forPosts(
        viewerId,
        ordinary.map((row) => ({
          id: row.post.id,
          authorUserId: row.post.authorUserId,
          boxStatus: row.boxStatus,
        })),
      ),
      this.lifeUpdates.byIds(
        viewerId,
        lifeUpdateIds,
        boxId === undefined ? {} : { scopeBoxId: boxId },
      ),
    ]);
    const page = { viewerId, ...ordinaryData, lifeUpdates: lifeUpdates.views };
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
    const { post } = context;
    // A backing post has no content or photos of its own to load.
    const { authors, media, interactions } = await this.pages.forPosts(
      viewerId,
      [
        {
          id: post.id,
          authorUserId: post.authorUserId,
          boxStatus: context.boxStatus,
        },
      ],
    );
    const author = authors.get(post.authorUserId);
    if (!author) throw postNotFound();
    return {
      context,
      author,
      media: media.get(postId) ?? [],
      interactions: interactions.get(postId),
    };
  }
}
