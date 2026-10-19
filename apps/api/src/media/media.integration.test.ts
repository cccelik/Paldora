import {
  mediaAssets,
  mediaJobOutbox,
  profiles,
  type MediaJobPayload,
} from '@paldora/database';
import {
  currentUserSchema,
  errorEnvelopeSchema,
  mediaAssetSchema,
  mediaUploadSchema,
} from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const pngBytes = new Uint8Array(2_048).fill(7);

async function errorCode(response: Response): Promise<string> {
  return errorEnvelopeSchema.parse(await response.json()).error.code;
}

async function reserve(user: TestUser, contentLength = pngBytes.byteLength) {
  const response = await app.request(user, '/media/uploads', {
    method: 'POST',
    body: { purpose: 'avatar', contentType: 'image/png', contentLength },
  });
  expect(response.status).toBe(201);
  return mediaUploadSchema.parse(await response.json());
}

async function storedKeyOf(mediaAssetId: string): Promise<string> {
  const [row] = await app.database
    .select({ key: mediaAssets.uploadObjectKey })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId));
  if (!row) throw new Error('asset missing');
  return row.key;
}

const complete = (user: TestUser, mediaAssetId: string) =>
  app.request(user, `/media/uploads/${mediaAssetId}/complete`, {
    method: 'POST',
  });

async function outboxFor(
  jobType: string,
  match: (payload: MediaJobPayload) => boolean,
) {
  const rows = await app.database
    .select()
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.jobType, jobType));
  return rows.filter((row) => match(row.payload));
}

describe('reserving an upload', () => {
  it('returns a signed PUT and never exposes object keys in the asset', async () => {
    const user = await app.createUser();
    const upload = await reserve(user);
    expect(upload.upload.method).toBe('PUT');
    expect(upload.upload.headers).toEqual({ 'content-type': 'image/png' });
    expect(upload.mediaAsset.status).toBe('pending');
    expect(JSON.stringify(upload.mediaAsset)).not.toMatch(/uploads\//);
  });

  it('rejects purposes, types, and sizes outside policy', async () => {
    const user = await app.createUser();
    for (const body of [
      { purpose: 'room_banner', contentType: 'image/png', contentLength: 10 },
      { purpose: 'avatar', contentType: 'image/svg+xml', contentLength: 10 },
      {
        purpose: 'avatar',
        contentType: 'image/png',
        contentLength: 10_485_761,
      },
    ]) {
      const response = await app.request(user, '/media/uploads', {
        method: 'POST',
        body,
      });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('completing an upload', () => {
  it('verifies the stored object and queues processing exactly once', async () => {
    const user = await app.createUser();
    const { mediaAsset } = await reserve(user);
    app.storage.put(await storedKeyOf(mediaAsset.id), 'image/png', pngBytes);

    const results = await Promise.all([
      complete(user, mediaAsset.id),
      complete(user, mediaAsset.id),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    const processed = await outboxFor(
      'media.process',
      (payload) => payload.mediaAssetId === mediaAsset.id,
    );
    expect(processed).toHaveLength(1);
    expect(processed[0]?.status).toBe('pending');
  });

  it('fails a mismatched upload and schedules its removal', async () => {
    const user = await app.createUser();
    const { mediaAsset } = await reserve(user);
    const key = await storedKeyOf(mediaAsset.id);
    app.storage.put(key, 'image/png', new Uint8Array(10));

    const response = await complete(user, mediaAsset.id);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('MEDIA_UPLOAD_MISMATCH');
    const status = mediaAssetSchema.parse(
      await (await app.request(user, `/media/${mediaAsset.id}`)).json(),
    ).status;
    expect(status).toBe('failed');
    const deletions = await outboxFor('media.delete', (payload) =>
      (payload.objectKeys ?? []).includes(key),
    );
    expect(deletions).toHaveLength(1);
  });

  it('treats a missing object as a mismatch', async () => {
    const user = await app.createUser();
    const { mediaAsset } = await reserve(user);
    expect(await errorCode(await complete(user, mediaAsset.id))).toBe(
      'MEDIA_UPLOAD_MISMATCH',
    );
  });

  it('refuses reservations past the completion window', async () => {
    const user = await app.createUser();
    const { mediaAsset } = await reserve(user);
    await app.database
      .update(mediaAssets)
      .set({ uploadExpiresAt: sql`now() - interval '1 hour'` })
      .where(eq(mediaAssets.id, mediaAsset.id));
    const response = await complete(user, mediaAsset.id);
    expect(response.status).toBe(410);
    expect(await errorCode(response)).toBe('MEDIA_UPLOAD_EXPIRED');
  });

  it('reports storage outages without changing state', async () => {
    const user = await app.createUser();
    const { mediaAsset } = await reserve(user);
    app.storage.failNext();
    const response = await complete(user, mediaAsset.id);
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('STORAGE_UNAVAILABLE');
    const [row] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAsset.id));
    expect(row?.status).toBe('pending');
  });
});

describe('ownership', () => {
  it('makes another user’s upload indistinguishable from a missing one', async () => {
    const owner = await app.createUser();
    const intruder = await app.createUser();
    const { mediaAsset } = await reserve(owner);
    app.storage.put(await storedKeyOf(mediaAsset.id), 'image/png', pngBytes);

    for (const response of [
      await app.request(intruder, `/media/${mediaAsset.id}`),
      await complete(intruder, mediaAsset.id),
      await app.request(intruder, `/media/${randomUUID()}`),
    ]) {
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('MEDIA_NOT_FOUND');
    }
    const [row] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAsset.id));
    expect(row?.status).toBe('pending');
  });
});

describe('avatars', () => {
  async function readyAvatar(user: TestUser) {
    const id = randomUUID();
    const keys = {
      uploadObjectKey: `uploads/${id}`,
      masterObjectKey: `media/${id}/master.webp`,
      displayObjectKey: `media/${id}/display.webp`,
      thumbnailObjectKey: `media/${id}/thumbnail.webp`,
    };
    await app.database.insert(mediaAssets).values({
      id,
      ownerUserId: user.id,
      purpose: 'avatar',
      status: 'ready',
      contentType: 'image/png',
      contentLength: 100,
      uploadExpiresAt: new Date(),
      width: 512,
      height: 512,
      ...keys,
    });
    await app.database
      .update(profiles)
      .set({ avatarMediaId: id })
      .where(eq(profiles.userId, user.id));
    return { id, keys };
  }

  it('serves only signed derivative URLs, never masters or raw uploads', async () => {
    const user = await app.createUser();
    const { keys } = await readyAvatar(user);
    const current = currentUserSchema.parse(
      await (await app.request(user, '/me')).json(),
    );
    expect(current.profile.avatar?.url).toContain(
      encodeURIComponent(keys.displayObjectKey),
    );
    expect(current.profile.avatar?.thumbnailUrl).toContain(
      encodeURIComponent(keys.thumbnailObjectKey),
    );
    const serialized = JSON.stringify(current);
    expect(serialized).not.toContain(encodeURIComponent(keys.masterObjectKey));
    expect(serialized).not.toContain(encodeURIComponent(keys.uploadObjectKey));
  });

  it('reports a newer avatar that is still processing', async () => {
    const user = await app.createUser();
    await readyAvatar(user);
    const { mediaAsset } = await reserve(user);
    app.storage.put(await storedKeyOf(mediaAsset.id), 'image/png', pngBytes);
    await complete(user, mediaAsset.id);
    const current = currentUserSchema.parse(
      await (await app.request(user, '/me')).json(),
    );
    expect(current.profile.avatarProcessing).toBe(true);
    expect(current.profile.avatar).not.toBeNull();
  });

  it('removes the avatar and snapshots every stored key for deletion', async () => {
    const user = await app.createUser();
    const { id, keys } = await readyAvatar(user);
    const response = await app.request(user, '/me/avatar', {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(
      currentUserSchema.parse(await response.json()).profile.avatar,
    ).toBeNull();
    const [asset] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id)));
    expect(asset?.status).toBe('deleted');
    const deletions = await outboxFor('media.delete', (payload) =>
      (payload.objectKeys ?? []).includes(keys.masterObjectKey),
    );
    expect(deletions[0]?.payload.objectKeys).toEqual(
      expect.arrayContaining(Object.values(keys)),
    );
    // Idempotent.
    expect(
      (await app.request(user, '/me/avatar', { method: 'DELETE' })).status,
    ).toBe(200);
  });
});
