import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { HomeFeedPrototype, type PrototypePost } from './home-feed.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `feed-${randomUUID()}`,
);
const db = getFirestore(app);
const feed = new HomeFeedPrototype(db);
afterAll(() => deleteApp(app));

async function seed(viewerId: string, boxCount: number) {
  const boxIds = Array.from({ length: boxCount }, () => randomUUID());
  const batch = db.batch();
  for (const boxId of boxIds)
    batch.set(
      db.collection('prototypeBoxMembers').doc(`${boxId}_${viewerId}`),
      {
        boxId,
        userId: viewerId,
        role: 'member',
        status: 'active',
      },
    );
  await batch.commit();
  return boxIds;
}

async function put(posts: PrototypePost[]) {
  const batch = db.batch();
  for (const post of posts)
    batch.set(db.collection('prototypePosts').doc(post.id), post);
  await batch.commit();
}

const post = (
  boxId: string,
  createdAt: number,
  authorId: string,
  itemId = randomUUID(),
): PrototypePost => ({
  id: randomUUID(),
  itemId,
  boxId,
  authorId,
  createdAt,
  status: 'active',
  moderationHidden: false,
});

describe('Firestore Home feed query prototype', () => {
  it('chunks 31 Boxes and keeps one Life Update across page boundaries', async () => {
    const viewer = randomUUID();
    const boxes = await seed(viewer, 31);
    const base = Date.now();
    const author = randomUUID();
    const blocked = randomUUID();
    const updateId = randomUUID();
    const posts = boxes.map((boxId, index) =>
      post(boxId, base - index, index === 1 ? blocked : author),
    );
    posts.push(post(boxes[0]!, base + 1, author, updateId));
    posts.push(post(boxes[30]!, base + 1, author, updateId));
    await put(posts);

    const seen = new Set<string>();
    let cursor = null;
    let calls = 0;
    do {
      const page = await feed.page(viewer, 10, new Set([blocked]), cursor);
      expect(page.measured.membershipReads).toBe(31);
      expect(page.measured.queries).toBe(3);
      expect(page.measured.candidateReads).toBeLessThanOrEqual(200);
      for (const item of page.items) {
        expect(seen.has(item.itemId)).toBe(false);
        seen.add(item.itemId);
      }
      cursor = page.nextCursor;
      calls += 1;
      expect(calls).toBeLessThan(10);
    } while (cursor);
    expect(seen.has(updateId)).toBe(true);
    expect(seen.size).toBe(31);
  });

  it('refuses a page when the bounded scan cannot cover every chunk', async () => {
    const viewer = randomUUID();
    await seed(viewer, 61);
    await expect(feed.page(viewer, 50, new Set(), null, 100)).rejects.toThrow(
      'candidate budget cannot cover all Box chunks',
    );
  });

  it('does not advance past unfetched candidates in a saturated chunk', async () => {
    const viewer = randomUUID();
    const boxes = await seed(viewer, 31);
    const base = Date.now();
    const author = randomUUID();
    const blocked = randomUUID();
    const posts = Array.from({ length: 15 }, (_, index) =>
      post(boxes[0]!, base - index, index < 10 ? blocked : author),
    );
    posts.push(post(boxes[30]!, base - 100, author));
    await put(posts);
    const first = await feed.page(viewer, 5, new Set([blocked]), null, 20);
    expect(first.items).toHaveLength(0);
    expect(first.nextCursor).not.toBeNull();
    const second = await feed.page(
      viewer,
      5,
      new Set([blocked]),
      first.nextCursor,
      20,
    );
    expect(second.items).toHaveLength(5);
  });
});
