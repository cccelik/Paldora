import {
  commentReactions,
  comments,
  mediaAssets,
  notifications,
  postReactions,
  type DatabaseTransaction,
  retireMediaAssets,
} from '@paldora/database';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Erases everything people did with some posts (one post, or every backing
 * post of a Life Update), inside the transaction that deletes them. Posts are soft-deleted, so foreign-key cascades never fire:
 * comment text is erased (tombstones keep who and when), reactions and
 * notifications are deleted, and camera images are retired with their
 * storage cleanup queued. Imports nothing from `posts/`, so no cycle.
 */
export async function erasePostInteractions(
  transaction: DatabaseTransaction,
  postIds: readonly string[],
): Promise<void> {
  if (postIds.length === 0) return;
  const ids = [...postIds];
  const images = await transaction
    .select({ asset: mediaAssets })
    .from(postReactions)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
    .where(inArray(postReactions.postId, ids))
    .for('update');
  await transaction
    .delete(postReactions)
    .where(inArray(postReactions.postId, ids));
  await retireMediaAssets(
    transaction,
    images.map((row) => row.asset),
  );
  const ofPost = transaction
    .select({ id: comments.id })
    .from(comments)
    .where(inArray(comments.postId, ids));
  await transaction
    .delete(commentReactions)
    .where(inArray(commentReactions.commentId, ofPost));
  const now = new Date();
  await transaction
    .update(comments)
    .set({ status: 'deleted', content: null, deletedAt: now, updatedAt: now })
    .where(and(inArray(comments.postId, ids), eq(comments.status, 'active')));
  await transaction
    .delete(notifications)
    .where(inArray(notifications.postId, ids));
}
