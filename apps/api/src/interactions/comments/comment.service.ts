import { Inject, Injectable } from '@nestjs/common';
import {
  commentReactions,
  comments,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import type { CommentView, NewComment } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { boxArchived } from '../../boxes/box-errors.js';
import { lockOpenBox } from '../../boxes/box-lock.js';
import { DATABASE } from '../../platform/config/tokens.js';
import { RealtimeBus } from '../../realtime/realtime-bus.js';
import { recordActivity } from '../shared/activity-events.js';
import { CommentQueryService } from './comment-query.service.js';
import {
  commentAccessDenied,
  commentNotFound,
} from '../shared/interaction-errors.js';
import {
  InteractionPolicyService,
  type CommentContext,
} from '../shared/interaction-policy.service.js';

interface Placement {
  readonly parentCommentId: string | null;
  readonly replyToUserId: string | null;
}

/**
 * Writing comments. Each write runs in one transaction holding the Box row
 * `FOR SHARE`; a new comment records its `comment.created` activity event in
 * that same transaction. Every final decision (one reply level, a race between an
 * edit and a delete) is made by the database, not by an earlier read.
 */
@Injectable()
export class CommentService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(InteractionPolicyService)
    private readonly policy: InteractionPolicyService,
    @Inject(CommentQueryService) private readonly queries: CommentQueryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  /**
   * A reply to a reply joins the root's thread (one level), remembering whom
   * it answers. The parent must be visible, active, and on the same post.
   */
  public async create(
    authorId: string,
    postId: string,
    input: NewComment,
  ): Promise<CommentView> {
    const created = await this.database.transaction(async (transaction) => {
      const post = await this.policy.postForWrite(
        transaction,
        authorId,
        postId,
      );
      const placement = await this.placement(
        transaction,
        authorId,
        postId,
        input.parentCommentId,
      );
      const [row] = await transaction
        .insert(comments)
        .values({
          postId,
          authorUserId: authorId,
          content: input.content,
          ...placement,
        })
        .returning();
      if (!row) throw new Error('Comment insert returned no row.');
      await recordActivity(transaction, {
        type: 'comment.created',
        actorUserId: authorId,
        postId,
        commentId: row.id,
        isReply: row.parentCommentId !== null,
      });
      return { row, boxId: post.post.boxId, boxStatus: post.boxStatus };
    });
    await this.bus.boxEvent(created.boxId, 'comment.created', {
      postId,
      commentId: created.row.id,
    });
    return this.queries.view(authorId, {
      comment: created.row,
      rootId: created.row.parentCommentId ?? created.row.id,
      boxId: created.boxId,
      boxStatus: created.boxStatus,
    });
  }

  public async update(
    viewerId: string,
    commentId: string,
    content: string,
  ): Promise<CommentView> {
    const target = await this.database.transaction(async (transaction) => {
      const found = await this.policy.commentFor(
        transaction,
        viewerId,
        commentId,
      );
      if (found.comment.status !== 'active') throw commentNotFound();
      await this.assertMayChange(transaction, viewerId, found);
      const now = new Date();
      const [changed] = await transaction
        .update(comments)
        .set({ content, editedAt: now, updatedAt: now })
        .where(
          and(
            eq(comments.id, commentId),
            eq(comments.authorUserId, viewerId),
            eq(comments.status, 'active'),
          ),
        )
        .returning();
      // Deleted between the read and the write: the delete won.
      if (!changed) throw commentNotFound();
      return { ...found, comment: changed };
    });
    await this.bus.boxEvent(target.boxId, 'comment.updated', {
      postId: target.comment.postId,
      commentId,
    });
    return this.queries.view(viewerId, target);
  }

  /**
   * Idempotent for the author: the text is erased (a tombstone keeps the
   * thread's shape) and the comment's reactions are deleted, in one
   * transaction. Replies stay.
   */
  public async remove(viewerId: string, commentId: string): Promise<void> {
    const removed = await this.database.transaction(async (transaction) => {
      const found = await this.policy.commentFor(
        transaction,
        viewerId,
        commentId,
      );
      if (found.comment.status === 'deleted') {
        if (found.comment.authorUserId === viewerId) return null;
        throw commentNotFound();
      }
      await this.assertMayChange(transaction, viewerId, found);
      const now = new Date();
      const [deleted] = await transaction
        .update(comments)
        .set({
          status: 'deleted',
          content: null,
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(comments.id, commentId), eq(comments.status, 'active')))
        .returning({ id: comments.id });
      if (!deleted) return null;
      await transaction
        .delete(commentReactions)
        .where(eq(commentReactions.commentId, commentId));
      return found;
    });
    if (removed) {
      await this.bus.boxEvent(removed.boxId, 'comment.deleted', {
        postId: removed.comment.postId,
        commentId,
      });
    }
  }

  private async placement(
    transaction: DatabaseTransaction,
    viewerId: string,
    postId: string,
    parentCommentId: string | undefined,
  ): Promise<Placement> {
    if (parentCommentId === undefined) {
      return { parentCommentId: null, replyToUserId: null };
    }
    const parent = await this.policy.commentFor(
      transaction,
      viewerId,
      parentCommentId,
    );
    if (
      parent.comment.postId !== postId ||
      parent.comment.status !== 'active'
    ) {
      throw commentNotFound();
    }
    return {
      parentCommentId: parent.rootId,
      replyToUserId: parent.comment.authorUserId,
    };
  }

  /** Archived Boxes are read-only for everyone; then only authors may change. */
  private async assertMayChange(
    transaction: DatabaseTransaction,
    viewerId: string,
    found: CommentContext,
  ): Promise<void> {
    if (found.boxStatus !== 'active') throw boxArchived();
    await lockOpenBox(transaction, found.boxId);
    if (found.comment.authorUserId !== viewerId) throw commentAccessDenied();
  }
}
