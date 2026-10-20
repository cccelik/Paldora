import { requireEnvironmentVariables } from '@paldora/config';
import {
  activityEvents,
  boxMemberships,
  boxes,
  commentReactions,
  comments,
  createDatabaseConnection,
  lifeUpdateDeliveries,
  lifeUpdates,
  notifications,
  postReactions,
  posts,
  profiles,
  userBlocks,
  users,
} from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { realtimeEventSchema, userChannel } from '@paldora/validation';
import { and, eq, inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { retainActivity } from '../maintenance/activity-retention.js';
import { MAX_ACTIVITY_ATTEMPTS } from './activity-store.js';
import { projectEvent, type CreatedNotification } from './projection-rules.js';
import { projectBatch, projectOnce, type ProjectEvent } from './projector.js';
import {
  createRealtimePublisher,
  type NotificationPublisher,
} from './realtime-publisher.js';

const { DATABASE_URL, REDIS_URL } = requireEnvironmentVariables(
  ['DATABASE_URL', 'REDIS_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 6,
  applicationName: 'paldora-projector-test',
});
const database = connection.database;
const logger = createLogger({
  service: 'worker',
  environment: 'test',
  level: 'silent',
});

afterAll(() => connection.close());

/** Records what would have been published, in order. */
function recordingPublisher(): NotificationPublisher & {
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

// --- Fixtures written straight to the database (the API is not running) ----

async function person(status: 'active' | 'suspended' = 'active') {
  const email = `projector-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({
      authSubject: `subject-${randomUUID()}`,
      email,
      emailNormalized: email,
      status,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  await database.insert(profiles).values({ userId: user.id });
  return user.id;
}

/** A Box owned by the first person, with everyone else as members. */
async function boxWith(...people: string[]) {
  const [box] = await database
    .insert(boxes)
    .values({ name: 'Projector crew' })
    .returning({ id: boxes.id });
  if (!box) throw new Error('box insert failed');
  await database.insert(boxMemberships).values(
    people.map((userId, index) => ({
      boxId: box.id,
      userId,
      role: index === 0 ? ('owner' as const) : ('member' as const),
    })),
  );
  return box.id;
}

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
 * Inserts an event the way the API's `recordActivity` does. Its claim time is
 * set earlier than any earlier run used, so the oldest-first claim reaches it
 * before rows other suites or interrupted runs left behind.
 */
async function recordEvent(
  event:
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
      },
) {
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
      availableAt: new Date(-Date.now()),
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

    await projectOnce(database, publisher, project ? { project } : {});

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

describe('activity projector', () => {
  it('projects each event type to the addressed person', async () => {
    const { author, guest, third, postId } = await scene();
    const root = await commentBy(postId, guest);
    const reply = await commentBy(postId, third, {
      id: root,
      replyToUserId: guest,
    });
    const events = [
      await recordEvent({
        type: 'comment.created',
        actor: guest,
        postId,
        commentId: root,
        reply: false,
      }),
      await recordEvent({
        type: 'comment.created',
        actor: third,
        postId,
        commentId: reply,
        reply: true,
      }),
      await reactToPost(postId, guest),
    ];
    await database
      .insert(commentReactions)
      .values({ commentId: root, userId: third, kind: '🎉' });
    events.push(
      await recordEvent({
        type: 'comment.reaction.set',
        actor: third,
        postId,
        commentId: root,
      }),
    );
    const publisher = recordingPublisher();
    await projectAll(
      events.map((event) => event.id),
      publisher,
    );

    const rows = await notificationsFor(events.map((event) => event.dedupeKey));
    const byKey = new Map(rows.map((row) => [row.dedupeKey, row]));
    expect(byKey.get(`post.comment:${root}`)).toMatchObject({
      type: 'post.comment',
      recipientUserId: author,
      actorUserId: guest,
      postId,
      commentId: root,
      readAt: null,
    });
    expect(byKey.get(`comment.reply:${reply}`)).toMatchObject({
      type: 'comment.reply',
      recipientUserId: guest,
      actorUserId: third,
      commentId: reply,
    });
    expect(byKey.get(`post.reaction:${postId}:${guest}`)).toMatchObject({
      type: 'post.reaction',
      recipientUserId: author,
      commentId: null,
    });
    expect(byKey.get(`comment.reaction:${root}:${third}`)).toMatchObject({
      type: 'comment.reaction',
      recipientUserId: guest,
      commentId: root,
    });
    for (const event of events) {
      const row = await eventRow(event.id);
      expect(row).toMatchObject({ status: 'completed', attempts: 1 });
      expect(byKey.get(event.dedupeKey)?.activityEventId).toBe(event.id);
    }
    // Hints go to each recipient, after commit, carrying IDs only.
    const mine = publisher.published.filter((created) =>
      rows.some((row) => row.id === created.id),
    );
    expect(mine).toHaveLength(4);
    expect(new Set(mine.map((created) => created.recipientUserId))).toEqual(
      new Set([author, guest]),
    );
  });

  it('sends a reply whose addressee is gone to the root author', async () => {
    const { guest, third, postId } = await scene();
    const root = await commentBy(postId, guest);
    const reply = await commentBy(postId, third, {
      id: root,
      replyToUserId: null,
    });
    const event = await recordEvent({
      type: 'comment.created',
      actor: third,
      postId,
      commentId: reply,
      reply: true,
    });
    await projectAll([event.id]);
    const [row] = await notificationsFor([event.dedupeKey]);
    expect(row?.recipientUserId).toBe(guest);
  });

  it('never notifies twice: double projection and re-reacting after removal', async () => {
    const { guest, postId } = await scene();
    const first = await reactToPost(postId, guest);
    await projectAll([first.id]);
    // Projected again (e.g. a replica re-ran it): the key decides.
    await database
      .update(activityEvents)
      .set({ status: 'pending', completedAt: null })
      .where(eq(activityEvents.id, first.id ?? ''));
    await projectAll([first.id]);
    expect(await eventRow(first.id)).toMatchObject({ status: 'completed' });
    // Removing and reacting again records no new event at all.
    await database
      .delete(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, guest)),
      );
    const again = await reactToPost(postId, guest, '❤️');
    expect(again.id).toBeUndefined();
    expect(await notificationsFor([first.dedupeKey])).toHaveLength(1);
  });

  it('lets two projectors run at once without duplicates', async () => {
    const { author, boxId, postId } = await scene();
    const reactors = await Promise.all(
      Array.from({ length: 12 }, () => person()),
    );
    await database
      .insert(boxMemberships)
      .values(reactors.map((userId) => ({ boxId, userId })));
    const events = await Promise.all(
      reactors.map((userId) => reactToPost(postId, userId)),
    );
    const publishers = [recordingPublisher(), recordingPublisher()];
    await Promise.all(
      publishers.map((publisher) => projectOnce(database, publisher)),
    );
    await projectAll(events.map((event) => event.id));

    const rows = await notificationsFor(events.map((event) => event.dedupeKey));
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.recipientUserId === author)).toBe(true);
    const ids = rows.map((row) => row.id);
    const published = publishers.flatMap((publisher) =>
      publisher.published.filter((created) => ids.includes(created.id)),
    );
    // Each notification was announced once, by whichever projector made it.
    expect(new Set(published.map((created) => created.id)).size).toBe(
      published.length,
    );
  });

  it('rolls back only a poison event, backs it off, and dead-letters it at the limit', async () => {
    const { guest, third, postId } = await scene();
    const [before, poison, after] = await Promise.all([
      reactToPost(postId, guest),
      (async () => {
        const root = await commentBy(postId, guest);
        return recordEvent({
          type: 'comment.created',
          actor: guest,
          postId,
          commentId: root,
          reply: false,
        });
      })(),
      reactToPost(postId, third),
    ]);
    // The poison event makes its notification, then fails: the savepoint
    // must undo that insert and nothing else.
    const project: ProjectEvent = async (executor, event) => {
      const created = await projectEvent(executor, event);
      if (event.id === poison.id) throw new Error('poisoned');
      return created;
    };
    const startedAt = Date.now();
    await projectAll([before.id, after.id], recordingPublisher(), project);

    expect(await eventRow(before.id)).toMatchObject({ status: 'completed' });
    expect(await eventRow(after.id)).toMatchObject({ status: 'completed' });
    const failed = await eventRow(poison.id);
    expect(failed).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'poisoned',
    });
    expect(failed.availableAt.getTime()).toBeGreaterThan(startedAt);
    expect(await notificationsFor([poison.dedupeKey])).toHaveLength(0);
    expect(
      await notificationsFor([before.dedupeKey, after.dedupeKey]),
    ).toHaveLength(2);

    for (let attempt = 2; attempt <= MAX_ACTIVITY_ATTEMPTS; attempt += 1) {
      // Skips the backoff wait: due again now, ahead of other rows.

      await database
        .update(activityEvents)
        .set({ availableAt: new Date(-Date.now()) })
        .where(eq(activityEvents.id, poison.id ?? ''));

      await projectOnce(database, recordingPublisher(), { project });

      const row = await eventRow(poison.id);
      expect(row.attempts).toBe(attempt);
      expect(row.status).toBe(
        attempt === MAX_ACTIVITY_ATTEMPTS ? 'dead' : 'pending',
      );
    }
    expect(await notificationsFor([poison.dedupeKey])).toHaveLength(0);
  });

  it('leaves the event pending after a crash before commit, then projects it once', async () => {
    const { guest, postId } = await scene();
    const event = await reactToPost(postId, guest);
    await expect(
      database.transaction(async (transaction) => {
        await projectBatch(transaction);
        throw new Error('worker crashed');
      }),
    ).rejects.toThrow('worker crashed');
    expect(await eventRow(event.id)).toMatchObject({
      status: 'pending',
      attempts: 0,
    });
    expect(await notificationsFor([event.dedupeKey])).toHaveLength(0);

    await projectAll([event.id]);
    expect(await notificationsFor([event.dedupeKey])).toHaveLength(1);
    expect(await eventRow(event.id)).toMatchObject({
      status: 'completed',
      attempts: 1,
    });
  });

  it('keeps the notification when Redis is down at publish time', async () => {
    const { guest, postId } = await scene();
    const event = await reactToPost(postId, guest);
    const unreachable = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    unreachable.on('error', () => undefined);
    try {
      await projectAll(
        [event.id],
        createRealtimePublisher(unreachable, logger),
      );
    } finally {
      unreachable.disconnect();
    }
    expect(await notificationsFor([event.dedupeKey])).toHaveLength(1);
    expect(await eventRow(event.id)).toMatchObject({ status: 'completed' });
  });

  it('publishes an ID-only hint on the recipient’s user channel', async () => {
    const { author, guest, postId } = await scene();
    const subscriber = new Redis(REDIS_URL ?? '');
    const publisherConnection = new Redis(REDIS_URL ?? '', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    try {
      const received = new Promise<unknown>((resolve) => {
        subscriber.on('message', (_channel, message: string) =>
          resolve(JSON.parse(message)),
        );
      });
      await subscriber.subscribe(userChannel(author));
      // Fail-fast like production: wait until it is connected.
      if (publisherConnection.status !== 'ready') {
        await new Promise((resolve) => {
          publisherConnection.once('ready', resolve);
        });
      }
      const event = await reactToPost(postId, guest);
      await projectAll(
        [event.id],
        createRealtimePublisher(publisherConnection, logger),
      );
      const [row] = await notificationsFor([event.dedupeKey]);
      const hint = await received;
      expect(Object.keys(hint as object).sort()).toEqual([
        'at',
        'notificationId',
        'postId',
        'type',
      ]);
      expect(realtimeEventSchema.parse(hint)).toMatchObject({
        type: 'notification.created',
        notificationId: row?.id,
        postId,
      });
    } finally {
      subscriber.disconnect();
      publisherConnection.disconnect();
    }
  });
});

describe('projector skip rules', () => {
  /** Projects and expects a completed event with no notification. */
  async function expectSkipped(event: {
    id: string | undefined;
    dedupeKey: string;
  }) {
    await projectAll([event.id]);
    expect(await eventRow(event.id)).toMatchObject({ status: 'completed' });
    expect(await notificationsFor([event.dedupeKey])).toHaveLength(0);
  }

  it('skips the actor’s own activity', async () => {
    const { author, postId } = await scene();
    await expectSkipped(await reactToPost(postId, author));
  });

  it('skips a recipient who is not active', async () => {
    const { author, guest, postId } = await scene();
    await database
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, author));
    await expectSkipped(await reactToPost(postId, guest));
  });

  it('skips a recipient who left the Box', async () => {
    const { author, guest, boxId, postId } = await scene();
    const event = await reactToPost(postId, guest);
    await database
      .update(boxMemberships)
      .set({ status: 'left', role: 'member' })
      .where(
        and(eq(boxMemberships.boxId, boxId), eq(boxMemberships.userId, author)),
      );
    await expectSkipped(event);
  });

  it.each(['recipient blocked the actor', 'actor blocked the recipient'])(
    'skips when the %s',
    async (direction) => {
      const { author, guest, postId } = await scene();
      const event = await reactToPost(postId, guest);
      await database
        .insert(userBlocks)
        .values(
          direction === 'recipient blocked the actor'
            ? { blockerId: author, blockedId: guest }
            : { blockerId: guest, blockedId: author },
        );
      await expectSkipped(event);
    },
  );

  it('skips a deleted post', async () => {
    const { guest, postId } = await scene();
    const event = await reactToPost(postId, guest);
    await database
      .update(posts)
      .set({ status: 'deleted', content: null, deletedAt: new Date() })
      .where(eq(posts.id, postId));
    await expectSkipped(event);
  });

  it('skips a comment deleted before projection', async () => {
    const { guest, postId } = await scene();
    const root = await commentBy(postId, guest);
    const event = await recordEvent({
      type: 'comment.created',
      actor: guest,
      postId,
      commentId: root,
      reply: false,
    });
    await database
      .update(comments)
      .set({ status: 'deleted', content: null, deletedAt: new Date() })
      .where(eq(comments.id, root));
    await expectSkipped(event);
  });

  it('skips reactions removed before projection', async () => {
    const { guest, third, postId } = await scene();
    const postEvent = await reactToPost(postId, third);
    await database
      .delete(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, third)),
      );
    await expectSkipped(postEvent);

    const root = await commentBy(postId, guest);
    const commentEvent = await recordEvent({
      type: 'comment.reaction.set',
      actor: third,
      postId,
      commentId: root,
    });
    await expectSkipped(commentEvent);
  });
});

describe('activity retention', () => {
  const day = 24 * 60 * 60 * 1_000;

  it('purges only old completed events and old notifications, and counts dead events', async () => {
    const { author, guest, postId } = await scene();
    const now = Date.now();
    const insertEvent = async (
      actor: string,
      status: 'completed' | 'dead',
      completedAgo?: number,
    ) => {
      const [row] = await database
        .insert(activityEvents)
        .values({
          type: 'post.reaction.set',
          actorUserId: actor,
          postId,
          dedupeKey: `retention:${randomUUID()}`,
          status,
          completedAt:
            completedAgo === undefined ? null : new Date(now - completedAgo),
        })
        .returning({ id: activityEvents.id });
      return row?.id ?? '';
    };
    const oldEvent = await insertEvent(guest, 'completed', 15 * day);
    const recentEvent = await insertEvent(guest, 'completed', 13 * day);
    const deadEvent = await insertEvent(guest, 'dead');
    const insertNotification = async (ageMs: number) => {
      const [row] = await database
        .insert(notifications)
        .values({
          recipientUserId: author,
          actorUserId: guest,
          type: 'post.reaction',
          postId,
          activityEventId: oldEvent,
          dedupeKey: `retention:${randomUUID()}`,
          createdAt: new Date(now - ageMs),
        })
        .returning({ id: notifications.id });
      return row?.id ?? '';
    };
    const oldNotification = await insertNotification(91 * day);
    const recentNotification = await insertNotification(89 * day);

    let result = await retainActivity(database);
    expect(result.deadActivityEvents).toBeGreaterThanOrEqual(1);
    for (let round = 0; round < 20; round += 1) {
      if (result.purgedActivityEvents === 0 && result.purgedNotifications === 0)
        break;
      // Sequential by protocol: each bounded batch commits before the next.

      result = await retainActivity(database);
    }

    const events = await database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(inArray(activityEvents.id, [oldEvent, recentEvent, deadEvent]));
    expect(events.map((row) => row.id).sort()).toEqual(
      [recentEvent, deadEvent].sort(),
    );
    const kept = await database
      .select({ id: notifications.id, eventId: notifications.activityEventId })
      .from(notifications)
      .where(inArray(notifications.id, [oldNotification, recentNotification]));
    // Purging an event never deletes its notification (SET NULL).
    expect(kept).toEqual([{ id: recentNotification, eventId: null }]);
  });
});

describe('Life Update deliveries (Phase 6)', () => {
  it('notifies the Life Update author of a comment or reaction on a backing post', async () => {
    const [author, guest] = await Promise.all([person(), person()]);
    const boxId = await boxWith(author, guest);
    const postId = await database.transaction(async (transaction) => {
      const [update] = await transaction
        .insert(lifeUpdates)
        .values({
          authorUserId: author,
          audience: 'boxes',
          sections: { travel: 'Lisbon' },
        })
        .returning({ id: lifeUpdates.id });
      const [post] = await transaction
        .insert(posts)
        .values({ boxId, authorUserId: author, kind: 'life_update' })
        .returning({ id: posts.id });
      if (!update || !post) throw new Error('life update insert failed');
      await transaction.insert(lifeUpdateDeliveries).values({
        lifeUpdateId: update.id,
        audience: 'boxes',
        authorUserId: author,
        position: 0,
        boxId,
        postId: post.id,
      });
      return post.id;
    });
    const commentId = await commentBy(postId, guest);
    const events = [
      await recordEvent({
        type: 'comment.created',
        actor: guest,
        postId,
        commentId,
        reply: false,
      }),
      await reactToPost(postId, guest),
    ];
    await projectAll(events.map((event) => event.id));
    const rows = await notificationsFor(events.map((event) => event.dedupeKey));
    expect(rows.map((row) => [row.type, row.recipientUserId]).sort()).toEqual(
      [
        ['post.comment', author],
        ['post.reaction', author],
      ].sort(),
    );
  });
});
