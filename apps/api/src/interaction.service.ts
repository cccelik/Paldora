import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  activityEvents,
  commentReactions,
  comments,
  mediaAssets,
  mediaJobOutbox,
  postReactions,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  Comment,
  CommentId,
  CommentInteractions,
  CommentPage,
  MediaAssetId,
  PostId,
  PostInteractions,
  ReactionKind,
  UserId,
} from '@paldora/domain';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  commentChangedActivity,
  commentCreatedActivity,
  commentReactionSetActivity,
  reactionSetActivity,
} from './activity-event.js';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import {
  decodeInteractionCursor,
  encodeInteractionCursor,
} from './interaction-cursor.js';
import { InteractionAuthorizationPolicy } from './interaction-authorization-policy.service.js';
import { mediaDeletionOutboxEntry } from './media-job-outbox.js';
import { ProfileAvatarService } from './profile-avatar.service.js';
import {
  emptyPostInteractionSummary,
  PostInteractionQueryService,
} from './post-interaction-query.js';

type CommentRow = typeof comments.$inferSelect;
type InteractionTransaction = Parameters<
  Parameters<PaldoraDatabase['transaction']>[0]
>[0];
interface ReactionWriteInput {
  userId: UserId;
  postId: PostId;
  kind: ReactionKind | null;
  mediaAssetId: MediaAssetId | undefined;
}

@Injectable()
export class InteractionService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(InteractionAuthorizationPolicy)
    private readonly policy: InteractionAuthorizationPolicy,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
    @Inject(PostInteractionQueryService)
    private readonly interactionQueries: PostInteractionQueryService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async listComments(
    userId: UserId,
    postId: PostId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<CommentPage> {
    await this.policy.requireVisiblePost(userId, postId);
    const cursor = input.cursor
      ? decodeInteractionCursor(input.cursor)
      : undefined;
    const cursorCondition = cursor
      ? or(
          lt(comments.createdAt, cursor.createdAt),
          and(
            eq(comments.createdAt, cursor.createdAt),
            lt(comments.id, cursor.id),
          ),
        )
      : undefined;
    const roots = await this.database
      .select({ comment: comments, profile: profiles })
      .from(comments)
      .innerJoin(profiles, eq(profiles.userId, comments.authorUserId))
      .where(
        and(
          eq(comments.postId, postId),
          isNull(comments.parentCommentId),
          cursorCondition,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(input.limit + 1);
    const hasMore = roots.length > input.limit;
    const pageRoots = hasMore ? roots.slice(0, input.limit) : roots;
    const rootIds = pageRoots.map(({ comment }) => comment.id);
    const replies =
      rootIds.length === 0
        ? []
        : await this.database
            .select({ comment: comments, profile: profiles })
            .from(comments)
            .innerJoin(profiles, eq(profiles.userId, comments.authorUserId))
            .where(inArray(comments.parentCommentId, rootIds))
            .orderBy(asc(comments.createdAt), asc(comments.id));
    const userIds = [
      ...pageRoots.map(({ comment }) => comment.authorUserId as UserId),
      ...replies.map(({ comment }) => comment.authorUserId as UserId),
    ];
    const allCommentIds = [
      ...pageRoots.map(({ comment }) => comment.id as CommentId),
      ...replies.map(({ comment }) => comment.id as CommentId),
    ];
    const [avatarUrls, reactionSummaries] = await Promise.all([
      this.avatars.forUsers(userIds),
      this.commentReactionSummaries(userId, allCommentIds),
    ]);
    const repliesByParent = new Map<string, Comment[]>();
    for (const row of replies) {
      const parentId = row.comment.parentCommentId;
      if (!parentId) continue;
      const items = repliesByParent.get(parentId) ?? [];
      items.push(
        this.mapComment(
          row,
          avatarUrls,
          reactionSummaries.get(row.comment.id) ?? emptyCommentInteractions(),
          [],
        ),
      );
      repliesByParent.set(parentId, items);
    }
    const items = pageRoots.map((row) =>
      this.mapComment(
        row,
        avatarUrls,
        reactionSummaries.get(row.comment.id) ?? emptyCommentInteractions(),
        repliesByParent.get(row.comment.id) ?? [],
      ),
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeInteractionCursor(new Date(last.createdAt), last.id)
          : null,
    };
  }

  public async createComment(
    userId: UserId,
    postId: PostId,
    content: string,
    parentCommentId?: CommentId,
  ): Promise<Comment> {
    const post = await this.policy.requirePostInteraction(userId, postId);
    const created = await this.database.transaction(async (transaction) => {
      let parent: CommentRow | undefined;
      if (parentCommentId) {
        [parent] = await transaction
          .select()
          .from(comments)
          .where(
            and(
              eq(comments.id, parentCommentId),
              eq(comments.postId, postId),
              eq(comments.status, 'active'),
            ),
          )
          .for('update')
          .limit(1);
        if (!parent) this.commentNotFound();
        if (parent.parentCommentId) {
          throw new ApiError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'REPLY_DEPTH_EXCEEDED',
            'Replies can only be added directly beneath a comment.',
          );
        }
        await this.policy.requireUsersCanInteract(
          userId,
          parent.authorUserId as UserId,
        );
      }
      const [inserted] = await transaction
        .insert(comments)
        .values({
          postId,
          authorUserId: userId,
          parentCommentId,
          content: content.trim(),
        })
        .returning();
      if (!inserted) throw new Error('Comment insert did not return a row.');
      const recipientUserId = (parent?.authorUserId ??
        post.authorUserId) as UserId;
      await transaction.insert(activityEvents).values(
        commentCreatedActivity(inserted.id, userId, {
          boxId: post.boxId,
          postId,
          commentId: inserted.id,
          ...(parentCommentId ? { parentCommentId } : {}),
          recipientUserId,
        }),
      );
      return inserted;
    });
    return this.getComment(userId, created.id as CommentId);
  }

  public async updateComment(
    userId: UserId,
    commentId: CommentId,
    content: string,
  ): Promise<Comment> {
    const now = new Date();
    const result = await this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.id, commentId),
            eq(comments.authorUserId, userId),
            eq(comments.status, 'active'),
          ),
        )
        .for('update')
        .limit(1);
      if (!existing) this.commentNotFound();
      const post = await this.policy.requirePostInteraction(
        userId,
        existing.postId as PostId,
      );
      await transaction
        .update(comments)
        .set({ content: content.trim(), editedAt: now, updatedAt: now })
        .where(eq(comments.id, commentId));
      await transaction.insert(activityEvents).values(
        commentChangedActivity('updated', randomUUID(), userId, {
          boxId: post.boxId,
          postId: existing.postId,
          commentId,
          ...(existing.parentCommentId
            ? { parentCommentId: existing.parentCommentId }
            : {}),
          recipientUserId: post.authorUserId,
        }),
      );
      return existing.postId as PostId;
    });
    return this.getComment(userId, commentId, result);
  }

  public async deleteComment(
    userId: UserId,
    commentId: CommentId,
  ): Promise<{ success: true }> {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.id, commentId),
            eq(comments.authorUserId, userId),
            eq(comments.status, 'active'),
          ),
        )
        .for('update')
        .limit(1);
      if (!existing) this.commentNotFound();
      const post = await this.policy.requireVisiblePost(
        userId,
        existing.postId as PostId,
      );
      await transaction
        .update(comments)
        .set({ content: '', status: 'deleted', deletedAt: now, updatedAt: now })
        .where(eq(comments.id, commentId));
      await transaction.insert(activityEvents).values(
        commentChangedActivity('deleted', randomUUID(), userId, {
          boxId: post.boxId,
          postId: existing.postId,
          commentId,
          ...(existing.parentCommentId
            ? { parentCommentId: existing.parentCommentId }
            : {}),
          recipientUserId: post.authorUserId,
        }),
      );
    });
    return { success: true };
  }

  public async setCommentReaction(
    userId: UserId,
    commentId: CommentId,
    kind: ReactionKind | null,
  ): Promise<CommentInteractions> {
    const [comment] = await this.database
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.status, 'active')))
      .limit(1);
    if (!comment) this.commentNotFound();
    const post = await this.policy.requirePostInteraction(
      userId,
      comment.postId as PostId,
    );
    await this.policy.requireUsersCanInteract(
      userId,
      comment.authorUserId as UserId,
    );
    await this.database.transaction(async (transaction) => {
      const changed = kind
        ? await transaction
            .insert(commentReactions)
            .values({ commentId, userId, kind, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: [commentReactions.commentId, commentReactions.userId],
              set: { kind, updatedAt: new Date() },
              setWhere: ne(commentReactions.kind, kind),
            })
            .returning({ kind: commentReactions.kind })
        : await transaction
            .delete(commentReactions)
            .where(
              and(
                eq(commentReactions.commentId, commentId),
                eq(commentReactions.userId, userId),
              ),
            )
            .returning({ kind: commentReactions.kind });
      if (changed.length === 0) return;
      await transaction.insert(activityEvents).values(
        commentReactionSetActivity(randomUUID(), userId, {
          boxId: post.boxId,
          postId: comment.postId,
          commentId,
          ...(comment.parentCommentId
            ? { parentCommentId: comment.parentCommentId }
            : {}),
          recipientUserId: comment.authorUserId,
          ...(kind ? { reactionKind: kind } : {}),
        }),
      );
    });
    return (
      (await this.commentReactionSummaries(userId, [commentId])).get(
        commentId,
      ) ?? emptyCommentInteractions()
    );
  }

  public async setReaction(
    userId: UserId,
    postId: PostId,
    kind: ReactionKind | null,
    mediaAssetId?: MediaAssetId,
  ): Promise<PostInteractions> {
    const post = await this.policy.requirePostInteraction(userId, postId);
    await this.database.transaction(async (transaction) => {
      await this.requireReactionMedia(transaction, post.boxId, {
        userId,
        postId,
        kind,
        mediaAssetId,
      });
      const change = await this.writeReaction(
        transaction,
        userId,
        postId,
        kind,
        mediaAssetId,
      );
      if (!change.changed) return;
      const { replacedMediaAssetId } = change;
      await this.queueReplacedReactionMedia(
        transaction,
        replacedMediaAssetId,
        mediaAssetId,
      );
      await transaction.insert(activityEvents).values(
        reactionSetActivity(randomUUID(), userId, {
          boxId: post.boxId,
          postId,
          recipientUserId: post.authorUserId,
          ...(kind ? { reactionKind: kind } : {}),
        }),
      );
    });
    return (
      (await this.summaries(userId, [postId])).get(postId) ??
      emptyPostInteractionSummary()
    );
  }

  public async summaries(
    userId: UserId,
    postIds: readonly PostId[],
  ): Promise<Map<string, PostInteractions>> {
    return this.interactionQueries.load(userId, postIds);
  }

  private async getComment(
    userId: UserId,
    commentId: CommentId,
    knownPostId?: PostId,
  ): Promise<Comment> {
    const [row] = await this.database
      .select({ comment: comments, profile: profiles })
      .from(comments)
      .innerJoin(profiles, eq(profiles.userId, comments.authorUserId))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row) this.commentNotFound();
    await this.policy.requireVisiblePost(
      userId,
      knownPostId ?? (row.comment.postId as PostId),
    );
    const [avatarUrls, reactions] = await Promise.all([
      this.avatars.forUsers([row.comment.authorUserId as UserId]),
      this.commentReactionSummaries(userId, [commentId]),
    ]);
    return this.mapComment(
      row,
      avatarUrls,
      reactions.get(commentId) ?? emptyCommentInteractions(),
      [],
    );
  }

  private async commentReactionSummaries(
    userId: UserId,
    commentIds: readonly CommentId[],
  ): Promise<Map<string, CommentInteractions>> {
    const result = new Map<string, CommentInteractions>();
    if (commentIds.length === 0) return result;
    const [totals, own] = await Promise.all([
      this.database
        .select({
          commentId: commentReactions.commentId,
          kind: commentReactions.kind,
          value: count(),
        })
        .from(commentReactions)
        .where(inArray(commentReactions.commentId, commentIds))
        .groupBy(commentReactions.commentId, commentReactions.kind),
      this.database
        .select({
          commentId: commentReactions.commentId,
          kind: commentReactions.kind,
        })
        .from(commentReactions)
        .where(
          and(
            inArray(commentReactions.commentId, commentIds),
            eq(commentReactions.userId, userId),
          ),
        ),
    ]);
    for (const commentId of commentIds) {
      result.set(commentId, emptyCommentInteractions());
    }
    for (const row of totals) {
      result.get(row.commentId)?.reactions.push({
        kind: row.kind,
        count: Number(row.value),
      });
    }
    for (const row of own) {
      const summary = result.get(row.commentId);
      if (summary) summary.currentUserReaction = row.kind;
    }
    return result;
  }

  private async requireReactionMedia(
    transaction: InteractionTransaction,
    boxId: string,
    input: ReactionWriteInput,
  ): Promise<void> {
    const { userId, postId, kind, mediaAssetId } = input;
    if (kind !== 'real') {
      if (mediaAssetId) this.invalidReactionMedia();
      return;
    }
    if (!mediaAssetId) this.invalidReactionMedia();
    const [asset] = await transaction
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.boxId, boxId),
          eq(mediaAssets.purpose, 'reaction_image'),
          inArray(mediaAssets.status, ['processing', 'ready']),
        ),
      )
      .for('update')
      .limit(1);
    if (!asset) this.invalidReactionMedia();
    const [attached] = await transaction
      .select({ postId: postReactions.postId, userId: postReactions.userId })
      .from(postReactions)
      .where(eq(postReactions.mediaAssetId, mediaAssetId))
      .limit(1);
    if (
      attached &&
      (attached.postId !== postId || attached.userId !== userId)
    ) {
      this.invalidReactionMedia();
    }
  }

  private writeReaction(
    transaction: InteractionTransaction,
    userId: UserId,
    postId: PostId,
    kind: ReactionKind | null,
    mediaAssetId?: MediaAssetId,
  ): Promise<{ changed: boolean; replacedMediaAssetId: string | null }> {
    return kind
      ? this.upsertReaction(transaction, userId, postId, kind, mediaAssetId)
      : this.removeReaction(transaction, userId, postId);
  }

  private async upsertReaction(
    transaction: InteractionTransaction,
    userId: UserId,
    postId: PostId,
    kind: ReactionKind,
    mediaAssetId?: MediaAssetId,
  ): Promise<{ changed: boolean; replacedMediaAssetId: string | null }> {
    const now = new Date();
    const [inserted] = await transaction
      .insert(postReactions)
      .values({ postId, userId, kind, mediaAssetId, updatedAt: now })
      .onConflictDoNothing({
        target: [postReactions.postId, postReactions.userId],
      })
      .returning({ kind: postReactions.kind });
    if (inserted) return { changed: true, replacedMediaAssetId: null };
    const [existing] = await transaction
      .select({
        kind: postReactions.kind,
        mediaAssetId: postReactions.mediaAssetId,
      })
      .from(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)),
      )
      .for('update')
      .limit(1);
    if (
      existing?.kind === kind &&
      existing.mediaAssetId === (mediaAssetId ?? null)
    ) {
      return { changed: false, replacedMediaAssetId: null };
    }
    await transaction
      .update(postReactions)
      .set({ kind, mediaAssetId: mediaAssetId ?? null, updatedAt: now })
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)),
      );
    return {
      changed: true,
      replacedMediaAssetId: existing?.mediaAssetId ?? null,
    };
  }

  private async removeReaction(
    transaction: InteractionTransaction,
    userId: UserId,
    postId: PostId,
  ): Promise<{ changed: boolean; replacedMediaAssetId: string | null }> {
    const [deleted] = await transaction
      .delete(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)),
      )
      .returning({ mediaAssetId: postReactions.mediaAssetId });
    return {
      changed: Boolean(deleted),
      replacedMediaAssetId: deleted?.mediaAssetId ?? null,
    };
  }

  private async queueReplacedReactionMedia(
    transaction: InteractionTransaction,
    replacedMediaAssetId: string | null,
    currentMediaAssetId?: MediaAssetId,
  ): Promise<void> {
    if (!replacedMediaAssetId || replacedMediaAssetId === currentMediaAssetId) {
      return;
    }
    const [replacedAsset] = await transaction
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, replacedMediaAssetId))
      .limit(1);
    if (replacedAsset) {
      await transaction
        .insert(mediaJobOutbox)
        .values(mediaDeletionOutboxEntry(replacedAsset));
    }
  }

  private invalidReactionMedia(): never {
    throw new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_REACTION_MEDIA',
      'That captured reaction photo is unavailable or already attached.',
    );
  }

  private mapComment(
    row: { comment: CommentRow; profile: typeof profiles.$inferSelect },
    avatarUrls: ReadonlyMap<UserId, string | null>,
    interactions: CommentInteractions,
    replies: Comment[],
  ): Comment {
    const deleted = row.comment.status === 'deleted';
    return {
      id: row.comment.id as CommentId,
      postId: row.comment.postId as PostId,
      parentCommentId: row.comment.parentCommentId as CommentId | null,
      author: {
        userId: row.comment.authorUserId as UserId,
        username: row.profile.username ?? '',
        displayName:
          row.profile.displayName ?? row.profile.username ?? 'Paldora member',
        avatarUrl: avatarUrls.get(row.comment.authorUserId as UserId) ?? null,
      },
      content: deleted ? '' : row.comment.content,
      deleted,
      editedAt: row.comment.editedAt?.toISOString() ?? null,
      createdAt: row.comment.createdAt.toISOString(),
      updatedAt: row.comment.updatedAt.toISOString(),
      interactions,
      replies,
    };
  }

  private commentNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'COMMENT_NOT_FOUND',
      'That comment is unavailable.',
    );
  }
}

function emptyCommentInteractions(): CommentInteractions {
  return { reactions: [], currentUserReaction: null };
}
