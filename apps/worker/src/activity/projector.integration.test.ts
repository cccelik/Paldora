import {
  activityEvents,
  boxMemberships,
  commentReactions,
  lifeUpdateDeliveries,
  lifeUpdates,
  postReactions,
  posts,
} from '@paldora/database';
import { beforeAnyRun } from '@paldora/database/testing';
import { realtimeEventSchema, userChannel } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { activityTools, recordingPublisher } from '../test-support/activity.js';
import { connectTestDatabase, silentLogger } from '../test-support/database.js';
import { MAX_ACTIVITY_ATTEMPTS } from './activity-store.js';
import { projectEvent } from './projection-rules.js';
import { projectBatch, projectOnce, type ProjectEvent } from './projector.js';
import { createRealtimePublisher } from './realtime-publisher.js';

/** Projection, dedupe, concurrency, failure handling, and realtime hints. */
const { database, env } = connectTestDatabase('paldora-projector-test', {
  required: ['DATABASE_URL', 'REDIS_URL'],
});
const { REDIS_URL } = env;
const logger = silentLogger();
const {
  person,
  boxWith,
  commentBy,
  recordEvent,
  reactToPost,
  eventRow,
  notificationsFor,
  projectAll,
  scene,
} = activityTools(database);

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
        .set({ availableAt: beforeAnyRun() })
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
