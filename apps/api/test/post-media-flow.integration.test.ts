import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { UserId } from '@paldora/domain';
import { S3ObjectStorage } from '@paldora/storage';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { InteractionAuthorizationPolicy } from '../src/interaction-authorization-policy.service.js';
import { InteractionService } from '../src/interaction.service.js';
import { PostMediaService } from '../src/post-media.service.js';
import { PostInteractionQueryService } from '../src/post-interaction-query.js';
import { PostService } from '../src/post.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { ReactionMediaService } from '../src/reaction-media.service.js';
import { UserService } from '../src/user.service.js';
import { createBoxService } from './create-box-service.js';

const configured = Boolean(
  process.env.DATABASE_URL &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY,
);

describe.runIf(configured)('post media upload flow', () => {
  let connection: DatabaseConnection;
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [`media-${marker}-owner`, `media-${marker}-outsider`];
  let userIds: UserId[] = [];

  beforeAll(async () => {
    connection = createDatabaseConnection(process.env.DATABASE_URL as string);
    const stale = await connection.pool.query<{
      object_key: string;
      display_object_key: string | null;
      thumbnail_object_key: string | null;
    }>(
      `select m.object_key, m.display_object_key, m.thumbnail_object_key
       from paldora.media_assets m
       join paldora.users u on u.id = m.owner_user_id
       where u.auth_subject like 'media-%'`,
    );
    const storage = createStorage();
    await Promise.allSettled(
      stale.rows
        .flatMap((row) => [
          row.object_key,
          row.display_object_key,
          row.thumbnail_object_key,
        ])
        .filter((key): key is string => Boolean(key))
        .map((key) => storage.deleteObject(key)),
    );
    await connection.pool.query(
      "delete from paldora.boxes where owner_user_id in (select id from paldora.users where auth_subject like 'media-%')",
    );
    await connection.pool.query(
      "delete from paldora.users where auth_subject like 'media-%'",
    );
  });

  afterAll(async () => {
    const rows = await connection.database
      .select({
        objectKey: mediaAssets.objectKey,
        displayObjectKey: mediaAssets.displayObjectKey,
        thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.ownerUserId, userIds));
    const storage = createStorage();
    await Promise.allSettled(
      rows
        .flatMap((row) => [
          row.objectKey,
          row.displayObjectKey,
          row.thumbnailObjectKey,
        ])
        .filter((key): key is string => Boolean(key))
        .map((key) => storage.deleteObject(key)),
    );
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

  it('verifies ownership and queues a private image for processing', async () => {
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const storage = createStorage();
    const avatars = new ProfileAvatarService(infrastructure, storage);
    const usersService = new UserService(infrastructure, avatars);
    const boxes = createBoxService(infrastructure, avatars);
    const posts = new PostService(
      infrastructure,
      avatars,
      { publish: async () => true },
      storage,
      new PostInteractionQueryService(infrastructure, storage),
    );
    const postMedia = new PostMediaService(
      infrastructure,
      posts,
      usersService,
      storage,
    );
    const policy = new InteractionAuthorizationPolicy(infrastructure);
    const interactionQueries = new PostInteractionQueryService(
      infrastructure,
      storage,
    );
    const interactions = new InteractionService(
      infrastructure,
      policy,
      avatars,
      interactionQueries,
    );
    const reactionMedia = new ReactionMediaService(
      infrastructure,
      policy,
      usersService,
      storage,
    );
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
        username: `media_${marker}_${index}`,
        usernameNormalized: `media_${marker}_${index}`,
        displayName: `Media User ${index}`,
        onboardingState: 'complete' as const,
      })),
    );
    const [owner, outsider] = requiredUsers(userIds);
    const box = await boxes.create(owner, 'Media integration');
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await postMedia.createUpload(owner, box.id, {
      contentType: 'image/png',
      contentLength: image.byteLength,
    });
    const uploaded = await fetch(upload.upload.url, {
      method: 'PUT',
      headers: upload.upload.headers,
      body: image,
    });
    expect(uploaded.ok).toBe(true);
    await expect(
      postMedia.completeUpload(outsider, upload.mediaAsset.id),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'POST_MEDIA_UPLOAD_NOT_FOUND' } },
    });
    await expect(
      postMedia.completeUpload(owner, upload.mediaAsset.id),
    ).resolves.toMatchObject({ status: 'processing', purpose: 'post_image' });
    await expect(
      connection.database
        .select({ jobType: mediaJobOutbox.jobType })
        .from(mediaJobOutbox)
        .where(eq(mediaJobOutbox.mediaAssetId, upload.mediaAsset.id)),
    ).resolves.toEqual([{ jobType: 'process-post-image' }]);
    const post = await posts.create(owner, box.id, '', [upload.mediaAsset.id]);
    expect(post).toMatchObject({
      content: '',
      media: [{ id: upload.mediaAsset.id, status: 'processing' }],
    });
    const reactionUpload = await reactionMedia.createUpload(owner, post.id, {
      contentType: 'image/png',
      contentLength: image.byteLength,
    });
    const reactionUploaded = await fetch(reactionUpload.upload.url, {
      method: 'PUT',
      headers: reactionUpload.upload.headers,
      body: image,
    });
    expect(reactionUploaded.ok).toBe(true);
    await expect(
      reactionMedia.completeUpload(outsider, reactionUpload.mediaAsset.id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(
      reactionMedia.completeUpload(owner, reactionUpload.mediaAsset.id),
    ).resolves.toMatchObject({
      status: 'processing',
      purpose: 'reaction_image',
    });
    await expect(
      interactions.setReaction(
        owner,
        post.id,
        'real',
        reactionUpload.mediaAsset.id,
      ),
    ).resolves.toMatchObject({
      currentUserReaction: 'real',
      realReactions: [
        expect.objectContaining({ mediaAssetId: reactionUpload.mediaAsset.id }),
      ],
    });
  });
});

function createStorage(): S3ObjectStorage {
  return new S3ObjectStorage({
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    region: process.env.S3_REGION ?? 'auto',
    bucket: process.env.S3_BUCKET as string,
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
}

function requiredUsers(values: UserId[]): [UserId, UserId] {
  const [first, second] = values;
  if (!first || !second) throw new Error('Test users are missing.');
  return [first, second];
}
