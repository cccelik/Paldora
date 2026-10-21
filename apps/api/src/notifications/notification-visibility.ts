import {
  boxMemberships,
  commentReactions,
  comments,
  hiddenByBlock,
  notifications,
  postReactions,
  posts,
  profiles,
  users,
} from '@paldora/database';
import { and, eq, sql, type SQL } from 'drizzle-orm';

const activeComment = sql`exists (
  select 1 from ${comments}
  where ${comments.id} = ${notifications.commentId}
    and ${comments.status} = 'active'
    and ${comments.moderationHidden} = false
)`;

/**
 * Whether the notification row in the surrounding query may be shown to
 * `viewerId` now (plan section D). It is rechecked on every read (list,
 * unread count, mark-one), because anything here can change after the
 * notification was made:
 *
 * - it is the viewer's own row;
 * - the post is active and the viewer is an active member of its Box (a
 *   former member sees nothing; the shared `activeMembership` rule, written
 *   out here and cross-checked by a unit test);
 * - the actor is active, has a public face, and no block exists in either
 *   direction (the shared `hiddenByBlock` definition);
 * - the target is still live: the comment is active (comments and replies),
 *   the actor's post reaction still exists, or the comment is active and the
 *   actor's reaction on it still exists.
 *
 * Use it only in queries whose FROM is `notifications`, unaliased.
 */
export function visibleTo(viewerId: string): SQL {
  const target = sql`case ${notifications.type}
    when 'post.comment' then ${activeComment}
    when 'comment.reply' then ${activeComment}
    when 'post.reaction' then exists (
      select 1 from ${postReactions}
      where ${postReactions.postId} = ${notifications.postId}
        and ${postReactions.userId} = ${notifications.actorUserId}
    )
    when 'comment.reaction' then ${activeComment} and exists (
      select 1 from ${commentReactions}
      where ${commentReactions.commentId} = ${notifications.commentId}
        and ${commentReactions.userId} = ${notifications.actorUserId}
    )
    else false
  end`;
  const condition = and(
    eq(notifications.recipientUserId, viewerId),
    sql`exists (
      select 1 from ${posts}
      join ${boxMemberships} on ${boxMemberships.boxId} = ${posts.boxId}
        and ${boxMemberships.userId} = ${viewerId}
        and ${boxMemberships.status} = 'active'
      where ${posts.id} = ${notifications.postId}
        and ${posts.status} = 'active'
        and ${posts.moderationHidden} = false
    )`,
    sql`exists (
      select 1 from ${users}
      join ${profiles} on ${profiles.userId} = ${users.id}
      where ${users.id} = ${notifications.actorUserId}
        and ${users.status} = 'active'
        and ${profiles.username} is not null
    )`,
    sql`not ${hiddenByBlock(viewerId, notifications.actorUserId)}`,
    target,
  );
  if (!condition) throw new Error('Notification visibility is empty.');
  return condition;
}
