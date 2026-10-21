import { Inject, Injectable } from '@nestjs/common';
import {
  commentReactions,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import type { CommentInteractionSummary } from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../platform/config/tokens.js';
import { RealtimeBus } from '../../realtime/realtime-bus.js';
import { recordActivity } from '../shared/activity-events.js';
import {
  InteractionPolicyService,
  type CommentContext,
} from '../shared/interaction-policy.service.js';
import { emptyCommentSummary } from '../shared/interaction-summaries.js';
import { InteractionSummaryService } from '../shared/interaction-summary.service.js';
import { lockReactor } from './reaction-media.js';

/**
 * One emoji per person per comment, set-state and idempotent; `null`
 * removes it. Same steps as post reactions (policy → per-person lock → read
 * → upsert or delete → event for a brand-new row), without camera images.
 */
@Injectable()
export class CommentReactionService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(InteractionPolicyService)
    private readonly policy: InteractionPolicyService,
    @Inject(InteractionSummaryService)
    private readonly summaries: InteractionSummaryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  public async set(
    userId: string,
    commentId: string,
    kind: string | null,
  ): Promise<CommentInteractionSummary> {
    const outcome = await this.database.transaction(async (transaction) => {
      const context = await this.policy.commentForReaction(
        transaction,
        userId,
        commentId,
      );
      await lockReactor(transaction, 'comment', commentId, userId);
      const changed = await this.apply(transaction, userId, context, kind);
      return { context, changed };
    });
    if (outcome.changed) {
      const { boxId, comment } = outcome.context;
      await this.bus.boxEvent(boxId, 'reaction.changed', {
        postId: comment.postId,
        commentId,
      });
    }
    const summaries = await this.summaries.forComments(userId, [commentId]);
    return summaries.get(commentId) ?? emptyCommentSummary();
  }

  /** Returns whether anything changed. */
  private async apply(
    transaction: DatabaseTransaction,
    userId: string,
    context: CommentContext,
    kind: string | null,
  ): Promise<boolean> {
    const commentId = context.comment.id;
    const row = and(
      eq(commentReactions.commentId, commentId),
      eq(commentReactions.userId, userId),
    );
    if (kind === null) {
      const removed = await transaction
        .delete(commentReactions)
        .where(row)
        .returning({ kind: commentReactions.kind });
      return removed.length > 0;
    }
    const [existing] = await transaction
      .select({ kind: commentReactions.kind })
      .from(commentReactions)
      .where(row)
      .for('update')
      .limit(1);
    if (existing?.kind === kind) return false;
    const now = new Date();
    const [saved] = await transaction
      .insert(commentReactions)
      .values({ commentId, userId, kind })
      .onConflictDoUpdate({
        target: [commentReactions.commentId, commentReactions.userId],
        set: { kind, createdAt: now, updatedAt: now },
      })
      // True only for a freshly inserted row: a changed emoji is no event.
      .returning({ inserted: sql<boolean>`(xmax = 0)`.mapWith(Boolean) });
    if (saved?.inserted) {
      await recordActivity(transaction, {
        type: 'comment.reaction.set',
        actorUserId: userId,
        postId: context.comment.postId,
        commentId,
      });
    }
    return true;
  }
}
