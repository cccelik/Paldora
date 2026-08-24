import { HttpStatus } from '@nestjs/common';
import {
  activityEvents,
  boxMemberships,
  boxes,
  comments,
  commentReactions,
  createDatabaseConnection,
  friendships,
  mediaAssets,
  mediaJobOutbox,
  notifications,
  postReactions,
  posts,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { MediaAssetId, PostId, UserId } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActivityEventDispatcher } from '../src/activity-event-dispatcher.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { InteractionAuthorizationPolicy } from '../src/interaction-authorization-policy.service.js';
import { InteractionService } from '../src/interaction.service.js';
import { NotificationService } from '../src/notification.service.js';
import { PostInteractionQueryService } from '../src/post-interaction-query.js';
import type { PostEventService } from '../src/post-event.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { createFakeObjectStorage } from './fake-object-storage.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Phase 5 interaction flow', () => {
  let connection: DatabaseConnection;
  let interactions: InteractionService;
  let notificationService: NotificationService;
  let dispatcher: ActivityEventDispatcher;
  let userIds: UserId[];
  let postId: PostId;
  let boxId: string;
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [0, 1, 2, 3].map(
    (index) => `interaction-${marker}-${index}`,
  );

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const avatars = new ProfileAvatarService(
      infrastructure,
      createFakeObjectStorage(),
    );
    const policy = new InteractionAuthorizationPolicy(infrastructure);
    const storage = createFakeObjectStorage();
    interactions = new InteractionService(
      infrastructure,
      policy,
      avatars,
      new PostInteractionQueryService(infrastructure, storage),
    );
    notificationService = new NotificationService(infrastructure, avatars);
    dispatcher = new ActivityEventDispatcher(infrastructure, {
      publishInteraction: () => Promise.resolve(true),
    } as unknown as PostEventService);
    const inserted = await connection.database
      .insert(users)
      .values(
        subjects.map((subject) => ({
          authSubject: subject,
          email: `${subject}@example.com`,
          emailNormalized: `${subject}@example.com`,
        })),
      )
      .returning({ id: users.id });
    userIds = inserted.map(({ id }) => id as UserId);
    await connection.database.insert(profiles).values(
      inserted.map(({ id }, index) => ({
        userId: id,
        username: `interaction_${marker}_${index}`,
        usernameNormalized: `interaction_${marker}_${index}`,
        displayName: `Interaction User ${index}`,
        onboardingState: 'complete' as const,
      })),
    );
    const [owner, member, replyAuthor] = requiredUsers(userIds);
    const [createdBox] = await connection.database
      .insert(boxes)
      .values({
        ownerUserId: owner,
        name: `Interaction ${marker}`,
        slug: `interaction-${marker}`,
      })
      .returning({ id: boxes.id });
    if (!createdBox) throw new Error('Test Box was not created.');
    boxId = createdBox.id;
    await connection.database.insert(boxMemberships).values([
      { boxId, userId: owner, role: 'owner' },
      { boxId, userId: member, role: 'member' },
      { boxId, userId: replyAuthor, role: 'member' },
    ]);
    const [createdPost] = await connection.database
      .insert(posts)
      .values({ boxId, authorUserId: owner, content: 'Interaction post' })
      .returning({ id: posts.id });
    if (!createdPost) throw new Error('Test post was not created.');
    postId = createdPost.id as PostId;
  });

  afterAll(async () => {
    await connection.database.delete(boxes).where(eq(boxes.id, boxId));
    await connection.database
      .delete(users)
      .where(eq(users.authSubject, subjects[0] ?? ''));
    await connection.pool.query(
      'delete from paldora.users where auth_subject = any($1::text[])',
      [subjects],
    );
    await connection.close();
  });

  it('creates comments and exactly one reply level with cursor pages', async () => {
    const [, member, replyAuthor] = requiredUsers(userIds);
    const root = await interactions.createComment(member, postId, 'First');
    const reply = await interactions.createComment(
      replyAuthor,
      postId,
      'Reply',
      root.id,
    );
    await expect(
      interactions.createComment(member, postId, 'Too deep', reply.id),
    ).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { error: { code: 'REPLY_DEPTH_EXCEEDED' } },
    });
    const page = await interactions.listComments(member, postId, { limit: 1 });
    expect(page.items[0]).toMatchObject({
      id: root.id,
      content: 'First',
      replies: [{ id: reply.id, content: 'Reply' }],
    });
    await expect(
      interactions.updateComment(member, root.id, 'Edited'),
    ).resolves.toMatchObject({
      content: 'Edited',
      editedAt: expect.any(String),
    });
    await interactions.deleteComment(member, root.id);
    const deleted = await connection.database
      .select()
      .from(comments)
      .where(eq(comments.id, root.id));
    expect(deleted[0]).toMatchObject({ status: 'deleted', content: '' });
  });

  it('serializes concurrent idempotent reaction writes', async () => {
    const [, member] = requiredUsers(userIds);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        interactions.setReaction(member, postId, '❤️'),
      ),
    );
    const rows = await connection.database
      .select()
      .from(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, member)),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('❤️');
    const events = await connection.database
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.type, 'reaction.set'),
          eq(activityEvents.actorUserId, member),
        ),
      );
    expect(events).toHaveLength(1);
  });

  it('reacts to comments idempotently and notifies the comment author', async () => {
    const [, member, reactor] = requiredUsers(userIds);
    const comment = await interactions.createComment(
      member,
      postId,
      'Reactable comment',
    );
    const summaries = await Promise.all(
      Array.from({ length: 8 }, () =>
        interactions.setCommentReaction(reactor, comment.id, '🥳'),
      ),
    );
    expect(summaries.at(-1)).toMatchObject({
      currentUserReaction: '🥳',
      reactions: [{ kind: '🥳', count: 1 }],
    });
    await expect(
      connection.database
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, comment.id)),
    ).resolves.toHaveLength(1);
    const page = await interactions.listComments(reactor, postId, {
      limit: 20,
    });
    expect(
      page.items.find(({ id }) => id === comment.id)?.interactions,
    ).toMatchObject({ currentUserReaction: '🥳' });
    await flushUntilNotification(member);
    await expect(
      connection.database
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientUserId, member),
            eq(notifications.type, 'comment.reaction'),
          ),
        ),
    ).resolves.toHaveLength(1);
    await interactions.setCommentReaction(reactor, comment.id, null);
    await expect(
      connection.database
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, comment.id)),
    ).resolves.toEqual([]);
    await interactions.deleteComment(member, comment.id);
    await expect(
      interactions.setCommentReaction(reactor, comment.id, '👍'),
    ).rejects.toMatchObject({
      response: { error: { code: 'COMMENT_NOT_FOUND' } },
    });
  });

  async function flushUntilNotification(
    recipientUserId: UserId,
  ): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await dispatcher.flush();
      const [projected] = await connection.database
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientUserId, recipientUserId),
            eq(notifications.type, 'comment.reaction'),
          ),
        )
        .limit(1);
      if (projected) return;
    }
  }

  it('projects deduplicated notifications from durable events', async () => {
    const [owner, member] = requiredUsers(userIds);
    await dispatcher.flush();
    await interactions.setReaction(member, postId, null);
    await interactions.setReaction(member, postId, '🙏');
    await dispatcher.flush();
    const projected = await connection.database
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, owner),
          eq(notifications.actorUserId, member),
          eq(notifications.type, 'post.reaction'),
        ),
      );
    expect(projected).toHaveLength(1);
    const page = await notificationService.list(owner, { limit: 20 });
    expect(page.unreadCount).toBeGreaterThan(0);
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'post.reaction', read: false }),
      ]),
    );
    const notification = page.items[0];
    if (!notification) throw new Error('Projected notification is missing.');
    await notificationService.markRead(owner, notification.id);
    await notificationService.markAllRead(owner);
    await expect(notificationService.unreadCount(owner)).resolves.toEqual({
      unreadCount: 0,
    });
  });

  it('attaches one private camera reaction and cleans it up when replaced', async () => {
    const [, member] = requiredUsers(userIds);
    const [asset] = await connection.database
      .insert(mediaAssets)
      .values({
        ownerUserId: member,
        boxId,
        purpose: 'reaction_image',
        objectKey: `reactions/${marker}.jpg`,
        contentType: 'image/jpeg',
        contentLength: 128,
        displayObjectKey: `reactions/${marker}.display.webp`,
        thumbnailObjectKey: `reactions/${marker}.thumbnail.webp`,
        status: 'ready',
      })
      .returning({ id: mediaAssets.id });
    if (!asset) throw new Error('Camera reaction asset was not created.');
    await expect(
      interactions.setReaction(
        member,
        postId,
        'real',
        asset.id as MediaAssetId,
      ),
    ).resolves.toMatchObject({
      currentUserReaction: 'real',
      realReactions: [
        expect.objectContaining({
          mediaAssetId: asset.id,
          thumbnailUrl: expect.stringContaining('signed:'),
        }),
      ],
    });
    await interactions.setReaction(member, postId, '😮');
    const cleanup = await connection.database
      .select()
      .from(mediaJobOutbox)
      .where(eq(mediaJobOutbox.mediaAssetId, asset.id));
    expect(cleanup).toHaveLength(1);
  });

  it('hides interactions from outsiders, removed members, blocks, and deleted posts', async () => {
    const [owner, member, , outsider] = requiredUsers(userIds);
    await expect(
      interactions.listComments(outsider, postId, { limit: 20 }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    const [low, high] = member < owner ? [member, owner] : [owner, member];
    await connection.database.insert(friendships).values({
      userLowId: low,
      userHighId: high,
      initiatedByUserId: member,
      blockedByUserId: owner,
      status: 'blocked',
    });
    await expect(
      interactions.createComment(member, postId, 'Blocked'),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { error: { code: 'INTERACTION_BLOCKED' } },
    });
    await connection.database
      .delete(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      );
    await connection.database
      .update(boxMemberships)
      .set({ status: 'removed' })
      .where(
        and(eq(boxMemberships.boxId, boxId), eq(boxMemberships.userId, member)),
      );
    await expect(
      interactions.setReaction(member, postId, '👍'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await connection.database
      .update(posts)
      .set({ status: 'deleted', content: '', deletedAt: new Date() })
      .where(eq(posts.id, postId));
    await expect(
      interactions.listComments(owner, postId, { limit: 20 }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});

function requiredUsers(values: UserId[]): [UserId, UserId, UserId, UserId] {
  const [first, second, third, fourth] = values;
  if (!first || !second || !third || !fourth) {
    throw new Error('Test users are missing.');
  }
  return [first, second, third, fourth];
}
