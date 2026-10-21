import { Inject, Injectable } from '@nestjs/common';
import {
  commentReactions,
  comments,
  hiddenByBlock,
  mediaAssets,
  postReactions,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  REAL_REACTION_KIND,
  REAL_REACTION_PREVIEW_COUNT,
  type BoxStatus,
} from '@paldora/domain';
import type {
  CommentInteractionSummary,
  PostInteractionSummary,
} from '@paldora/validation';
import { and, eq, inArray, isNull, lte, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ProfileSummaryService } from '../../identity/profile-summary.service.js';
import { MediaUrlService } from '../../media/media-urls.service.js';
import { DATABASE } from '../../platform/config/tokens.js';
import {
  summarizeKinds,
  type KindCount,
  type RealPreview,
} from './interaction-summaries.js';

/** A post the caller has already authorized for this viewer. */
export interface SummaryTarget {
  readonly id: string;
  readonly boxStatus: BoxStatus;
}

const root = alias(comments, 'summary_root');
const count = sql<number>`count(*)::int`;

const groupByTarget = <Row extends { target: string }>(
  rows: readonly Row[],
) => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const list = grouped.get(row.target) ?? [];
    list.push(row);
    grouped.set(row.target, list);
  }
  return grouped;
};

/**
 * Interaction summaries for a page of posts or comments, in a fixed number of
 * queries whatever the page size (no N+1). Counts are computed on read and
 * are viewer-relative: anything by someone in a block relationship with the
 * viewer is left out, so a number never reveals blocked activity.
 */
@Injectable()
export class InteractionSummaryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(ProfileSummaryService)
    private readonly people: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  public async forPosts(
    viewerId: string,
    targets: readonly SummaryTarget[],
  ): Promise<Map<string, PostInteractionSummary>> {
    const ids = [...new Set(targets.map((target) => target.id))];
    if (ids.length === 0) return new Map();
    const [commentCounts, kinds, own] = await Promise.all([
      this.commentCounts(viewerId, ids),
      this.postKindCounts(viewerId, ids),
      this.database
        .select({
          target: postReactions.postId,
          kind: postReactions.kind,
          mediaAssetId: postReactions.mediaAssetId,
        })
        .from(postReactions)
        .where(
          and(
            inArray(postReactions.postId, ids),
            eq(postReactions.userId, viewerId),
          ),
        ),
    ]);
    const kindsByPost = groupByTarget(kinds);
    const withReal = ids.filter((id) =>
      kindsByPost.get(id)?.some((row) => row.kind === REAL_REACTION_KIND),
    );
    const previews = await this.realPreviews(viewerId, withReal);
    const mine = new Map(own.map((row) => [row.target, row]));
    return new Map(
      targets.map((target) => {
        const counts = summarizeKinds(kindsByPost.get(target.id) ?? []);
        const viewer = mine.get(target.id);
        const summary: PostInteractionSummary = {
          commentCount: commentCounts.get(target.id) ?? 0,
          reactions: counts.reactions,
          reactionCount: counts.reactionCount,
          realCount: counts.realCount,
          realPreview: previews.get(target.id) ?? [],
          viewerReaction: viewer
            ? {
                kind: viewer.kind,
                ...(viewer.mediaAssetId
                  ? { mediaAssetId: viewer.mediaAssetId }
                  : {}),
              }
            : null,
          canInteract: target.boxStatus === 'active',
        };
        return [target.id, summary];
      }),
    );
  }

  public async forComments(
    viewerId: string,
    commentIds: readonly string[],
  ): Promise<Map<string, CommentInteractionSummary>> {
    const ids = [...new Set(commentIds)];
    if (ids.length === 0) return new Map();
    const [kinds, own] = await Promise.all([
      this.database
        .select({
          target: commentReactions.commentId,
          kind: commentReactions.kind,
          count,
        })
        .from(commentReactions)
        .where(
          and(
            inArray(commentReactions.commentId, ids),
            not(hiddenByBlock(viewerId, commentReactions.userId)),
          ),
        )
        .groupBy(commentReactions.commentId, commentReactions.kind),
      this.database
        .select({
          target: commentReactions.commentId,
          kind: commentReactions.kind,
        })
        .from(commentReactions)
        .where(
          and(
            inArray(commentReactions.commentId, ids),
            eq(commentReactions.userId, viewerId),
          ),
        ),
    ]);
    const kindsByComment = groupByTarget(kinds);
    const mine = new Map(own.map((row) => [row.target, row.kind]));
    return new Map(
      ids.map((id) => {
        const counts = summarizeKinds(kindsByComment.get(id) ?? []);
        const kind = mine.get(id);
        const summary: CommentInteractionSummary = {
          reactions: counts.reactions,
          reactionCount: counts.reactionCount,
          viewerReaction: kind === undefined ? null : { kind },
        };
        return [id, summary];
      }),
    );
  }

  /** Active comments the viewer can read: not blocked, not in a hidden thread. */
  private async commentCounts(viewerId: string, postIds: readonly string[]) {
    const rows = await this.database
      .select({ target: comments.postId, count })
      .from(comments)
      .leftJoin(root, eq(root.id, comments.parentCommentId))
      .where(
        and(
          inArray(comments.postId, [...postIds]),
          eq(comments.status, 'active'),
          eq(comments.moderationHidden, false),
          not(hiddenByBlock(viewerId, comments.authorUserId)),
          or(
            isNull(root.id),
            and(
              eq(root.moderationHidden, false),
              not(hiddenByBlock(viewerId, root.authorUserId)),
            ),
          ),
        ),
      )
      .groupBy(comments.postId);
    return new Map(rows.map((row) => [row.target, row.count]));
  }

  private postKindCounts(
    viewerId: string,
    postIds: readonly string[],
  ): Promise<(KindCount & { target: string })[]> {
    return this.database
      .select({ target: postReactions.postId, kind: postReactions.kind, count })
      .from(postReactions)
      .where(
        and(
          inArray(postReactions.postId, [...postIds]),
          not(hiddenByBlock(viewerId, postReactions.userId)),
        ),
      )
      .groupBy(postReactions.postId, postReactions.kind);
  }

  /** The latest few camera reactions per post, as signed thumbnails. */
  private async realPreviews(
    viewerId: string,
    postIds: readonly string[],
  ): Promise<Map<string, RealPreview[]>> {
    if (postIds.length === 0) return new Map();
    const ranked = this.database
      .select({
        postId: postReactions.postId,
        userId: postReactions.userId,
        mediaAssetId: postReactions.mediaAssetId,
        rank: sql<number>`row_number() over (partition by ${postReactions.postId} order by ${postReactions.createdAt} desc, ${postReactions.userId})`.as(
          'rank',
        ),
      })
      .from(postReactions)
      .where(
        and(
          inArray(postReactions.postId, [...postIds]),
          eq(postReactions.kind, REAL_REACTION_KIND),
          not(hiddenByBlock(viewerId, postReactions.userId)),
        ),
      )
      .as('ranked');
    const rows = await this.database
      .select({
        postId: ranked.postId,
        userId: ranked.userId,
        rank: ranked.rank,
        asset: {
          id: mediaAssets.id,
          status: mediaAssets.status,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        },
      })
      .from(ranked)
      .innerJoin(mediaAssets, eq(mediaAssets.id, ranked.mediaAssetId))
      .where(
        and(
          lte(ranked.rank, REAL_REACTION_PREVIEW_COUNT),
          eq(mediaAssets.status, 'ready'),
        ),
      )
      .orderBy(ranked.postId, ranked.rank);
    const people = await this.people.summaries(rows.map((row) => row.userId));
    const signed = await Promise.all(
      rows.map(async (row) => ({
        row,
        thumbnailUrl: await this.mediaUrls.signThumbnail(row.asset),
      })),
    );
    const previews = new Map<string, RealPreview[]>();
    for (const { row, thumbnailUrl } of signed) {
      const user = people.get(row.userId);
      if (!user || !thumbnailUrl) continue;
      const list = previews.get(row.postId) ?? [];
      list.push({ user, thumbnailUrl });
      previews.set(row.postId, list);
    }
    return previews;
  }
}
