import { Inject, Injectable } from '@nestjs/common';
import {
  comments,
  hiddenByBlock,
  type PaldoraDatabase,
} from '@paldora/database';
import { COMMENT_REPLY_PREVIEW_COUNT, type BoxStatus } from '@paldora/domain';
import type {
  CommentDetail,
  CommentItemView,
  CommentThreadView,
} from '@paldora/validation';
import { and, eq, exists, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ProfileSummaryService } from '../../identity/profile-summary.service.js';
import {
  keysetWindow,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
  type PageQuery,
} from '../../platform/pagination/pagination.js';
import { DATABASE } from '../../platform/config/tokens.js';
import {
  toCommentItem,
  toCommentView,
  visibleRows,
  type CommentRowWithVisibility,
  type CommentViewContext,
} from './comment-views.js';
import { commentNotFound } from '../shared/interaction-errors.js';
import {
  InteractionPolicyService,
  type CommentContext,
} from '../shared/interaction-policy.service.js';
import { InteractionSummaryService } from '../shared/interaction-summary.service.js';

const reply = alias(comments, 'live_reply');
const count = sql<number>`count(*)::int`;

/**
 * Threads are chronological: roots newest first, replies oldest first, both
 * keyset on (created_at, id). A page costs a fixed number of queries: roots,
 * the reply previews for all of them at once, reply counts, authors, and
 * reaction summaries.
 */
@Injectable()
export class CommentQueryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(InteractionPolicyService)
    private readonly policy: InteractionPolicyService,
    @Inject(ProfileSummaryService)
    private readonly people: ProfileSummaryService,
    @Inject(InteractionSummaryService)
    private readonly interactions: InteractionSummaryService,
  ) {}

  public async roots(
    viewerId: string,
    postId: string,
    query: PageQuery,
  ): Promise<Page<CommentThreadView>> {
    const post = await this.policy.postForRead(this.database, viewerId, postId);
    const keyset = keysetWindow(
      comments.createdAt,
      comments.id,
      decodeCursor(query.cursor),
      'desc',
    );
    const rows = await this.database
      .select({
        comment: comments,
        hidden: hiddenByBlock(viewerId, comments.authorUserId).mapWith(Boolean),
        cursorAt: cursorTimestamp(comments.createdAt),
      })
      .from(comments)
      .where(
        and(
          eq(comments.postId, postId),
          isNull(comments.parentCommentId),
          this.listedRoot(),
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    // A thread whose root is hidden is one placeholder: no replies loaded.
    const open = rows
      .slice(0, query.limit)
      .filter((row) => !row.hidden)
      .map((row) => row.comment.id);
    const [previews, replyCounts] = await Promise.all([
      this.replyPreviews(viewerId, open),
      this.replyCounts(open),
    ]);
    const context = await this.viewContext(
      viewerId,
      post.boxStatus,
      [...rows, ...previews],
      replyCounts,
    );
    const threads = rows.flatMap((row) => {
      const item = toCommentItem(row, context);
      if (!item) return [];
      const thread: CommentThreadView = {
        root: item,
        replies: itemsOf(
          previews.filter((p) => p.comment.parentCommentId === row.comment.id),
          context,
        ),
        replyCount: row.hidden ? 0 : (replyCounts.get(row.comment.id) ?? 0),
      };
      return [{ row, thread }];
    });
    return pageOf(
      threads,
      query.limit,
      ({ row }) => ({ at: row.cursorAt, id: row.comment.id }),
      ({ thread }) => thread,
    );
  }

  public async replies(
    viewerId: string,
    rootId: string,
    query: PageQuery,
  ): Promise<Page<CommentItemView>> {
    const root = await this.policy.commentFor(this.database, viewerId, rootId);
    if (root.comment.parentCommentId !== null) throw commentNotFound();
    const keyset = keysetWindow(
      comments.createdAt,
      comments.id,
      decodeCursor(query.cursor),
      'asc',
    );
    const rows = await this.database
      .select({
        comment: comments,
        hidden: hiddenByBlock(viewerId, comments.authorUserId).mapWith(Boolean),
        cursorAt: cursorTimestamp(comments.createdAt),
      })
      .from(comments)
      .where(
        and(
          eq(comments.parentCommentId, rootId),
          eq(comments.status, 'active'),
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    const context = await this.viewContext(
      viewerId,
      root.boxStatus,
      rows,
      new Map(),
    );
    const items = rows.flatMap((row) => {
      const item = toCommentItem(row, context);
      return item ? [{ row, item }] : [];
    });
    return pageOf(
      items,
      query.limit,
      ({ row }) => ({ at: row.cursorAt, id: row.comment.id }),
      ({ item }) => item,
    );
  }

  /** One active comment and its thread's root, for deep links. */
  public async detail(
    viewerId: string,
    commentId: string,
  ): Promise<CommentDetail> {
    const target = await this.policy.commentFor(
      this.database,
      viewerId,
      commentId,
    );
    return {
      comment: await this.view(viewerId, target),
      rootId: target.rootId,
    };
  }

  /** The full view of a comment the caller has already authorized. */
  public async view(viewerId: string, target: CommentContext) {
    if (target.comment.status !== 'active') throw commentNotFound();
    const row = { comment: target.comment, hidden: false };
    const replyCounts =
      target.comment.parentCommentId === null
        ? await this.replyCounts([target.comment.id])
        : new Map<string, number>();
    const context = await this.viewContext(
      viewerId,
      target.boxStatus,
      [row],
      replyCounts,
    );
    const author = context.authors.get(target.comment.authorUserId);
    if (!author) throw commentNotFound();
    return toCommentView(target.comment, author, context);
  }

  /** A root stays listed while it is active or still has an active reply. */
  private listedRoot() {
    return or(
      eq(comments.status, 'active'),
      exists(
        this.database
          .select({ one: sql`1` })
          .from(reply)
          .where(
            and(
              eq(reply.parentCommentId, comments.id),
              eq(reply.status, 'active'),
            ),
          ),
      ),
    );
  }

  /** The oldest few active replies of each root, in one window query. */
  private async replyPreviews(
    viewerId: string,
    rootIds: readonly string[],
  ): Promise<CommentRowWithVisibility[]> {
    if (rootIds.length === 0) return [];
    const ranked = this.database
      .select({
        id: comments.id,
        postId: comments.postId,
        authorUserId: comments.authorUserId,
        parentCommentId: comments.parentCommentId,
        content: comments.content,
        status: comments.status,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        rank: sql<number>`row_number() over (partition by ${comments.parentCommentId} order by ${comments.createdAt}, ${comments.id})`.as(
          'rank',
        ),
      })
      .from(comments)
      .where(
        and(
          inArray(comments.parentCommentId, [...rootIds]),
          eq(comments.status, 'active'),
        ),
      )
      .as('ranked_replies');
    const rows = await this.database
      .select({
        id: ranked.id,
        postId: ranked.postId,
        authorUserId: ranked.authorUserId,
        parentCommentId: ranked.parentCommentId,
        content: ranked.content,
        status: ranked.status,
        createdAt: ranked.createdAt,
        editedAt: ranked.editedAt,
        hidden: hiddenByBlock(viewerId, ranked.authorUserId).mapWith(Boolean),
      })
      .from(ranked)
      .where(lte(ranked.rank, COMMENT_REPLY_PREVIEW_COUNT))
      .orderBy(ranked.parentCommentId, ranked.rank);
    return rows.map(({ hidden, ...comment }) => ({ comment, hidden }));
  }

  /** Active replies per root: exactly what `replies` will page through. */
  private async replyCounts(rootIds: readonly string[]) {
    if (rootIds.length === 0) return new Map<string, number>();
    const rows = await this.database
      .select({ rootId: comments.parentCommentId, count })
      .from(comments)
      .where(
        and(
          inArray(comments.parentCommentId, [...rootIds]),
          eq(comments.status, 'active'),
        ),
      )
      .groupBy(comments.parentCommentId);
    return new Map(rows.map((row) => [row.rootId ?? '', row.count]));
  }

  private async viewContext(
    viewerId: string,
    boxStatus: BoxStatus,
    rows: readonly CommentRowWithVisibility[],
    replyCounts: ReadonlyMap<string, number>,
  ): Promise<CommentViewContext> {
    const shown = visibleRows(rows);
    const [authors, summaries] = await Promise.all([
      this.people.summaries(shown.map((row) => row.comment.authorUserId)),
      this.interactions.forComments(
        viewerId,
        shown.map((row) => row.comment.id),
      ),
    ]);
    return { viewerId, boxStatus, authors, summaries, replyCounts };
  }
}

function itemsOf(
  rows: readonly CommentRowWithVisibility[],
  context: CommentViewContext,
): CommentItemView[] {
  return rows.flatMap((row) => {
    const item = toCommentItem(row, context);
    return item ? [item] : [];
  });
}
