import {
  boxInvitationSchema,
  boxSchema,
  postSchema,
} from '@paldora/validation';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { client, expectError, json, ok } from '../test-support/http.js';
import { openStream, type OpenStream } from '../test-support/event-stream.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

let app: TestApp;
const open: OpenStream[] = [];
beforeAll(async () => {
  app = await createTestApp();
});
afterEach(() => {
  for (const stream of open.splice(0)) stream.close();
});
afterAll(() => app.close());

const as = (user: TestUser) => client(app, user);

async function listen(user: TestUser, token = user.token) {
  const stream = await openStream(app.baseUrl, token);
  open.push(stream);
  expect(stream.response.status).toBe(200);
  await stream.waitFor((event) => event.type === 'resync');
  return stream;
}

async function newBox(owner: TestUser, name = 'Crew') {
  return boxSchema.parse(
    await json(await as(owner).post('/boxes', { name }), 201),
  );
}

async function join(owner: TestUser, boxId: string, guest: TestUser) {
  const invitation = boxInvitationSchema.parse(
    await json(
      await as(owner).post(`/boxes/${boxId}/invitations`, {
        username: guest.username,
      }),
      201,
    ),
  );
  await json(await as(guest).post(`/box-invitations/${invitation.id}/accept`));
}

const say = async (user: TestUser, boxId: string, content: string) =>
  postSchema.parse(
    await json(await as(user).post(`/boxes/${boxId}/posts`, { content }), 201),
  );

describe('connecting', () => {
  it('requires sign-in and sends a resync first', async () => {
    const anonymous = await fetch(`${app.baseUrl}/me/events`);
    await expectError(anonymous, 401, 'AUTHENTICATION_REQUIRED');
    const ada = await app.person('ada');
    const stream = await listen(ada);
    expect(stream.response.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    expect(stream.response.headers.get('x-accel-buffering')).toBe('no');
    expect(stream.events[0]?.type).toBe('resync');
  });

  it('caps open streams per person', async () => {
    const ada = await app.person('ada');
    for (let index = 0; index < 5; index += 1) {
      // Sequential: each must be established before the next counts.
      await listen(ada);
    }
    const sixth = await fetch(`${app.baseUrl}/me/events`, {
      headers: { authorization: `Bearer ${ada.token}` },
    });
    await expectError(sixth, 429, 'RATE_LIMITED');
    open[0]?.close();
    await open[0]?.ended;
    // Closing frees a slot (give the server a moment to notice).
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    await listen(ada);
  });

  it('ends when the access token expires', async () => {
    const ada = await app.person('ada');
    const stream = await listen(ada, await app.issuer.token(ada.subject, '2s'));
    const outcome = await Promise.race([
      stream.ended.then(() => 'ended'),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('still open'), 6_000);
      }),
    ]);
    expect(outcome).toBe('ended');
  });
});

describe('delivery', () => {
  it('tells every member about post changes, with IDs only', async () => {
    const [owner, member] = await Promise.all([
      app.person('owner'),
      app.person('member'),
    ]);
    const box = await newBox(owner);
    await join(owner, box.id, member);
    const stream = await listen(member);

    const post = await say(owner, box.id, 'a very private sentence');
    const created = await stream.waitFor(
      (event) => event.type === 'post.created',
    );
    expect(created).toMatchObject({ boxId: box.id, postId: post.id });
    expect(JSON.stringify(stream.events)).not.toContain('private sentence');

    await json(
      await as(owner).patch(`/posts/${post.id}`, { content: 'changed' }),
    );
    await stream.waitFor(
      (event) => event.type === 'post.updated' && event.postId === post.id,
    );
    await ok(await as(owner).delete(`/posts/${post.id}`));
    await stream.waitFor(
      (event) => event.type === 'post.deleted' && event.postId === post.id,
    );
  });

  it('never tells people outside the Box', async () => {
    const [owner, stranger] = await Promise.all([
      app.person('owner'),
      app.person('stranger'),
    ]);
    const box = await newBox(owner);
    const theirs = await newBox(stranger, 'Elsewhere');
    const listener = await listen(stranger);

    await say(owner, box.id, 'not for you');
    const mine = await say(stranger, theirs.id, 'sentinel');
    await listener.waitFor(
      (event) => event.type === 'post.created' && event.postId === mine.id,
    );
    expect(listener.events.filter((event) => event.boxId === box.id)).toEqual(
      [],
    );
  });

  it('stops delivering a Box the moment a member is removed', async () => {
    const [owner, member] = await Promise.all([
      app.person('owner'),
      app.person('member'),
    ]);
    const box = await newBox(owner);
    await join(owner, box.id, member);
    const stream = await listen(member);
    await ok(await as(owner).delete(`/boxes/${box.id}/members/${member.id}`));
    await stream.waitFor((event) => event.type === 'memberships.changed');

    await say(owner, box.id, 'after you left');
    await stream.expectNone((event) => event.type === 'post.created');
  });

  it('starts delivering a Box right after joining it', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await newBox(owner);
    const stream = await listen(guest);
    await join(owner, box.id, guest);
    await stream.waitFor((event) => event.type === 'memberships.changed');
    const post = await say(owner, box.id, 'welcome');
    await stream.waitFor(
      (event) => event.type === 'post.created' && event.postId === post.id,
    );
  });

  it('tells members when a Box is deleted and stops its events', async () => {
    const [owner, member] = await Promise.all([
      app.person('owner'),
      app.person('member'),
    ]);
    const box = await newBox(owner, 'Doomed');
    await join(owner, box.id, member);
    const stream = await listen(member);
    await ok(await as(owner).delete(`/boxes/${box.id}?confirmName=Doomed`));
    await stream.waitFor((event) => event.type === 'memberships.changed');
  });
});
