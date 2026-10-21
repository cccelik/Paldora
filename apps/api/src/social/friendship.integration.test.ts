import { boxMemberships, friendships, orderedPair } from '@paldora/database';
import { friendshipPageSchema, friendshipSchema } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, expectError, json, ok } from '../test-support/http.js';
import { scenes } from '../test-support/scenes.js';
import { createTestApp, type TestApp } from '../test-support/test-app.js';

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const befriend: ReturnType<typeof scenes>['befriend'] = (...args) =>
  scenes(app).befriend(...args);

describe('friend requests', () => {
  it('flow from request to friendship, seen from both sides', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const sent = friendshipSchema.parse(
      await json(
        await client(app, ada).post('/friend-requests', {
          username: grace.username,
        }),
        201,
      ),
    );
    expect(sent).toMatchObject({ status: 'pending', direction: 'outgoing' });
    expect(sent.user.id).toBe(grace.id);

    const incoming = friendshipPageSchema.parse(
      await json(await client(app, grace).get('/friend-requests')),
    );
    expect(incoming.items).toHaveLength(1);
    expect(incoming.items[0]).toMatchObject({ direction: 'incoming' });
    expect(incoming.items[0]?.user.id).toBe(ada.id);

    const accepted = friendshipSchema.parse(
      await json(
        await client(app, grace).post(`/friend-requests/${sent.id}/accept`),
      ),
    );
    expect(accepted).toMatchObject({
      status: 'accepted',
      direction: 'established',
    });

    for (const [viewer, other] of [
      [ada, grace],
      [grace, ada],
    ] as const) {
      const friends = friendshipPageSchema.parse(
        await json(await client(app, viewer).get('/friends')),
      );
      expect(friends.items.map((item) => item.user.id)).toEqual([other.id]);
      expect(
        friendshipPageSchema.parse(
          await json(await client(app, viewer).get('/friend-requests')),
        ).items,
      ).toEqual([]);
    }
  });

  it('exposes only public profile fields of the other person', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    await befriend(ada, grace);
    const body = JSON.stringify(
      await json(await client(app, ada).get('/friends')),
    );
    for (const secret of [
      grace.subject,
      'email',
      'authSubject',
      'object_key',
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it('rejects yourself, unknown names, and users without a username', async () => {
    const ada = await app.person('ada');
    const nameless = await app.createUser();
    const requests = client(app, ada);
    await expectError(
      await requests.post('/friend-requests', { username: ada.username }),
      400,
      'CANNOT_FRIEND_SELF',
    );
    await expectError(
      await requests.post('/friend-requests', {
        username: 'nobody_here_at_all',
      }),
      404,
      'USER_NOT_FOUND',
    );
    expect(nameless.username).toBe('');
    await expectError(
      await requests.post('/friend-requests', { username: 'bad name!' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('finds usernames the way they are normalized', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const response = await client(app, ada).post('/friend-requests', {
      username: grace.username.toUpperCase(),
    });
    expect(response.status).toBe(201);
  });

  it('refuses duplicates in either direction and for existing friends', async () => {
    const [ada, grace, linus] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
      app.person('linus'),
    ]);
    await json(
      await client(app, ada).post('/friend-requests', {
        username: grace.username,
      }),
      201,
    );
    await expectError(
      await client(app, ada).post('/friend-requests', {
        username: grace.username,
      }),
      409,
      'FRIEND_REQUEST_ALREADY_PENDING',
    );
    await expectError(
      await client(app, grace).post('/friend-requests', {
        username: ada.username,
      }),
      409,
      'FRIEND_REQUEST_ALREADY_PENDING',
    );
    await befriend(ada, linus);
    await expectError(
      await client(app, linus).post('/friend-requests', {
        username: ada.username,
      }),
      409,
      'ALREADY_FRIENDS',
    );
  });

  it('lets only one of two simultaneous opposite requests win', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const results = await Promise.all([
      client(app, ada).post('/friend-requests', { username: grace.username }),
      client(app, grace).post('/friend-requests', { username: ada.username }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const [low, high] = orderedPair(ada.id, grace.id);
    const rows = await app.database
      .select()
      .from(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      );
    expect(rows).toHaveLength(1);
  });

  it('allows asking again after a decline', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const sent = friendshipSchema.parse(
      await json(
        await client(app, ada).post('/friend-requests', {
          username: grace.username,
        }),
        201,
      ),
    );
    await ok(
      await client(app, grace).post(`/friend-requests/${sent.id}/decline`),
    );
    expect(
      friendshipPageSchema.parse(
        await json(await client(app, grace).get('/friend-requests')),
      ).items,
    ).toEqual([]);
    await json(
      await client(app, ada).post('/friend-requests', {
        username: grace.username,
      }),
      201,
    );
  });
});

describe('answering and withdrawing', () => {
  it('lets only the recipient answer, and treats guesses like missing requests', async () => {
    const [ada, grace, mallory] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
      app.person('mallory'),
    ]);
    const sent = friendshipSchema.parse(
      await json(
        await client(app, ada).post('/friend-requests', {
          username: grace.username,
        }),
        201,
      ),
    );
    for (const actor of [ada, mallory]) {
      for (const path of ['accept', 'decline']) {
        await expectError(
          await client(app, actor).post(`/friend-requests/${sent.id}/${path}`),
          404,
          'FRIEND_REQUEST_NOT_FOUND',
        );
      }
    }
    await expectError(
      await client(app, grace).post(`/friend-requests/${randomUUID()}/accept`),
      404,
      'FRIEND_REQUEST_NOT_FOUND',
    );
    const rows = await app.database
      .select()
      .from(friendships)
      .where(eq(friendships.id, sent.id));
    expect(rows[0]?.status).toBe('pending');
  });

  it('answering twice fails the second time', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const sent = friendshipSchema.parse(
      await json(
        await client(app, ada).post('/friend-requests', {
          username: grace.username,
        }),
        201,
      ),
    );
    const results = await Promise.all([
      client(app, grace).post(`/friend-requests/${sent.id}/accept`),
      client(app, grace).post(`/friend-requests/${sent.id}/decline`),
    ]);
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 404)).toHaveLength(1);
    expect(
      statuses.filter((status) => status === 200 || status === 204),
    ).toHaveLength(1);
  });

  it('lets the sender withdraw, and nobody else', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const sent = friendshipSchema.parse(
      await json(
        await client(app, ada).post('/friend-requests', {
          username: grace.username,
        }),
        201,
      ),
    );
    await expectError(
      await client(app, grace).delete(`/friend-requests/${sent.id}`),
      404,
      'FRIEND_REQUEST_NOT_FOUND',
    );
    await ok(await client(app, ada).delete(`/friend-requests/${sent.id}`));
    await expectError(
      await client(app, ada).delete(`/friend-requests/${sent.id}`),
      404,
      'FRIEND_REQUEST_NOT_FOUND',
    );
  });

  it('ends a friendship for both people but leaves shared Boxes alone', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    await befriend(ada, grace);
    const box = await json<{ id: string }>(
      await client(app, ada).post('/boxes', { name: 'Shared' }),
      201,
    );
    const invite = await json<{ id: string }>(
      await client(app, ada).post(`/boxes/${box.id}/invitations`, {
        username: grace.username,
      }),
      201,
    );
    await json(
      await client(app, grace).post(`/box-invitations/${invite.id}/accept`),
    );

    await ok(await client(app, grace).delete(`/friends/${ada.id}`));
    for (const viewer of [ada, grace]) {
      expect(
        friendshipPageSchema.parse(
          await json(await client(app, viewer).get('/friends')),
        ).items,
      ).toEqual([]);
    }
    const members = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, box.id),
          eq(boxMemberships.status, 'active'),
        ),
      );
    expect(members).toHaveLength(2);
    await expectError(
      await client(app, grace).delete(`/friends/${ada.id}`),
      404,
      'FRIENDSHIP_NOT_FOUND',
    );
  });
});

describe('paging', () => {
  it('walks every friend exactly once with a small page size', async () => {
    const owner = await app.person('owner');
    const friends = await Promise.all(
      Array.from({ length: 5 }, () => app.person('f')),
    );
    for (const friend of friends) await befriend(owner, friend);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const path: string = `/friends?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page = friendshipPageSchema.parse(
        await json(await client(app, owner).get(path)),
      );
      seen.push(...page.items.map((item) => item.user.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual(friends.map((friend) => friend.id).sort());
  });

  it('rejects malformed cursors and oversized pages', async () => {
    const ada = await app.person('ada');
    await expectError(
      await client(app, ada).get('/friends?cursor=garbage'),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await client(app, ada).get('/friends?limit=51'),
      400,
      'VALIDATION_FAILED',
    );
  });
});
