import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccountLifecycle } from './native-account-lifecycle.js';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeMedia } from './native-media.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Auth, Firestore and Storage emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `oracle-${randomUUID()}`,
);
const auth = getAuth(app),
  db = getFirestore(app),
  storage = getStorage(app);
const bucketName = 'demo-paldora.firebasestorage.app';
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const blocks = new NativeBlockPairs(db);
const media = new NativeMedia(db, storage, bucketName);
const lifecycle = new NativeAccountLifecycle(db, auth, storage, bucketName);
afterAll(() => deleteApp(app));

async function person(): Promise<string> {
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

async function addMember(boxId: string, uid: string): Promise<void> {
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('members')
    .doc(uid)
    .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
}

type Denial =
  { threw: true; error: unknown } | { threw: false; value: unknown };

async function settle(run: () => Promise<unknown>): Promise<Denial> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function shape(error: unknown) {
  const object = error as Record<string, unknown>;
  return {
    name: (error as Error).constructor?.name,
    code: object.code,
    message: (error as Error).message,
    keys: Object.keys(object).sort(),
  };
}

/** Both calls must reject, and the rejections must be indistinguishable. */
async function expectSameDenial(
  fnReal: () => Promise<unknown>,
  fnRandom: () => Promise<unknown>,
): Promise<void> {
  const [real, random] = await Promise.all([settle(fnReal), settle(fnRandom)]);
  expect(real.threw, 'real forbidden id must be denied').toBe(true);
  expect(random.threw, 'random id must be denied').toBe(true);
  if (real.threw && random.threw)
    expect(shape(real.error)).toEqual(shape(random.error));
}

/* ------------------------------------------------------------------ */
/* 1 and 2: posts, comments, reactions                                 */
/* ------------------------------------------------------------------ */

interface Ctx {
  uid: string;
  boxId: string;
  postId: string;
  commentId: string;
}

interface Scenario {
  name: string;
  setup: () => Promise<Ctx>;
}

/** Owner + author share a Box with one post and one comment. */
async function world() {
  const owner = await person();
  const author = await person();
  const box = await boxes.create(owner, 'Oracle');
  await addMember(box.id, author);
  const postId = await posts.create(box.id, author, 'private words');
  const commentId = await posts.createComment(box.id, postId, author, 'hello');
  return { owner, author, boxId: box.id, postId, commentId };
}

async function memberWorld() {
  const w = await world();
  const uid = await person();
  await addMember(w.boxId, uid);
  return { ...w, uid };
}

const scenarios: Scenario[] = [
  {
    name: 'outsider',
    setup: async () => {
      const w = await world();
      return { ...w, uid: await person() };
    },
  },
  {
    name: 'former member after leaving',
    setup: async () => {
      const w = await memberWorld();
      await boxes.removeMember(w.boxId, w.uid, w.uid);
      return w;
    },
  },
  {
    name: 'former member after removal',
    setup: async () => {
      const w = await memberWorld();
      await boxes.removeMember(w.boxId, w.owner, w.uid);
      return w;
    },
  },
  {
    name: 'blocker of the author',
    setup: async () => {
      const w = await memberWorld();
      await blocks.setBlocked(w.uid, w.author, true);
      return w;
    },
  },
  {
    name: 'user blocked by the author',
    setup: async () => {
      const w = await memberWorld();
      await blocks.setBlocked(w.author, w.uid, true);
      return w;
    },
  },
  {
    name: 'suspended actor',
    setup: async () => {
      const w = await memberWorld();
      await accounts.suspend(w.uid);
      return w;
    },
  },
  {
    name: 'moderation-hidden post',
    setup: async () => {
      const w = await memberWorld();
      await db
        .collection('nativeBoxes')
        .doc(w.boxId)
        .collection('posts')
        .doc(w.postId)
        .update({ moderationHidden: true });
      return w;
    },
  },
  {
    name: 'soft-deleted post',
    setup: async () => {
      const w = await memberWorld();
      await posts.remove(w.boxId, w.postId, w.author);
      return w;
    },
  },
  {
    name: 'moderation-hidden comment on a visible post',
    setup: async () => {
      const w = await memberWorld();
      await db
        .collection('nativeBoxes')
        .doc(w.boxId)
        .collection('posts')
        .doc(w.postId)
        .collection('comments')
        .doc(w.commentId)
        .update({ moderationHidden: true });
      return w;
    },
  },
  {
    name: 'soft-deleted comment on a visible post',
    setup: async () => {
      const w = await memberWorld();
      await posts.deleteComment(w.boxId, w.postId, w.commentId, w.author);
      return w;
    },
  },
  {
    name: 'real post requested under a different real Box the caller belongs to',
    setup: async () => {
      const w = await memberWorld();
      const other = await boxes.create(w.uid, 'Other Box');
      return { ...w, boxId: other.id };
    },
  },
  {
    name: 'real post requested under a different real Box the caller owns, caller is the post author',
    setup: async () => {
      const w = await world();
      const other = await boxes.create(w.author, 'Authors other Box');
      return { ...w, uid: w.author, boxId: other.id };
    },
  },
];

interface Op {
  name: string;
  scope: 'post' | 'comment';
  run: (ctx: Ctx) => Promise<unknown>;
}

const ops: Op[] = [
  {
    name: 'get',
    scope: 'post',
    run: (c) => posts.get(c.boxId, c.postId, c.uid),
  },
  {
    name: 'resolve',
    scope: 'post',
    run: (c) => posts.resolve(c.postId, c.uid),
  },
  {
    name: 'listComments',
    scope: 'post',
    run: (c) => posts.listComments(c.boxId, c.postId, c.uid),
  },
  {
    name: 'listCommentRoots',
    scope: 'post',
    run: (c) => posts.listCommentRoots(c.boxId, c.postId, c.uid),
  },
  {
    name: 'interactionSummary',
    scope: 'post',
    run: (c) => posts.interactionSummary(c.boxId, c.postId, c.uid),
  },
  {
    name: 'listReactions (post)',
    scope: 'post',
    run: (c) => posts.listReactions(c.boxId, c.postId, c.uid),
  },
  {
    name: 'viewerReaction (post)',
    scope: 'post',
    run: (c) => posts.viewerReaction(c.boxId, c.postId, c.uid),
  },
  {
    name: 'setReaction (post, emoji)',
    scope: 'post',
    run: (c) => posts.setReaction(c.boxId, c.postId, c.uid, '👍'),
  },
  {
    name: 'setReaction (post, clear)',
    scope: 'post',
    run: (c) => posts.setReaction(c.boxId, c.postId, c.uid, null),
  },
  {
    name: 'createComment (root)',
    scope: 'post',
    run: (c) => posts.createComment(c.boxId, c.postId, c.uid, 'probe'),
  },
  {
    name: 'commentDetail',
    scope: 'comment',
    run: (c) => posts.commentDetail(c.boxId, c.postId, c.commentId, c.uid),
  },
  {
    name: 'listCommentReplies',
    scope: 'comment',
    run: (c) => posts.listCommentReplies(c.boxId, c.postId, c.commentId, c.uid),
  },
  {
    name: 'countCommentReplies',
    scope: 'comment',
    run: (c) =>
      posts.countCommentReplies(c.boxId, c.postId, c.commentId, c.uid),
  },
  {
    name: 'viewerReaction (comment)',
    scope: 'comment',
    run: (c) => posts.viewerReaction(c.boxId, c.postId, c.uid, c.commentId),
  },
  {
    name: 'listReactions (comment)',
    scope: 'comment',
    run: (c) => posts.listReactions(c.boxId, c.postId, c.uid, c.commentId),
  },
  {
    name: 'setReaction (comment, emoji)',
    scope: 'comment',
    run: (c) => posts.setReaction(c.boxId, c.postId, c.uid, '👍', c.commentId),
  },
  {
    name: 'createComment (reply)',
    scope: 'comment',
    run: (c) =>
      posts.createComment(c.boxId, c.postId, c.uid, 'probe', c.commentId),
  },
];

function baselines(ctx: Ctx, scope: Op['scope']): Ctx[] {
  const all = {
    uid: ctx.uid,
    boxId: randomUUID(),
    postId: randomUUID(),
    commentId: randomUUID(),
  };
  const post = { ...ctx, postId: randomUUID(), commentId: randomUUID() };
  const list: Ctx[] = [all, post];
  if (scope === 'comment') list.push({ ...ctx, commentId: randomUUID() });
  return list;
}

/** Everything an actor could have written through these operations. */
async function effects(ctx: Ctx) {
  const postRef = db
    .collection('nativeBoxes')
    .doc(ctx.boxId)
    .collection('posts')
    .doc(ctx.postId);
  const [postReaction, commentReaction, activity, comments] = await Promise.all(
    [
      postRef.collection('reactions').doc(ctx.uid).get(),
      postRef
        .collection('comments')
        .doc(ctx.commentId)
        .collection('reactions')
        .doc(ctx.uid)
        .get(),
      db.collection('nativeActivity').where('actorUid', '==', ctx.uid).get(),
      postRef.collection('comments').where('authorUid', '==', ctx.uid).get(),
    ],
  );
  return {
    postReaction: postReaction.exists,
    commentReaction: commentReaction.exists,
    activity: activity.size,
    comments: comments.size,
  };
}

describe('post, comment and reaction denials are not an existence oracle', () => {
  for (const scenario of scenarios) {
    describe(scenario.name, () => {
      let state: Promise<{
        ctx: Ctx;
        before: Awaited<ReturnType<typeof effects>>;
      }>;
      const ready = () => {
        state ??= scenario.setup().then(async (ctx) => ({
          ctx,
          before: await effects(ctx),
        }));
        return state;
      };

      for (const op of ops) {
        it(`${op.name}: real ids are denied exactly like random ids`, async () => {
          const { ctx } = await ready();
          // Scenarios where the comment (not the post) is the forbidden part
          // are only meaningful for comment-scoped operations.
          if (
            op.scope === 'post' &&
            /comment on a visible post/.test(scenario.name)
          )
            return;
          // resolve() looks a post up by its pointer alone, with no Box ID in
          // the request, so a mismatched Box cannot be expressed for it.
          if (op.name === 'resolve' && /different real Box/.test(scenario.name))
            return;
          const real = await settle(() => op.run(ctx));
          // Only denials are compared; a visible target is a different test.
          // A soft-deleted root stays addressable as a tombstone so its thread
          // survives (commentItem allows deleted); a hidden one must not be.
          const tombstoneThread =
            /soft-deleted comment/.test(scenario.name) &&
            (op.name === 'listCommentReplies' ||
              op.name === 'countCommentReplies');
          if (
            !real.threw &&
            /comment on a visible post/.test(scenario.name) &&
            !tombstoneThread
          )
            expect.fail(`${op.name} succeeded for a hidden or deleted comment`);
          if (tombstoneThread && !real.threw) return;
          await Promise.all(
            baselines(ctx, op.scope).map((random) =>
              expectSameDenial(
                () => op.run(ctx),
                () => op.run(random),
              ),
            ),
          );
        });
      }

      it('denied writes created no reaction, comment or activity event', async () => {
        const { ctx, before } = await ready();
        expect(await effects(ctx)).toEqual(before);
      });
    });
  }
});

/* ------------------------------------------------------------------ */
/* 3: media reads                                                       */
/* ------------------------------------------------------------------ */

type Fields = Record<string, unknown>;

async function asset(fields: Fields): Promise<string> {
  const id = randomUUID();
  await db
    .collection('nativeMediaAssets')
    .doc(id)
    .set({
      purpose: 'post_image',
      boxId: null,
      status: 'ready',
      lifecycleEpoch: 1,
      contentType: 'image/jpeg',
      contentLength: 10,
      rawPath: `private/raw/${id}`,
      objectPaths: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      uploadedAt: Date.now(),
      attachedPostId: null,
      attachedLifeUpdateId: null,
      attachedRoomUid: null,
      attachedReactionPostId: null,
      ...fields,
    });
  return id;
}

/** A foreign Box with a post that lists the asset id; the viewer is not a member. */
async function foreignPostAsset(
  viewer: string,
  extra: (ids: { boxId: string; postId: string; owner: string }) => Fields,
  options: { viewerIsMember?: boolean } = {},
) {
  const owner = await person();
  const box = await boxes.create(owner, 'Foreign');
  if (options.viewerIsMember) await addMember(box.id, viewer);
  const postId = await posts.create(box.id, owner, 'with a photo');
  const id = await asset({
    ownerUid: owner,
    boxId: box.id,
    ...extra({ boxId: box.id, postId, owner }),
  });
  await db
    .collection('nativeBoxes')
    .doc(box.id)
    .collection('posts')
    .doc(postId)
    .update({ mediaAssetIds: [id] });
  return { id, boxId: box.id, postId, owner };
}

interface MediaScenario {
  name: string;
  setup: (viewer: string) => Promise<string>;
}

const mediaScenarios: MediaScenario[] = [
  ...(['pending', 'uploading', 'processing', 'failed', 'deleted'] as const).map(
    (status): MediaScenario => ({
      name: `another user's asset in state ${status}`,
      setup: async () => asset({ ownerUid: await person(), status }),
    }),
  ),
  {
    name: "another user's ready, unattached asset",
    setup: async () => asset({ ownerUid: await person() }),
  },
  {
    name: 'ready post image in a foreign Box',
    setup: async (viewer) =>
      (
        await foreignPostAsset(viewer, ({ postId }) => ({
          attachedPostId: postId,
        }))
      ).id,
  },
  {
    name: 'ready reaction image in a foreign Box',
    setup: async (viewer) =>
      (
        await foreignPostAsset(viewer, ({ postId }) => ({
          purpose: 'reaction_image',
          attachedReactionPostId: postId,
        }))
      ).id,
  },
  {
    name: 'ready post image in a Box that is being deleted (viewer is a member)',
    setup: async (viewer) => {
      const made = await foreignPostAsset(
        viewer,
        ({ postId }) => ({ attachedPostId: postId }),
        { viewerIsMember: true },
      );
      await db
        .collection('nativeBoxes')
        .doc(made.boxId)
        .update({ status: 'deleting' });
      return made.id;
    },
  },
  {
    name: "hidden Room's banner",
    setup: async () => {
      const owner = await person();
      const username = `u${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      await db.collection('nativeAccounts').doc(owner).update({ username });
      await db.collection('nativeUsernames').doc(username).set({ uid: owner });
      const id = await asset({
        ownerUid: owner,
        purpose: 'room_banner',
        attachedRoomUid: owner,
      });
      await db
        .collection('nativeRooms')
        .doc(owner)
        .set({ visibility: 'hidden', bannerMediaId: id, version: 1 });
      return id;
    },
  },
  {
    name: 'avatar of a user the viewer has blocked',
    setup: async (viewer) => {
      const owner = await person();
      const id = await asset({ ownerUid: owner, purpose: 'avatar' });
      await db.collection('nativeProfiles').doc(owner).update({
        avatarMediaId: id,
      });
      await blocks.setBlocked(viewer, owner, true);
      return id;
    },
  },
  {
    name: 'avatar of a user who blocked the viewer',
    setup: async (viewer) => {
      const owner = await person();
      const id = await asset({ ownerUid: owner, purpose: 'avatar' });
      await db.collection('nativeProfiles').doc(owner).update({
        avatarMediaId: id,
      });
      await blocks.setBlocked(owner, viewer, true);
      return id;
    },
  },
];

describe('media reads do not reveal whether an asset id exists', () => {
  for (const scenario of mediaScenarios) {
    for (const variant of ['display', 'thumbnail'] as const) {
      it(`${scenario.name} (${variant}) is denied like a random id`, async () => {
        const viewer = await person();
        const id = await scenario.setup(viewer);
        await expectSameDenial(
          () => media.read(viewer, id, variant),
          () => media.read(viewer, randomUUID(), variant),
        );
      });
    }
  }

  it('a suspended viewer is denied like a random id', async () => {
    const viewer = await person();
    const id = await asset({ ownerUid: viewer });
    await accounts.suspend(viewer);
    await expectSameDenial(
      () => media.read(viewer, id, 'display'),
      () => media.read(viewer, randomUUID(), 'display'),
    );
  });
});

/** Fails every Firestore transaction, the path NativeBoxPosts.get uses. */
function failingTransactions(real: Firestore): Firestore {
  return new Proxy(real, {
    get(target, property) {
      if (property === 'runTransaction')
        return () => Promise.reject(new Error('injected firestore failure'));
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

describe('a Firestore error on the post-lookup path is not a media oracle', () => {
  const flaky = new NativeMedia(failingTransactions(db), storage, bucketName);
  const cases: Array<[string, MediaScenario['setup']]> = [
    [
      'post image in a foreign Box',
      async (viewer) =>
        (
          await foreignPostAsset(viewer, ({ postId }) => ({
            attachedPostId: postId,
          }))
        ).id,
    ],
    [
      'reaction image in a foreign Box',
      async (viewer) =>
        (
          await foreignPostAsset(viewer, ({ postId }) => ({
            purpose: 'reaction_image',
            attachedReactionPostId: postId,
          }))
        ).id,
    ],
  ];
  for (const [name, setup] of cases) {
    it(`${name}: real and random ids fail identically`, async () => {
      const viewer = await person();
      const id = await setup(viewer);
      await expectSameDenial(
        () => flaky.read(viewer, id, 'display'),
        () => flaky.read(viewer, randomUUID(), 'display'),
      );
    });
  }
});

/* ------------------------------------------------------------------ */
/* 5: exports                                                           */
/* ------------------------------------------------------------------ */

async function exportRow(ownerUid: string, fields: Fields = {}) {
  const id = randomUUID();
  await db
    .collection('nativeExports')
    .doc(id)
    .set({
      schemaVersion: 1,
      ownerUid,
      status: 'ready',
      createdAt: Date.now() - 1000,
      readyAt: Date.now() - 500,
      expiresAt: Date.now() + 3_600_000,
      objectPath: `private/exports/${ownerUid}/${id}.json`,
      ...fields,
    });
  return id;
}

describe('export downloads do not reveal whether an export id exists', () => {
  const cases: Array<
    [string, (caller: string, other: string) => Promise<string>]
  > = [
    ["another user's ready export", (_c, other) => exportRow(other)],
    [
      "another user's expired export",
      (_c, other) => exportRow(other, { expiresAt: Date.now() - 1 }),
    ],
    [
      "another user's pending export",
      (_c, other) =>
        exportRow(other, { status: 'pending', expiresAt: null, readyAt: null }),
    ],
    [
      "the caller's own expired export",
      (caller) => exportRow(caller, { expiresAt: Date.now() - 1 }),
    ],
  ];
  for (const [name, setup] of cases) {
    it(`${name} is denied like a random id (download)`, async () => {
      const caller = await person();
      const id = await setup(caller, await person());
      await expectSameDenial(
        () => lifecycle.download(caller, id),
        () => lifecycle.download(caller, randomUUID()),
      );
    });
    it(`${name} is denied like a random id (downloadStream)`, async () => {
      const caller = await person();
      const id = await setup(caller, await person());
      await expectSameDenial(
        () => lifecycle.downloadStream(caller, id),
        () => lifecycle.downloadStream(caller, randomUUID()),
      );
    });
  }
});
