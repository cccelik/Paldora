import type { Firestore, Query } from 'firebase-admin/firestore';

export interface PrototypePost {
  id: string;
  /** One canonical sort ID shared by all deliveries of a Life Update. */
  itemId: string;
  boxId: string;
  authorId: string;
  createdAt: number;
  status: 'active' | 'deleted';
  moderationHidden: boolean;
}

export interface FeedCursor {
  at: number;
  itemId: string;
}

export interface PrototypeFeedPage {
  items: PrototypePost[];
  nextCursor: FeedCursor | null;
  measured: {
    membershipReads: number;
    candidateReads: number;
    queries: number;
  };
}

const BOXES_PER_QUERY = 30;

const compare = (a: PrototypePost, b: PrototypePost) =>
  b.createdAt - a.createdAt || b.itemId.localeCompare(a.itemId);

function consumeCandidates(
  candidates: PrototypePost[],
  safeTail: PrototypePost | undefined,
  blockedAuthorIds: ReadonlySet<string>,
  limit: number,
) {
  const seen = new Set<string>();
  const items: PrototypePost[] = [];
  let consumed = 0;
  let last: PrototypePost | undefined;
  for (const candidate of candidates) {
    if (safeTail && compare(candidate, safeTail) > 0) break;
    consumed += 1;
    last = candidate;
    if (seen.has(candidate.itemId)) continue;
    seen.add(candidate.itemId);
    if (blockedAuthorIds.has(candidate.authorId)) continue;
    items.push(candidate);
    if (items.length === limit) break;
  }
  return { items, consumed, last };
}

/**
 * Bounded candidate-query experiment. This deliberately refuses a page when
 * the scan budget cannot cover at least one full page per Box-ID chunk; a real
 * implementation needs a continuation strategy for that case.
 */
export class HomeFeedPrototype {
  public constructor(private readonly db: Firestore) {}

  public async page(
    viewerId: string,
    limit: number,
    blockedAuthorIds: ReadonlySet<string>,
    cursor: FeedCursor | null = null,
    maxCandidateReads = 200,
  ): Promise<PrototypeFeedPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new RangeError('limit must be between 1 and 50');
    const membershipSnapshot = await this.db
      .collection('prototypeBoxMembers')
      .where('userId', '==', viewerId)
      .where('status', '==', 'active')
      .get();
    const boxIds = membershipSnapshot.docs.map(
      (doc) => doc.get('boxId') as string,
    );
    if (boxIds.length === 0)
      return {
        items: [],
        nextCursor: null,
        measured: {
          membershipReads: 0,
          candidateReads: 0,
          queries: 1,
        },
      };
    const chunks = Array.from(
      { length: Math.ceil(boxIds.length / BOXES_PER_QUERY) },
      (_, index) =>
        boxIds.slice(index * BOXES_PER_QUERY, (index + 1) * BOXES_PER_QUERY),
    );
    const perChunk = Math.floor(maxCandidateReads / chunks.length);
    if (perChunk < limit)
      throw new RangeError('candidate budget cannot cover all Box chunks');
    const snapshots = await Promise.all(
      chunks.map((ids) => {
        let query: Query = this.db
          .collection('prototypePosts')
          .where('boxId', 'in', ids)
          .where('status', '==', 'active')
          .where('moderationHidden', '==', false)
          .orderBy('createdAt', 'desc')
          .orderBy('itemId', 'desc');
        if (cursor) query = query.startAfter(cursor.at, cursor.itemId);
        return query.limit(perChunk).get();
      }),
    );
    const candidates = snapshots
      .flatMap((snapshot) =>
        snapshot.docs.map((doc) => doc.data() as PrototypePost),
      )
      .sort(compare);
    // A saturated chunk may contain unseen records just older than its last
    // fetched item. Advancing a global cursor beyond the newest such tail
    // would skip those records. Stop at that boundary and return a short page.
    const safeTail = snapshots
      .filter((snapshot) => snapshot.size === perChunk)
      .map((snapshot) => snapshot.docs.at(-1)?.data() as PrototypePost)
      .sort(compare)[0];
    const { items, consumed, last } = consumeCandidates(
      candidates,
      safeTail,
      blockedAuthorIds,
      limit,
    );
    const mayHaveMore =
      consumed < candidates.length ||
      snapshots.some((snapshot) => snapshot.size === perChunk);
    return {
      items,
      nextCursor:
        mayHaveMore && last
          ? { at: last.createdAt, itemId: last.itemId }
          : null,
      measured: {
        membershipReads: membershipSnapshot.size,
        candidateReads: candidates.length,
        queries: chunks.length + 1,
      },
    };
  }
}
