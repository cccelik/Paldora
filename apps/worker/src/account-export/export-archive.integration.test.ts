import { accountExports, posts } from '@paldora/database';
import { createBox, createPerson } from '@paldora/database/testing';
import { MemoryObjectStorage } from '@paldora/storage';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectTestDatabase } from '../test-support/database.js';
import { buildNextExport, expireNextExport } from './export-archive.js';

const { database } = connectTestDatabase('paldora-export-test');
const storage = new MemoryObjectStorage();

describe('account JSON archives', () => {
  it('keeps the same tracked object key after a storage failure and retries', async () => {
    const owner = await createPerson(database, { label: 'export-retry' });
    const id = randomUUID();
    const objectKey = `exports/${id}/archive.json`;
    await database
      .insert(accountExports)
      .values({ id, userId: owner, objectKey });
    storage.failNext();
    await expect(buildNextExport(database, storage)).rejects.toThrow(
      'storage unavailable',
    );
    const [pending] = await database
      .select()
      .from(accountExports)
      .where(eq(accountExports.id, id));
    expect(pending).toMatchObject({ status: 'pending', objectKey });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await buildNextExport(database, storage);
      const [current] = await database
        .select()
        .from(accountExports)
        .where(eq(accountExports.id, id));
      if (current?.status === 'ready') break;
    }
    const [ready] = await database
      .select()
      .from(accountExports)
      .where(eq(accountExports.id, id));
    expect(ready).toMatchObject({ status: 'ready', objectKey });
    expect(storage.objects.has(objectKey)).toBe(true);
  });

  it('exports own data without another member’s post or storage keys, then expires the object', async () => {
    const owner = await createPerson(database, { label: 'export-owner' });
    const other = await createPerson(database, { label: 'export-other' });
    const boxId = await createBox(database, owner, [other]);
    await database.insert(posts).values([
      { boxId, authorUserId: owner, content: 'my own content' },
      {
        boxId,
        authorUserId: other,
        content: 'another person’s private content',
      },
    ]);
    const requestId = randomUUID();
    const [request] = await database
      .insert(accountExports)
      .values({
        id: requestId,
        userId: owner,
        objectKey: `exports/${requestId}/archive.json`,
      })
      .returning();
    expect(request).toBeDefined();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await buildNextExport(database, storage);
      const [current] = await database
        .select()
        .from(accountExports)
        .where(eq(accountExports.id, request!.id));
      if (current?.status === 'ready') break;
    }
    const [ready] = await database
      .select()
      .from(accountExports)
      .where(eq(accountExports.id, request!.id));
    expect(ready?.status).toBe('ready');
    const object = storage.objects.get(ready!.objectKey!);
    expect(object).toBeDefined();
    const archive = JSON.parse(new TextDecoder().decode(object!.body)) as {
      format: string;
      posts: { content: string }[];
      account: { id: string };
    };
    expect(archive.format).toBe('paldora-json-v1');
    expect(archive.account.id).toBe(owner);
    expect(archive.posts.map((item) => item.content)).toEqual([
      'my own content',
    ]);
    expect(JSON.stringify(archive)).not.toContain(
      'another person’s private content',
    );
    expect(JSON.stringify(archive)).not.toContain('uploadObjectKey');
    const expiredAt = new Date(ready!.expiresAt!.getTime() + 1);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expireNextExport(database, storage, expiredAt);
      const [current] = await database
        .select()
        .from(accountExports)
        .where(eq(accountExports.id, request!.id));
      if (current?.status === 'expired') break;
    }
    expect(storage.objects.has(ready!.objectKey!)).toBe(false);
  });
});
