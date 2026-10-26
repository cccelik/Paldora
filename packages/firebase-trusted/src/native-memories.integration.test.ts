import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeHomeFeed } from './native-home-feed.js';
import { NativeLifeUpdates } from './native-life-updates.js';
import { NativeMemories } from './native-memories.js';
import { nativeBlockPairId } from './native-box-invitations.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `memories-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const updates = new NativeLifeUpdates(db);
const home = new NativeHomeFeed(db);
const memories = new NativeMemories(db);
afterAll(() => deleteApp(app));

async function user() {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid);
  return uid;
}

describe('live UTC Memories', () => {
  it('advances past a bounded window of stale Home hints without losing an older memory', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Home Window');
    const visibleId = await posts.create(
      box.id,
      owner,
      'Older Home memory',
      Date.parse('2025-01-01T00:00:00Z'),
    );
    await home.processOnce(NativeHomeFeed.publishJobId(visibleId));
    const batch = db.batch();
    for (let index = 0; index < 330; index++) {
      const id = randomUUID();
      batch.set(
        db
          .collection('nativeFeedRefs')
          .doc(owner)
          .collection('items')
          .doc(`p_${id}`),
        {
          kind: 'post',
          contentId: id,
          authorUid: owner,
          boxId: box.id,
          createdAt: Date.parse('2025-06-01T00:00:00Z') + index,
          schemaVersion: 2,
        },
      );
    }
    await batch.commit();
    const calls = vi.spyOn(NativeHomeFeed.prototype, 'page');
    try {
      const first = await memories.page(
        owner,
        { kind: 'personal' },
        { year: 2025 },
      );
      expect(first.items).toEqual([]);
      expect(first.nextCursor).toBeTruthy();
      expect(calls).toHaveBeenCalledTimes(1);
      const second = await memories.page(
        owner,
        { kind: 'personal' },
        {
          year: 2025,
          cursor: first.nextCursor!,
        },
      );
      expect(second.items.map((item) => item.id)).toEqual([visibleId]);
      expect(calls).toHaveBeenCalledTimes(2);
    } finally {
      calls.mockRestore();
    }
  });
  it('advances through hidden-heavy Box history with one source window per request', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Hidden Window');
    const visibleId = await posts.create(
      box.id,
      owner,
      'Older visible',
      Date.parse('2025-01-01T00:00:00Z'),
    );
    const batch = db.batch();
    for (let index = 0; index < 160; index++) {
      const id = randomUUID();
      const at = Date.parse('2025-06-01T00:00:00Z') + index;
      batch.create(
        db.collection('nativeBoxes').doc(box.id).collection('posts').doc(id),
        {
          boxId: box.id,
          authorUid: owner,
          text: `Hidden ${index}`,
          kind: 'post',
          status: 'active',
          moderationHidden: true,
          createdAt: at,
          updatedAt: at,
        },
      );
    }
    await batch.commit();
    const calls = vi.spyOn(NativeBoxPosts.prototype, 'list');
    try {
      let cursor: string | undefined;
      let found: string[] = [];
      for (let index = 0; index < 50; index++) {
        const before = calls.mock.calls.length;
        const page = await memories.page(
          owner,
          { kind: 'box', boxId: box.id },
          { year: 2025, limit: 5, cursor },
        );
        expect(calls.mock.calls.length - before).toBe(1);
        found = [...found, ...page.items.map((item) => item.id)];
        cursor = page.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(found).toEqual([visibleId]);
    } finally {
      calls.mockRestore();
    }
  });
  it('keeps same-timestamp Box posts and deliveries distinct across cursors', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Tie Order');
    const at = Date.parse('2025-05-01T12:00:00Z');
    const postId = await posts.create(box.id, owner, 'A post', at);
    const firstUpdate = await updates.create(
      owner,
      {
        audience: { type: 'boxes', boxIds: [box.id] },
        sections: { lifeLately: 'First' },
      },
      at,
    );
    const secondUpdate = await updates.create(
      owner,
      {
        audience: { type: 'boxes', boxIds: [box.id] },
        sections: { lifeLately: 'Second' },
      },
      at,
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await memories.page(
        owner,
        { kind: 'box', boxId: box.id },
        { year: 2025, limit: 1, cursor },
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen)).toEqual(new Set([postId, firstUpdate, secondUpdate]));
    expect(seen).toHaveLength(3);
  });
  it('queries sparse Room history by author without walking other Home refs', async () => {
    const owner = await user();
    const viewer = await user();
    const username = `room${randomUUID().slice(0, 8)}`;
    await db.collection('nativeAccounts').doc(owner).update({
      username,
      usernameNormalized: username,
    });
    await db.collection('nativeUsernames').doc(username).set({ uid: owner });
    await db
      .collection('nativeFriendPairs')
      .doc(nativeBlockPairId(owner, viewer))
      .set({ users: [owner, viewer].sort(), status: 'accepted' });
    const box = await boxes.create(owner, 'Sparse Room');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(viewer)
      .set({ uid: viewer, role: 'member', status: 'active', joinedAt: 1 });
    const id = await posts.create(
      box.id,
      owner,
      'Owner memory',
      Date.parse('2025-06-01T00:00:00Z'),
    );
    await home.processOnce(NativeHomeFeed.publishJobId(id));
    const batch = db.batch();
    for (let index = 0; index < 80; index++) {
      const otherId = randomUUID();
      batch.set(
        db
          .collection('nativeFeedRefs')
          .doc(viewer)
          .collection('items')
          .doc(`p_${otherId}`),
        {
          kind: 'post',
          contentId: otherId,
          authorUid: viewer,
          boxId: box.id,
          createdAt: Date.parse('2025-07-01T00:00:00Z') + index,
          schemaVersion: 1,
        },
      );
    }
    await batch.commit();
    const forgedId = await posts.create(
      box.id,
      viewer,
      'Different author',
      Date.parse('2025-06-02T00:00:00Z'),
    );
    await home.processOnce(NativeHomeFeed.publishJobId(forgedId));
    await db
      .collection('nativeFeedRefs')
      .doc(viewer)
      .collection('items')
      .doc(`p_${forgedId}`)
      .update({ authorUid: owner });
    const calls = vi.spyOn(NativeHomeFeed.prototype, 'page');
    try {
      const result = await memories.page(
        viewer,
        { kind: 'room', username },
        { year: 2025, limit: 5 },
      );
      expect(result.items.map((item) => item.id)).toEqual([id]);
      expect(calls).toHaveBeenCalledTimes(1);
      expect(calls.mock.calls[0]?.[3]).toBe(owner);
    } finally {
      calls.mockRestore();
    }
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('posts')
      .doc(id)
      .update({ moderationHidden: true });
    expect(
      (await memories.page(viewer, { kind: 'room', username }, { year: 2025 }))
        .items,
    ).toEqual([]);
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(owner, viewer))
      .set({ blockedBy: [viewer], epoch: 1 });
    await expect(
      memories.page(viewer, { kind: 'room', username }, { year: 2025 }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('stops a populated Box page after one bounded source batch', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Long History');
    const batch = db.batch();
    for (let index = 0; index < 120; index++) {
      const id = randomUUID();
      const at = Date.parse('2025-06-01T00:00:00Z') + index;
      batch.create(
        db.collection('nativeBoxes').doc(box.id).collection('posts').doc(id),
        {
          boxId: box.id,
          authorUid: owner,
          text: `Post ${index}`,
          status: 'active',
          moderationHidden: false,
          createdAt: at,
          updatedAt: at,
        },
      );
    }
    await batch.commit();
    const olderId = await posts.create(
      box.id,
      owner,
      'Older memory',
      Date.parse('2024-01-01T00:00:00Z'),
    );
    const calls = vi.spyOn(NativeBoxPosts.prototype, 'list');
    try {
      const first = await memories.page(
        owner,
        { kind: 'box', boxId: box.id },
        {
          year: 2025,
          limit: 5,
        },
      );
      expect(first.items).toHaveLength(5);
      expect(first.nextCursor).toBeTruthy();
      expect(calls).toHaveBeenCalledTimes(1);
      const second = await memories.page(
        owner,
        { kind: 'box', boxId: box.id },
        {
          year: 2025,
          limit: 5,
          cursor: first.nextCursor!,
        },
      );
      expect(second.items).toHaveLength(5);
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(10);
      calls.mockClear();
      const older = await memories.page(
        owner,
        { kind: 'box', boxId: box.id },
        { year: 2024, limit: 5 },
      );
      expect(older.items.map((item) => item.id)).toEqual([olderId]);
      expect(calls).toHaveBeenCalledTimes(1);
      expect(calls.mock.calls[0]?.[4]).toEqual({
        beforeAt: Date.UTC(2025, 0, 1),
        afterAt: Date.UTC(2024, 0, 1),
      });
    } finally {
      calls.mockRestore();
    }
  });
  it('deduplicates delivered updates, includes Only Me personally, and rechecks removal', async () => {
    const owner = await user();
    const reader = await user();
    const one = await boxes.create(owner, 'One');
    const two = await boxes.create(owner, 'Two');
    for (const box of [one, two]) {
      await db
        .collection('nativeBoxes')
        .doc(box.id)
        .collection('members')
        .doc(reader)
        .set({ uid: reader, role: 'member', status: 'active', joinedAt: 1 });
      await db
        .collection('nativeAccounts')
        .doc(reader)
        .collection('boxRefs')
        .doc(box.id)
        .set({ boxId: box.id });
    }
    const beforeMidnight = Date.parse('2024-12-31T23:59:59.000Z');
    const afterMidnight = Date.parse('2025-01-01T00:00:01.000Z');
    const postId = await posts.create(
      one.id,
      owner,
      'Old year',
      beforeMidnight,
    );
    await home.processOnce(NativeHomeFeed.publishJobId(postId));
    const updateId = await updates.create(
      owner,
      {
        audience: { type: 'boxes', boxIds: [one.id, two.id] },
        sections: { lifeLately: 'New year' },
      },
      afterMidnight,
    );
    const contexts = (await updates.get(updateId, owner)).contexts;
    for (const context of contexts)
      await home.processOnce(NativeHomeFeed.publishJobId(context.postId));
    const privateId = await updates.create(
      owner,
      {
        audience: { type: 'only_me' },
        sections: { travel: 'Private' },
      },
      afterMidnight + 1,
    );

    expect(
      (await memories.summary(reader, { kind: 'personal' })).years,
    ).toEqual([
      { year: 2025, count: 1 },
      { year: 2024, count: 1 },
    ]);
    expect(
      (
        await memories.page(reader, { kind: 'personal' }, { year: 2025 })
      ).items.map((item) => item.id),
    ).toEqual([updateId]);
    expect(
      (
        await memories.page(owner, { kind: 'personal' }, { year: 2025 })
      ).items.map((item) => item.id),
    ).toEqual([privateId, updateId]);
    expect(
      (await memories.page(reader, { kind: 'box', boxId: one.id })).items.map(
        (item) => item.id,
      ),
    ).toEqual([updateId, postId]);
    const first = await memories.page(
      reader,
      { kind: 'personal' },
      { limit: 1 },
    );
    expect(first.nextCursor).toBeTruthy();
    expect(
      (
        await memories.page(
          reader,
          { kind: 'personal' },
          { limit: 1, cursor: first.nextCursor! },
        )
      ).items[0]?.id,
    ).toBe(postId);
    await expect(
      memories.page(
        reader,
        { kind: 'personal' },
        {
          year: 2025,
          cursor: first.nextCursor!,
        },
      ),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await expect(
      memories.page(
        reader,
        { kind: 'box', boxId: one.id },
        {
          cursor: first.nextCursor!,
        },
      ),
    ).rejects.toMatchObject({ code: 'INVALID' });

    await db
      .collection('nativeBoxes')
      .doc(one.id)
      .collection('members')
      .doc(reader)
      .update({ status: 'removed' });
    expect(
      (await memories.page(reader, { kind: 'personal' })).items.map(
        (item) => item.id,
      ),
    ).toEqual([updateId]);
    await db
      .collection('nativeBoxes')
      .doc(two.id)
      .collection('members')
      .doc(reader)
      .update({ status: 'removed' });
    expect((await memories.page(reader, { kind: 'personal' })).items).toEqual(
      [],
    );
  });
  it('keeps strict descending order and gap-free cursors across sources', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Two Sources');
    const day = (value: number) => Date.UTC(2025, 5, value, 12);
    const expected: { id: string; at: number }[] = [];
    for (const [d, kind] of [
      [28, 'post'],
      [27, 'post'],
      [26, 'only_me'],
      [24, 'post'],
      [23, 'post'],
      [22, 'only_me'],
      [21, 'post'],
      [15, 'post'],
      [14, 'only_me'],
      [13, 'post'],
    ] as const) {
      const at = day(d);
      if (kind === 'post') {
        const id = await posts.create(box.id, owner, `Post ${d}`, at);
        await home.processOnce(NativeHomeFeed.publishJobId(id));
        expected.push({ id, at });
      } else {
        const id = await updates.create(
          owner,
          { audience: { type: 'only_me' }, sections: { travel: `Me ${d}` } },
          at,
        );
        expected.push({ id, at });
      }
    }
    const walk = async (limit: number) => {
      const seen: { id: string; at: number }[] = [];
      let pages = 0;
      let cursor: string | undefined;
      do {
        const page = await memories.page(
          owner,
          { kind: 'personal' },
          { year: 2025, month: 6, limit, cursor },
        );
        pages += 1;
        expect(page.items.length).toBeLessThanOrEqual(limit);
        seen.push(
          ...page.items.map((item) => ({
            id: item.id,
            at: item.occurredAt,
          })),
        );
        cursor = page.nextCursor ?? undefined;
      } while (cursor && pages < 40);
      return { seen, pages };
    };
    for (const limit of [2, 3]) {
      const { seen, pages } = await walk(limit);
      expect(pages).toBeGreaterThanOrEqual(3);
      expect(new Set(seen.map((item) => item.id)).size).toBe(seen.length);
      expect(seen).toEqual(expected);
      for (let index = 1; index < seen.length; index++)
        expect(seen[index - 1]!.at).toBeGreaterThan(seen[index]!.at);
    }
  });

  it('refills past candidates rejected by authorization without changing the item set', async () => {
    const owner = await user();
    const viewer = await user();
    const blockedByViewer = await user();
    const blocksViewer = await user();
    const box = await boxes.create(owner, 'Reject Mix');
    const left = await boxes.create(owner, 'Left Box');
    for (const [boxId, uid] of [
      [box.id, viewer],
      [box.id, blockedByViewer],
      [box.id, blocksViewer],
      [left.id, viewer],
    ] as const) {
      await db
        .collection('nativeBoxes')
        .doc(boxId)
        .collection('members')
        .doc(uid)
        .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
      await db
        .collection('nativeAccounts')
        .doc(uid)
        .collection('boxRefs')
        .doc(boxId)
        .set({ boxId });
    }
    const day = (value: number) => Date.UTC(2025, 5, value, 12);
    const publish = async (boxId: string, uid: string, d: number) => {
      const id = await posts.create(boxId, uid, `Post ${d}`, day(d));
      await home.processOnce(NativeHomeFeed.publishJobId(id));
      return id;
    };
    // Newest first: every rejected candidate sorts ahead of the visible ones.
    const hidden = await publish(box.id, owner, 29);
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('posts')
      .doc(hidden)
      .update({ moderationHidden: true });
    await publish(box.id, blockedByViewer, 28);
    await publish(box.id, blocksViewer, 27);
    await publish(left.id, owner, 26);
    await updates.create(
      owner,
      { audience: { type: 'only_me' }, sections: { travel: 'Not yours' } },
      day(25),
    );
    const visible = [
      await publish(box.id, owner, 20),
      await publish(box.id, owner, 19),
      await publish(box.id, owner, 18),
      await publish(box.id, owner, 17),
      await publish(box.id, owner, 16),
    ];
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(viewer, blockedByViewer))
      .set({ blockedBy: [viewer], epoch: 1 });
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(viewer, blocksViewer))
      .set({ blockedBy: [blocksViewer], epoch: 1 });
    await db
      .collection('nativeBoxes')
      .doc(left.id)
      .collection('members')
      .doc(viewer)
      .update({ status: 'removed' });

    for (const scope of [
      { kind: 'personal' as const },
      { kind: 'box' as const, boxId: box.id },
    ]) {
      const first = await memories.page(viewer, scope, {
        year: 2025,
        month: 6,
        limit: 3,
      });
      // A bounded scan may return a short (even empty) page with a cursor; what
      // is guaranteed is that whatever it returns is a correct prefix, and that
      // walking every cursor yields the full visible set in order.
      expect(first.items.map((item) => item.id)).toEqual(
        visible.slice(0, first.items.length),
      );
      const seen = first.items.map((item) => item.id);
      let cursor = first.nextCursor ?? undefined;
      for (let pages = 0; cursor && pages < 30; pages++) {
        const page = await memories.page(viewer, scope, {
          year: 2025,
          month: 6,
          limit: 3,
          cursor,
        });
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
      }
      expect(seen).toEqual(visible);
    }
  });
});
