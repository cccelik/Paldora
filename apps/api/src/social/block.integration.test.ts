import {
  boxInvitations,
  boxMemberships,
  friendships,
  hiddenByBlock,
  isBlockedBetween,
  orderedPair,
  userBlocks,
  users,
} from '@paldora/database';
import {
  blockedUserPageSchema,
  boxInvitationPageSchema,
  boxInvitationSchema,
  boxMemberPageSchema,
  boxSchema,
  friendshipPageSchema,
} from '@paldora/validation';
import { and, eq, inArray, not } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, expectError, json, ok } from '../test-support/http.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

/**
 * ADR 013 authorization matrix for Phase 2. Rows are the things a person can
 * do with or to another person; columns are the block directions. Later
 * phases add posts, comments (Phase 5), and Life Updates (Phase 6) to the
 * same matrix.
 */
let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);

const block: ReturnType<typeof scenes>['block'] = (...args) =>
  scenes(app).block(...args);

const befriend: ReturnType<typeof scenes>['befriend'] = (...args) =>
  scenes(app).befriend(...args);

const sharedBox: ReturnType<typeof scenes>['sharedBox'] = (...args) =>
  scenes(app).sharedBox(...args);

async function pairRow(first: TestUser, second: TestUser) {
  const [low, high] = orderedPair(first.id, second.id);
  const rows = await app.database
    .select()
    .from(friendships)
    .where(
      and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
    );
  return rows[0];
}

describe('blocking, in either direction', () => {
  it.each([
    ['the blocker', 0],
    ['the blocked person', 1],
  ])('ends the friendship for both people (%s asked)', async (_who, index) => {
    const pair = await Promise.all([app.person('a'), app.person('b')]);
    const [first, second] = pair;
    await befriend(first as TestUser, second as TestUser);
    await block(pair[index] as TestUser, pair[1 - index] as TestUser);
    expect(
      await pairRow(first as TestUser, second as TestUser),
    ).toBeUndefined();
    for (const viewer of pair) {
      const friends = friendshipPageSchema.parse(
        await json(await as(viewer).get('/friends')),
      );
      expect(friends.items).toEqual([]);
    }
  });

  it('withdraws a pending request sent either way', async () => {
    const [ada, grace, linus] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
      app.person('linus'),
    ]);
    await json(
      await as(ada).post('/friend-requests', { username: grace.username }),
      201,
    );
    await json(
      await as(linus).post('/friend-requests', { username: ada.username }),
      201,
    );
    await block(ada, grace);
    await block(ada, linus);
    for (const viewer of [ada, grace, linus]) {
      expect(
        friendshipPageSchema.parse(
          await json(await as(viewer).get('/friend-requests')),
        ).items,
      ).toEqual([]);
    }
  });

  it('keeps both people in a shared Box and leaves the member list intact', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await sharedBox(owner, guest);
    await block(guest, owner);
    for (const viewer of [owner, guest]) {
      expect(
        boxSchema.parse(await json(await as(viewer).get(`/boxes/${box.id}`)))
          .memberCount,
      ).toBe(2);
      const members = boxMemberPageSchema.parse(
        await json(await as(viewer).get(`/boxes/${box.id}/members`)),
      );
      expect(members.items.map((item) => item.user.id).sort()).toEqual(
        [owner.id, guest.id].sort(),
      );
    }
    const memberships = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, box.id),
          eq(boxMemberships.status, 'active'),
        ),
      );
    expect(memberships).toHaveLength(2);
  });

  it('withdraws Box invitations between the two people, both ways', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const adaBox = boxSchema.parse(
      await json(await as(ada).post('/boxes', { name: 'Ada’s' }), 201),
    );
    const graceBox = boxSchema.parse(
      await json(await as(grace).post('/boxes', { name: 'Grace’s' }), 201),
    );
    const toGrace = boxInvitationSchema.parse(
      await json(
        await as(ada).post(`/boxes/${adaBox.id}/invitations`, {
          username: grace.username,
        }),
        201,
      ),
    );
    const toAda = boxInvitationSchema.parse(
      await json(
        await as(grace).post(`/boxes/${graceBox.id}/invitations`, {
          username: ada.username,
        }),
        201,
      ),
    );
    await block(grace, ada);
    for (const [invitee, invitation] of [
      [grace, toGrace],
      [ada, toAda],
    ] as const) {
      await expectError(
        await as(invitee).post(`/box-invitations/${invitation.id}/accept`),
        404,
        'INVITATION_NOT_FOUND',
      );
      expect(
        boxInvitationPageSchema.parse(
          await json(await as(invitee).get('/me/box-invitations')),
        ).items,
      ).toEqual([]);
    }
    const rows = await app.database
      .select({ status: boxInvitations.status })
      .from(boxInvitations)
      .where(inArray(boxInvitations.id, [toGrace.id, toAda.id]));
    expect(rows.map((row) => row.status)).toEqual(['revoked', 'revoked']);
  });

  it('does not touch invitations that involve other people', async () => {
    const [owner, guest, bystander] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
      app.person('bystander'),
    ]);
    const box = boxSchema.parse(
      await json(await as(owner).post('/boxes', { name: 'Open' }), 201),
    );
    const invitation = boxInvitationSchema.parse(
      await json(
        await as(owner).post(`/boxes/${box.id}/invitations`, {
          username: guest.username,
        }),
        201,
      ),
    );
    await block(bystander, guest);
    await json(
      await as(guest).post(`/box-invitations/${invitation.id}/accept`),
    );
  });
});

describe('reaching out to someone who blocked you', () => {
  it('is indistinguishable from reaching out to someone who does not exist', async () => {
    const [blocker, blocked] = await Promise.all([
      app.person('blocker'),
      app.person('blocked'),
    ]);
    await block(blocker, blocked);
    const box = boxSchema.parse(
      await json(await as(blocked).post('/boxes', { name: 'Mine' }), 201),
    );
    const missing = 'person_who_never_existed_q';

    const friendRequest = async (username: string) =>
      errorOf(await as(blocked).post('/friend-requests', { username }));
    const boxInvite = async (username: string) =>
      errorOf(
        await as(blocked).post(`/boxes/${box.id}/invitations`, { username }),
      );

    expect(await friendRequest(blocker.username)).toEqual(
      await friendRequest(missing),
    );
    expect(await boxInvite(blocker.username)).toEqual(await boxInvite(missing));
    expect((await friendRequest(blocker.username)).code).toBe('USER_NOT_FOUND');
  });

  it('tells the person who placed the block that they did', async () => {
    const [blocker, blocked] = await Promise.all([
      app.person('blocker'),
      app.person('blocked'),
    ]);
    await block(blocker, blocked);
    const box = boxSchema.parse(
      await json(await as(blocker).post('/boxes', { name: 'Mine' }), 201),
    );
    await expectError(
      await as(blocker).post('/friend-requests', {
        username: blocked.username,
      }),
      403,
      'USER_BLOCKED',
    );
    await expectError(
      await as(blocker).post(`/boxes/${box.id}/invitations`, {
        username: blocked.username,
      }),
      403,
      'USER_BLOCKED',
    );
  });

  it('never reveals a block through lists, only through the blocker’s own list', async () => {
    const [blocker, blocked] = await Promise.all([
      app.person('blocker'),
      app.person('blocked'),
    ]);
    await block(blocker, blocked);
    const mine = blockedUserPageSchema.parse(
      await json(await as(blocker).get('/blocks')),
    );
    expect(mine.items.map((item) => item.userId)).toEqual([blocked.id]);
    expect(
      blockedUserPageSchema.parse(await json(await as(blocked).get('/blocks')))
        .items,
    ).toEqual([]);
    expect(JSON.stringify(mine)).not.toMatch(/avatar|email|subject/i);
  });
});

describe('block bookkeeping', () => {
  it('is idempotent and rejects yourself and strangers', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    const first = await block(ada, grace);
    const second = await block(ada, grace);
    expect(second.blockedAt).toBe(first.blockedAt);
    await expectError(
      await as(ada).post('/blocks', { username: ada.username }),
      400,
      'CANNOT_BLOCK_SELF',
    );
    await expectError(
      await as(ada).post('/blocks', { username: 'nobody_exists_here_x' }),
      404,
      'USER_NOT_FOUND',
    );
  });

  it('lets you block someone who has already blocked you', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    await block(grace, ada);
    await block(ada, grace);
    const rows = await app.database
      .select()
      .from(userBlocks)
      .where(inArray(userBlocks.blockerId, [ada.id, grace.id]));
    expect(rows).toHaveLength(2);
  });

  it('unblocking removes only your own block', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    await block(ada, grace);
    await block(grace, ada);

    await ok(await as(ada).delete(`/blocks/${grace.id}`));
    await ok(await as(ada).delete(`/blocks/${grace.id}`)); // idempotent
    // Grace’s block still stands: Ada reaching out looks like a missing user.
    await expectError(
      await as(ada).post('/friend-requests', { username: grace.username }),
      404,
      'USER_NOT_FOUND',
    );
    await ok(await as(grace).delete(`/blocks/${ada.id}`));
    await json(
      await as(ada).post('/friend-requests', { username: grace.username }),
      201,
    );
  });

  it('does not restore what a block removed when it is lifted', async () => {
    const [ada, grace] = await Promise.all([
      app.person('ada'),
      app.person('grace'),
    ]);
    await befriend(ada, grace);
    await block(ada, grace);
    await ok(await as(ada).delete(`/blocks/${grace.id}`));
    expect(await pairRow(ada, grace)).toBeUndefined();
    // Block, unblock, block again: still consistent.
    await block(ada, grace);
    await block(grace, ada);
    await ok(await as(ada).delete(`/blocks/${grace.id}`));
    expect(await pairRow(ada, grace)).toBeUndefined();
  });

  it('exposes one SQL definition of “hidden by a block” for later phases', async () => {
    const [viewer, blockedByViewer, blockerOfViewer, neutral] =
      await Promise.all([
        app.person('viewer'),
        app.person('blockedbyviewer'),
        app.person('blockerofviewer'),
        app.person('neutral'),
      ]);
    await block(viewer, blockedByViewer);
    await block(blockerOfViewer, viewer);
    const everyone = [viewer, blockedByViewer, blockerOfViewer, neutral].map(
      (person) => person.id,
    );
    const visible = await app.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, everyone),
          not(hiddenByBlock(viewer.id, users.id)),
        ),
      );
    expect(visible.map((row) => row.id).sort()).toEqual(
      [viewer.id, neutral.id].sort(),
    );
    expect(
      await isBlockedBetween(app.database, viewer.id, blockedByViewer.id),
    ).toBe(true);
    expect(
      await isBlockedBetween(app.database, blockerOfViewer.id, viewer.id),
    ).toBe(true);
    expect(await isBlockedBetween(app.database, viewer.id, neutral.id)).toBe(
      false,
    );
  });
});

describe('races with a block', () => {
  const rounds = Array.from({ length: 8 }, (_, index) => index);

  it.each(rounds)(
    'never leaves a friendship behind a simultaneous block (round %i)',
    async () => {
      const [ada, grace] = await Promise.all([
        app.person('ada'),
        app.person('grace'),
      ]);
      const [requested, blocked] = await Promise.all([
        as(ada).post('/friend-requests', { username: grace.username }),
        as(grace).post('/blocks', { username: ada.username }),
      ]);
      expect(blocked.status).toBe(201);
      expect([201, 404]).toContain(requested.status);
      expect(await pairRow(ada, grace)).toBeUndefined();
    },
  );

  it.each(rounds)(
    'never leaves an acceptable invitation behind a simultaneous block (round %i)',
    async () => {
      const [owner, guest] = await Promise.all([
        app.person('owner'),
        app.person('guest'),
      ]);
      const box = boxSchema.parse(
        await json(await as(owner).post('/boxes', { name: 'Race' }), 201),
      );
      const [invited, blocked] = await Promise.all([
        as(owner).post(`/boxes/${box.id}/invitations`, {
          username: guest.username,
        }),
        as(guest).post('/blocks', { username: owner.username }),
      ]);
      expect(blocked.status).toBe(201);
      expect([201, 404]).toContain(invited.status);
      expect(
        boxInvitationPageSchema.parse(
          await json(await as(guest).get('/me/box-invitations')),
        ).items,
      ).toEqual([]);
    },
  );

  it.each(rounds)(
    'never lets an acceptance slip past a simultaneous block (round %i)',
    async () => {
      const [owner, guest] = await Promise.all([
        app.person('owner'),
        app.person('guest'),
      ]);
      const box = boxSchema.parse(
        await json(await as(owner).post('/boxes', { name: 'Race' }), 201),
      );
      const invitation = boxInvitationSchema.parse(
        await json(
          await as(owner).post(`/boxes/${box.id}/invitations`, {
            username: guest.username,
          }),
          201,
        ),
      );
      const [accepted] = await Promise.all([
        as(guest).post(`/box-invitations/${invitation.id}/accept`),
        as(owner).post('/blocks', { username: guest.username }),
      ]);
      // Either the acceptance won (and the person is a member, which a block
      // never undoes) or the block won (and nothing was accepted).
      const [membership] = await app.database
        .select()
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.boxId, box.id),
            eq(boxMemberships.userId, guest.id),
          ),
        );
      expect(accepted.status === 200).toBe(membership?.status === 'active');
      expect([200, 404]).toContain(accepted.status);
    },
  );
});
