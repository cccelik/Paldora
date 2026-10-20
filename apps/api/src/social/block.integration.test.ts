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
  blockedUserSchema,
  boxInvitationPageSchema,
  boxInvitationSchema,
  boxMemberPageSchema,
  boxSchema,
  feedPageSchema,
  friendshipPageSchema,
  friendshipSchema,
  roomSchema,
  type FeedItemView,
} from '@paldora/validation';
import { and, eq, inArray, not } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, errorOf, expectError, json, ok } from '../testing/http.js';
import { lifeUpdateTools } from '../testing/life-updates.js';
import { notificationTools } from '../testing/notifications.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

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

const as = (user: TestUser) => client(app, user);

async function block(blocker: TestUser, target: TestUser) {
  return blockedUserSchema.parse(
    await json(
      await as(blocker).post('/blocks', { username: target.username }),
      201,
    ),
  );
}

async function befriend(first: TestUser, second: TestUser) {
  const sent = friendshipSchema.parse(
    await json(
      await as(first).post('/friend-requests', { username: second.username }),
      201,
    ),
  );
  await json(await as(second).post(`/friend-requests/${sent.id}/accept`));
}

async function sharedBox(owner: TestUser, guest: TestUser) {
  const box = boxSchema.parse(
    await json(await as(owner).post('/boxes', { name: 'Shared' }), 201),
  );
  const invitation = boxInvitationSchema.parse(
    await json(
      await as(owner).post(`/boxes/${box.id}/invitations`, {
        username: guest.username,
      }),
      201,
    ),
  );
  await json(await as(guest).post(`/box-invitations/${invitation.id}/accept`));
  return box;
}

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

describe('comments and reactions in a shared Box (Phase 5)', () => {
  const setup = async () => {
    const scene = scenes(app);
    const {
      owner: viewer,
      member: other,
      admin: third,
      box,
    } = await scene.room();
    const post = await scene.say(third, box.id, 'neutral post');
    const theirRoot = await scene.comment(other, post.id, 'secret words');
    const myRoot = await scene.comment(viewer, post.id, 'my words');
    const theirReply = await scene.comment(
      other,
      post.id,
      'secret reply',
      myRoot.id,
    );
    await scene.reactToPost(other, post.id, '😂');
    await scene.reactToPost(viewer, post.id, '❤️');
    await scene.reactToComment(other, myRoot.id, '🔥');
    const second = await scene.say(third, box.id, 'second post');
    await scene.cameraReaction(other, box.id, second.id);
    const theirPost = await scene.say(other, box.id, 'their post');
    return {
      scene,
      viewer,
      other,
      third,
      post,
      second,
      theirPost,
      theirRoot,
      myRoot,
      theirReply,
    };
  };

  it.each([
    ['the viewer blocked the commenter', 'viewer'],
    ['the commenter blocked the viewer', 'other'],
  ])('%s', async (_name, direction) => {
    const s = await setup();
    const [from, target] =
      direction === 'viewer' ? [s.viewer, s.other] : [s.other, s.viewer];
    await block(from, target);

    const page = await s.scene.threads(s.viewer, s.post.id);
    const byRoot = new Map(
      page.items.map((thread) => [
        thread.root.kind === 'hidden'
          ? thread.root.hidden.id
          : thread.root.kind === 'comment'
            ? thread.root.comment.id
            : thread.root.deleted.id,
        thread,
      ]),
    );
    // Their thread is one neutral placeholder: an ID and a time, no replies.
    expect(byRoot.get(s.theirRoot.id)).toEqual({
      root: {
        kind: 'hidden',
        hidden: { id: s.theirRoot.id, createdAt: s.theirRoot.createdAt },
      },
      replies: [],
      replyCount: 0,
    });
    // Their reply in my thread is a placeholder; their reaction is not counted.
    const mine = byRoot.get(s.myRoot.id);
    expect(mine?.replies).toEqual([
      {
        kind: 'hidden',
        hidden: { id: s.theirReply.id, createdAt: s.theirReply.createdAt },
      },
    ]);
    expect(mine?.root).toMatchObject({
      kind: 'comment',
      comment: { interactions: { reactionCount: 0, reactions: [] } },
    });
    const leaks = JSON.stringify(page);
    for (const leak of ['secret', s.other.id, s.other.username]) {
      expect(leaks).not.toContain(leak);
    }

    // Counts are viewer-relative, so a number never reveals blocked activity.
    expect(
      (await s.scene.postView(s.viewer, s.post.id)).interactions,
    ).toMatchObject({
      commentCount: 1,
      reactionCount: 1,
      reactions: [{ kind: '❤️', count: 1 }],
    });
    expect(
      (await s.scene.postView(s.viewer, s.second.id)).interactions,
    ).toMatchObject({ realCount: 0, realPreview: [], reactionCount: 0 });
    // Someone outside the block sees everything.
    expect(
      (await s.scene.postView(s.third, s.post.id)).interactions,
    ).toMatchObject({ commentCount: 3, reactionCount: 2 });

    // Hidden comments cannot be reached directly or replied to.
    for (const response of [
      await as(s.viewer).get(`/comments/${s.theirRoot.id}`),
      await as(s.viewer).get(`/comments/${s.theirRoot.id}/replies`),
      await as(s.viewer).get(`/comments/${s.theirReply.id}`),
      await as(s.viewer).post(`/posts/${s.post.id}/comments`, {
        content: 'reply',
        parentCommentId: s.theirReply.id,
      }),
    ]) {
      await expectError(response, 404, 'COMMENT_NOT_FOUND');
    }
    // Their post is gone for the viewer, comments and all.
    await expectError(
      await as(s.viewer).post(`/posts/${s.theirPost.id}/comments`, {
        content: 'hi',
      }),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(s.viewer).get(`/posts/${s.theirPost.id}/comments`),
      404,
      'POST_NOT_FOUND',
    );
    // The other side sees the viewer the same way.
    const theirView = await s.scene.threads(s.other, s.post.id);
    expect(JSON.stringify(theirView)).not.toContain('my words');

    // Unblocking restores everything; blocking again hides it again.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    const restored = await s.scene.threads(s.viewer, s.post.id);
    expect(JSON.stringify(restored)).toContain('secret words');
    expect(
      (await s.scene.postView(s.viewer, s.post.id)).interactions.commentCount,
    ).toBe(3);
    await block(from, target);
    expect(
      JSON.stringify(await s.scene.threads(s.viewer, s.post.id)),
    ).not.toContain('secret');
  });

  it.each(Array.from({ length: 4 }, (_, index) => index))(
    'never shows a comment racing a block (round %i)',
    async () => {
      const scene = scenes(app);
      const { owner: viewer, member: other, box } = await scene.room();
      const post = await scene.say(viewer, box.id);
      const [created, blocked] = await Promise.all([
        as(other).post(`/posts/${post.id}/comments`, { content: 'racing' }),
        as(viewer).post('/blocks', { username: other.username }),
      ]);
      expect(blocked.status).toBe(201);
      expect([201, 404]).toContain(created.status);
      const page = await scene.threads(viewer, post.id);
      expect(JSON.stringify(page)).not.toContain('racing');
      expect(
        (await scene.postView(viewer, post.id)).interactions.commentCount,
      ).toBe(0);
    },
  );
});

describe('notifications across a block (Phase 5)', () => {
  it.each([
    ['the recipient blocked the actor', 'recipient'],
    ['the actor blocked the recipient', 'actor'],
  ])('%s', async (_name, direction) => {
    const scene = scenes(app);
    const { deliver, unread, visibleIds } = notificationTools(app);
    const {
      owner: recipient,
      member: actor,
      admin: bystander,
      box,
    } = await scene.room();
    const post = await scene.say(recipient, box.id);
    const comment = await scene.comment(actor, post.id, 'hello');
    await scene.reactToPost(actor, post.id, '👍');
    await scene.reactToPost(bystander, post.id, '❤️');
    const fromActor = [
      await deliver({
        recipient,
        actor,
        type: 'post.comment',
        postId: post.id,
        commentId: comment.id,
      }),
      await deliver({
        recipient,
        actor,
        type: 'post.reaction',
        postId: post.id,
      }),
    ];
    const fromBystander = await deliver({
      recipient,
      actor: bystander,
      type: 'post.reaction',
      postId: post.id,
    });
    const [from, target] =
      direction === 'recipient' ? [recipient, actor] : [actor, recipient];

    await block(from, target);
    // Created before the block, hidden after it: rechecked at every read.
    expect(await visibleIds(recipient)).toEqual([fromBystander]);
    expect(await unread(recipient)).toEqual({ count: 1, capped: false });
    for (const id of fromActor) {
      // Sequential for clarity: one 404 per hidden notification.

      await expectError(
        await as(recipient).post(`/me/notifications/${id}/read`),
        404,
        'NOTIFICATION_NOT_FOUND',
      );
    }

    // Unblocking restores them (still unread); blocking again hides them.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    expect((await visibleIds(recipient)).sort()).toEqual(
      [...fromActor, fromBystander].sort(),
    );
    expect(await unread(recipient)).toEqual({ count: 3, capped: false });
    await block(from, target);
    expect(await visibleIds(recipient)).toEqual([fromBystander]);
  });
});

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

describe('Rooms and Top Friends across a block (Phase 7)', () => {
  const room = (viewer: TestUser, owner: TestUser) =>
    as(viewer).get(`/rooms/${owner.username}`);
  const topFriendIds = async (viewer: TestUser, owner: TestUser) => {
    const body = roomSchema.parse(await json(await room(viewer, owner)));
    return body.topFriends.items?.map((item) => item.id) ?? null;
  };
  async function chooseTopFriends(owner: TestUser, friends: TestUser[]) {
    const { updatedAt } = roomSchema.parse(
      await json(await as(owner).get('/me/room')),
    );
    return as(owner).put('/me/room/top-friends', {
      userIds: friends.map((friend) => friend.id),
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: updatedAt,
    });
  }

  it.each([
    ['the owner blocks the viewer', 0],
    ['the viewer blocks the owner', 1],
  ])(
    'hides the Room from both people when %s; unblock restores, re-block hides',
    async (_case, index) => {
      const [owner, viewer] = [await app.person('o'), await app.person('v')];
      await befriend(owner, viewer);
      const box = await sharedBox(owner, viewer);
      const { updatedAt } = roomSchema.parse(
        await json(await as(owner).get('/me/room')),
      );
      await json(
        await as(owner).patch('/me/room', {
          visibility: 'members',
          expectedUpdatedAt: updatedAt,
        }),
      );
      const [from, target] = (
        index === 0 ? [owner, viewer] : [viewer, owner]
      ) as [TestUser, TestUser];
      const post = await scenes(app).say(owner, box.id, 'in the shared Box');
      // The Room and every preview route answer alike.
      const routes = ['', '/content', '/content/summary', '/photos'];
      const hidden = async (from: TestUser, of: TestUser) => {
        for (const path of routes) {
          await expectError(
            await as(from).get(`/rooms/${of.username}${path}`),
            404,
            'ROOM_NOT_FOUND',
          );
        }
      };
      await block(from, target);
      await hidden(viewer, owner);
      await hidden(owner, viewer);
      // The block ended the friendship; the shared Box admits them again.
      await ok(await as(from).delete(`/blocks/${target.id}`));
      expect(
        roomSchema.parse(await json(await room(viewer, owner))).relationship,
      ).toBe('member');
      const content = (await json(
        await as(viewer).get(`/rooms/${owner.username}/content`),
      )) as { items: { post?: { id: string } }[] };
      expect(content.items.map((item) => item.post?.id)).toEqual([post.id]);
      await block(from, target);
      await hidden(viewer, owner);
    },
  );

  it.each([
    ['the owner blocks the Top Friend', 0],
    ['the Top Friend blocks the owner', 1],
  ])(
    'removes the Top Friend when %s, and refuses re-adding',
    async (_c, index) => {
      const [owner, top] = [await app.person('o'), await app.person('t')];
      await befriend(owner, top);
      await json(await chooseTopFriends(owner, [top]));
      const [from, target] = (index === 0 ? [owner, top] : [top, owner]) as [
        TestUser,
        TestUser,
      ];
      await block(from, target);
      expect(await topFriendIds(owner, owner)).toEqual([]);
      await expectError(
        await chooseTopFriends(owner, [top]),
        422,
        'TOP_FRIEND_NOT_ELIGIBLE',
      );
      // Unblocking does not restore the friendship, so still not eligible.
      await ok(await as(from).delete(`/blocks/${target.id}`));
      await expectError(
        await chooseTopFriends(owner, [top]),
        422,
        'TOP_FRIEND_NOT_ELIGIBLE',
      );
    },
  );

  it.each([
    ['the visitor blocks the Top Friend', 0],
    ['the Top Friend blocks the visitor', 1],
  ])(
    'omits only that Top Friend for that visitor when %s',
    async (_c, index) => {
      const [owner, top, other, visitor] = await Promise.all([
        app.person('o'),
        app.person('t'),
        app.person('x'),
        app.person('v'),
      ]);
      await befriend(owner, top);
      await befriend(owner, other);
      await befriend(owner, visitor);
      await json(await chooseTopFriends(owner, [top, other]));
      const [from, target] = (
        index === 0 ? [visitor, top] : [top, visitor]
      ) as [TestUser, TestUser];
      await block(from, target);
      expect(await topFriendIds(visitor, owner)).toEqual([other.id]);
      expect(await topFriendIds(owner, owner)).toEqual([top.id, other.id]);
      await ok(await as(from).delete(`/blocks/${target.id}`));
      expect(await topFriendIds(visitor, owner)).toEqual([top.id, other.id]);
    },
  );
});
