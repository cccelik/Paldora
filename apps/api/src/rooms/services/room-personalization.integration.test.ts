import {
  roomCustomizations,
  roomCustomWidgets,
  rooms,
  users,
} from '@paldora/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, expectError, json, ok } from '../../test-support/http.js';
import { roomTools } from '../../test-support/rooms.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../../test-support/test-app.js';
let app: TestApp;
let tools: ReturnType<typeof roomTools>;
beforeAll(async () => {
  app = await createTestApp(true);
  tools = roomTools(app);
});
afterAll(() => app.close());
const body = {
  cssSource: '.room-title{font-weight:700}',
  widgets: [{ title: 'Hello', source: '<p>Private note</p>' }],
};
const artifact = (viewer: TestUser, owner: TestUser) =>
  tools.as(viewer).get(`/rooms/${owner.username}/personalization`);
async function save(owner: TestUser, input = body) {
  return tools.as(owner).put('/me/room/personalization', {
    ...input,
    expectedUpdatedAt: (await tools.myRoom(owner)).updatedAt,
  });
}
describe('Room personalization authorization and persistence', () => {
  it('creates lazily, exposes editable source only to owner, and deletes with empty replacement', async () => {
    const owner = await app.person();
    const friend = await app.person();
    await tools.befriend(owner, friend);
    expect((await tools.myRoom(owner)).updatedAt).toBeNull();
    await json(await save(owner));
    const result = await json<{ css: string; widgets: { document: string }[] }>(
      await artifact(friend, owner),
    );
    expect(result.css).toContain(owner.id);
    expect(result.widgets[0]?.document).toContain('Private note');
    expect(result).not.toHaveProperty('cssSource');
    const source = await tools.as(owner).get('/me/room/personalization');
    expect(source.headers.get('cache-control')).toContain('no-store');
    expect(await json(source)).toMatchObject(body);
    await json(await save(owner, { cssSource: '', widgets: [] }));
    expect(await json(await artifact(friend, owner))).toEqual({
      css: '',
      widgets: [],
    });
  });
  it('shares the Room stale-save lock and leaves the previous source intact', async () => {
    const owner = await app.person();
    await json(await save(owner));
    await expectError(
      await tools.as(owner).put('/me/room/personalization', {
        ...body,
        cssSource: '.room-title{font-weight:400}',
        expectedUpdatedAt: null,
      }),
      409,
      'ROOM_UPDATE_STALE',
    );
    expect(
      await json(await tools.as(owner).get('/me/room/personalization')),
    ).toMatchObject(body);
  });
  it.each(['owner', 'viewer'] as const)(
    'hides all artifacts after %s blocks, with no friendship restored by unblock',
    async (direction) => {
      const owner = await app.person();
      const viewer = await app.person();
      await tools.befriend(owner, viewer);
      await save(owner);
      expect((await artifact(viewer, owner)).status).toBe(200);
      const blocker = direction === 'owner' ? owner : viewer;
      const target = direction === 'owner' ? viewer : owner;
      await tools.block(blocker, target);
      await expectError(await artifact(viewer, owner), 404, 'ROOM_NOT_FOUND');
      await ok(await tools.as(blocker).delete(`/blocks/${target.id}`));
      await expectError(await artifact(viewer, owner), 404, 'ROOM_NOT_FOUND');
    },
  );
  it.each(['left', 'removed', 'deleted'] as const)(
    'revokes current members artifacts when the Box is %s',
    async (how) => {
      const owner = await app.person();
      const viewer = await app.person();
      await tools.patchRoom(owner, { visibility: 'members' });
      await save(owner);
      const box = await tools.sharedBox(owner, viewer);
      expect((await artifact(viewer, owner)).status).toBe(200);
      if (how === 'left')
        await ok(await tools.as(viewer).delete(`/boxes/${box.id}/members/me`));
      if (how === 'removed')
        await ok(
          await tools.as(owner).delete(`/boxes/${box.id}/members/${viewer.id}`),
        );
      if (how === 'deleted')
        await ok(
          await tools
            .as(owner)
            .delete(`/boxes/${box.id}?confirmName=${box.name}`),
        );
      await expectError(await artifact(viewer, owner), 404, 'ROOM_NOT_FOUND');
    },
  );
  it('keeps archived shared membership, and removes friends-only access immediately on unfriend', async () => {
    const owner = await app.person();
    const viewer = await app.person();
    await tools.befriend(owner, viewer);
    await save(owner);
    await ok(await tools.as(viewer).delete(`/friends/${owner.id}`));
    await expectError(await artifact(viewer, owner), 404, 'ROOM_NOT_FOUND');
    const box = await tools.sharedBox(owner, viewer);
    await tools.patchRoom(owner, { visibility: 'members' });
    await json(
      await tools.as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    expect((await artifact(viewer, owner)).status).toBe(200);
  });
  it('matches denial status, body and headers for guesses, hidden, strangers and suspension', async () => {
    const viewer = await app.person();
    const owner = await app.person();
    await save(owner);
    const paths = ['missing_person', '%%%'.repeat(40), owner.username];
    const responses = await Promise.all(
      paths.map((name) =>
        tools
          .as(viewer)
          .get(`/rooms/${encodeURIComponent(name)}/personalization`),
      ),
    );
    await tools.befriend(owner, viewer);
    await tools.patchRoom(owner, { visibility: 'hidden' });
    responses.push(await artifact(viewer, owner));
    await app.database
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, owner.id));
    responses.push(await artifact(viewer, owner));
    const shapes = await Promise.all(
      responses.map(async (response) => ({
        error: await errorOf(response),
        headers: Object.fromEntries(
          [...response.headers].filter(
            ([key]) => !['date', 'etag', 'x-request-id'].includes(key),
          ),
        ),
      })),
    );
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
  });
  it('rejects active content without overwriting or leaking parser errors', async () => {
    const owner = await app.person();
    await save(owner);
    const response = await save(owner, {
      ...body,
      widgets: [{ title: 'Bad', source: '<img src="https://evil.test">' }],
    });
    await expectError(response, 400, 'VALIDATION_FAILED');
    expect(
      await json(await tools.as(owner).get('/me/room/personalization')),
    ).toMatchObject(body);
  });
  it('fails closed on obsolete policy and tampered source', async () => {
    const owner = await app.person();
    await save(owner);
    await app.database
      .update(roomCustomizations)
      .set({ policyVersion: 2 })
      .where(eq(roomCustomizations.roomUserId, owner.id));
    await app.database
      .update(roomCustomWidgets)
      .set({ source: '<script>bad()</script>' })
      .where(eq(roomCustomWidgets.roomUserId, owner.id));
    expect(await json(await artifact(owner, owner))).toEqual({
      css: '',
      widgets: [],
    });
  });
  it('enforces byte bounds and widget count in PostgreSQL and cascades Room deletion', async () => {
    const owner = await app.person();
    await save(owner);
    await expect(
      app.database
        .update(roomCustomizations)
        .set({ cssSource: 'é'.repeat(4097) })
        .where(eq(roomCustomizations.roomUserId, owner.id)),
    ).rejects.toThrow();
    await expect(
      app.database.insert(roomCustomWidgets).values({
        roomUserId: owner.id,
        position: 3,
        policyVersion: 1,
        title: 'Fourth',
        source: '',
      }),
    ).rejects.toThrow();
    await app.database.delete(rooms).where(eq(rooms.userId, owner.id));
    expect(
      await app.database
        .select()
        .from(roomCustomizations)
        .where(eq(roomCustomizations.roomUserId, owner.id)),
    ).toEqual([]);
    expect(
      await app.database
        .select()
        .from(roomCustomWidgets)
        .where(eq(roomCustomWidgets.roomUserId, owner.id)),
    ).toEqual([]);
  });
});
