import {
  commentReactions,
  comments,
  mediaAssets,
  notifications,
  postReactions,
  type DatabaseTransaction,
} from '@paldora/database';
import { and, eq, inArray } from 'drizzle-orm';
import { retireAssets } from '../media/media-retirement.js';

/**
 * Erases everything people did with a post, inside the transaction that
 * deletes it. Posts are soft-deleted, so foreign-key cascades never fire:
 * comment text is erased (tombstones keep who and when), reactions and
 * notifications are deleted, and camera images are retired with their
 * storage cleanup queued. Imports nothing from `posts/`, so no cycle.
 */
export async function erasePostInteractions(
  transaction: DatabaseTransaction,
  postId: string,
): Promise<void> {
  const images = await transaction
    .select({ asset: mediaAssets })
    .from(postReactions)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
    .where(eq(postReactions.postId, postId))
    .for('update');
  await transaction
    .delete(postReactions)
    .where(eq(postReactions.postId, postId));
  await retireAssets(
    transaction,
    images.map((row) => row.asset),
  );
  const ofPost = transaction
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.postId, postId));
  await transaction
    .delete(commentReactions)
    .where(inArray(commentReactions.commentId, ofPost));
  const now = new Date();
  await transaction
    .update(comments)
    .set({ status: 'deleted', content: null, deletedAt: now, updatedAt: now })
    .where(and(eq(comments.postId, postId), eq(comments.status, 'active')));
  await transaction
    .delete(notifications)
    .where(eq(notifications.postId, postId));
}
