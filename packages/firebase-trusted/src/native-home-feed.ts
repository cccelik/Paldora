/* eslint-disable complexity, max-depth, no-await-in-loop -- Bounded Firestore pages require sequential cursor advancement and access rechecks. */
import {
  FieldPath,
  FieldValue,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import {
  NativeBoxPosts,
  NativePostError,
  type NativePost,
} from './native-box-posts.js';
import {
  NativeLifeUpdates,
  NativeLifeUpdateError,
} from './native-life-updates.js';

const WORK_SIZE = 40;
const READ_SIZE = 40;
const MAX_READ_CANDIDATES = 320;

export class NativeHomeFeedError extends Error {
  public constructor(public readonly code: 'UNAVAILABLE' | 'INVALID') {
    super(code);
  }
}

type FeedRef = {
  kind: 'post' | 'life_update';
  contentId: string;
  authorUid: string;
  boxId?: string;
  boxIds?: string[];
  createdAt: number;
};

type Cursor = { at: number; id: string };

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    );
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Cursor).at !== 'number' ||
      !Number.isFinite((parsed as Cursor).at) ||
      typeof (parsed as Cursor).id !== 'string' ||
      !/^[pl]_[0-9a-f-]{36}$/.test((parsed as Cursor).id)
    )
      throw new Error('Invalid cursor');
    return parsed as Cursor;
  } catch {
    throw new NativeHomeFeedError('INVALID');
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** ID-only Home hints. Canonical post/update services authorize every result. */
export class NativeHomeFeed {
  private readonly posts: NativeBoxPosts;
  private readonly updates: NativeLifeUpdates;

  public constructor(private readonly db: Firestore) {
    this.posts = new NativeBoxPosts(db);
    this.updates = new NativeLifeUpdates(db);
  }

  public static publishJobId(postId: string): string {
    return `feed-publish-${postId}`;
  }

  public static unpublishJobId(postId: string): string {
    return `feed-unpublish-${postId}`;
  }

  public static joinJobId(
    boxId: string,
    uid: string,
    joinedAt: number,
  ): string {
    return `feed-join-${boxId}-${uid}-${joinedAt}`;
  }

  private ref(uid: string, kind: FeedRef['kind'], contentId: string) {
    return this.db
      .collection('nativeFeedRefs')
      .doc(uid)
      .collection('items')
      .doc(`${kind === 'post' ? 'p' : 'l'}_${contentId}`);
  }

  /** Each call advances one durable page; a retry repeats writes harmlessly. */
  // eslint-disable-next-line max-lines-per-function -- The transaction keeps cursor checks and all four job modes atomic.
  public async processOnce(jobId: string): Promise<'pending' | 'complete'> {
    const jobRef = this.db.collection('nativeJobs').doc(jobId);
    const job = await jobRef.get();
    if (
      job.get('type') !== 'feed' ||
      !['pending', 'complete'].includes(job.get('status'))
    )
      throw new NativeHomeFeedError('UNAVAILABLE');
    if (job.get('status') === 'complete') return 'complete';
    const boxId = job.get('boxId') as string;
    const mode = job.get('mode') as 'publish' | 'join' | 'unpublish' | 'leave';
    if (!['publish', 'join', 'unpublish', 'leave'].includes(mode))
      throw new NativeHomeFeedError('UNAVAILABLE');
    const cursor = (job.get('cursor') as string | null) ?? null;
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const uid = job.get('uid') as string | undefined;
    const source =
      mode === 'leave' && uid
        ? this.db.collection('nativeFeedRefs').doc(uid).collection('items')
        : mode === 'publish' || mode === 'unpublish'
          ? boxRef.collection('members')
          : boxRef.collection('posts');
    let query = source.orderBy(FieldPath.documentId()).limit(WORK_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    const next = page.docs.at(-1)?.id ?? cursor;
    return this.db.runTransaction(async (tx) => {
      const current = await tx.get(jobRef);
      if (current.get('status') === 'complete') return 'complete';
      if (current.get('cursor') !== cursor) return 'pending';
      const box = await tx.get(boxRef);
      const readable =
        box.exists &&
        ['active', 'archived'].includes(box.get('status') as string);
      const member =
        (mode === 'join' || mode === 'leave') && uid
          ? await tx.get(boxRef.collection('members').doc(uid))
          : null;
      const joined =
        mode === 'join' &&
        member?.get('status') === 'active' &&
        member.get('joinedAt') === job.get('joinedAt');
      if (
        !readable ||
        (mode === 'join' && !joined) ||
        (mode === 'leave' && member?.get('status') === 'active')
      ) {
        tx.update(jobRef, { status: 'complete', updatedAt: Date.now() });
        return 'complete';
      }
      if (mode === 'leave') {
        const hints = await Promise.all(
          page.docs.map((row) => tx.get(row.ref)),
        );
        for (const hint of hints) {
          if (!hint.exists) continue;
          if (hint.get('boxId') === boxId) tx.delete(hint.ref);
          else {
            const boxIds = hint.get('boxIds') as string[] | undefined;
            if (boxIds?.includes(boxId)) {
              if (boxIds.length === 1) tx.delete(hint.ref);
              else
                tx.update(hint.ref, {
                  boxIds: boxIds.filter((id) => id !== boxId),
                });
            }
          }
        }
        const complete = page.size < WORK_SIZE;
        tx.update(jobRef, {
          cursor: next,
          status: complete ? 'complete' : 'pending',
          updatedAt: Date.now(),
        });
        return complete ? 'complete' : 'pending';
      }
      if (mode === 'unpublish') {
        const kind = job.get('kind') as FeedRef['kind'];
        const contentId = job.get('contentId') as string;
        if (!['post', 'life_update'].includes(kind) || !contentId)
          throw new NativeHomeFeedError('UNAVAILABLE');
        for (const memberRow of page.docs)
          tx.delete(this.ref(memberRow.id, kind, contentId));
        const complete = page.size < WORK_SIZE;
        tx.update(jobRef, {
          cursor: next,
          status: complete ? 'complete' : 'pending',
          updatedAt: Date.now(),
        });
        return complete ? 'complete' : 'pending';
      }
      const publishPost =
        mode === 'publish'
          ? await tx.get(
              boxRef.collection('posts').doc(job.get('postId') as string),
            )
          : null;
      if (
        mode === 'publish' &&
        (publishPost?.get('status') !== 'active' ||
          publishPost.get('moderationHidden') !== false)
      ) {
        tx.update(jobRef, { status: 'complete', updatedAt: Date.now() });
        return 'complete';
      }
      const candidates =
        mode === 'join'
          ? await Promise.all(page.docs.map((row) => tx.get(row.ref)))
          : [];
      const members =
        mode === 'publish'
          ? await Promise.all(page.docs.map((row) => tx.get(row.ref)))
          : [];
      for (const row of mode === 'publish' ? members : candidates) {
        const post = mode === 'publish' ? publishPost! : row;
        const targetUid = mode === 'publish' ? row.id : uid!;
        if (
          (mode === 'publish' && row.get('status') !== 'active') ||
          post.get('status') !== 'active' ||
          post.get('moderationHidden') !== false ||
          post.get('boxId') !== boxId
        )
          continue;
        const kind =
          post.get('kind') === 'life_update' ? 'life_update' : 'post';
        const contentId =
          kind === 'life_update'
            ? (post.get('lifeUpdateId') as string)
            : post.id;
        if (!contentId) continue;
        const ref = this.ref(targetUid, kind, contentId);
        if (kind === 'life_update') {
          tx.set(
            ref,
            {
              kind,
              contentId,
              authorUid: post.get('authorUid') as string,
              boxIds: FieldValue.arrayUnion(boxId),
              createdAt: post.get('createdAt') as number,
              schemaVersion: 2,
            },
            { merge: true },
          );
        } else {
          tx.set(ref, {
            kind,
            contentId,
            authorUid: post.get('authorUid') as string,
            boxId,
            createdAt: post.get('createdAt') as number,
            schemaVersion: 2,
          });
        }
      }
      const complete = page.size < WORK_SIZE;
      tx.update(jobRef, {
        cursor: next,
        status: complete ? 'complete' : 'pending',
        updatedAt: Date.now(),
      });
      return complete ? 'complete' : 'pending';
    });
  }

  /** Local repair entry point; an eventual task dispatcher can call processOnce. */
  public async processPending(maxPages = 8): Promise<number> {
    let processed = 0;
    for (let i = 0; i < maxPages; i += 1) {
      const jobs = await this.db
        .collection('nativeJobs')
        .where('type', '==', 'feed')
        .where('status', '==', 'pending')
        .orderBy('updatedAt')
        .limit(1)
        .get();
      const job = jobs.docs[0];
      if (!job) break;
      await this.processOnce(job.id);
      processed += 1;
    }
    return processed;
  }

  public async page(
    uid: string,
    cursor?: string,
    limit = 20,
    authorUid?: string,
    time?: { beforeAt?: number | undefined; afterAt?: number | undefined },
  ): Promise<{ items: NativePost[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new NativeHomeFeedError('INVALID');
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeHomeFeedError('UNAVAILABLE');
    let position = decodeCursor(cursor);
    const items: NativePost[] = [];
    let scanned = 0;
    let exhausted = false;
    while (items.length < limit && scanned < MAX_READ_CANDIDATES) {
      // Size the hint read to what is still needed, plus ~25% for filtered hints.
      const requested = Math.min(
        READ_SIZE,
        MAX_READ_CANDIDATES - scanned,
        Math.max(1, Math.ceil((limit - items.length) * 1.25)),
      );
      let query: Query = this.db
        .collection('nativeFeedRefs')
        .doc(uid)
        .collection('items');
      if (authorUid) query = query.where('authorUid', '==', authorUid);
      if (time?.beforeAt !== undefined)
        query = query.where('createdAt', '<', time.beforeAt);
      if (time?.afterAt !== undefined)
        query = query.where('createdAt', '>=', time.afterAt);
      let ordered = query
        .orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(requested);
      if (position) ordered = ordered.startAfter(position.at, position.id);
      const page = await ordered.get();
      if (page.empty) {
        exhausted = true;
        break;
      }
      const postRefs = page.docs.flatMap((hint) => {
        const data = hint.data() as FeedRef;
        return data.kind === 'post' && data.boxId
          ? [{ boxId: data.boxId, postId: data.contentId }]
          : [];
      });
      const authorized = await this.posts.getMany(postRefs, uid);
      const postByKey = new Map(
        postRefs.map((ref, i) => [`${ref.boxId}/${ref.postId}`, authorized[i]]),
      );
      for (const hint of page.docs) {
        scanned += 1;
        position = { at: hint.get('createdAt') as number, id: hint.id };
        const data = hint.data() as FeedRef;
        try {
          if (data.kind === 'post' && data.boxId) {
            const post = postByKey.get(`${data.boxId}/${data.contentId}`);
            if (
              post &&
              post.id === data.contentId &&
              post.createdAt === data.createdAt &&
              (!authorUid || post.authorUid === authorUid)
            )
              items.push(post);
          } else if (data.kind === 'life_update') {
            const update = await this.updates.get(data.contentId, uid);
            const context = update.contexts[0];
            if (context && update.createdAt === data.createdAt) {
              const post = await this.posts.get(
                context.boxId,
                context.postId,
                uid,
              );
              if (
                post.lifeUpdateId === update.id &&
                (!authorUid || post.authorUid === authorUid)
              )
                items.push(post);
            }
          }
        } catch (error) {
          if (
            (error instanceof NativePostError ||
              error instanceof NativeLifeUpdateError) &&
            error.code === 'UNAVAILABLE'
          )
            continue;
          throw error;
        }
        if (items.length === limit) break;
      }
      if (items.length === limit) break;
      if (page.size < requested) {
        exhausted = true;
        break;
      }
    }
    return {
      items,
      nextCursor: !exhausted && position ? encodeCursor(position) : null,
    };
  }
}
