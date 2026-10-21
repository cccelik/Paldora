import { hiddenByBlock, type DatabaseExecutor } from '@paldora/database';
import { ACTIVITY_EVENT_TYPES, type ActivityEventType } from '@paldora/domain';
import { sql, type SQL } from 'drizzle-orm';

/** What a projection created; the publisher turns it into a realtime hint. */
export interface CreatedNotification {
  readonly id: string;
  readonly recipientUserId: string;
  readonly postId: string;
}

const isActivityEventType = (type: string): type is ActivityEventType =>
  (ACTIVITY_EVENT_TYPES as readonly string[]).includes(type);

/**
 * Per event type, the one notification it may become: who is addressed,
 * about what. Every candidate exposes the same columns (`event_id`, `type`,
 * `recipient_user_id`, `actor_user_id`, `post_id`, `comment_id`,
 * `dedupe_key`), and yields no row when the target is gone: a deleted
 * comment, or a reaction that was removed before projection.
 *
 * Recipients (plan section G): a root comment tells the post author; a reply
 * tells whom it answers (`reply_to_user_id`, else the root's author); a post
 * reaction tells the post author; a comment reaction the comment's author.
 * The event's `dedupe_key` already equals the notification's key.
 */
const candidates: Record<ActivityEventType, (eventId: string) => SQL> = {
  'comment.created': (eventId) => sql`
    select e.id as event_id,
      case when c.parent_comment_id is null
        then 'post.comment' else 'comment.reply' end as type,
      case when c.parent_comment_id is null
        then p.author_user_id
        else coalesce(c.reply_to_user_id, root.author_user_id) end as recipient_user_id,
      e.actor_user_id, e.post_id, e.comment_id, e.dedupe_key
    from paldora.activity_events e
    join paldora.posts p on p.id = e.post_id
    join paldora.comments c on c.id = e.comment_id
      and c.post_id = e.post_id
      and c.author_user_id = e.actor_user_id
      and c.status = 'active'
    left join paldora.comments root on root.id = c.parent_comment_id
    where e.id = ${eventId}`,
  'post.reaction.set': (eventId) => sql`
    select e.id as event_id, 'post.reaction' as type,
      p.author_user_id as recipient_user_id,
      e.actor_user_id, e.post_id, null::uuid as comment_id, e.dedupe_key
    from paldora.activity_events e
    join paldora.posts p on p.id = e.post_id
    where e.id = ${eventId}
      and exists (
        select 1 from paldora.post_reactions r
        where r.post_id = e.post_id and r.user_id = e.actor_user_id
      )`,
  'comment.reaction.set': (eventId) => sql`
    select e.id as event_id, 'comment.reaction' as type,
      c.author_user_id as recipient_user_id,
      e.actor_user_id, e.post_id, e.comment_id, e.dedupe_key
    from paldora.activity_events e
    join paldora.comments c on c.id = e.comment_id
      and c.post_id = e.post_id
      and c.status = 'active'
    where e.id = ${eventId}
      and exists (
        select 1 from paldora.comment_reactions r
        where r.comment_id = e.comment_id and r.user_id = e.actor_user_id
      )`,
};

/**
 * One set-based statement per event: the candidate, filtered by the rules
 * every notification shares, inserted unless its key already exists. The
 * skip rules: the recipient is the actor; the recipient is not active or no
 * longer an active member of the post's Box; a block in either direction
 * (the shared `hiddenByBlock` definition); the post is not active. A skipped
 * event inserts nothing and is still complete. The read path rechecks all of
 * this, because any of it can change after the notification exists.
 */
export function projectionStatement(
  type: ActivityEventType,
  eventId: string,
): SQL {
  return sql`
    with candidate as (${candidates[type](eventId)})
    insert into paldora.notifications (
      recipient_user_id, actor_user_id, type, post_id, comment_id,
      activity_event_id, dedupe_key
    )
    select n.recipient_user_id, n.actor_user_id, n.type, n.post_id,
      n.comment_id, n.event_id, n.dedupe_key
    from candidate n
    join paldora.posts p on p.id = n.post_id and p.status = 'active'
    join paldora.users recipient on recipient.id = n.recipient_user_id
      and recipient.status = 'active'
    join paldora.box_memberships m on m.box_id = p.box_id
      and m.user_id = n.recipient_user_id
      and m.status = 'active'
    where n.recipient_user_id <> n.actor_user_id
      and not ${hiddenByBlock(sql.raw('n.recipient_user_id'), sql.raw('n.actor_user_id'))}
    on conflict (dedupe_key) do nothing
    returning id, recipient_user_id, post_id`;
}

interface InsertedRow extends Record<string, unknown> {
  readonly id: string;
  readonly recipient_user_id: string;
  readonly post_id: string;
}

/** Projects one event; an unknown type throws and is retried, then dead. */
export async function projectEvent(
  executor: DatabaseExecutor,
  event: { readonly id: string; readonly type: string },
): Promise<CreatedNotification[]> {
  if (!isActivityEventType(event.type)) {
    throw new Error(`Unknown activity event type: ${event.type}`);
  }
  const result = await executor.execute<InsertedRow>(
    projectionStatement(event.type, event.id),
  );
  return result.rows.map((row) => ({
    id: row.id,
    recipientUserId: row.recipient_user_id,
    postId: row.post_id,
  }));
}
