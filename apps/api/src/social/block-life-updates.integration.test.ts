import { feedPageSchema, type FeedItemView } from '@paldora/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../test-support/http.js';
import { lifeUpdateTools } from '../test-support/life-updates.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

/** ADR 013 block-direction matrix for Phase 6, including restoration and races. */
let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);

const block: ReturnType<typeof scenes>['block'] = (...args) =>
  scenes(app).block(...args);

describe('Life Updates across a block (Phase 6)', () => {
  const feed = async (user: TestUser, path: string) =>
    feedPageSchema.parse(await json(await as(user).get(path)));
  const kinds = (items: readonly FeedItemView[]) =>
    items.map((item) => item.kind);

  /**
   * The viewer and the other person share two Boxes (and a bystander is in
   * both); the other person shares a Life Update to both, the viewer keeps
   * one Only Me and shares one of their own to both.
   */
  const setup = async () => {
    const scene = scenes(app);
    const tools = lifeUpdateTools(app);
    const [viewer, other, bystander] = await Promise.all([
      app.person('viewer'),
      app.person('other'),
      app.person('bystander'),
    ]);
    const first = await scene.newBox(viewer, 'First');
    const second = await scene.newBox(viewer, 'Second');
    for (const box of [first, second]) {
      await scene.join(viewer, box.id, other);
      await scene.join(viewer, box.id, bystander);
    }
    const theirs = await tools.shareTo(other, [first.id, second.id], {
      sections: { travel: 'secret trip' },
      mediaAssetIds: [(await tools.photo(other)).id],
    });
    const mineOnly = await tools.keepPrivate(viewer);
    const mineShared = await tools.shareTo(viewer, [first.id, second.id], {
      sections: { reading: 'my book' },
    });
    return {
      scene,
      tools,
      viewer,
      other,
      bystander,
      first,
      second,
      theirs,
      mineOnly,
      mineShared,
    };
  };

  it.each([
    ['the viewer blocked the author', 'viewer'],
    ['the author blocked the viewer', 'other'],
  ])('%s', async (_name, direction) => {
    const s = await setup();
    const [from, target] =
      direction === 'viewer' ? [s.viewer, s.other] : [s.other, s.viewer];
    const backing = s.theirs.contexts.map((context) => context.postId);
    await block(from, target);

    // Home: one neutral placeholder, deduped across both Boxes, and my own
    // Life Update as usual.
    const home = await feed(s.viewer, '/me/feed');
    expect(kinds(home.items)).toEqual(['life_update', 'hidden']);
    const [mine, hidden] = home.items;
    expect(mine?.kind === 'life_update' && mine.lifeUpdate.id).toBe(
      s.mineShared.id,
    );
    if (hidden?.kind !== 'hidden') throw new Error('expected a placeholder');
    expect(backing).toContain(hidden.hidden.id);
    expect(hidden).toEqual({
      kind: 'hidden',
      hidden: {
        id: expect.any(String),
        boxId: expect.any(String),
        createdAt: expect.any(String),
      },
    });
    // Each Box feed: a placeholder for that Box's delivery only.
    for (const box of [s.first, s.second]) {
      const page = await feed(s.viewer, `/boxes/${box.id}/posts`);
      expect(kinds(page.items)).toEqual(['life_update', 'hidden']);
      const placeholder = page.items[1];
      expect(placeholder?.kind === 'hidden' && placeholder.hidden).toEqual({
        id: s.theirs.contexts.find((context) => context.box.id === box.id)
          ?.postId,
        boxId: box.id,
        createdAt: expect.any(String),
      });
    }
    // Nothing anywhere names the author, the content, the photo, or which
    // Boxes the Life Update went to.
    const everything = JSON.stringify([
      home,
      await feed(s.viewer, `/boxes/${s.first.id}/posts`),
    ]);
    for (const leak of [
      'secret trip',
      s.theirs.id,
      s.other.id,
      s.other.username,
      s.theirs.media[0]?.id ?? 'no photo',
    ]) {
      expect(everything).not.toContain(leak);
    }
    // The permalink and the backing posts answer as if they never existed.
    await expectError(
      await as(s.viewer).get(`/life-updates/${s.theirs.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    for (const postId of backing) {
      await expectError(
        await as(s.viewer).get(`/posts/${postId}`),
        404,
        'POST_NOT_FOUND',
      );
      await expectError(
        await as(s.viewer).post(`/posts/${postId}/comments`, { content: 'x' }),
        404,
        'POST_NOT_FOUND',
      );
    }
    // The other side sees the viewer's Life Update the same way.
    const theirHome = await feed(s.other, '/me/feed');
    expect(kinds(theirHome.items)).toEqual(['hidden', 'life_update']);
    expect(JSON.stringify(theirHome)).not.toContain('my book');
    await expectError(
      await as(s.other).get(`/life-updates/${s.mineShared.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    // Only Me is the viewer's own and unaffected; a bystander sees both.
    expect((await s.tools.view(s.viewer, s.mineOnly.id)).id).toBe(
      s.mineOnly.id,
    );
    expect(kinds((await feed(s.bystander, '/me/feed')).items)).toEqual([
      'life_update',
      'life_update',
    ]);

    // Unblocking restores it with both tabs; blocking again hides it again.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    const restored = (await feed(s.viewer, '/me/feed')).items[1];
    expect(
      restored?.kind === 'life_update' &&
        restored.lifeUpdate.contexts.map((context) => context.box.name),
    ).toEqual(['First', 'Second']);
    await block(from, target);
    expect(kinds((await feed(s.viewer, '/me/feed')).items)).toEqual([
      'life_update',
      'hidden',
    ]);
    await expectError(
      await as(s.viewer).get(`/life-updates/${s.theirs.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });
});
