import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  hiddenByBlock,
  posts,
  type DatabaseExecutor,
} from '@paldora/database';
import type { FeedItemView } from '@paldora/validation';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
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
import { toFeedItem, type PostContext } from './post-views.js';

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
    const items = rows.flatMap((row) => {
      const item = toFeedItem(row, authors, viewerId);
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
    return { context, author };
  }
}
