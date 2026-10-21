import { notifications } from '@paldora/database';
import type { NotificationType } from '@paldora/domain';
import { notificationPageSchema, unreadCountSchema } from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { client, json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

export interface Delivery {
  readonly recipient: TestUser;
  readonly actor: TestUser;
  readonly type: NotificationType;
  readonly postId: string;
  readonly commentId?: string;
  readonly createdAt?: Date;
}

/** The key the worker's projector gives the same notification. */
export function dedupeKeyOf(delivery: Delivery): string {
  switch (delivery.type) {
    case 'post.comment':
    case 'comment.reply':
      return `${delivery.type}:${delivery.commentId ?? ''}`;
    case 'post.reaction':
      return `post.reaction:${delivery.postId}:${delivery.actor.id}`;
    case 'comment.reaction':
      return `comment.reaction:${delivery.commentId ?? ''}:${delivery.actor.id}`;
  }
}

/**
 * Notification tooling for API tests. The projector runs in the worker, which
 * these tests do not start, so `deliver` writes the row the projector would
 * (IDs only, same key); the worker suite tests the projection itself. Reads
 * always go through the real API, so visibility is what is under test.
 */
export function notificationTools(app: TestApp) {
  async function deliver(delivery: Delivery): Promise<string> {
    const dedupeKey = dedupeKeyOf(delivery);
    await app.database
      .insert(notifications)
      .values({
        recipientUserId: delivery.recipient.id,
        actorUserId: delivery.actor.id,
        type: delivery.type,
        postId: delivery.postId,
        commentId: delivery.commentId ?? null,
        dedupeKey,
        ...(delivery.createdAt ? { createdAt: delivery.createdAt } : {}),
      })
      .onConflictDoNothing({ target: notifications.dedupeKey });
    const [row] = await app.database
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupeKey, dedupeKey));
    if (!row) throw new Error('notification not delivered');
    return row.id;
  }

  async function inbox(user: TestUser, query = '') {
    return notificationPageSchema.parse(
      await json(await client(app, user).get(`/me/notifications${query}`)),
    );
  }

  async function unread(user: TestUser) {
    return unreadCountSchema.parse(
      await json(await client(app, user).get('/me/notifications/unread-count')),
    );
  }

  /** The IDs the person can see right now, newest first (first page). */
  async function visibleIds(user: TestUser) {
    return (await inbox(user, '?limit=50')).items.map((item) => item.id);
  }

  return { deliver, inbox, unread, visibleIds };
}
