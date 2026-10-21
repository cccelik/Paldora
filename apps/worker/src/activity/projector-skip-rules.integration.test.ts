import {
  boxMemberships,
  comments,
  postReactions,
  posts,
  userBlocks,
  users,
} from '@paldora/database';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activityTools } from '../test-support/activity.js';
import { connectTestDatabase } from '../test-support/database.js';

/** Events the projector completes without notifying anyone. */
const { database } = connectTestDatabase('paldora-projector-skip-test', {
  required: ['DATABASE_URL', 'REDIS_URL'],
});
const {
  commentBy,
  recordEvent,
  reactToPost,
  eventRow,
  notificationsFor,
  projectAll,
  scene,
} = activityTools(database);

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
