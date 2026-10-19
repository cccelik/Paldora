import { activityEvents, type DatabaseExecutor } from '@paldora/database';

/**
 * One interaction worth a notification, recorded in the transaction that
 * makes it. Real foreign keys, never content: the worker's projector joins
 * live rows (and rechecks blocks, membership, and the target) when it turns
 * the event into a notification.
 */
export type ActivityEvent =
  | {
      readonly type: 'comment.created';
      readonly actorUserId: string;
      readonly postId: string;
      readonly commentId: string;
      /** A reply notifies whom it answers; a root comment the post author. */
      readonly isReply: boolean;
    }
  | {
      readonly type: 'post.reaction.set';
      readonly actorUserId: string;
      readonly postId: string;
    }
  | {
      readonly type: 'comment.reaction.set';
      readonly actorUserId: string;
      readonly postId: string;
      readonly commentId: string;
    };

/**
 * The notification key the event will project to (plan section G). It is
 * stable per person and target, so re-reacting after a removal, or a retried
 * request, records nothing new and can never notify twice.
 */
export function dedupeKeyOf(event: ActivityEvent): string {
  switch (event.type) {
    case 'comment.created':
      return event.isReply
        ? `comment.reply:${event.commentId}`
        : `post.comment:${event.commentId}`;
    case 'post.reaction.set':
      return `post.reaction:${event.postId}:${event.actorUserId}`;
    case 'comment.reaction.set':
      return `comment.reaction:${event.commentId}:${event.actorUserId}`;
  }
}

/**
 * The single insert into the interactions outbox. Call it inside the
 * transaction that writes the comment or the new reaction row, so the event
 * exists exactly when its cause commits. A repeated key is ignored.
 */
export async function recordActivity(
  executor: DatabaseExecutor,
  event: ActivityEvent,
): Promise<void> {
  await executor
    .insert(activityEvents)
    .values({
      type: event.type,
      actorUserId: event.actorUserId,
      postId: event.postId,
      commentId: event.type === 'post.reaction.set' ? null : event.commentId,
      dedupeKey: dedupeKeyOf(event),
    })
    .onConflictDoNothing({ target: activityEvents.dedupeKey });
}
