import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { REAL_REACTION_KIND } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `posts-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const blocks = new NativeBlockPairs(db);
afterAll(() => deleteApp(app));

async function admittedUser() {
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

describe('trusted Box post pages', () => {
  it('pages roots separately from replies and keeps only a tombstone for a deleted root', async () => {
    const owner = await admittedUser();
    const peer = await admittedUser();
    const box = await boxes.create(owner, 'Threaded');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(peer)
      .set({ uid: peer, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Talk');
    const root = await posts.createComment(box.id, postId, owner, 'Root');
    const reply = await posts.createComment(
      box.id,
      postId,
      peer,
      'Reply',
      root,
    );
    const nested = await posts.createComment(
      box.id,
      postId,
      owner,
      'Nested',
      reply,
    );
    expect(
      (await posts.commentDetail(box.id, postId, nested, owner)).rootId,
    ).toBe(root);
    expect(
      (await posts.listCommentRoots(box.id, postId, owner)).items,
    ).toMatchObject([{ kind: 'comment', comment: { id: root } }]);
    expect(
      (await posts.listCommentReplies(box.id, postId, root, owner)).items,
    ).toHaveLength(2);
    expect(await posts.countCommentReplies(box.id, postId, root, owner)).toBe(
      2,
    );
    const deletedBatch = db.batch();
    for (let index = 0; index < 25; index++) {
      deletedBatch.set(
        db
          .collection('nativeBoxes')
          .doc(box.id)
          .collection('posts')
          .doc(postId)
          .collection('comments')
          .doc(randomUUID()),
        {
          postId,
          authorUid: owner,
          parentId: root,
          text: '',
          status: 'deleted',
          moderationHidden: false,
          createdAt: index + 1,
          updatedAt: index + 1,
        },
      );
    }
    await deletedBatch.commit();
    expect(
      (
        await posts.listCommentReplies(
          box.id,
          postId,
          root,
          owner,
          undefined,
          2,
        )
      ).items.map((item) => item.kind),
    ).toEqual(['comment', 'comment']);
    await blocks.setBlocked(owner, peer, true);
    expect(
      (await posts.listCommentReplies(box.id, postId, root, owner)).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'hidden', id: reply }),
      ]),
    );
    await expect(
      posts.commentDetail(box.id, postId, reply, owner),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await posts.deleteComment(box.id, postId, root, owner);
    expect((await posts.listCommentRoots(box.id, postId, owner)).items).toEqual(
      [expect.objectContaining({ kind: 'deleted', id: root })],
    );
  });
  it('counts only visible comments and reactions and revokes the summary with membership', async () => {
    const owner = await admittedUser();
    const peer = await admittedUser();
    const box = await boxes.create(owner, 'Counted');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(peer)
      .set({ uid: peer, role: 'member', status: 'active', joinedAt: 1 });
    await db
      .collection('nativeAccounts')
      .doc(peer)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    const postId = await posts.create(box.id, owner, 'A post');
    await posts.setReaction(box.id, postId, owner, '👍');
    await posts.setReaction(box.id, postId, peer, '👍');
    const mine = await posts.createComment(box.id, postId, owner, 'Mine');
    await posts.createComment(box.id, postId, peer, 'Peer');
    await posts.setReaction(box.id, postId, peer, '🎉', mine);
    expect(
      await posts.commentInteractionSummary(box.id, postId, mine, owner),
    ).toMatchObject({
      reactionCount: 1,
      reactions: [{ kind: '🎉', count: 1 }],
    });
    expect((await posts.listReactions(box.id, postId, owner)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: owner, kind: '👍' }),
        expect.objectContaining({ uid: peer, kind: '👍' }),
      ]),
    );
    expect(await posts.interactionSummary(box.id, postId, owner)).toMatchObject(
      {
        commentCount: 2,
        reactionCount: 2,
        reactions: [{ kind: '👍', count: 2 }],
        viewerReaction: { kind: '👍' },
      },
    );
    await blocks.setBlocked(owner, peer, true);
    expect(
      await posts.commentInteractionSummary(box.id, postId, mine, owner),
    ).toMatchObject({ reactionCount: 0, reactions: [] });
    expect(
      (await posts.listReactions(box.id, postId, owner)).items.map(
        (item) => item.uid,
      ),
    ).toEqual([owner]);
    expect(await posts.interactionSummary(box.id, postId, owner)).toMatchObject(
      {
        commentCount: 1,
        reactionCount: 1,
        reactions: [{ kind: '👍', count: 1 }],
        viewerReaction: { kind: '👍' },
      },
    );
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(owner)
      .update({ status: 'removed' });
    await expect(
      posts.interactionSummary(box.id, postId, owner),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('reads only the authenticated viewer reaction and revokes it with Box access', async () => {
    const owner = await admittedUser();
    const outsider = await admittedUser();
    const box = await boxes.create(owner, 'Reactions');
    const postId = await posts.create(box.id, owner, 'A note');
    expect(await posts.viewerReaction(box.id, postId, owner)).toBeNull();
    await posts.setReaction(box.id, postId, owner, '👍');
    expect(await posts.viewerReaction(box.id, postId, owner)).toBe('👍');
    await expect(
      posts.viewerReaction(box.id, postId, outsider),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await posts.setReaction(box.id, postId, owner, null);
    expect(await posts.viewerReaction(box.id, postId, owner)).toBeNull();
  });

  it('attaches replies to replies at the root and rejects a deleted target', async () => {
    const owner = await admittedUser();
    const box = await boxes.create(owner, 'Reply Tree');
    const postId = await posts.create(box.id, owner, 'A post');
    const root = await posts.createComment(box.id, postId, owner, 'Root');
    const reply = await posts.createComment(
      box.id,
      postId,
      owner,
      'First reply',
      root,
    );
    const nested = await posts.createComment(
      box.id,
      postId,
      owner,
      'Second reply',
      reply,
    );
    expect(
      (await posts.listComments(box.id, postId, owner)).items.find(
        (item) => item.id === nested,
      )?.parentId,
    ).toBe(root);
    await posts.deleteComment(box.id, postId, reply, owner);
    await expect(
      posts.createComment(box.id, postId, owner, 'Too late', reply),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('pages by requested limit and rechecks membership, blocks and account status', async () => {
    const owner = await admittedUser();
    const peer = await admittedUser();
    const outsider = await admittedUser();
    const box = await boxes.create(owner, 'Journal');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    await boxRef
      .collection('members')
      .doc(peer)
      .set({ uid: peer, role: 'member', status: 'active', joinedAt: 1 });
    await db
      .collection('nativeAccounts')
      .doc(peer)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    await boxRef.update({ memberCount: 2 });
    const oldest = await posts.create(box.id, owner, 'Oldest', 1);
    const middle = await posts.create(box.id, peer, 'Middle', 2);
    const newest = await posts.create(box.id, owner, 'Newest', 3);
    expect(await posts.resolve(newest, owner)).toMatchObject({
      kind: 'post',
      post: { id: newest, boxId: box.id },
    });
    await expect(posts.resolve(middle, outsider)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const first = await posts.list(box.id, owner, undefined, 2);
    expect(first.items.map((post) => post.id)).toEqual([newest, middle]);
    expect(
      (await posts.list(box.id, owner, first.nextCursor!, 2)).items.map(
        (post) => post.id,
      ),
    ).toEqual([oldest]);
    await expect(posts.list(box.id, outsider)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await blocks.setBlocked(owner, peer, true);
    await expect(posts.get(box.id, middle, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(posts.resolve(middle, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const filtered = await posts.list(box.id, owner, undefined, 2);
    expect(filtered.items.map((post) => post.id)).toEqual([newest]);
    expect(filtered.nextCursor).toBe(middle);
    expect(
      (await posts.list(box.id, owner, filtered.nextCursor!, 2)).items.map(
        (post) => post.id,
      ),
    ).toEqual([oldest]);
    await posts.remove(box.id, oldest, owner);
    expect(
      (await db.collection('nativePostPointers').doc(oldest).get()).exists,
    ).toBe(false);
    await accounts.suspend(owner);
    await expect(posts.list(box.id, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('excludes real-reaction previews whose asset is foreign or still processing', async () => {
    const owner = await admittedUser();
    const good = await admittedUser();
    const foreign = await admittedUser();
    const pending = await admittedUser();
    const box = await boxes.create(owner, 'Camera');
    for (const uid of [good, foreign, pending])
      await db
        .collection('nativeBoxes')
        .doc(box.id)
        .collection('members')
        .doc(uid)
        .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Smile');
    const reactions = db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('posts')
      .doc(postId)
      .collection('reactions');
    const cases = [
      { uid: good, ownerUid: good, status: 'ready' },
      { uid: foreign, ownerUid: owner, status: 'ready' },
      { uid: pending, ownerUid: pending, status: 'processing' },
    ];
    for (const { uid, ownerUid, status } of cases) {
      const mediaId = randomUUID();
      await db.collection('nativeMediaAssets').doc(mediaId).set({
        ownerUid,
        status,
        attachedReactionPostId: postId,
      });
      await reactions.doc(uid).set({
        kind: REAL_REACTION_KIND,
        mediaAssetId: mediaId,
        createdAt: 1,
      });
    }
    const summary = await posts.interactionSummary(box.id, postId, owner);
    expect(summary.realCount).toBe(1);
    expect(summary.reactionCount).toBe(1);
    expect(summary.realPreview.map((p) => p.user.id)).toEqual([good]);
  });
});

describe('idempotent post and comment creation', () => {
  it('creates one post and one comment per (author, key)', async () => {
    const owner = await admittedUser();
    const outsider = await admittedUser();
    const box = await boxes.create(owner, 'Idempotent');
    const key = randomUUID();
    const ids = await Promise.all(
      [1, 2, 3].map(() =>
        posts.create(box.id, owner, 'Once', Date.now(), [], key),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    // A different payload under the same key returns the original (as Life Updates do).
    expect(
      await posts.create(box.id, owner, 'Other text', Date.now(), [], key),
    ).toBe(ids[0]);
    expect((await posts.list(box.id, owner)).items).toHaveLength(1);
    // A non-member cannot replay or probe a key.
    await expect(
      posts.create(box.id, outsider, 'Once', Date.now(), [], key),
    ).rejects.toBeInstanceOf(Error);
    // No key: every call creates.
    const a = await posts.create(box.id, owner, 'Plain');
    const b = await posts.create(box.id, owner, 'Plain');
    expect(a).not.toBe(b);

    const ckey = randomUUID();
    const comments = await Promise.all(
      [1, 2, 3].map(() =>
        posts.createComment(box.id, ids[0]!, owner, 'Hi', null, ckey),
      ),
    );
    expect(new Set(comments).size).toBe(1);
    const roots = await posts.listCommentRoots(box.id, ids[0]!, owner);
    expect(roots.items).toHaveLength(1);
    const marker = await db
      .collection('nativeIdempotency')
      .doc(`box_comment_${owner}_${ckey}`)
      .get();
    expect(marker.get('commentId')).toBe(comments[0]);
  });
});
