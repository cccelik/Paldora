import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

/** Maximum distinct actors per map before a post is marked overflowed. */
export const INDEX_ACTOR_CAP = 1000;
/** Comment rows a single repair transaction will read before declaring overflow. */
export const REPAIR_COMMENT_ROW_CAP = 5000;
const REPAIR_PAGE = 50;

export interface IndexedReaction {
  kind: string;
  mediaAssetId?: string;
}

export interface InteractionIndex {
  v: 1;
  comments: Record<string, number>;
  reactions: Record<string, IndexedReaction>;
}

export interface OverflowedIndex {
  v: 1;
  overflow: true;
}

/** Result of reading `interactionIndex` off a post document. */
export type ParsedIndex =
  | { state: 'trusted'; index: InteractionIndex }
  | { state: 'overflow' }
  | { state: 'absent' }
  /** Written by an unknown schema version: writers replace it with delete(). */
  | { state: 'foreign' }
  /** v is 1 but the shape is wrong: writers skip, repair fixes. */
  | { state: 'corrupt' };

export interface CommentRow {
  authorUid: string;
  status: unknown;
  moderationHidden: unknown;
}

export interface ReactionRow {
  uid: string;
  kind: string;
  mediaAssetId?: string | undefined;
}

/** Fresh empty index for a newly created post. */
export function emptyInteractionIndex(): InteractionIndex {
  return { v: 1, comments: {}, reactions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse the raw `interactionIndex` field value from a post snapshot. */
export function parseInteractionIndex(raw: unknown): ParsedIndex {
  if (raw === undefined || raw === null) return { state: 'absent' };
  if (!isRecord(raw) || raw.v !== 1) return { state: 'foreign' };
  if (raw.overflow === true) return { state: 'overflow' };
  const { comments, reactions } = raw;
  if (!isRecord(comments) || !isRecord(reactions)) return { state: 'corrupt' };
  for (const count of Object.values(comments))
    if (!Number.isInteger(count) || (count as number) < 1)
      return { state: 'corrupt' };
  const parsedReactions: Record<string, IndexedReaction> = {};
  for (const [uid, entry] of Object.entries(reactions)) {
    if (!isRecord(entry) || typeof entry.kind !== 'string')
      return { state: 'corrupt' };
    parsedReactions[uid] =
      typeof entry.mediaAssetId === 'string'
        ? { kind: entry.kind, mediaAssetId: entry.mediaAssetId }
        : { kind: entry.kind };
  }
  return {
    state: 'trusted',
    index: {
      v: 1,
      comments: { ...(comments as Record<string, number>) },
      reactions: parsedReactions,
    },
  };
}

/** Pure: new index with one author's active-visible comment count changed. */
export function applyComment(
  index: InteractionIndex,
  uid: string,
  delta: 1 | -1,
): InteractionIndex | OverflowedIndex {
  const current = index.comments[uid] ?? 0;
  const next = current + delta;
  const comments = { ...index.comments };
  if (next < 1) delete comments[uid];
  else {
    if (current === 0 && Object.keys(comments).length >= INDEX_ACTOR_CAP)
      return { v: 1, overflow: true };
    comments[uid] = next;
  }
  return { v: 1, comments, reactions: index.reactions };
}

/** Pure: new index with one actor's post-level reaction set (or cleared). */
export function applyReaction(
  index: InteractionIndex,
  uid: string,
  reaction: IndexedReaction | null,
): InteractionIndex | OverflowedIndex {
  const reactions = { ...index.reactions };
  if (reaction === null) delete reactions[uid];
  else {
    if (!(uid in reactions) && Object.keys(reactions).length >= INDEX_ACTOR_CAP)
      return { v: 1, overflow: true };
    reactions[uid] = reaction.mediaAssetId
      ? { kind: reaction.kind, mediaAssetId: reaction.mediaAssetId }
      : { kind: reaction.kind };
  }
  return { v: 1, comments: index.comments, reactions };
}

/** Pure: rebuild the raw per-actor index from canonical rows. */
export function recomputeInteractionIndex(
  commentRows: readonly CommentRow[],
  reactionRows: readonly ReactionRow[],
): InteractionIndex | OverflowedIndex {
  const comments: Record<string, number> = {};
  for (const row of commentRows) {
    if (row.status !== 'active' || row.moderationHidden !== false) continue;
    comments[row.authorUid] = (comments[row.authorUid] ?? 0) + 1;
  }
  const reactions: Record<string, IndexedReaction> = {};
  for (const row of reactionRows)
    reactions[row.uid] = row.mediaAssetId
      ? { kind: row.kind, mediaAssetId: row.mediaAssetId }
      : { kind: row.kind };
  if (
    Object.keys(comments).length > INDEX_ACTOR_CAP ||
    Object.keys(reactions).length > INDEX_ACTOR_CAP
  )
    return { v: 1, overflow: true };
  return { v: 1, comments, reactions };
}

export interface IndexDiff {
  actor: string;
  map: 'comments' | 'reactions';
  expected: unknown;
  actual: unknown;
}

export interface IndexCheck {
  ok: boolean;
  /** Actors present in canonical data but absent or wrong in the index. */
  missing: string[];
  /** Actors present in the index with no canonical backing. */
  extra: string[];
  diffs: IndexDiff[];
}

/** Pure: compare a stored index with the recomputed truth. */
export function diffInteractionIndex(
  stored: ParsedIndex,
  truth: InteractionIndex | OverflowedIndex,
): IndexCheck {
  const empty: IndexCheck = { ok: true, missing: [], extra: [], diffs: [] };
  if ('overflow' in truth)
    return stored.state === 'overflow'
      ? empty
      : { ok: false, missing: [], extra: [], diffs: [] };
  if (stored.state !== 'trusted') {
    const missing = [
      ...new Set([
        ...Object.keys(truth.comments),
        ...Object.keys(truth.reactions),
      ]),
    ];
    return { ok: false, missing, extra: [], diffs: [] };
  }
  const missing = new Set<string>();
  const extra = new Set<string>();
  const diffs: IndexDiff[] = [];
  for (const map of ['comments', 'reactions'] as const) {
    const expected = truth[map] as Record<string, unknown>;
    const actual = stored.index[map] as Record<string, unknown>;
    for (const actor of new Set([
      ...Object.keys(expected),
      ...Object.keys(actual),
    ])) {
      const e = expected[actor];
      const a = actual[actor];
      if (JSON.stringify(e) === JSON.stringify(a)) continue;
      if (a === undefined) missing.add(actor);
      else if (e === undefined) extra.add(actor);
      else missing.add(actor);
      diffs.push({ actor, map, expected: e, actual: a });
    }
  }
  return {
    ok: diffs.length === 0,
    missing: [...missing],
    extra: [...extra],
    diffs,
  };
}

const DELETE_FIELD = Symbol('delete');

/** One field-level change to `interactionIndex` produced by a canonical write. */
export type IndexWrite =
  | { kind: 'none' }
  | { kind: 'replace'; value: OverflowedIndex | typeof DELETE_FIELD }
  | {
      kind: 'entry';
      map: 'comments' | 'reactions';
      uid: string;
      value: number | IndexedReaction | typeof DELETE_FIELD;
    };

function resolve(value: unknown): unknown {
  return value === DELETE_FIELD ? FieldValue.delete() : value;
}

/**
 * Decide how a writer must change the index, given the post's current field.
 * Absent, overflowed and corrupt indexes are skipped (repair owns them); an
 * unknown version is deleted so a rollback self-heals.
 */
export function planIndexWrite(
  raw: unknown,
  change:
    | { type: 'comment'; uid: string; delta: 1 | -1 }
    | { type: 'reaction'; uid: string; reaction: IndexedReaction | null },
): IndexWrite {
  const parsed = parseInteractionIndex(raw);
  if (parsed.state === 'foreign')
    return { kind: 'replace', value: DELETE_FIELD };
  if (parsed.state !== 'trusted') return { kind: 'none' };
  const { index } = parsed;
  if (change.type === 'comment') {
    const next = applyComment(index, change.uid, change.delta);
    if ('overflow' in next) return { kind: 'replace', value: next };
    const count = next.comments[change.uid];
    if (count === (index.comments[change.uid] ?? undefined))
      return { kind: 'none' };
    return {
      kind: 'entry',
      map: 'comments',
      uid: change.uid,
      value: count ?? DELETE_FIELD,
    };
  }
  const next = applyReaction(index, change.uid, change.reaction);
  if ('overflow' in next) return { kind: 'replace', value: next };
  const entry = next.reactions[change.uid];
  if (JSON.stringify(entry) === JSON.stringify(index.reactions[change.uid]))
    return { kind: 'none' };
  return {
    kind: 'entry',
    map: 'reactions',
    uid: change.uid,
    value: entry ?? DELETE_FIELD,
  };
}

/** Apply a planned write inside the writer's transaction (after all reads). */
export function applyIndexWrite(
  tx: Transaction,
  postRef: DocumentReference,
  write: IndexWrite,
): void {
  if (write.kind === 'none') return;
  if (write.kind === 'replace') {
    tx.update(postRef, 'interactionIndex', resolve(write.value));
    return;
  }
  tx.update(
    postRef,
    new FieldPath('interactionIndex', write.map, write.uid),
    resolve(write.value),
  );
}

export interface RepairResult {
  status: 'repaired' | 'overflow' | 'missing';
}

export interface BackfillPage {
  repaired: number;
  nextCursor: string | null;
}

/** Repair, verification and backfill of `posts.interactionIndex`. */
export class NativeInteractionIndex {
  public constructor(private readonly db: Firestore) {}

  private postRef(boxId: string, postId: string): DocumentReference {
    return this.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts')
      .doc(postId);
  }

  /** Read canonical rows inside the transaction; null when over the cap. */
  private async canonicalIndex(
    tx: Transaction,
    postRef: DocumentReference,
  ): Promise<InteractionIndex | OverflowedIndex> {
    const comments: CommentRow[] = [];
    let commentsOverflow = false;
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = postRef
        .collection('comments')
        .orderBy(FieldPath.documentId())
        .limit(REPAIR_PAGE);
      if (last) query = query.startAfter(last);
      // eslint-disable-next-line no-await-in-loop -- Sequential keyset pages inside one transaction.
      const page = await tx.get(query);
      for (const doc of page.docs)
        comments.push({
          authorUid: doc.get('authorUid') as string,
          status: doc.get('status'),
          moderationHidden: doc.get('moderationHidden'),
        });
      last = page.docs.at(-1);
      if (comments.length >= REPAIR_COMMENT_ROW_CAP && page.size) {
        commentsOverflow = true;
        break;
      }
      if (page.size < REPAIR_PAGE) break;
    }
    const reactions: ReactionRow[] = [];
    let lastReaction: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = postRef
        .collection('reactions')
        .orderBy(FieldPath.documentId())
        .limit(REPAIR_PAGE);
      if (lastReaction) query = query.startAfter(lastReaction);
      // eslint-disable-next-line no-await-in-loop -- Sequential keyset pages inside one transaction.
      const page = await tx.get(query);
      for (const doc of page.docs) {
        const mediaAssetId = doc.get('mediaAssetId') as string | undefined;
        reactions.push({
          uid: doc.id,
          kind: doc.get('kind') as string,
          ...(mediaAssetId ? { mediaAssetId } : {}),
        });
      }
      lastReaction = page.docs.at(-1);
      if (reactions.length > INDEX_ACTOR_CAP) break;
      if (page.size < REPAIR_PAGE) break;
    }
    if (commentsOverflow) return { v: 1, overflow: true };
    return recomputeInteractionIndex(comments, reactions);
  }

  /** One transaction: recompute from canonical docs and replace the field. */
  public async repair(boxId: string, postId: string): Promise<RepairResult> {
    const postRef = this.postRef(boxId, postId);
    return this.db.runTransaction(
      async (tx) => {
        const post = await tx.get(postRef);
        if (!post.exists) return { status: 'missing' as const };
        const truth = await this.canonicalIndex(tx, postRef);
        tx.update(postRef, 'interactionIndex', truth);
        return {
          status:
            'overflow' in truth ? ('overflow' as const) : ('repaired' as const),
        };
      },
      { maxAttempts: 10 },
    );
  }

  /** Read-only comparison of the stored index with canonical data. */
  public async check(boxId: string, postId: string): Promise<IndexCheck> {
    const postRef = this.postRef(boxId, postId);
    return this.db.runTransaction(
      async (tx) => {
        const post = await tx.get(postRef);
        if (!post.exists)
          return { ok: false, missing: [], extra: [], diffs: [] };
        const stored = parseInteractionIndex(post.get('interactionIndex'));
        const truth = await this.canonicalIndex(tx, postRef);
        return diffInteractionIndex(stored, truth);
      },
      { readOnly: true },
    );
  }

  /** Repair up to `limit` posts after `cursor` (a posts document path). */
  public async backfillPage(
    cursor: string | null,
    limit = 100,
  ): Promise<BackfillPage> {
    let query = this.db
      .collectionGroup('posts')
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(this.db.doc(cursor));
    const page = await query.get();
    for (const doc of page.docs) {
      const boxId = doc.ref.parent.parent?.id;
      // eslint-disable-next-line no-await-in-loop -- Bounded page; one repair transaction per post.
      if (boxId) await this.repair(boxId, doc.id);
    }
    const last = page.docs.at(-1);
    return {
      repaired: page.size,
      nextCursor: page.size === limit && last ? last.ref.path : null,
    };
  }
}
