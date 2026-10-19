import { Inject, Injectable } from '@nestjs/common';
import {
  postReactions,
  type DatabaseTransaction,
  type PaldoraDatabase,
  type PostReactionRow,
} from '@paldora/database';
import { REAL_REACTION_KIND } from '@paldora/domain';
import type {
  PostInteractionSummary,
  SetPostReactionInput,
} from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { mediaNotFound } from '../media/media-errors.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { recordActivity } from './activity-events.js';
import { InteractionPolicyService } from './interaction-policy.service.js';
import { InteractionSummaryService } from './interaction-summary.service.js';
import {
  claimReactionImage,
  lockReactor,
  retireReactionImage,
} from './reaction-media.js';

type Existing = Pick<PostReactionRow, 'kind' | 'mediaAssetId'> | undefined;

interface Target {
  readonly userId: string;
  readonly postId: string;
  readonly boxId: string;
}

const sameReaction = (existing: Existing, input: SetPostReactionInput) =>
  existing !== undefined &&
  existing.kind === input.kind &&
  existing.mediaAssetId === (input.mediaAssetId ?? null);

/**
 * One reaction per person per post, set-state and idempotent: an emoji, a
 * camera image, or nothing. The steps are policy → per-person lock → read
 * the current reaction → claim a camera image → upsert or delete → retire a
 * replaced camera image → record the activity event, all in one transaction.
 * Only a brand-new row records an event: changing your emoji never
 * re-notifies, and the event's dedupe key stops re-react spam.
 */
@Injectable()
export class PostReactionService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(InteractionPolicyService)
    private readonly policy: InteractionPolicyService,
    @Inject(InteractionSummaryService)
    private readonly summaries: InteractionSummaryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public async set(
    userId: string,
    postId: string,
    input: SetPostReactionInput,
  ): Promise<PostInteractionSummary> {
    const outcome = await this.database
      .transaction(async (transaction) => {
        const context = await this.policy.postForWrite(
          transaction,
          userId,
          postId,
        );
        const target = { userId, postId, boxId: context.post.boxId };
        await lockReactor(transaction, 'post', postId, userId);
        const changed = await this.apply(transaction, target, input);
        return { target, changed, boxStatus: context.boxStatus };
      })
      .catch((error: unknown) => {
        // Two reactions racing for one camera image: the index decides.
        if (isUniqueViolation(error, 'post_reactions_media_asset_unique')) {
          throw mediaNotFound();
        }
        throw error;
      });
    if (outcome.changed) {
      const { boxId } = outcome.target;
      await this.bus.publish(boxChannel(boxId), {
        type: 'reaction.changed',
        boxId,
        postId,
      });
    }
    // Signing happens here, after commit, never inside the transaction.
    const summaries = await this.summaries.forPosts(userId, [
      { id: postId, boxStatus: outcome.boxStatus },
    ]);
    const summary = summaries.get(postId);
    if (!summary) throw new Error('Reaction summary missing for its post.');
    return summary;
  }

  /** Returns whether anything changed. */
  private async apply(
    transaction: DatabaseTransaction,
    target: Target,
    input: SetPostReactionInput,
  ): Promise<boolean> {
    const existing = await this.current(transaction, target);
    if (input.kind === null) {
      if (!existing) return false;
      await transaction.delete(postReactions).where(this.rowOf(target));
      await retireReactionImage(transaction, existing.mediaAssetId);
      return true;
    }
    if (sameReaction(existing, input)) return false;
    const mediaAssetId =
      input.kind === REAL_REACTION_KIND && input.mediaAssetId
        ? (
            await claimReactionImage(
              transaction,
              target.userId,
              target.boxId,
              input.mediaAssetId,
            )
          ).id
        : null;
    const inserted = await this.upsert(
      transaction,
      target,
      input.kind,
      mediaAssetId,
    );
    if (existing && existing.mediaAssetId !== mediaAssetId) {
      await retireReactionImage(transaction, existing.mediaAssetId);
    }
    if (inserted) {
      await recordActivity(transaction, {
        type: 'post.reaction.set',
        actorUserId: target.userId,
        postId: target.postId,
      });
    }
    return true;
  }

  private rowOf(target: Target) {
    return and(
      eq(postReactions.postId, target.postId),
      eq(postReactions.userId, target.userId),
    );
  }

  private async current(
    transaction: DatabaseTransaction,
    target: Target,
  ): Promise<Existing> {
    const [row] = await transaction
      .select({
        kind: postReactions.kind,
        mediaAssetId: postReactions.mediaAssetId,
      })
      .from(postReactions)
      .where(this.rowOf(target))
      .for('update')
      .limit(1);
    return row;
  }

  /**
   * Insert or replace; `xmax = 0` is true only for a freshly inserted row,
   * which is what "new reaction" means (the primary key decides races).
   * A changed reaction counts as set now, so it sorts as the latest.
   */
  private async upsert(
    transaction: DatabaseTransaction,
    target: Target,
    kind: string,
    mediaAssetId: string | null,
  ): Promise<boolean> {
    const now = new Date();
    const [row] = await transaction
      .insert(postReactions)
      .values({
        postId: target.postId,
        userId: target.userId,
        kind,
        mediaAssetId,
      })
      .onConflictDoUpdate({
        target: [postReactions.postId, postReactions.userId],
        set: { kind, mediaAssetId, createdAt: now, updatedAt: now },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)`.mapWith(Boolean) });
    return row?.inserted ?? false;
  }
}
