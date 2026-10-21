import {
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  mediaJobOutbox,
} from '@paldora/database';
import { lifeUpdateSchema, type LifeUpdateView } from '@paldora/validation';
import { and, asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openStream, type OpenStream } from '../test-support/event-stream.js';
import { expectError, json, ok } from '../test-support/http.js';
import { lifeUpdateTools } from '../test-support/life-updates.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
let tools: ReturnType<typeof lifeUpdateTools>;
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
  tools = lifeUpdateTools(app);
});
afterAll(() => app.close());

const edit = (user: TestUser, lifeUpdateId: string, body: unknown) =>
  scene.as(user).patch(`/life-updates/${lifeUpdateId}`, body);

const edited = async (
  user: TestUser,
  lifeUpdateId: string,
  body: unknown,
): Promise<LifeUpdateView> =>
  lifeUpdateSchema.parse(await json(await edit(user, lifeUpdateId, body)));

/** An author sharing to two Boxes with one photo, a member of each, a stranger. */
async function shared() {
  const [author, inAlpha, inBravo, stranger] = (await Promise.all(
    ['author', 'alpha', 'bravo', 'stranger'].map((name) => app.person(name)),
  )) as [TestUser, TestUser, TestUser, TestUser];
  const alpha = await scene.newBox(author, 'Alpha');
  const bravo = await scene.newBox(author, 'Bravo');
  await scene.join(author, alpha.id, inAlpha);
  await scene.join(author, bravo.id, inBravo);
  const kept = await tools.photo(author);
  const published = await tools.shareTo(author, [alpha.id, bravo.id], {
    mediaAssetIds: [kept.id],
  });
  return { author, inAlpha, inBravo, stranger, alpha, bravo, kept, published };
}

async function row(lifeUpdateId: string) {
  const [found] = await app.database
    .select()
    .from(lifeUpdates)
    .where(eq(lifeUpdates.id, lifeUpdateId));
  return found;
}

async function linkedPhotos(lifeUpdateId: string) {
  const rows = await app.database
    .select({ id: lifeUpdateMedia.mediaAssetId })
    .from(lifeUpdateMedia)
    .where(eq(lifeUpdateMedia.lifeUpdateId, lifeUpdateId))
    .orderBy(asc(lifeUpdateMedia.position));
  return rows.map((linked) => linked.id);
}

async function assetStatus(id: string) {
  const [asset] = await app.database
    .select({ status: mediaAssets.status })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));
  return asset?.status;
}

/** Deletion jobs queued for exactly these object keys. */
async function deletionsFor(keys: readonly string[]) {
  const [found] = await app.database
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        sql`${mediaJobOutbox.payload} -> 'objectKeys' @> ${JSON.stringify(keys)}::jsonb`,
      ),
    );
  return found?.count ?? 0;
}

describe('editing', () => {
  it('replaces sections and shows the change in every Box', async () => {
    const { author, inAlpha, inBravo, published } = await shared();
    const result = await edited(author, published.id, {
      sections: { travel: '  Lisbon in May ', watching: 'Severance' },
    });
    expect(result.sections).toEqual([
      { key: 'travel', label: expect.any(String), content: 'Lisbon in May' },
      { key: 'watching', label: expect.any(String), content: 'Severance' },
    ]);
    expect(result.editedAt).not.toBeNull();
    // Photos were not part of the change, so they stay.
    expect(result.media).toHaveLength(1);
    expect(result.createdAt).toBe(published.createdAt);
    for (const member of [inAlpha, inBravo]) {
      const seen = await tools.view(member, published.id);
      expect(seen.sections.map((section) => section.content)).toEqual([
        'Lisbon in May',
        'Severance',
      ]);
      expect(seen.editedAt).toBe(result.editedAt);
    }
  });

  it('adds, reorders, and removes photos, retiring only removed ones', async () => {
    const { author, inBravo, published, kept } = await shared();
    const added = await tools.photo(author);
    const second = await tools.photo(author);
    const first = await edited(author, published.id, {
      mediaAssetIds: [added.id, kept.id, second.id],
    });
    expect(first.media.map((photo) => photo.id)).toEqual([
      added.id,
      kept.id,
      second.id,
    ]);
    expect(await linkedPhotos(published.id)).toEqual([
      added.id,
      kept.id,
      second.id,
    ]);
    const after = await edited(author, published.id, {
      mediaAssetIds: [second.id, added.id],
    });
    expect(after.media.map((photo) => photo.id)).toEqual([second.id, added.id]);
    expect(await assetStatus(kept.id)).toBe('deleted');
    expect(await deletionsFor(Object.values(kept.keys))).toBe(1);
    for (const photo of [added, second]) {
      expect(await assetStatus(photo.id)).toBe('ready');
      expect(await deletionsFor(Object.values(photo.keys))).toBe(0);
    }
    // The same photos serve every Box.
    expect(
      (await tools.view(inBravo, published.id)).media.map((photo) => photo.id),
    ).toEqual([second.id, added.id]);
  });

  it('may drop every photo or every section, but not both', async () => {
    const { author, published } = await shared();
    await expectError(
      await edit(author, published.id, { sections: {}, mediaAssetIds: [] }),
      400,
      'VALIDATION_FAILED',
    );
    const textOnly = await edited(author, published.id, { mediaAssetIds: [] });
    expect(textOnly.media).toEqual([]);
    // With no photo left, clearing the sections would leave nothing.
    for (const body of [{ sections: {} }, { sections: { travel: '   ' } }]) {
      await expectError(
        await edit(author, published.id, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    const photo = await tools.photo(author);
    const photoOnly = await edited(author, published.id, {
      sections: {},
      mediaAssetIds: [photo.id],
    });
    expect(photoOnly).toMatchObject({ sections: [] });
    // And with no section left, clearing the photos would leave nothing.
    await expectError(
      await edit(author, published.id, { mediaAssetIds: [] }),
      400,
      'VALIDATION_FAILED',
    );
    expect(await linkedPhotos(published.id)).toEqual([photo.id]);
  });

  it('rejects empty, unknown, and oversized bodies', async () => {
    const { author, published } = await shared();
    for (const body of [
      {},
      { content: 'hello' },
      { sections: { favouriteColour: 'blue' } },
      { sections: { travel: 'x'.repeat(2001) } },
      { mediaAssetIds: ['nope'] },
    ]) {
      await expectError(
        await edit(author, published.id, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    await expectError(
      await edit(author, 'nope', { sections: { travel: 'x' } }),
      400,
      'VALIDATION_FAILED',
    );
    expect((await row(published.id))?.editedAt).toBeNull();
  });

  it('edits Only Me updates', async () => {
    const author = await app.person('private');
    const mine = await tools.keepPrivate(author);
    const result = await edited(author, mine.id, {
      sections: { reading: 'Middlemarch' },
    });
    expect(result).toMatchObject({ audience: 'only_me', contexts: [] });
    expect(result.sections[0]?.content).toBe('Middlemarch');
  });
});

describe('the audience', () => {
  it('cannot be changed through an edit, in either direction', async () => {
    const { author, alpha, published } = await shared();
    const mine = await tools.keepPrivate(author);
    for (const [id, audience] of [
      [published.id, { type: 'only_me' }],
      [published.id, { type: 'boxes', boxIds: [alpha.id] }],
      [mine.id, { type: 'boxes', boxIds: [alpha.id] }],
    ] as const) {
      await expectError(
        await edit(author, id, { sections: { travel: 'x' }, audience }),
        400,
        'VALIDATION_FAILED',
      );
    }
    const deliveries = await app.database
      .select({ boxId: lifeUpdateDeliveries.boxId })
      .from(lifeUpdateDeliveries)
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, published.id));
    expect(deliveries).toHaveLength(2);
    expect((await row(mine.id))?.audience).toBe('only_me');
    // An edit leaves the audience and the publish time exactly as they were.
    const before = await row(published.id);
    await edited(author, published.id, { sections: { travel: 'y' } });
    const after = await row(published.id);
    expect(after?.audience).toBe(before?.audience);
    expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
  });
});

describe('who may edit', () => {
  it('is the author alone, with non-leaking answers for everyone else', async () => {
    const { author, inAlpha, stranger, published } = await shared();
    const body = { sections: { travel: 'hijacked' } };
    await expectError(
      await edit(inAlpha, published.id, body),
      403,
      'LIFE_UPDATE_ACCESS_DENIED',
    );
    for (const [user, id] of [
      [stranger, published.id],
      [inAlpha, randomUUID()],
      [author, randomUUID()],
    ] as const) {
      await expectError(
        await edit(user, id, body),
        404,
        'LIFE_UPDATE_NOT_FOUND',
      );
    }
    const mine = await tools.keepPrivate(author);
    await expectError(
      await edit(inAlpha, mine.id, body),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    expect((await row(published.id))?.sections).toEqual({
      lifeLately: 'Busy, happy.',
    });
  });

  it('answers not found across a block in either direction', async () => {
    const { author, inAlpha, inBravo, published } = await shared();
    await json(
      await scene.as(author).post('/blocks', { username: inAlpha.username }),
      201,
    );
    await json(
      await scene.as(inBravo).post('/blocks', { username: author.username }),
      201,
    );
    for (const viewer of [inAlpha, inBravo]) {
      await expectError(
        await edit(viewer, published.id, { sections: { travel: 'x' } }),
        404,
        'LIFE_UPDATE_NOT_FOUND',
      );
    }
    // Blocks do not stop the author editing their own.
    await edited(author, published.id, { sections: { travel: 'fine' } });
  });

  it('follows current membership, for members and the author alike', async () => {
    const { author, inAlpha, alpha, published } = await shared();
    await ok(await scene.as(inAlpha).delete(`/boxes/${alpha.id}/members/me`));
    await expectError(
      await edit(inAlpha, published.id, { sections: { travel: 'x' } }),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    // An author who left every delivery Box can no longer reach it.
    const owner = await app.person('owner');
    const theirs = await scene.newBox(owner, 'Theirs');
    await scene.join(owner, theirs.id, author);
    const elsewhere = await tools.shareTo(author, [theirs.id]);
    await ok(await scene.as(author).delete(`/boxes/${theirs.id}/members/me`));
    await expectError(
      await edit(author, elsewhere.id, { sections: { travel: 'x' } }),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });

  it('is closed once deleted, even for the author', async () => {
    const { author, published } = await shared();
    await ok(await scene.as(author).delete(`/life-updates/${published.id}`));
    await expectError(
      await edit(author, published.id, { sections: { travel: 'x' } }),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });
});

describe('archived Boxes', () => {
  const archive = async (owner: TestUser, boxId: string) =>
    json(
      await scene.as(owner).patch(`/boxes/${boxId}`, { status: 'archived' }),
    );

  it('allow an edit while one delivery Box is open, and refuse it once all are archived', async () => {
    const { author, inAlpha, alpha, bravo, published } = await shared();
    await archive(author, alpha.id);
    const result = await edited(author, published.id, {
      sections: { travel: 'still open' },
    });
    expect(result.canEdit).toBe(true);
    // The archived Box shows the current content, read-only.
    const seen = await tools.view(inAlpha, published.id);
    expect(seen.sections[0]?.content).toBe('still open');
    expect(seen.contexts[0]?.interactions.canInteract).toBe(false);
    await archive(author, bravo.id);
    await expectError(
      await edit(author, published.id, { sections: { travel: 'frozen' } }),
      409,
      'BOX_ARCHIVED',
    );
    expect((await row(published.id))?.sections).toEqual({
      travel: 'still open',
    });
    // Other members still get their own answer first.
    await expectError(
      await edit(inAlpha, published.id, { sections: { travel: 'x' } }),
      403,
      'LIFE_UPDATE_ACCESS_DENIED',
    );
  });
});

describe('photos while editing', () => {
  it('refuses photos that are not ready, not yours, used, or of another purpose', async () => {
    const { author, inAlpha, alpha, published, kept } = await shared();
    const notReady = await tools.photo(author, { status: 'processing' });
    const theirs = await tools.photo(inAlpha);
    const other = await tools.shareTo(author, [alpha.id], {
      mediaAssetIds: [(await tools.photo(author)).id],
    });
    const usedElsewhere = (await linkedPhotos(other.id))[0] ?? '';
    const postPhoto = await scene.cameraImage(author, alpha.id, {
      purpose: 'post_image',
    });
    for (const id of [theirs.id, usedElsewhere, postPhoto, randomUUID()]) {
      await expectError(
        await edit(author, published.id, { mediaAssetIds: [kept.id, id] }),
        404,
        'MEDIA_NOT_FOUND',
      );
    }
    await expectError(
      await edit(author, published.id, { mediaAssetIds: [notReady.id] }),
      409,
      'MEDIA_NOT_READY',
    );
    // A failed edit changed nothing.
    expect(await linkedPhotos(published.id)).toEqual([kept.id]);
    expect(await assetStatus(kept.id)).toBe('ready');
    expect(await linkedPhotos(other.id)).toEqual([usedElsewhere]);
  });

  it('lets one of two racing edits claim a photo', async () => {
    const { author, alpha, published } = await shared();
    const other = await tools.shareTo(author, [alpha.id]);
    const contested = await tools.photo(author);
    const results = await Promise.all(
      [published.id, other.id].map((id) =>
        edit(author, id, { mediaAssetIds: [contested.id] }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
    const owners = await app.database
      .select({ id: lifeUpdateMedia.lifeUpdateId })
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.mediaAssetId, contested.id));
    expect(owners).toHaveLength(1);
  });
});

describe('races', () => {
  it.each([0, 1, 2])(
    'serializes an edit with a delete, leaving nothing behind (round %i)',
    async () => {
      const { author, published, kept } = await shared();
      const fresh = await tools.photo(author);
      const [editing, deleting] = await Promise.all([
        edit(author, published.id, {
          sections: { travel: 'racing' },
          mediaAssetIds: [fresh.id],
        }),
        scene.as(author).delete(`/life-updates/${published.id}`),
      ]);
      expect(deleting.status).toBe(204);
      expect([200, 404]).toContain(editing.status);
      const after = await row(published.id);
      expect(after).toMatchObject({ status: 'deleted', sections: {} });
      expect(await linkedPhotos(published.id)).toEqual([]);
      expect(await assetStatus(kept.id)).toBe('deleted');
      // If the edit won, its new photo was claimed and then retired by the
      // delete; if the delete won, it was never claimed.
      expect(['deleted', 'ready']).toContain(await assetStatus(fresh.id));
      if (editing.status === 200) {
        expect(await assetStatus(fresh.id)).toBe('deleted');
      }
    },
  );

  it('applies concurrent edits one after the other', async () => {
    const { author, published } = await shared();
    const results = await Promise.all(
      ['one', 'two', 'three'].map((travel) =>
        edit(author, published.id, { sections: { travel } }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    const final = (await row(published.id))?.sections.travel;
    expect(['one', 'two', 'three']).toContain(final);
  });
});

describe('realtime hints', () => {
  const streams: OpenStream[] = [];
  afterEach(() => {
    for (const stream of streams.splice(0)) stream.close();
  });

  async function listen(user: TestUser) {
    const stream = await openStream(app.baseUrl, user.token);
    streams.push(stream);
    await stream.waitFor((event) => event.type === 'resync');
    return stream;
  }

  it('announce post.updated to every delivery Box, after commit', async () => {
    const { author, inAlpha, inBravo, stranger, alpha, bravo, published } =
      await shared();
    const [alphaStream, bravoStream, outsider] = await Promise.all(
      [inAlpha, inBravo, stranger].map((user) => listen(user)),
    );
    await edited(author, published.id, { sections: { travel: 'news' } });
    const postIn = (boxId: string) =>
      published.contexts.find((context) => context.box.id === boxId)?.postId;
    expect(
      await alphaStream?.waitFor((event) => event.type === 'post.updated'),
    ).toMatchObject({ boxId: alpha.id, postId: postIn(alpha.id) });
    expect(
      await bravoStream?.waitFor((event) => event.type === 'post.updated'),
    ).toMatchObject({ boxId: bravo.id, postId: postIn(bravo.id) });
    await outsider?.expectNone((event) => event.type === 'post.updated');
  });
});

describe('rate limits', () => {
  it('allows 30 edits an hour', async () => {
    const author = await app.person('fiddly');
    const mine = await tools.keepPrivate(author);
    for (let index = 0; index < 30; index += 1) {
      // Sequential, so the limiter sees the requests in order.
      await json(
        await edit(author, mine.id, { sections: { travel: `${index}` } }),
      );
    }
    await expectError(
      await edit(author, mine.id, { sections: { travel: 'again' } }),
      429,
      'RATE_LIMITED',
    );
  });
});
