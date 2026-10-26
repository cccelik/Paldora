import { randomUUID } from 'node:crypto';
import {
  FieldPath,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { emojiSchema } from '@paldora/validation';
import { REAL_REACTION_KIND } from '@paldora/domain';
import { nativeBlockPairId } from './native-box-invitations.js';
import {
  applyIndexWrite,
  emptyInteractionIndex,
  NativeInteractionIndex,
  parseInteractionIndex,
  planIndexWrite,
  type InteractionIndex,
} from './native-interaction-index.js';
import { logEvent } from './log.js';

/** Retries for transactions that write the shared post document. */
const HOT_POST_ATTEMPTS = 30;

export class NativePostError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'INVALID',
  ) {
    super(code);
  }
}

export interface NativePost {
  id: string;
  boxId: string;
  authorUid: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  kind: 'post' | 'life_update';
  lifeUpdateId: string | null;
  mediaAssetIds: string[];
}

export interface NativeComment {
  id: string;
  postId: string;
  authorUid: string;
  parentId: string | null;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export type NativeCommentItem =
  | { kind: 'comment'; comment: NativeComment }
  | { kind: 'deleted' | 'hidden'; id: string; createdAt: number };

export interface NativeCommentThread {
  root: NativeCommentItem;
  rootId: string;
  replies: NativeCommentItem[];
  replyCount: number;
}

const THREAD_PAGE = 20;
const THREAD_PREVIEW = 3;
/** Batched reply probe size; a full probe falls back to per-root queries. */
const THREAD_PROBE_LIMIT = 60;

export interface NativeReaction {
  uid: string;
  kind: string;
  createdAt: number;
  mediaAssetId?: string;
}

/** Comment exists in this post and is not moderation-hidden (any status). */
function commentPresent(snapshot: DocumentSnapshot, postId: string): boolean {
  return (
    snapshot.exists &&
    snapshot.get('postId') === postId &&
    snapshot.get('moderationHidden') === false
  );
}

/** Pure comment-level readability: present, not hidden, and active. */
export function commentReadable(
  snapshot: DocumentSnapshot,
  postId: string,
): boolean {
  return (
    commentPresent(snapshot, postId) && snapshot.get('status') === 'active'
  );
}

function active(snapshot: DocumentSnapshot): boolean {
  return snapshot.exists && snapshot.get('status') === 'active';
}

type Reader = (ref: DocumentReference) => Promise<DocumentSnapshot>;

/** One read per distinct document within a single transaction. */
function memoReader(tx: FirebaseFirestore.Transaction): Reader {
  const cache = new Map<string, Promise<DocumentSnapshot>>();
  return (ref) => {
    let hit = cache.get(ref.path);
    if (!hit) {
      hit = tx.get(ref);
      cache.set(ref.path, hit);
    }
    return hit;
  };
}

/** The single viewer-access predicate shared by access() and the batch path. */
function accessAllows(
  account: DocumentSnapshot,
  box: DocumentSnapshot,
  member: DocumentSnapshot,
  write: boolean,
): boolean {
  return (
    active(account) &&
    box.exists &&
    ['active', 'archived'].includes(box.get('status') as string) &&
    active(member) &&
    !(write && box.get('status') !== 'active')
  );
}

function validDocId(id: string): boolean {
  return (
    id !== '' &&
    !id.includes('/') &&
    !/^__.*__$/.test(id) &&
    id !== '.' &&
    id !== '..'
  );
}

function readablePost(snapshot: DocumentSnapshot): boolean {
  return (
    snapshot.exists &&
    snapshot.get('status') === 'active' &&
    snapshot.get('moderationHidden') === false
  );
}

function toPost(snapshot: DocumentSnapshot): NativePost {
  return {
    id: snapshot.id,
    boxId: snapshot.get('boxId') as string,
    authorUid: snapshot.get('authorUid') as string,
    text: snapshot.get('text') as string,
    createdAt: snapshot.get('createdAt') as number,
    updatedAt: snapshot.get('updatedAt') as number,
    kind: snapshot.get('kind') === 'life_update' ? 'life_update' : 'post',
    lifeUpdateId: (snapshot.get('lifeUpdateId') as string | undefined) ?? null,
    mediaAssetIds:
      (snapshot.get('mediaAssetIds') as string[] | undefined) ?? [],
  };
}

function toComment(snapshot: DocumentSnapshot): NativeComment {
  return {
    id: snapshot.id,
    postId: snapshot.get('postId') as string,
    authorUid: snapshot.get('authorUid') as string,
    parentId: snapshot.get('parentId') as string | null,
    text: snapshot.get('text') as string,
    createdAt: snapshot.get('createdAt') as number,
    updatedAt: snapshot.get('updatedAt') as number,
  };
}

export interface NativeInteractionSummary {
  commentCount: number;
  reactions: { kind: string; count: number }[];
  reactionCount: number;
  realCount: number;
  realPreview: {
    user: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: null;
    };
    thumbnailUrl: string;
  }[];
  viewerReaction: { kind: string; mediaAssetId?: string } | null;
  canInteract: boolean;
}

export interface NativeBoxPostsOptions {
  /** Read summaries from `posts.interactionIndex`; scan when it is absent. */
  trustInteractionIndex?: boolean;
}

/** Real previews shown per post. */
const REAL_PREVIEW_MAX = 4;
/** Distinct kinds shown per post. */
const REACTION_KINDS_MAX = 8;
const ALREADY_EXISTS = 6;

type ActorVisibility = (uid: string) => Promise<boolean>;

export class NativeBoxPosts {
  private readonly trustIndex: boolean;

  public constructor(
    private readonly db: Firestore,
    options: NativeBoxPostsOptions = {},
  ) {
    this.trustIndex = options.trustInteractionIndex === true;
  }

  private postRef(boxId: string, postId: string) {
    return this.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts')
      .doc(postId);
  }

  private commentRef(boxId: string, postId: string, commentId: string) {
    return this.postRef(boxId, postId).collection('comments').doc(commentId);
  }

  private async access(
    tx: FirebaseFirestore.Transaction,
    boxId: string,
    uid: string,
    write: boolean,
  ) {
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const [account, box, member] = await Promise.all([
      tx.get(this.db.collection('nativeAccounts').doc(uid)),
      tx.get(boxRef),
      tx.get(boxRef.collection('members').doc(uid)),
    ]);
    if (!accessAllows(account, box, member, write))
      throw new NativePostError('UNAVAILABLE');
  }

  /** Distinct Boxes the viewer may read, each Box and member read once. */
  private async readableBoxes(
    read: Reader,
    boxIds: string[],
    uid: string,
  ): Promise<Set<string>> {
    const readable = new Set<string>();
    const account = await read(this.db.collection('nativeAccounts').doc(uid));
    if (!active(account)) return readable;
    await Promise.all(
      [...new Set(boxIds)].map(async (boxId) => {
        const boxRef = this.db.collection('nativeBoxes').doc(boxId);
        const [box, member] = await Promise.all([
          read(boxRef),
          read(boxRef.collection('members').doc(uid)),
        ]);
        if (accessAllows(account, box, member, false)) readable.add(boxId);
      }),
    );
    return readable;
  }

  private async visible(
    tx: FirebaseFirestore.Transaction,
    boxId: string,
    uid: string,
    post: DocumentSnapshot,
  ) {
    return this.visibleWith((ref) => tx.get(ref), boxId, uid, post);
  }

  /** Post-level predicate; the reader decides whether reads are memoized. */
  private async visibleWith(
    read: Reader,
    boxId: string,
    uid: string,
    post: DocumentSnapshot,
  ) {
    if (!readablePost(post) || post.get('boxId') !== boxId) return false;
    if (post.get('kind') === 'life_update') {
      const lifeUpdateId = post.get('lifeUpdateId') as string;
      const [update, delivery] = await Promise.all([
        read(this.db.collection('nativeLifeUpdates').doc(lifeUpdateId)),
        read(
          this.db
            .collection('nativeLifeUpdateDeliveries')
            .doc(`${lifeUpdateId}_${boxId}`),
        ),
      ]);
      if (
        !active(update) ||
        !active(delivery) ||
        delivery.get('postId') !== post.id ||
        update.get('authorUid') !== post.get('authorUid')
      )
        return false;
    }
    const authorUid = post.get('authorUid') as string;
    const [author, pair] = await Promise.all([
      read(this.db.collection('nativeAccounts').doc(authorUid)),
      read(
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(uid, authorUid)),
      ),
    ]);
    return (
      active(author) &&
      !(pair.exists && (pair.get('blockedBy') as string[] | undefined)?.length)
    );
  }

  public async create(
    boxId: string,
    authorUid: string,
    text: string,
    now = Date.now(),
    mediaAssetIds: string[] = [],
  ): Promise<string> {
    const body = text.trim();
    if (
      (!body && !mediaAssetIds.length) ||
      body.length > 5_000 ||
      mediaAssetIds.length > 4 ||
      new Set(mediaAssetIds).size !== mediaAssetIds.length
    )
      throw new NativePostError('INVALID');
    const postId = randomUUID();
    await this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, true);
      const assets = await Promise.all(
        mediaAssetIds.map((id) =>
          tx.get(this.db.collection('nativeMediaAssets').doc(id)),
        ),
      );
      if (
        assets.some(
          (asset) =>
            asset.get('status') !== 'ready' ||
            asset.get('purpose') !== 'post_image' ||
            asset.get('boxId') !== boxId ||
            asset.get('ownerUid') !== authorUid ||
            asset.get('attachedPostId') ||
            asset.get('attachedLifeUpdateId'),
        )
      )
        throw new NativePostError('INVALID');
      for (const asset of assets)
        tx.update(asset.ref, {
          attachedPostId: postId,
          unattachedExpiresAt: null,
          updatedAt: now,
        });
      tx.create(this.postRef(boxId, postId), {
        boxId,
        authorUid,
        text: body,
        status: 'active',
        moderationHidden: false,
        createdAt: now,
        updatedAt: now,
        mediaAssetIds,
        interactionIndex: emptyInteractionIndex(),
      });
      tx.create(this.db.collection('nativePostPointers').doc(postId), {
        boxId,
        authorUid,
        kind: 'post',
        createdAt: now,
      });
      tx.create(
        this.db.collection('nativeJobs').doc(`feed-publish-${postId}`),
        {
          type: 'feed',
          mode: 'publish',
          boxId,
          postId,
          cursor: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      );
    });
    return postId;
  }

  public async get(
    boxId: string,
    postId: string,
    viewerUid: string,
  ): Promise<NativePost> {
    return this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, viewerUid, false);
      const post = await tx.get(this.postRef(boxId, postId));
      if (!(await this.visible(tx, boxId, viewerUid, post)))
        throw new NativePostError('UNAVAILABLE');
      return toPost(post);
    });
  }

  /**
   * Batched get(): the same access and visibility predicates per item, but each
   * distinct Box, member, account and block pair is read once. An unavailable,
   * absent or malformed item is null; one bad item never fails the batch.
   */
  public async getMany(
    refs: { boxId: string; postId: string }[],
    viewerUid: string,
  ): Promise<(NativePost | null)[]> {
    if (refs.length === 0) return [];
    return this.db.runTransaction(
      async (tx) => {
        const snapshots = await this.visiblePostSnapshots(
          tx,
          memoReader(tx),
          refs,
          viewerUid,
        );
        return snapshots.map((snapshot) =>
          snapshot ? toPost(snapshot) : null,
        );
      },
      { readOnly: true },
    );
  }

  /**
   * The batch viewer predicate behind getMany() and interactionSummaries():
   * each distinct Box, member, account and block pair is read once, and an
   * unavailable, absent or malformed item is null.
   */
  private async visiblePostSnapshots(
    tx: Transaction,
    read: Reader,
    refs: { boxId: string; postId: string }[],
    viewerUid: string,
  ): Promise<(DocumentSnapshot | null)[]> {
    const valid = refs.map(
      (ref) => validDocId(ref.boxId) && validDocId(ref.postId),
    );
    const readable = await this.readableBoxes(
      read,
      refs.filter((_, i) => valid[i]).map((ref) => ref.boxId),
      viewerUid,
    );
    const wanted = new Map<string, DocumentReference>();
    refs.forEach((ref, i) => {
      if (valid[i] && readable.has(ref.boxId)) {
        const docRef = this.postRef(ref.boxId, ref.postId);
        wanted.set(docRef.path, docRef);
      }
    });
    const snapshots = wanted.size ? await tx.getAll(...wanted.values()) : [];
    const byPath = new Map(
      snapshots.map((snapshot) => [snapshot.ref.path, snapshot]),
    );
    return Promise.all(
      refs.map(async (ref, i) => {
        const snapshot = valid[i]
          ? byPath.get(this.postRef(ref.boxId, ref.postId).path)
          : undefined;
        if (!snapshot || !readable.has(ref.boxId)) return null;
        return (await this.visibleWith(read, ref.boxId, viewerUid, snapshot))
          ? snapshot
          : null;
      }),
    );
  }

  /** A permalink pointer is never authority: get() rechecks the canonical Box. */
  public async resolve(
    postId: string,
    viewerUid: string,
  ): Promise<{
    post: NativePost;
    kind: 'post' | 'life_update';
    lifeUpdateId: string | null;
  }> {
    return this.db.runTransaction(async (tx) => {
      const pointer = await tx.get(
        this.db.collection('nativePostPointers').doc(postId),
      );
      const boxId = pointer.get('boxId') as string | undefined;
      const kind = pointer.get('kind') as 'post' | 'life_update' | undefined;
      if (!boxId || (kind !== 'post' && kind !== 'life_update'))
        throw new NativePostError('UNAVAILABLE');
      await this.access(tx, boxId, viewerUid, false);
      const snapshot = await tx.get(this.postRef(boxId, postId));
      const canonicalKind =
        (snapshot.get('kind') as string | undefined) ?? 'post';
      const lifeUpdateId =
        kind === 'life_update' ? (pointer.get('lifeUpdateId') as string) : null;
      if (
        !(await this.visible(tx, boxId, viewerUid, snapshot)) ||
        snapshot.get('authorUid') !== pointer.get('authorUid') ||
        canonicalKind !== kind ||
        (kind === 'life_update' &&
          snapshot.get('lifeUpdateId') !== lifeUpdateId)
      )
        throw new NativePostError('UNAVAILABLE');
      return { post: toPost(snapshot), kind, lifeUpdateId };
    });
  }

  public async list(
    boxId: string,
    viewerUid: string,
    cursor?: string,
    limit = 20,
    time?: { beforeAt?: number | undefined; afterAt?: number | undefined },
  ): Promise<{ items: NativePost[]; nextCursor: string | null }> {
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query: Query = this.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts');
    if (time?.beforeAt !== undefined)
      query = query.where('createdAt', '<', time.beforeAt);
    if (time?.afterAt !== undefined)
      query = query.where('createdAt', '>=', time.afterAt);
    const ordered = query
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(pageSize);
    // One snapshot: viewer/Box access, the page, and every visibility check.
    return this.db.runTransaction(
      async (tx) => {
        const read = memoReader(tx);
        const readable = await this.readableBoxes(read, [boxId], viewerUid);
        if (!readable.has(boxId)) throw new NativePostError('UNAVAILABLE');
        let pageQuery = ordered;
        if (cursor) {
          const cursorDoc = await tx.get(this.postRef(boxId, cursor));
          if (!cursorDoc.exists) throw new NativePostError('UNAVAILABLE');
          pageQuery = ordered.startAfter(cursorDoc);
        }
        const page = await tx.get(pageQuery);
        const candidates = await Promise.all(
          page.docs.map(async (candidate) =>
            (await this.visibleWith(read, boxId, viewerUid, candidate))
              ? toPost(candidate)
              : null,
          ),
        );
        return {
          items: candidates.filter((item): item is NativePost => item !== null),
          nextCursor:
            page.size === pageSize ? page.docs[page.docs.length - 1]!.id : null,
        };
      },
      { readOnly: true },
    );
  }

  public async edit(
    boxId: string,
    postId: string,
    authorUid: string,
    text: string,
    now = Date.now(),
  ): Promise<void> {
    const body = text.trim();
    if (!body || body.length > 5_000) throw new NativePostError('INVALID');
    await this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, true);
      const ref = this.postRef(boxId, postId);
      const post = await tx.get(ref);
      if (
        !readablePost(post) ||
        post.get('authorUid') !== authorUid ||
        post.get('kind') === 'life_update'
      )
        throw new NativePostError('UNAVAILABLE');
      tx.update(ref, { text: body, updatedAt: now });
    });
  }

  public async remove(
    boxId: string,
    postId: string,
    authorUid: string,
    now = Date.now(),
  ): Promise<string[]> {
    return this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, false);
      const ref = this.postRef(boxId, postId);
      const post = await tx.get(ref);
      if (
        !readablePost(post) ||
        post.get('authorUid') !== authorUid ||
        post.get('kind') === 'life_update'
      )
        throw new NativePostError('UNAVAILABLE');
      tx.update(ref, { status: 'deleted', updatedAt: now });
      tx.delete(this.db.collection('nativePostPointers').doc(postId));
      tx.create(
        this.db.collection('nativeJobs').doc(`feed-unpublish-${postId}`),
        {
          type: 'feed',
          mode: 'unpublish',
          boxId,
          postId,
          kind: 'post',
          contentId: postId,
          cursor: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      );
      tx.set(
        this.db.collection('nativeJobs').doc(`media-post-cleanup-${postId}`),
        {
          type: 'mediaPostCleanup',
          boxId,
          postId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      return (post.get('mediaAssetIds') as string[] | undefined) ?? [];
    });
  }

  /**
   * Comments and reactions now write the post's interaction index, so busy
   * posts serialise. Firestore backs off between attempts; a higher limit keeps
   * ordinary bursts from surfacing as errors (see ADR 022).
   */
  private hotPostTransaction<T>(
    update: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.db.runTransaction(update, { maxAttempts: HOT_POST_ATTEMPTS });
  }

  public async createComment(
    boxId: string,
    postId: string,
    authorUid: string,
    text: string,
    parentId: string | null = null,
  ): Promise<string> {
    const now = Date.now();
    const body = text.trim();
    if (!body || body.length > 2_000) throw new NativePostError('INVALID');
    const commentId = randomUUID();
    const activityId = randomUUID();
    // eslint-disable-next-line complexity -- Existing reply visibility and ancestry checks share one transaction.
    await this.hotPostTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, true);
      const post = await tx.get(this.postRef(boxId, postId));
      if (!(await this.visible(tx, boxId, authorUid, post)))
        throw new NativePostError('UNAVAILABLE');
      let rootId = parentId;
      if (parentId) {
        const parent = await tx.get(this.commentRef(boxId, postId, parentId));
        if (
          !parent.exists ||
          parent.get('status') !== 'active' ||
          parent.get('moderationHidden') !== false ||
          parent.get('postId') !== postId
        )
          throw new NativePostError('UNAVAILABLE');
        const parentAuthorUid = parent.get('authorUid') as string;
        const [parentAuthor, pair] = await Promise.all([
          tx.get(this.db.collection('nativeAccounts').doc(parentAuthorUid)),
          tx.get(
            this.db
              .collection('nativeBlockPairs')
              .doc(nativeBlockPairId(authorUid, parentAuthorUid)),
          ),
        ]);
        if (
          !active(parentAuthor) ||
          (pair.exists &&
            (pair.get('blockedBy') as string[] | undefined)?.length)
        )
          throw new NativePostError('UNAVAILABLE');
        const parentRootId = parent.get('parentId') as string | null;
        if (parentRootId) {
          const root = await tx.get(
            this.commentRef(boxId, postId, parentRootId),
          );
          if (
            !root.exists ||
            root.get('status') !== 'active' ||
            root.get('moderationHidden') !== false ||
            root.get('parentId') !== null ||
            root.get('postId') !== postId
          )
            throw new NativePostError('UNAVAILABLE');
          const rootAuthorUid = root.get('authorUid') as string;
          const [rootAuthor, rootPair] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(rootAuthorUid)),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(authorUid, rootAuthorUid)),
            ),
          ]);
          if (
            !active(rootAuthor) ||
            (rootPair.exists &&
              (rootPair.get('blockedBy') as string[] | undefined)?.length)
          )
            throw new NativePostError('UNAVAILABLE');
          rootId = parentRootId;
        }
      }
      const recipientUid = parentId
        ? ((await tx.get(this.commentRef(boxId, postId, parentId))).get(
            'authorUid',
          ) as string)
        : (post.get('authorUid') as string);
      tx.create(this.commentRef(boxId, postId, commentId), {
        postId,
        authorUid,
        parentId: rootId,
        text: body,
        status: 'active',
        moderationHidden: false,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(this.db.collection('nativeCommentPointers').doc(commentId), {
        schemaVersion: 1,
        boxId,
        postId,
        authorUid,
      });
      applyIndexWrite(
        tx,
        post.ref,
        planIndexWrite(post.get('interactionIndex'), {
          type: 'comment',
          uid: authorUid,
          delta: 1,
        }),
      );
      if (recipientUid !== authorUid) {
        tx.create(this.db.collection('nativeActivity').doc(activityId), {
          schemaVersion: 1,
          type: parentId ? 'comment.reply' : 'post.comment',
          boxId,
          postId,
          commentId,
          actorUid: authorUid,
          recipientUid,
          createdAt: now,
          status: 'pending',
        });
      }
    });
    return commentId;
  }

  public async listComments(
    boxId: string,
    postId: string,
    viewerUid: string,
    cursor?: string,
  ): Promise<{ items: NativeComment[]; nextCursor: string | null }> {
    await this.get(boxId, postId, viewerUid);
    let query = this.postRef(boxId, postId)
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(20);
    if (cursor) {
      const cursorDoc = await this.commentRef(boxId, postId, cursor).get();
      if (!cursorDoc.exists) throw new NativePostError('UNAVAILABLE');
      query = query.startAfter(cursorDoc);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          await this.access(tx, boxId, viewerUid, false);
          const [post, comment] = await Promise.all([
            tx.get(this.postRef(boxId, postId)),
            tx.get(candidate.ref),
          ]);
          if (
            !(await this.visible(tx, boxId, viewerUid, post)) ||
            !comment.exists ||
            comment.get('status') !== 'active' ||
            comment.get('moderationHidden') !== false ||
            comment.get('postId') !== postId
          )
            return null;
          const authorUid = comment.get('authorUid') as string;
          const [author, pair] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(authorUid)),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(viewerUid, authorUid)),
            ),
          ]);
          return active(author) &&
            !(
              pair.exists &&
              (pair.get('blockedBy') as string[] | undefined)?.length
            )
            ? toComment(comment)
            : null;
        }),
      ),
    );
    return {
      items: items.filter((item): item is NativeComment => item !== null),
      nextCursor: page.size === 20 ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  private async commentItem(
    boxId: string,
    postId: string,
    viewerUid: string,
    commentId: string,
    includeDeleted = false,
  ): Promise<NativeCommentItem | null> {
    return this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, viewerUid, false);
      const [post, comment] = await Promise.all([
        tx.get(this.postRef(boxId, postId)),
        tx.get(this.commentRef(boxId, postId, commentId)),
      ]);
      if (
        !(await this.visible(tx, boxId, viewerUid, post)) ||
        !commentPresent(comment, postId)
      )
        return null;
      const createdAt = comment.get('createdAt') as number;
      if (comment.get('status') !== 'active')
        return includeDeleted
          ? { kind: 'deleted', id: commentId, createdAt }
          : null;
      const authorUid = comment.get('authorUid') as string;
      const [author, pair] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(authorUid)),
        tx.get(
          this.db
            .collection('nativeBlockPairs')
            .doc(nativeBlockPairId(viewerUid, authorUid)),
        ),
      ]);
      return active(author) &&
        !(
          pair.exists && (pair.get('blockedBy') as string[] | undefined)?.length
        )
        ? { kind: 'comment', comment: toComment(comment) }
        : { kind: 'hidden', id: commentId, createdAt };
    });
  }

  public async commentDetail(
    boxId: string,
    postId: string,
    commentId: string,
    viewerUid: string,
  ) {
    const item = await this.commentItem(boxId, postId, viewerUid, commentId);
    if (!item || item.kind !== 'comment')
      throw new NativePostError('UNAVAILABLE');
    return {
      comment: item.comment,
      rootId: item.comment.parentId ?? item.comment.id,
    };
  }

  public async listCommentRoots(
    boxId: string,
    postId: string,
    viewerUid: string,
    cursor?: string,
  ) {
    await this.get(boxId, postId, viewerUid);
    let query = this.postRef(boxId, postId)
      .collection('comments')
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(20);
    if (cursor) {
      const marker = await this.commentRef(boxId, postId, cursor).get();
      if (!marker.exists || marker.get('parentId') !== null)
        throw new NativePostError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map(async (row) => {
        const item = await this.commentItem(
          boxId,
          postId,
          viewerUid,
          row.id,
          true,
        );
        if (!item) return null;
        if (item.kind !== 'deleted') return item;
        const replies = await this.postRef(boxId, postId)
          .collection('comments')
          .where('parentId', '==', row.id)
          .where('status', '==', 'active')
          .where('moderationHidden', '==', false)
          .limit(1)
          .get();
        return replies.empty ? null : item;
      }),
    );
    return {
      items: items.filter((item): item is NativeCommentItem => item !== null),
      nextCursor: page.size === 20 ? page.docs.at(-1)!.id : null,
    };
  }

  // eslint-disable-next-line max-params -- Scoped identity, target, cursor and preview limit are independent authorization inputs.
  public async listCommentReplies(
    boxId: string,
    postId: string,
    rootId: string,
    viewerUid: string,
    cursor?: string,
    limit = 20,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new NativePostError('INVALID');
    const root = await this.commentItem(boxId, postId, viewerUid, rootId, true);
    if (
      !root ||
      root.kind === 'hidden' ||
      (root.kind === 'comment' && root.comment.parentId !== null)
    )
      throw new NativePostError('UNAVAILABLE');
    let query = this.postRef(boxId, postId)
      .collection('comments')
      .where('parentId', '==', rootId)
      .where('status', '==', 'active')
      .where('moderationHidden', '==', false)
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(limit);
    if (cursor) {
      const marker = await this.commentRef(boxId, postId, cursor).get();
      if (!marker.exists || marker.get('parentId') !== rootId)
        throw new NativePostError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((row) =>
        this.commentItem(boxId, postId, viewerUid, row.id),
      ),
    );
    return {
      items: items.filter((item): item is NativeCommentItem => item !== null),
      nextCursor: page.size === limit ? page.docs.at(-1)!.id : null,
    };
  }

  public async countCommentReplies(
    boxId: string,
    postId: string,
    rootId: string,
    viewerUid: string,
  ) {
    const root = await this.commentItem(boxId, postId, viewerUid, rootId, true);
    if (
      !root ||
      root.kind === 'hidden' ||
      (root.kind === 'comment' && root.comment.parentId !== null)
    )
      throw new NativePostError('UNAVAILABLE');
    const count = await this.postRef(boxId, postId)
      .collection('comments')
      .where('parentId', '==', rootId)
      .where('status', '==', 'active')
      .where('moderationHidden', '==', false)
      .count()
      .get();
    return count.data().count;
  }

  /**
   * Roots with a reply preview and reply count in one read-only transaction.
   * Equivalent to listCommentRoots + listCommentReplies(3) +
   * countCommentReplies per root, with shared authorization reads.
   */
  public async commentThreadsPage(
    boxId: string,
    postId: string,
    viewerUid: string,
    cursor?: string,
  ): Promise<{ items: NativeCommentThread[]; nextCursor: string | null }> {
    if (cursor !== undefined && !validDocId(cursor))
      throw new NativePostError('UNAVAILABLE');
    return this.db.runTransaction(
      async (tx) => {
        const read = memoReader(tx);
        const readable = await this.readableBoxes(read, [boxId], viewerUid);
        const post = await read(this.postRef(boxId, postId));
        if (
          !readable.has(boxId) ||
          !(await this.visibleWith(read, boxId, viewerUid, post))
        )
          throw new NativePostError('UNAVAILABLE');
        const comments = this.postRef(boxId, postId).collection('comments');
        let query = comments
          .where('parentId', '==', null)
          .orderBy('createdAt', 'desc')
          .orderBy(FieldPath.documentId(), 'desc')
          .limit(THREAD_PAGE);
        if (cursor) {
          const marker = await read(this.commentRef(boxId, postId, cursor));
          if (!marker.exists || marker.get('parentId') !== null)
            throw new NativePostError('UNAVAILABLE');
          query = query.startAfter(marker);
        }
        const page = await tx.get(query);
        const toItem = async (
          row: DocumentSnapshot,
          includeDeleted: boolean,
        ): Promise<NativeCommentItem | null> => {
          if (!commentPresent(row, postId)) return null;
          const createdAt = row.get('createdAt') as number;
          if (row.get('status') !== 'active')
            return includeDeleted
              ? { kind: 'deleted', id: row.id, createdAt }
              : null;
          const authorUid = row.get('authorUid') as string;
          const [author, pair] = await Promise.all([
            read(this.db.collection('nativeAccounts').doc(authorUid)),
            read(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(viewerUid, authorUid)),
            ),
          ]);
          return active(author) &&
            !(
              pair.exists &&
              (pair.get('blockedBy') as string[] | undefined)?.length
            )
            ? { kind: 'comment', comment: toComment(row) }
            : { kind: 'hidden', id: row.id, createdAt };
        };
        const roots = (
          await Promise.all(
            page.docs.map(async (row) => ({
              row,
              item: await toItem(row, true),
            })),
          )
        ).filter(
          (
            entry,
          ): entry is { row: QueryDocumentSnapshot; item: NativeCommentItem } =>
            entry.item !== null,
        );
        const probeIds = roots
          .filter((entry) => entry.item.kind !== 'hidden')
          .map((entry) => entry.row.id);
        const replies = await this.threadReplies(tx, comments, probeIds);
        const built = await Promise.all(
          roots.map(
            async ({ row, item }): Promise<NativeCommentThread | null> => {
              if (item.kind === 'hidden')
                return {
                  root: item,
                  rootId: row.id,
                  replies: [],
                  replyCount: 0,
                };
              const group = replies.get(row.id) ?? { preview: [], count: 0 };
              if (item.kind === 'deleted' && group.count === 0) return null;
              const preview = (
                await Promise.all(
                  group.preview.map((reply) => toItem(reply, false)),
                )
              ).filter((entry): entry is NativeCommentItem => entry !== null);
              return {
                root: item,
                rootId: row.id,
                replies: preview,
                replyCount: group.count,
              };
            },
          ),
        );
        const items = built.filter(
          (thread): thread is NativeCommentThread => thread !== null,
        );
        return {
          items,
          nextCursor:
            page.size === THREAD_PAGE ? page.docs[page.size - 1]!.id : null,
        };
      },
      { readOnly: true },
    );
  }

  /**
   * Active, visible-state replies for the given roots: preview (first three,
   * oldest first) and raw count, matching countCommentReplies. One batched
   * query; a saturated probe falls back to bounded per-root queries.
   */
  private async threadReplies(
    tx: FirebaseFirestore.Transaction,
    comments: FirebaseFirestore.CollectionReference,
    rootIds: string[],
  ): Promise<Map<string, { preview: QueryDocumentSnapshot[]; count: number }>> {
    const result = new Map<
      string,
      { preview: QueryDocumentSnapshot[]; count: number }
    >();
    if (rootIds.length === 0) return result;
    const live = (base: Query) =>
      base
        .where('status', '==', 'active')
        .where('moderationHidden', '==', false);
    const probe = await tx.get(
      live(comments.where('parentId', 'in', rootIds))
        .orderBy('createdAt', 'asc')
        .orderBy(FieldPath.documentId(), 'asc')
        .limit(THREAD_PROBE_LIMIT),
    );
    if (probe.size < THREAD_PROBE_LIMIT) {
      for (const doc of probe.docs) {
        const parentId = doc.get('parentId') as string;
        const group = result.get(parentId) ?? { preview: [], count: 0 };
        if (group.preview.length < THREAD_PREVIEW) group.preview.push(doc);
        group.count += 1;
        result.set(parentId, group);
      }
      return result;
    }
    await Promise.all(
      rootIds.map(async (rootId) => {
        const base = live(comments.where('parentId', '==', rootId));
        const [preview, count] = await Promise.all([
          tx.get(
            base
              .orderBy('createdAt', 'asc')
              .orderBy(FieldPath.documentId(), 'asc')
              .limit(THREAD_PREVIEW),
          ),
          tx.get(base.count()),
        ]);
        result.set(rootId, {
          preview: preview.docs,
          count: count.data().count,
        });
      }),
    );
    return result;
  }

  public async editComment(
    boxId: string,
    postId: string,
    commentId: string,
    authorUid: string,
    text: string,
  ): Promise<void> {
    const now = Date.now();
    const body = text.trim();
    if (!body || body.length > 2_000) throw new NativePostError('INVALID');
    await this.db.runTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, true);
      const [post, comment] = await Promise.all([
        tx.get(this.postRef(boxId, postId)),
        tx.get(this.commentRef(boxId, postId, commentId)),
      ]);
      if (
        !(await this.visible(tx, boxId, authorUid, post)) ||
        !comment.exists ||
        comment.get('status') !== 'active' ||
        comment.get('moderationHidden') !== false ||
        comment.get('authorUid') !== authorUid
      )
        throw new NativePostError('UNAVAILABLE');
      tx.update(comment.ref, { text: body, updatedAt: now });
    });
  }

  public async deleteComment(
    boxId: string,
    postId: string,
    commentId: string,
    authorUid: string,
    now = Date.now(),
  ): Promise<void> {
    await this.hotPostTransaction(async (tx) => {
      await this.access(tx, boxId, authorUid, false);
      const [comment, post] = await Promise.all([
        tx.get(this.commentRef(boxId, postId, commentId)),
        tx.get(this.postRef(boxId, postId)),
      ]);
      if (
        !comment.exists ||
        comment.get('status') !== 'active' ||
        comment.get('authorUid') !== authorUid
      )
        throw new NativePostError('UNAVAILABLE');
      tx.update(comment.ref, { status: 'deleted', updatedAt: now });
      tx.delete(this.db.collection('nativeCommentPointers').doc(commentId));
      // Only a comment the index counted (active and not moderation-hidden).
      if (post.exists && comment.get('moderationHidden') === false)
        applyIndexWrite(
          tx,
          post.ref,
          planIndexWrite(post.get('interactionIndex'), {
            type: 'comment',
            uid: authorUid,
            delta: -1,
          }),
        );
    });
  }

  private async reactionTarget(
    tx: FirebaseFirestore.Transaction,
    boxId: string,
    postId: string,
    viewerUid: string,
    commentId?: string,
  ) {
    await this.access(tx, boxId, viewerUid, false);
    const postRef = this.postRef(boxId, postId);
    const post = await tx.get(postRef);
    if (!(await this.visible(tx, boxId, viewerUid, post)))
      throw new NativePostError('UNAVAILABLE');
    if (!commentId) return postRef;
    const commentRef = this.commentRef(boxId, postId, commentId);
    const comment = await tx.get(commentRef);
    if (
      !comment.exists ||
      comment.get('status') !== 'active' ||
      comment.get('moderationHidden') !== false ||
      comment.get('postId') !== postId
    )
      throw new NativePostError('UNAVAILABLE');
    const authorUid = comment.get('authorUid') as string;
    const [author, pair] = await Promise.all([
      tx.get(this.db.collection('nativeAccounts').doc(authorUid)),
      tx.get(
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(viewerUid, authorUid)),
      ),
    ]);
    if (
      !active(author) ||
      (pair.exists && (pair.get('blockedBy') as string[] | undefined)?.length)
    )
      throw new NativePostError('UNAVAILABLE');
    return commentRef;
  }

  public async setReaction(
    boxId: string,
    postId: string,
    uid: string,
    kind: string | null,
    options?: string | { commentId?: string; mediaAssetId?: string },
  ): Promise<string | null> {
    const commentId =
      typeof options === 'string' ? options : options?.commentId;
    const mediaAssetId =
      typeof options === 'string' ? undefined : options?.mediaAssetId;
    if (
      (kind === REAL_REACTION_KIND) !== (mediaAssetId !== undefined) ||
      (mediaAssetId && commentId) ||
      (kind !== null &&
        kind !== REAL_REACTION_KIND &&
        !emojiSchema.safeParse(kind).success)
    )
      throw new NativePostError('INVALID');
    // eslint-disable-next-line complexity -- Reaction replacement checks asset ownership and canonical post access atomically.
    return this.hotPostTransaction(async (tx) => {
      await this.access(tx, boxId, uid, kind !== null);
      const target = await this.reactionTarget(
        tx,
        boxId,
        postId,
        uid,
        commentId,
      );
      const reactionRef = target.collection('reactions').doc(uid);
      const [existing, media, targetSnapshot] = await Promise.all([
        tx.get(reactionRef),
        mediaAssetId
          ? tx.get(this.db.collection('nativeMediaAssets').doc(mediaAssetId))
          : Promise.resolve(null),
        tx.get(target),
      ]);
      if (
        media &&
        (media.get('status') !== 'ready' ||
          media.get('purpose') !== 'reaction_image' ||
          media.get('boxId') !== boxId ||
          media.get('ownerUid') !== uid ||
          (media.get('attachedReactionPostId') &&
            (media.get('attachedReactionPostId') !== postId ||
              media.get('attachedReactionUid') !== uid)))
      )
        throw new NativePostError('INVALID');
      const oldMediaId = existing.get('mediaAssetId') as string | undefined;
      if (oldMediaId && oldMediaId !== mediaAssetId)
        tx.update(this.db.collection('nativeMediaAssets').doc(oldMediaId), {
          attachedReactionPostId: null,
          attachedReactionUid: null,
          unattachedExpiresAt: Date.now(),
        });
      if (media && !media.get('attachedReactionPostId'))
        tx.update(media.ref, {
          attachedReactionPostId: postId,
          attachedReactionUid: uid,
          unattachedExpiresAt: null,
        });
      const indexed = (
        reaction: { kind: string; mediaAssetId?: string } | null,
      ) =>
        commentId
          ? undefined
          : applyIndexWrite(
              tx,
              target,
              planIndexWrite(targetSnapshot.get('interactionIndex'), {
                type: 'reaction',
                uid,
                reaction,
              }),
            );
      if (kind === null) {
        if (existing.exists) {
          tx.delete(reactionRef);
          indexed(null);
        }
      } else if (
        !existing.exists ||
        existing.get('kind') !== kind ||
        oldMediaId !== mediaAssetId
      ) {
        tx.set(reactionRef, {
          uid,
          kind,
          ...(mediaAssetId ? { mediaAssetId } : {}),
          createdAt: Date.now(),
        });
        indexed({ kind, ...(mediaAssetId ? { mediaAssetId } : {}) });
        const recipientUid = targetSnapshot.get('authorUid') as string;
        if (recipientUid !== uid) {
          const id = randomUUID();
          tx.create(this.db.collection('nativeActivity').doc(id), {
            schemaVersion: 1,
            type: commentId ? 'comment.reaction' : 'post.reaction',
            boxId,
            postId,
            commentId: commentId ?? null,
            actorUid: uid,
            recipientUid,
            reactionKind: kind,
            createdAt: Date.now(),
            status: 'pending',
          });
        }
      }
      return oldMediaId && oldMediaId !== mediaAssetId ? oldMediaId : null;
    });
  }

  public async viewerReaction(
    boxId: string,
    postId: string,
    viewerUid: string,
    commentId?: string,
  ): Promise<string | null> {
    return this.db.runTransaction(async (tx) => {
      const target = await this.reactionTarget(
        tx,
        boxId,
        postId,
        viewerUid,
        commentId,
      );
      const reaction = await tx.get(
        target.collection('reactions').doc(viewerUid),
      );
      return reaction.exists ? (reaction.get('kind') as string) : null;
    });
  }

  /** Bounded preview profiles in one batched read. */
  private async realPreviewUsers(rows: { uid: string; mediaId: string }[]) {
    if (rows.length === 0) return [];
    const snaps = await this.db.getAll(
      ...rows.flatMap(({ uid }) => [
        this.db.collection('nativeAccounts').doc(uid),
        this.db.collection('nativeProfiles').doc(uid),
      ]),
    );
    return rows.map(({ uid, mediaId }, i) => {
      const username =
        (snaps[i * 2]!.get('username') as string | undefined) ?? uid;
      return {
        user: {
          id: uid,
          username,
          displayName:
            (snaps[i * 2 + 1]!.get('displayName') as string | undefined) ??
            username,
          avatarUrl: null as null,
        },
        thumbnailUrl: `/media/${mediaId}/thumbnail`,
      };
    });
  }

  /** One memoised check per actor: active account and no block either way. */
  private actorVisibility(read: Reader, viewerUid: string): ActorVisibility {
    const cache = new Map<string, Promise<boolean>>();
    return (uid) => {
      let result = cache.get(uid);
      if (!result) {
        result = Promise.all([
          read(this.db.collection('nativeAccounts').doc(uid)),
          read(
            this.db
              .collection('nativeBlockPairs')
              .doc(nativeBlockPairId(viewerUid, uid)),
          ),
        ]).then(
          ([account, pair]) =>
            active(account) &&
            !(
              pair.exists &&
              (pair.get('blockedBy') as string[] | undefined)?.length
            ),
        );
        cache.set(uid, result);
      }
      return result;
    };
  }

  /** Viewer-relative counts, including replies; no blocked or inactive actor leaks. */
  public async interactionSummary(
    boxId: string,
    postId: string,
    viewerUid: string,
  ): Promise<NativeInteractionSummary> {
    const [summary] = await this.interactionSummaries(
      [{ boxId, postId }],
      viewerUid,
    );
    if (!summary) throw new NativePostError('UNAVAILABLE');
    return summary;
  }

  /**
   * Batched summaries in one read-only transaction. A post with a trusted
   * index is summarised without scanning; any other post (and every post when
   * the option is off) is scanned. Unavailable posts are null.
   */
  public async interactionSummaries(
    refs: { boxId: string; postId: string }[],
    viewerUid: string,
  ): Promise<(NativeInteractionSummary | null)[]> {
    if (refs.length === 0) return [];
    const outcome = await this.db.runTransaction(
      async (tx) => {
        const read = memoReader(tx);
        const visibleActor = this.actorVisibility(read, viewerUid);
        const snapshots = await this.visiblePostSnapshots(
          tx,
          read,
          refs,
          viewerUid,
        );
        const results: (NativeInteractionSummary | null)[] = snapshots.map(
          () => null,
        );
        const indexed: {
          at: number;
          index: InteractionIndex;
          ref: { boxId: string; postId: string };
        }[] = [];
        const untrusted: { boxId: string; postId: string }[] = [];
        const scans: Promise<void>[] = [];
        snapshots.forEach((snapshot, at) => {
          if (!snapshot) return;
          const ref = refs[at]!;
          const parsed = this.trustIndex
            ? parseInteractionIndex(snapshot.get('interactionIndex'))
            : ({ state: 'absent' } as const);
          if (parsed.state === 'trusted') {
            indexed.push({ at, index: parsed.index, ref });
            return;
          }
          // An overflowed index is final: a repair cannot make it trusted.
          if (this.trustIndex && parsed.state !== 'overflow')
            untrusted.push(ref);
          scans.push(
            this.scanSummary(tx, read, visibleActor, ref, viewerUid).then(
              (summary) => {
                results[at] = summary;
              },
            ),
          );
        });
        await Promise.all([
          ...scans,
          this.indexedSummaries(
            tx,
            read,
            visibleActor,
            indexed,
            viewerUid,
          ).then((summaries) => {
            indexed.forEach(({ at }, i) => {
              results[at] = summaries[i]!;
            });
          }),
        ]);
        return { results, untrusted };
      },
      { readOnly: true },
    );
    await this.enqueueIndexRepairs(outcome.untrusted);
    return outcome.results;
  }

  /** Best effort: a missing index is repaired by the durable job, never inline. */
  private async enqueueIndexRepairs(
    posts: { boxId: string; postId: string }[],
  ): Promise<void> {
    const unique = new Map(posts.map((post) => [post.postId, post]));
    await Promise.all(
      [...unique.values()].map(async ({ boxId, postId }) => {
        const now = Date.now();
        try {
          await this.db
            .collection('nativeJobs')
            .doc(NativeInteractionIndex.jobId(postId))
            .create({
              type: 'interactionIndexRepair',
              boxId,
              postId,
              status: 'pending',
              attempts: 0,
              createdAt: now,
              updatedAt: now,
            });
        } catch (error) {
          if ((error as { code?: unknown }).code === ALREADY_EXISTS) return;
          logEvent(
            'WARNING',
            { event: 'interaction_index.enqueue_failed' },
            error,
          );
        }
      }),
    );
  }

  /** Summaries for posts with a trusted index; no comment or reaction reads. */
  private async indexedSummaries(
    tx: Transaction,
    read: Reader,
    visibleActor: ActorVisibility,
    posts: {
      index: InteractionIndex;
      ref: { boxId: string; postId: string };
    }[],
    viewerUid: string,
  ): Promise<NativeInteractionSummary[]> {
    if (posts.length === 0) return [];
    const actors = new Set<string>();
    for (const { index } of posts) {
      for (const uid of Object.keys(index.comments)) actors.add(uid);
      for (const uid of Object.keys(index.reactions)) actors.add(uid);
    }
    const visible = new Map<string, boolean>(
      await Promise.all(
        [...actors].map(
          async (uid) => [uid, await visibleActor(uid)] as [string, boolean],
        ),
      ),
    );
    // Asset readiness is never cached in the index: check it at read time.
    const mediaIds = new Set<string>();
    for (const { index } of posts)
      for (const [uid, entry] of Object.entries(index.reactions))
        if (
          visible.get(uid) &&
          entry.kind === REAL_REACTION_KIND &&
          entry.mediaAssetId
        )
          mediaIds.add(entry.mediaAssetId);
    const assets = new Map<string, DocumentSnapshot>();
    if (mediaIds.size > 0) {
      const snaps = await tx.getAll(
        ...[...mediaIds].map((id) =>
          this.db.collection('nativeMediaAssets').doc(id),
        ),
      );
      for (const snap of snaps) assets.set(snap.id, snap);
    }
    const computed = await Promise.all(
      posts.map(async ({ index, ref }) => {
        const box = await read(
          this.db.collection('nativeBoxes').doc(ref.boxId),
        );
        return this.summarizeIndex(index, ref.postId, {
          visible,
          assets,
          viewerUid,
          canInteract: box.get('status') === 'active',
        });
      }),
    );
    const users = await this.previewUsers(
      computed.flatMap((entry) => entry.previewRows),
    );
    return computed.map((entry) => ({
      ...entry.summary,
      realPreview: entry.previewRows.map(({ uid, mediaId }) => ({
        user: users.get(uid)!,
        thumbnailUrl: `/media/${mediaId}/thumbnail`,
      })),
    }));
  }

  /** Pure per-post computation, field-for-field the scan's result. */
  private summarizeIndex(
    index: InteractionIndex,
    postId: string,
    context: {
      visible: Map<string, boolean>;
      assets: Map<string, DocumentSnapshot>;
      viewerUid: string;
      canInteract: boolean;
    },
  ) {
    const { visible, assets, viewerUid } = context;
    let commentCount = 0;
    for (const [uid, count] of Object.entries(index.comments))
      if (visible.get(uid)) commentCount += count;
    const counts = new Map<string, number>();
    const validReal: { uid: string; mediaId: string }[] = [];
    let reactionCount = 0;
    let viewerReaction: NativeInteractionSummary['viewerReaction'] = null;
    for (const [uid, entry] of Object.entries(index.reactions)) {
      if (!visible.get(uid)) continue;
      if (entry.kind === REAL_REACTION_KIND) {
        const mediaId = entry.mediaAssetId;
        const asset = mediaId ? assets.get(mediaId) : undefined;
        if (
          !mediaId ||
          !asset ||
          asset.get('status') !== 'ready' ||
          asset.get('attachedReactionPostId') !== postId ||
          asset.get('ownerUid') !== uid
        )
          continue;
        validReal.push({ uid, mediaId });
      } else counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
      reactionCount += 1;
      if (uid === viewerUid)
        viewerReaction = {
          kind: entry.kind,
          ...(entry.mediaAssetId ? { mediaAssetId: entry.mediaAssetId } : {}),
        };
    }
    // The scan walks reactions in document-id (uid) order.
    validReal.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    return {
      previewRows: validReal.slice(0, REAL_PREVIEW_MAX),
      summary: {
        commentCount,
        reactions: [...counts.entries()]
          .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
          .slice(0, REACTION_KINDS_MAX)
          .map(([kind, count]) => ({ kind, count })),
        reactionCount,
        realCount: validReal.length,
        realPreview: [] as NativeInteractionSummary['realPreview'],
        viewerReaction,
        canInteract: context.canInteract,
      },
    };
  }

  /** One batched profile read for the distinct preview users. */
  private async previewUsers(rows: { uid: string; mediaId: string }[]) {
    const distinct = [...new Map(rows.map((row) => [row.uid, row])).values()];
    const users = await this.realPreviewUsers(distinct);
    return new Map(users.map((entry) => [entry.user.id, entry.user]));
  }

  /** The canonical scan: every comment and reaction, inside the transaction. */
  // eslint-disable-next-line complexity -- Viewer-relative counts check each actor and camera asset.
  private async scanSummary(
    tx: Transaction,
    read: Reader,
    visibleActor: ActorVisibility,
    ref: { boxId: string; postId: string },
    viewerUid: string,
  ): Promise<NativeInteractionSummary> {
    const { boxId, postId } = ref;
    const postRef = this.postRef(boxId, postId);
    const box = await read(this.db.collection('nativeBoxes').doc(boxId));
    const scan = async (root: FirebaseFirestore.CollectionReference) => {
      const rows: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      let cursor: string | null = null;
      for (;;) {
        let query = root.orderBy(FieldPath.documentId()).limit(50);
        if (cursor) query = query.startAfter(cursor);
        // eslint-disable-next-line no-await-in-loop -- Ordered batches avoid an unbounded collection read.
        const page = await tx.get(query);
        rows.push(...page.docs);
        if (page.size < 50) break;
        cursor = page.docs.at(-1)!.id;
      }
      return rows;
    };
    const [comments, reactions] = await Promise.all([
      scan(postRef.collection('comments')),
      scan(postRef.collection('reactions')),
    ]);
    const [visibleComments, visibleReactions] = await Promise.all([
      Promise.all(
        comments.map(
          async (row) =>
            row.get('status') === 'active' &&
            row.get('moderationHidden') === false &&
            (await visibleActor(row.get('authorUid') as string)),
        ),
      ),
      Promise.all(
        reactions.map(
          async (row) =>
            typeof row.get('kind') === 'string' && (await visibleActor(row.id)),
        ),
      ),
    ]);
    const counts = new Map<string, number>();
    const realPreviews: {
      user: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: null;
      };
      thumbnailUrl: string;
    }[] = [];
    // Batch the canonical asset reads; each reaction keeps its own checks.
    const mediaIds = [
      ...new Set(
        reactions.flatMap((row, index) =>
          visibleReactions[index] && row.get('kind') === REAL_REACTION_KIND
            ? [row.get('mediaAssetId')].filter(
                (id): id is string => typeof id === 'string' && id !== '',
              )
            : [],
        ),
      ),
    ];
    const assets = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    if (mediaIds.length > 0) {
      const snaps = await tx.getAll(
        ...mediaIds.map((id) =>
          this.db.collection('nativeMediaAssets').doc(id),
        ),
      );
      for (const snap of snaps) assets.set(snap.id, snap);
    }
    const previewRows: { uid: string; mediaId: string }[] = [];
    for (const [index, row] of reactions.entries()) {
      if (!visibleReactions[index]) continue;
      const kind = row.get('kind') as string;
      if (kind === REAL_REACTION_KIND) {
        const mediaId = row.get('mediaAssetId') as string | undefined;
        const asset = mediaId ? assets.get(mediaId) : undefined;
        if (
          !mediaId ||
          !asset ||
          asset.get('status') !== 'ready' ||
          asset.get('attachedReactionPostId') !== postId ||
          asset.get('ownerUid') !== row.id
        ) {
          visibleReactions[index] = false;
          continue;
        }
        if (previewRows.length < 4) previewRows.push({ uid: row.id, mediaId });
        continue;
      }
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    realPreviews.push(...(await this.realPreviewUsers(previewRows)));
    const viewer = reactions.find((row) => row.id === viewerUid);
    return {
      commentCount: visibleComments.filter(Boolean).length,
      reactions: [...counts.entries()]
        .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
        .slice(0, 8)
        .map(([kind, count]) => ({ kind, count })),
      reactionCount: visibleReactions.filter(Boolean).length,
      realCount: reactions.filter(
        (row, index) =>
          visibleReactions[index] && row.get('kind') === REAL_REACTION_KIND,
      ).length,
      realPreview: realPreviews,
      viewerReaction:
        viewer && visibleReactions[reactions.indexOf(viewer)]
          ? {
              kind: viewer.get('kind') as string,
              ...(viewer.get('mediaAssetId')
                ? { mediaAssetId: viewer.get('mediaAssetId') as string }
                : {}),
            }
          : null,
      canInteract: box.get('status') === 'active',
    };
  }

  public async listReactions(
    boxId: string,
    postId: string,
    viewerUid: string,
    commentId?: string,
    cursor?: string,
  ): Promise<{ items: NativeReaction[]; nextCursor: string | null }> {
    const target = await this.db.runTransaction((tx) =>
      this.reactionTarget(tx, boxId, postId, viewerUid, commentId),
    );
    let query = target
      .collection('reactions')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(20);
    if (cursor) {
      const cursorDoc = await target.collection('reactions').doc(cursor).get();
      if (!cursorDoc.exists) throw new NativePostError('UNAVAILABLE');
      query = query.startAfter(cursorDoc);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          await this.reactionTarget(tx, boxId, postId, viewerUid, commentId);
          const reaction = await tx.get(candidate.ref);
          if (!reaction.exists || reaction.get('uid') !== candidate.id)
            return null;
          const reactorUid = candidate.id;
          const [reactor, pair] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(reactorUid)),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(viewerUid, reactorUid)),
            ),
          ]);
          if (reaction.get('kind') === REAL_REACTION_KIND) {
            const mediaId = reaction.get('mediaAssetId') as string | undefined;
            const media = mediaId
              ? await tx.get(
                  this.db.collection('nativeMediaAssets').doc(mediaId),
                )
              : null;
            if (
              !media ||
              media.get('status') !== 'ready' ||
              media.get('attachedReactionPostId') !== postId ||
              media.get('ownerUid') !== reactorUid
            )
              return null;
          }
          return active(reactor) &&
            !(
              pair.exists &&
              (pair.get('blockedBy') as string[] | undefined)?.length
            )
            ? {
                uid: reactorUid,
                kind: reaction.get('kind') as string,
                createdAt: reaction.get('createdAt') as number,
                ...(reaction.get('mediaAssetId')
                  ? { mediaAssetId: reaction.get('mediaAssetId') as string }
                  : {}),
              }
            : null;
        }),
      ),
    );
    return {
      items: items.filter((item): item is NativeReaction => item !== null),
      nextCursor: page.size === 20 ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  /** The comment's emoji summary is rebuilt from currently visible actors. */
  public async commentInteractionSummary(
    boxId: string,
    postId: string,
    commentId: string,
    viewerUid: string,
  ) {
    const counts = new Map<string, number>();
    let reactionCount = 0;
    let viewerReaction: { kind: string } | null = null;
    let cursor: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop -- Every page rechecks canonical access.
      const page = await this.listReactions(
        boxId,
        postId,
        viewerUid,
        commentId,
        cursor,
      );
      for (const reaction of page.items) {
        reactionCount++;
        counts.set(reaction.kind, (counts.get(reaction.kind) ?? 0) + 1);
        if (reaction.uid === viewerUid)
          viewerReaction = { kind: reaction.kind };
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return {
      reactions: [...counts.entries()]
        .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
        .slice(0, 8)
        .map(([kind, count]) => ({ kind, count })),
      reactionCount,
      viewerReaction,
    };
  }
}
