import {
  FieldPath,
  FieldValue,
  type Firestore,
} from 'firebase-admin/firestore';
import { NativeBoxPosts, NativePostError } from './native-box-posts.js';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeNotificationError extends Error {
  public constructor(public readonly code: 'UNAVAILABLE' | 'INVALID') {
    super(code);
  }
}

export interface NativeNotification {
  id: string;
  type: 'post.comment' | 'comment.reply' | 'post.reaction' | 'comment.reaction';
  actorUid: string;
  boxId: string;
  postId: string;
  commentId: string | null;
  reactionKind: string | null;
  lifeUpdateId: string | null;
  read: boolean;
  createdAt: number;
}

/** Private pointers only. Canonical access is rechecked on every read. */
export class NativeNotifications {
  private readonly posts: NativeBoxPosts;

  public constructor(private readonly db: Firestore) {
    this.posts = new NativeBoxPosts(db);
  }

  private items(uid: string) {
    return this.db
      .collection('nativeNotifications')
      .doc(uid)
      .collection('items');
  }

  /** Idempotent projection; callers can retry after any failure. */
  public async processOnce(id: string): Promise<void> {
    const ref = this.db.collection('nativeActivity').doc(id);
    await this.db.runTransaction(async (tx) => {
      const activity = await tx.get(ref);
      if (!activity.exists || activity.get('status') !== 'pending') return;
      const recipientUid = activity.get('recipientUid') as string;
      const [account, box] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(recipientUid)),
        tx.get(
          this.db
            .collection('nativeBoxes')
            .doc(activity.get('boxId') as string),
        ),
      ]);
      if (
        account.get('status') !== 'active' ||
        !['active', 'archived'].includes(box.get('status') as string)
      ) {
        tx.update(ref, { status: 'discarded' });
        return;
      }
      tx.create(this.items(recipientUid).doc(id), {
        schemaVersion: 1,
        type: activity.get('type'),
        actorUid: activity.get('actorUid'),
        boxId: activity.get('boxId'),
        postId: activity.get('postId'),
        commentId: activity.get('commentId') ?? null,
        reactionKind: activity.get('reactionKind') ?? null,
        read: false,
        createdAt: activity.get('createdAt'),
      });
      tx.update(ref, { status: 'projected' });
      tx.set(
        this.db.collection('nativeUserHints').doc(recipientUid),
        {
          schemaVersion: 1,
          version: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    });
  }

  public async processPending(limit = 50): Promise<number> {
    const page = await this.db
      .collection('nativeActivity')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(Math.min(100, Math.max(1, limit)))
      .get();
    await Promise.all(page.docs.map((doc) => this.processOnce(doc.id)));
    return page.size;
  }

  // eslint-disable-next-line complexity -- Every pointer requires canonical post, actor, comment and reaction checks.
  private async visible(
    uid: string,
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Promise<NativeNotification | null> {
    const boxId = data.boxId as string;
    const postId = data.postId as string;
    const actorUid = data.actorUid as string;
    const commentId = (data.commentId as string | null) ?? null;
    try {
      const post = await this.posts.get(boxId, postId, uid);
      const [account, pair] = await Promise.all([
        this.db.collection('nativeAccounts').doc(actorUid).get(),
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(uid, actorUid))
          .get(),
      ]);
      if (
        account.get('status') !== 'active' ||
        ((pair.get('blockedBy') as string[] | undefined)?.length ?? 0) > 0
      )
        return null;
      if (commentId) {
        const { comment } = await this.posts.commentDetail(
          boxId,
          postId,
          commentId,
          uid,
        );
        if (data.type !== 'comment.reaction' && comment.authorUid !== actorUid)
          return null;
      }
      if (data.type === 'post.reaction' || data.type === 'comment.reaction') {
        const target = commentId
          ? this.db
              .collection('nativeBoxes')
              .doc(boxId)
              .collection('posts')
              .doc(postId)
              .collection('comments')
              .doc(commentId)
          : this.db
              .collection('nativeBoxes')
              .doc(boxId)
              .collection('posts')
              .doc(postId);
        const reaction = await target
          .collection('reactions')
          .doc(actorUid)
          .get();
        if (!reaction.exists || reaction.get('kind') !== data.reactionKind)
          return null;
      }
      return {
        id,
        type: data.type,
        actorUid,
        boxId,
        postId,
        commentId,
        reactionKind: data.reactionKind ?? null,
        lifeUpdateId: post.lifeUpdateId,
        read: data.read === true,
        createdAt: data.createdAt,
      } as NativeNotification;
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        return null;
      throw error;
    }
  }

  public async get(uid: string, id: string): Promise<NativeNotification> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeNotificationError('UNAVAILABLE');
    const row = await this.items(uid).doc(id).get();
    if (!row.exists) throw new NativeNotificationError('UNAVAILABLE');
    const item = await this.visible(uid, row.id, row.data()!);
    if (!item) throw new NativeNotificationError('UNAVAILABLE');
    return item;
  }

  public async list(uid: string, cursor?: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new NativeNotificationError('INVALID');
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeNotificationError('UNAVAILABLE');
    let query = this.items(uid)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(limit * 3);
    if (cursor) {
      const start = await this.items(uid).doc(cursor).get();
      if (!start.exists) throw new NativeNotificationError('INVALID');
      query = query.startAfter(start);
    }
    const page = await query.get();
    const visible = await Promise.all(
      page.docs.map((row) => this.visible(uid, row.id, row.data())),
    );
    const items = visible
      .filter((item): item is NativeNotification => item !== null)
      .slice(0, limit);
    return {
      items,
      nextCursor:
        page.size === limit * 3 ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async unreadCount(uid: string) {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeNotificationError('UNAVAILABLE');
    const page = await this.items(uid)
      .where('read', '==', false)
      .limit(300)
      .get();
    let count = 0;
    for (const row of page.docs) {
      // eslint-disable-next-line no-await-in-loop -- bounded, visibility checked per pointer.
      if (await this.visible(uid, row.id, row.data())) count += 1;
      if (count >= 100) break;
    }
    return { count: Math.min(count, 100), capped: count >= 100 };
  }

  public async markRead(uid: string, id: string): Promise<NativeNotification> {
    const item = await this.get(uid, id);
    await this.items(uid).doc(id).update({ read: true });
    await this.db
      .collection('nativeUserHints')
      .doc(uid)
      .set(
        {
          schemaVersion: 1,
          version: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    return item;
  }

  public async markAllRead(uid: string): Promise<void> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeNotificationError('UNAVAILABLE');
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- each bounded batch consumes the prior one.
      const page = await this.items(uid)
        .where('read', '==', false)
        .limit(400)
        .get();
      if (page.empty) break;
      const batch = this.db.batch();
      for (const row of page.docs) batch.update(row.ref, { read: true });
      // eslint-disable-next-line no-await-in-loop -- each bounded batch consumes the prior one.
      await batch.commit();
    }
    await this.db
      .collection('nativeUserHints')
      .doc(uid)
      .set(
        {
          schemaVersion: 1,
          version: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
  }

  public async hintVersion(uid: string): Promise<number> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeNotificationError('UNAVAILABLE');
    const hint = await this.db.collection('nativeUserHints').doc(uid).get();
    return (hint.get('version') as number | undefined) ?? 0;
  }
}
