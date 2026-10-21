import {
  accountDeletionRequests,
  accountExports,
  mediaAssets,
  postReactions,
  posts,
  rooms,
  users,
} from '@paldora/database';
import {
  createBox,
  createPerson,
  readyMediaAsset,
} from '@paldora/database/testing';
import { MemoryObjectStorage } from '@paldora/storage';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectTestDatabase } from '../test-support/database.js';
import { finishNextErasure, startNextDueErasure } from './erase-account.js';

const { database } = connectTestDatabase('paldora-erasure-test');
const storage = new MemoryObjectStorage();

describe('account erasure', () => {
  it('blocks access first, then removes Auth, owned media, exports, and the user on retry', async () => {
    const owner = await createPerson(database, { label: 'erase-owner' });
    const other = await createPerson(database, { label: 'erase-other' });
    const boxId = await createBox(database, other, [owner]);
    const [post] = await database
      .insert(posts)
      .values({ boxId, authorUserId: other, content: 'A shared post' })
      .returning({ id: posts.id });
    const banner = await readyMediaAsset(database, {
      ownerId: owner,
      purpose: 'room_banner',
    });
    const reaction = await readyMediaAsset(database, {
      ownerId: owner,
      purpose: 'reaction_image',
      boxId,
    });
    await database
      .insert(rooms)
      .values({ userId: owner, bannerMediaId: banner.id });
    await database.insert(postReactions).values({
      postId: post!.id,
      userId: owner,
      kind: 'real',
      mediaAssetId: reaction.id,
    });
    for (const key of [
      ...Object.values(banner.keys),
      ...Object.values(reaction.keys),
    ])
      storage.put(key, 'image/webp', new Uint8Array([1]));
    const exportId = randomUUID();
    const exportKey = `exports/${exportId}/archive.json`;
    await database
      .insert(accountExports)
      .values({ id: exportId, userId: owner, objectKey: exportKey });
    storage.put(exportKey, 'application/json', new Uint8Array([2]));
    const requestedAt = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    const dueAt = new Date(requestedAt.getTime() + 7 * 24 * 60 * 60_000);
    const [request] = await database
      .insert(accountDeletionRequests)
      .values({ userId: owner, requestedAt, dueAt, nextAttemptAt: dueAt })
      .returning();
    expect(await startNextDueErasure(database)).toBe(true);
    const [blocked] = await database
      .select({ status: users.status, subject: users.authSubject })
      .from(users)
      .where(eq(users.id, owner));
    expect(blocked?.status).toBe('deleted');
    let calls = 0;
    const auth = {
      deleteUser: async (subject: string) => {
        expect(subject).toBe(blocked?.subject);
        calls += 1;
        if (calls === 1) throw new Error('auth unavailable');
      },
    };
    await expect(finishNextErasure(database, storage, auth)).rejects.toThrow(
      'auth unavailable',
    );
    const [retryable] = await database
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, request!.id));
    expect(retryable?.status).toBe('erasing');
    expect(
      (await database.select().from(users).where(eq(users.id, owner))).length,
    ).toBe(1);
    expect(await finishNextErasure(database, storage, auth)).toBe(true);
    expect(calls).toBe(2);
    expect(
      await database.select().from(users).where(eq(users.id, owner)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.ownerUserId, owner)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(postReactions)
        .where(eq(postReactions.userId, owner)),
    ).toEqual([]);
    expect(
      await database.select().from(rooms).where(eq(rooms.userId, owner)),
    ).toEqual([]);
    const [completed] = await database
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, request!.id));
    expect(completed).toMatchObject({ status: 'completed', userId: null });
    for (const key of [
      ...Object.values(banner.keys),
      ...Object.values(reaction.keys),
      exportKey,
    ])
      expect(storage.objects.has(key)).toBe(false);
  });
});
