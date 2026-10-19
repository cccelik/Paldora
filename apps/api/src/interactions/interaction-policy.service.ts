import { Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  comments,
  hiddenByBlock,
  posts,
  type CommentRow,
  type DatabaseExecutor,
} from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { boxArchived } from '../boxes/box-errors.js';
import {
  isReadable,
  loadPostContext,
  type PostContext,
} from '../posts/post-context.js';
import { postNotFound } from '../posts/post-errors.js';
import { commentNotFound } from './interaction-errors.js';

/** A comment the viewer may see, with what decides what they may do. */
export interface CommentContext {
  readonly comment: CommentRow;
  /** The root of its thread (itself for a root). */
  readonly rootId: string;
  readonly boxId: string;
  readonly boxStatus: BoxStatus;
}

const root = alias(comments, 'root_comment');

/**
 * The only place interaction access is decided. Every read starts from the
 * post's context (membership, Box status, block with the author), so "not
 * allowed" is one code path: POST_NOT_FOUND for posts and COMMENT_NOT_FOUND
 * for comments, whatever the reason. Writes additionally hold the Box row
 * `FOR SHARE`, so archiving cannot slip in between check and write.
 */
@Injectable()
export class InteractionPolicyService {
  /** A visible, active post in one of the viewer's Boxes. */
  public async postForRead(
    executor: DatabaseExecutor,
    viewerId: string,
    postId: string,
  ): Promise<PostContext> {
    const context = await loadPostContext(executor, viewerId, postId);
    if (!isReadable(context)) throw postNotFound();
    return context;
  }

  /** As `postForRead`, inside a transaction, in a Box that is still open. */
  public async postForWrite(
    transaction: DatabaseExecutor,
    viewerId: string,
    postId: string,
  ): Promise<PostContext> {
    const context = await this.postForRead(transaction, viewerId, postId);
    await this.lockOpenBox(transaction, context.post.boxId);
    return context;
  }

  /**
   * A comment whose post the viewer may read, whose author and thread root
   * are not in a block relationship with them. Deleted comments are returned
   * (callers decide what a tombstone allows); invisible ones are not.
   */
  public async commentFor(
    executor: DatabaseExecutor,
    viewerId: string,
    commentId: string,
  ): Promise<CommentContext> {
    const [row] = await executor
      .select({
        comment: comments,
        boxId: posts.boxId,
        boxStatus: boxes.status,
        visible: sql<boolean>`(${posts.status} = 'active'
          and not ${hiddenByBlock(viewerId, posts.authorUserId)}
          and not ${hiddenByBlock(viewerId, comments.authorUserId)}
          and (${root.id} is null or not ${hiddenByBlock(viewerId, root.authorUserId)}))`.mapWith(
          Boolean,
        ),
      })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(boxes, eq(boxes.id, posts.boxId))
      .innerJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, posts.boxId),
          eq(boxMemberships.userId, viewerId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .leftJoin(root, eq(root.id, comments.parentCommentId))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row?.visible) throw commentNotFound();
    return {
      comment: row.comment,
      rootId: row.comment.parentCommentId ?? row.comment.id,
      boxId: row.boxId,
      boxStatus: row.boxStatus,
    };
  }

  /** Holds the Box row `FOR SHARE` until commit; archived Boxes are read-only. */
  public async lockOpenBox(
    transaction: DatabaseExecutor,
    boxId: string,
  ): Promise<void> {
    const [box] = await transaction
      .select({ status: boxes.status })
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .for('share')
      .limit(1);
    if (box?.status !== 'active') throw boxArchived();
  }
}
