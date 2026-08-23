import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import {
  boxMemberships,
  createDatabaseConnection,
  mediaAssets,
  posts as postsTable,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { PostId, UserId } from '@paldora/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxService } from '../src/box.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { PostService } from '../src/post.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import type { PublishPostEventInput } from '../src/post-event.service.js';
import { createFakeObjectStorage } from './fake-object-storage.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('private text-post flow', () => {
  let connection: DatabaseConnection;
  let boxes: BoxService;
  let posts: PostService;
  const publishedEvents: PublishPostEventInput[] = [];
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [0, 1, 2].map((index) => `post-${marker}-${index}`);
  let userIds: UserId[];

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const avatars = new ProfileAvatarService(
      infrastructure,
      createFakeObjectStorage(),
    );
    boxes = new BoxService(infrastructure, avatars);
    posts = new PostService(infrastructure, avatars, {
      publish: async (event) => {
        publishedEvents.push(event);
        return true;
      },
    });
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
        username: `post_${marker}_${index}`,
        usernameNormalized: `post_${marker}_${index}`,
        displayName: `Post Author ${index}`,
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

  it('enforces private access, editing, deletion, feeds, and cursors', async () => {
    const [owner, friend, outsider] = requiredUsers(userIds);
    const sharedBox = await boxes.create(owner, 'Shared posts');
    const privateBox = await boxes.create(owner, 'Private posts');
    await connection.database.insert(boxMemberships).values({
      boxId: sharedBox.id,
      userId: friend,
      role: 'member',
      status: 'active',
    });

    const ownerPost = await posts.create(owner, sharedBox.id, 'Owner story');
    const friendPost = await posts.create(friend, sharedBox.id, 'Friend story');
    const privatePost = await posts.create(
      owner,
      privateBox.id,
      'Private story',
    );
    await expect(
      posts.assertBoxAccess(outsider, sharedBox.id),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'BOX_NOT_FOUND' } },
    });
    await expect(posts.canAccessBox(owner, sharedBox.id)).resolves.toBe(true);
    await expect(posts.canAccessBox(outsider, sharedBox.id)).resolves.toBe(
      false,
    );
    const baseTime = new Date('2026-08-23T12:00:00.000Z');

    const [firstAvatar, secondAvatar] = await connection.database
      .insert(mediaAssets)
      .values([
        {
          ownerUserId: owner,
          purpose: 'avatar',
          objectKey: `avatars/${owner}/first.webp`,
          contentType: 'image/webp',
          contentLength: 128,
          status: 'ready',
        },
        {
          ownerUserId: owner,
          purpose: 'avatar',
          objectKey: `avatars/${owner}/second.webp`,
          contentType: 'image/webp',
          contentLength: 128,
          status: 'ready',
        },
      ])
      .returning({ id: mediaAssets.id, objectKey: mediaAssets.objectKey });
    if (!firstAvatar || !secondAvatar) {
      throw new Error('Test avatars are missing.');
    }
    await connection.database
      .update(profiles)
      .set({ avatarMediaId: firstAvatar.id })
      .where(eq(profiles.userId, owner));
    await expect(posts.get(owner, ownerPost.id)).resolves.toMatchObject({
      author: { avatarUrl: `signed:${firstAvatar.objectKey}` },
    });
    await connection.database
      .update(profiles)
      .set({ avatarMediaId: secondAvatar.id })
      .where(eq(profiles.userId, owner));
    await expect(posts.get(owner, ownerPost.id)).resolves.toMatchObject({
      author: { avatarUrl: `signed:${secondAvatar.objectKey}` },
    });

    await setCreatedAt(ownerPost.id, baseTime);
    await setCreatedAt(friendPost.id, new Date(baseTime.getTime() - 1_000));
    await setCreatedAt(privatePost.id, new Date(baseTime.getTime() - 2_000));

    const firstPage = await posts.feed(owner, { limit: 2 });
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      ownerPost.id,
      friendPost.id,
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await posts.feed(owner, {
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
    });
    expect(secondPage.items.map(({ id }) => id)).toEqual([privatePost.id]);
    expect(secondPage.nextCursor).toBeNull();

    await expect(posts.get(outsider, ownerPost.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'POST_NOT_FOUND' } },
    });
    await expect(
      posts.update(friend, ownerPost.id, 'Not mine'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(
      posts.update(owner, ownerPost.id, 'Owner story edited'),
    ).resolves.toMatchObject({
      content: 'Owner story edited',
      editedAt: expect.any(String),
    });
    await expect(posts.delete(friend, friendPost.id)).resolves.toEqual({
      success: true,
    });
    await expect(posts.get(owner, friendPost.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(publishedEvents).toEqual(
      expect.arrayContaining([
        { action: 'created', boxId: sharedBox.id, postId: ownerPost.id },
        { action: 'updated', boxId: sharedBox.id, postId: ownerPost.id },
        { action: 'deleted', boxId: sharedBox.id, postId: friendPost.id },
      ]),
    );

    await boxes.update(owner, sharedBox.id, { status: 'archived' });
    await expect(
      posts.create(owner, sharedBox.id, 'Should not publish'),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { error: { code: 'BOX_ARCHIVED' } },
    });
    await boxes.update(owner, sharedBox.id, { status: 'active' });
    await connection.database
      .update(boxMemberships)
      .set({ status: 'left' })
      .where(eq(boxMemberships.userId, friend));
    await expect(
      posts.listBox(friend, sharedBox.id, { limit: 20 }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(
      posts.assertBoxAccess(friend, sharedBox.id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(posts.canAccessBox(friend, sharedBox.id)).resolves.toBe(false);

    await boxes.deleteBox(owner, privateBox.id);
    const deletedByCascade = await connection.database
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(eq(postsTable.id, privatePost.id));
    expect(deletedByCascade).toEqual([]);
  });

  async function setCreatedAt(postId: PostId, createdAt: Date) {
    await connection.database
      .update(postsTable)
      .set({ createdAt, updatedAt: createdAt })
      .where(eq(postsTable.id, postId));
  }
});

function requiredUsers(values: UserId[]): [UserId, UserId, UserId] {
  const [first, second, third] = values;
  if (!first || !second || !third) throw new Error('Test users are missing.');
  return [first, second, third];
}
