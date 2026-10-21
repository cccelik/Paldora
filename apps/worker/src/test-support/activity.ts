import {
  activityEvents,
  comments,
  notifications,
  postReactions,
  posts,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  beforeAnyRun,
  createBox,
  createPerson,
} from '@paldora/database/testing';
import { and, eq, inArray } from 'drizzle-orm';
import type { CreatedNotification } from '../activity/projection-rules.js';
import { projectOnce, type ProjectEvent } from '../activity/projector.js';
import type { NotificationPublisher } from '../activity/realtime-publisher.js';

/** Records what would have been published, in order. */
export function recordingPublisher(): NotificationPublisher & {
  published: CreatedNotification[];
} {
  const published: CreatedNotification[] = [];
  return {
    published,
    notificationsCreated: async (created) => {
      published.push(...created);
    },
  };
}

export type RecordedEvent =
  | {
      type: 'comment.created';
      actor: string;
      postId: string;
      commentId: string;
      reply: boolean;
    }
  | { type: 'post.reaction.set'; actor: string; postId: string }
  | {
      type: 'comment.reaction.set';
      actor: string;
      postId: string;
      commentId: string;
    };

/**
 * Activity fixtures written straight to the database (the API is not
 * running), and a projector loop that tolerates other suites' rows.
 */
export function activityTools(database: PaldoraDatabase) {
  const person = (status: 'active' | 'suspended' = 'active') =>
    createPerson(database, { status, label: 'projector' });

  /** A Box owned by the first person, with everyone else as members. */
  const boxWith = (owner: string, ...members: string[]) =>
    createBox(database, owner, members, { name: 'Projector crew' });

  async function postBy(boxId: string, authorUserId: string) {
    const [post] = await database
      .insert(posts)
      .values({ boxId, authorUserId, content: 'a post' })
      .returning({ id: posts.id });
    if (!post) throw new Error('post insert failed');
    return post.id;
  }

  async function commentBy(
    postId: string,
    authorUserId: string,
    parent?: { id: string; replyToUserId: string | null },
  ) {
    const [comment] = await database
      .insert(comments)
      .values({
        postId,
        authorUserId,
        content: 'a comment',
        parentCommentId: parent?.id ?? null,
        replyToUserId: parent?.replyToUserId ?? null,
      })
      .returning({ id: comments.id });
    if (!comment) throw new Error('comment insert failed');
    return comment.id;
  }

  /**
   * Inserts an event the way the API's `recordActivity` does. Its claim time
   * is set earlier than any earlier run used, so the oldest-first claim
   * reaches it before rows other suites or interrupted runs left behind.
   */
  async function recordEvent(event: RecordedEvent) {
    const dedupeKey =
      event.type === 'comment.created'
        ? `${event.reply ? 'comment.reply' : 'post.comment'}:${event.commentId}`
        : event.type === 'post.reaction.set'
          ? `post.reaction:${event.postId}:${event.actor}`
          : `comment.reaction:${event.commentId}:${event.actor}`;
    const [row] = await database
      .insert(activityEvents)
      .values({
        type: event.type,
        actorUserId: event.actor,
        postId: event.postId,
        commentId: event.type === 'post.reaction.set' ? null : event.commentId,
        dedupeKey,
        availableAt: beforeAnyRun(),
      })
      .onConflictDoNothing({ target: activityEvents.dedupeKey })
      .returning({ id: activityEvents.id });
    return { id: row?.id, dedupeKey };
  }

  async function reactToPost(postId: string, userId: string, kind = '👍') {
    await database.insert(postReactions).values({ postId, userId, kind });
    return recordEvent({ type: 'post.reaction.set', actor: userId, postId });
  }

  async function eventRow(id: string | undefined) {
    if (!id) throw new Error('event was not recorded');
    const [row] = await database
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.id, id));
    if (!row) throw new Error('event vanished');
    return row;
  }

  const notificationsFor = (dedupeKeys: readonly string[]) =>
    database
      .select()
      .from(notifications)
      .where(inArray(notifications.dedupeKey, [...dedupeKeys]));

  /** Projects until none of `ids` is still due (other suites' rows may share batches). */
  async function projectAll(
    ids: readonly (string | undefined)[],
    publisher: NotificationPublisher = recordingPublisher(),
    project?: ProjectEvent,
  ) {
    const wanted = ids.filter((id): id is string => id !== undefined);
    for (let round = 0; round < 10; round += 1) {
      // Sequential by protocol: each round must commit before the next claims.
      // eslint-disable-next-line no-await-in-loop
      await projectOnce(database, publisher, project ? { project } : {});
      // eslint-disable-next-line no-await-in-loop
      const due = await database
        .select({ id: activityEvents.id })
        .from(activityEvents)
        .where(
          and(
            inArray(activityEvents.id, wanted),
            eq(activityEvents.status, 'pending'),
          ),
        );
      if (due.length === 0) return;
    }
  }

  /** A post author, a commenter, and a third member around one post. */
  async function scene() {
    const [author, guest, third] = await Promise.all([
      person(),
      person(),
      person(),
    ]);
    const boxId = await boxWith(author, guest, third);
    const postId = await postBy(boxId, author);
    return { author, guest, third, boxId, postId };
  }

  return {
    person,
    boxWith,
    postBy,
    commentBy,
    recordEvent,
    reactToPost,
    eventRow,
    notificationsFor,
    projectAll,
    scene,
  };
}
