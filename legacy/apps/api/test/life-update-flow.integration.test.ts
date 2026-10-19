import { HttpStatus } from '@nestjs/common';
import {
  boxMemberships,
  createDatabaseConnection,
  friendships,
  lifeUpdates,
  mediaAssets,
  mediaJobOutbox,
  notifications,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { BoxId, MediaAssetId, UserId } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActivityEventDispatcher } from '../src/activity-event-dispatcher.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { InteractionAuthorizationPolicy } from '../src/interaction-authorization-policy.service.js';
import { InteractionService } from '../src/interaction.service.js';
import { LifeUpdateService } from '../src/life-update.service.js';
import { MemoryService } from '../src/memory.service.js';
import { NotificationService } from '../src/notification.service.js';
import { PostInteractionQueryService } from '../src/post-interaction-query.js';
import type { PostEventService } from '../src/post-event.service.js';
import { PostService } from '../src/post.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { createBoxService } from './create-box-service.js';
import { createFakeObjectStorage } from './fake-object-storage.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('multi-Box Life Update flow', () => {
  let connection: DatabaseConnection;
  let updates: LifeUpdateService;
  let posts: PostService;
  let interactions: InteractionService;
  let memories: MemoryService;
  let notificationService: NotificationService;
  let dispatcher: ActivityEventDispatcher;
  let userIds: UserId[];
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [0, 1, 2, 3].map(
    (index) => `life-update-${marker}-${index}`,
  );

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const storage = createFakeObjectStorage();
    const avatars = new ProfileAvatarService(infrastructure, storage);
    const interactionQueries = new PostInteractionQueryService(
      infrastructure,
      storage,
    );
    updates = new LifeUpdateService(
      infrastructure,
      avatars,
      interactionQueries,
      { publish: async () => true },
      storage,
    );
    posts = new PostService(
      infrastructure,
      avatars,
      { publish: async () => true },
      storage,
      interactionQueries,
    );
    interactions = new InteractionService(
      infrastructure,
      new InteractionAuthorizationPolicy(infrastructure),
      avatars,
      interactionQueries,
    );
    memories = new MemoryService(infrastructure, posts, updates);
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
        username: `life_${marker}_${index}`,
        usernameNormalized: `life_${marker}_${index}`,
        displayName: `Life Update User ${index}`,
        onboardingState: 'complete' as const,
      })),
    );
  });

  afterAll(async () => {
    await connection.pool.query(
      'delete from paldora.boxes where owner_user_id = any($1::uuid[])',
      [userIds],
    );
    await connection.pool.query(
      'delete from paldora.users where auth_subject = any($1::text[])',
      [subjects],
    );
    await connection.close();
  });

  it('publishes atomically with private contexts and cleans the final delivery', async () => {
    const [author, memberOfBoth, memberOfFirst, outsider] =
      requiredUsers(userIds);
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const boxService = createBoxService(
      infrastructure,
      new ProfileAvatarService(infrastructure, createFakeObjectStorage()),
    );
    const firstBox = await boxService.create(author, `First ${marker}`);
    const secondBox = await boxService.create(author, `Second ${marker}`);
    await connection.database.insert(boxMemberships).values([
      { boxId: firstBox.id, userId: memberOfBoth, role: 'member' },
      { boxId: secondBox.id, userId: memberOfBoth, role: 'member' },
      { boxId: firstBox.id, userId: memberOfFirst, role: 'member' },
    ]);
    const [asset] = await connection.database
      .insert(mediaAssets)
      .values({
        ownerUserId: author,
        purpose: 'life_update_image',
        objectKey: `life-updates/${author}/${marker}.jpg`,
        contentType: 'image/jpeg',
        contentLength: 128,
        displayObjectKey: `life-updates/${author}/${marker}.display.webp`,
        thumbnailObjectKey: `life-updates/${author}/${marker}.thumb.webp`,
        status: 'ready',
      })
      .returning({ id: mediaAssets.id });
    if (!asset) throw new Error('Life Update test media is missing.');

    const beforeInvalid = await activeUpdateCount(author);
    await expect(
      updates.create(author, {
        audience: {
          type: 'boxes',
          boxIds: [firstBox.id, randomUUID() as BoxId],
        },
        sections: { lifeLately: 'This must roll back.' },
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'BOX_NOT_FOUND' } },
    });
    expect(await activeUpdateCount(author)).toBe(beforeInvalid);

    const update = await updates.create(author, {
      audience: { type: 'boxes', boxIds: [secondBox.id, firstBox.id] },
      sections: { lifeLately: 'One story, two private conversations.' },
      mediaAssetIds: [asset.id as MediaAssetId],
    });
    expect(update.contexts.map(({ boxName }) => boxName)).toEqual([
      firstBox.name,
      secondBox.name,
    ]);
    await expect(updates.get(memberOfBoth, update.id)).resolves.toMatchObject({
      contexts: [{ boxId: firstBox.id }, { boxId: secondBox.id }],
    });
    await expect(updates.get(memberOfFirst, update.id)).resolves.toMatchObject({
      contexts: [{ boxId: firstBox.id }],
    });
    await expect(updates.get(outsider, update.id)).rejects.toMatchObject({
      response: { error: { code: 'LIFE_UPDATE_NOT_FOUND' } },
    });
    expect((await posts.feed(memberOfBoth, { limit: 20 })).items).toEqual([]);

    await expect(
      updates.update(author, update.id, {
        sections: { lifeLately: 'The shared story was edited once.' },
        mediaAssetIds: [asset.id as MediaAssetId],
      }),
    ).resolves.toMatchObject({
      sections: { lifeLately: 'The shared story was edited once.' },
      contexts: [{ boxId: firstBox.id }, { boxId: secondBox.id }],
    });

    const firstContext = requiredContext(update, firstBox.id);
    await expect(posts.get(author, firstContext.postId)).rejects.toMatchObject({
      response: { error: { code: 'POST_NOT_FOUND' } },
    });
    await expect(
      posts.update(author, firstContext.postId, 'Bypass the master'),
    ).rejects.toMatchObject({
      response: { error: { code: 'POST_NOT_FOUND' } },
    });
    await expect(
      posts.delete(author, firstContext.postId),
    ).rejects.toMatchObject({
      response: { error: { code: 'POST_NOT_FOUND' } },
    });
    await interactions.createComment(
      memberOfFirst,
      firstContext.postId,
      'Visible only in the first Box.',
    );
    const refreshed = await updates.get(memberOfBoth, update.id);
    expect(
      requiredContext(refreshed, firstBox.id).interactions.commentCount,
    ).toBe(1);
    expect(
      requiredContext(refreshed, secondBox.id).interactions.commentCount,
    ).toBe(0);

    await dispatcher.flush();
    const publicationNotifications = await connection.database
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.lifeUpdateId, update.id),
          eq(notifications.type, 'life_update.published'),
        ),
      );
    expect(publicationNotifications).toHaveLength(2);
    expect(
      publicationNotifications.filter(
        ({ recipientUserId }) => recipientUserId === memberOfBoth,
      ),
    ).toHaveLength(1);
    const authorNotifications = await notificationService.list(author, {
      limit: 20,
    });
    expect(
      authorNotifications.items.find(
        ({ type, actor }) =>
          type === 'post.comment' && actor.userId === memberOfFirst,
      ),
    ).toMatchObject({ lifeUpdateId: update.id, postId: firstContext.postId });

    await posts.create(author, firstBox.id, 'A standard memory.');
    const publicationDate = new Date(update.createdAt);
    const personalMemories = await memories.mine(memberOfBoth, {
      year: publicationDate.getUTCFullYear(),
      month: publicationDate.getUTCMonth() + 1,
      limit: 20,
    });
    expect(
      personalMemories.items.filter(
        (item) =>
          item.type === 'life_update' && item.lifeUpdate.id === update.id,
      ),
    ).toHaveLength(1);
    const firstMemoryPage = await memories.box(memberOfBoth, firstBox.id, {
      year: publicationDate.getUTCFullYear(),
      month: publicationDate.getUTCMonth() + 1,
      limit: 1,
    });
    expect(firstMemoryPage.items).toHaveLength(1);
    expect(firstMemoryPage.nextCursor).toEqual(expect.any(String));

    const [low, high] =
      memberOfFirst < author
        ? [memberOfFirst, author]
        : [author, memberOfFirst];
    await connection.database.insert(friendships).values({
      userLowId: low,
      userHighId: high,
      initiatedByUserId: memberOfFirst,
      blockedByUserId: author,
      status: 'blocked',
    });
    await expect(updates.get(memberOfFirst, update.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    await connection.database
      .delete(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      );

    const removedAuthorUpdate = await updates.create(memberOfFirst, {
      audience: { type: 'boxes', boxIds: [firstBox.id] },
      sections: { workOrUniversity: 'Visible until membership ends.' },
    });
    await boxService.removeMember(author, firstBox.id, memberOfFirst);
    await expect(
      updates.get(memberOfFirst, removedAuthorUpdate.id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(
      updates.get(author, removedAuthorUpdate.id),
    ).resolves.toMatchObject({ contexts: [{ boxId: firstBox.id }] });
    await updates.delete(memberOfFirst, removedAuthorUpdate.id);

    await boxService.deleteBox(author, firstBox.id);
    await expect(updates.get(memberOfBoth, update.id)).resolves.toMatchObject({
      contexts: [{ boxId: secondBox.id }],
    });
    await expect(updates.get(memberOfFirst, update.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(await cleanupJobCount(asset.id as MediaAssetId)).toBe(0);

    await boxService.deleteBox(author, secondBox.id);
    await expect(updates.get(author, update.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(await cleanupJobCount(asset.id as MediaAssetId)).toBe(1);
    const [deletedMaster] = await connection.database
      .select({ status: lifeUpdates.status })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, update.id));
    expect(deletedMaster?.status).toBe('deleted');

    const onlyMe = await updates.create(author, {
      audience: { type: 'only_me' },
      sections: { reading: 'A private note.' },
    });
    expect(onlyMe.contexts).toMatchObject([
      { audience: 'only_me', boxId: null },
    ]);
    await expect(updates.get(outsider, onlyMe.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    await expect(
      interactions.createComment(
        author,
        onlyMe.contexts[0]!.postId,
        'Interactions stay disabled.',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(updates.delete(author, onlyMe.id)).resolves.toEqual({
      success: true,
    });
  });

  async function activeUpdateCount(author: UserId): Promise<number> {
    const rows = await connection.database
      .select({ id: lifeUpdates.id })
      .from(lifeUpdates)
      .where(
        and(
          eq(lifeUpdates.authorUserId, author),
          eq(lifeUpdates.status, 'active'),
        ),
      );
    return rows.length;
  }

  async function cleanupJobCount(mediaAssetId: MediaAssetId): Promise<number> {
    return (
      await connection.database
        .select({ id: mediaJobOutbox.id })
        .from(mediaJobOutbox)
        .where(
          and(
            eq(mediaJobOutbox.mediaAssetId, mediaAssetId),
            eq(mediaJobOutbox.jobType, 'delete-media-object'),
          ),
        )
    ).length;
  }
});

function requiredUsers(values: UserId[]): [UserId, UserId, UserId, UserId] {
  const [first, second, third, fourth] = values;
  if (!first || !second || !third || !fourth)
    throw new Error('Life Update test users are missing.');
  return [first, second, third, fourth];
}

function requiredContext(
  update: Awaited<ReturnType<LifeUpdateService['get']>>,
  boxId: BoxId,
) {
  const context = update.contexts.find((item) => item.boxId === boxId);
  if (!context) throw new Error('Life Update test context is missing.');
  return context;
}
