/* eslint-disable no-await-in-loop -- Erasure is deliberately ordered and resumable. */
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldPath,
  FieldValue,
  type Firestore,
  type DocumentSnapshot,
  type Query,
} from 'firebase-admin/firestore';
import { NativeMedia } from './native-media.js';
import type { Storage } from 'firebase-admin/storage';

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 50;
type Phase =
  | 'pending'
  | 'media'
  | 'exports'
  | 'content'
  | 'references'
  | 'identity'
  | 'account'
  | 'complete';

export class NativeLifecycleError extends Error {
  constructor(
    public readonly code:
      | 'UNAVAILABLE'
      | 'REAUTH_FAILED'
      | 'BOX_OWNERSHIP_TRANSFER_REQUIRED'
      | 'WINDOW_CLOSED',
  ) {
    super(code);
  }
}

const serializable = (doc: DocumentSnapshot) => ({ id: doc.id, ...doc.data() });
const iso = (time: number) => new Date(time).toISOString();

export class NativeAccountLifecycle {
  private readonly bucket: ReturnType<Storage['bucket']>;
  private readonly media: NativeMedia;
  constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
    storage: Storage,
    bucketName: string,
    private readonly checkpoint?: (phase: Phase) => void,
  ) {
    this.bucket = storage.bucket(bucketName);
    this.media = new NativeMedia(db, storage, bucketName);
  }

  private requestRef(uid: string) {
    return this.db.collection('nativeDeletionRequests').doc(uid);
  }
  private async active(uid: string) {
    if (
      (await this.db.collection('nativeAccounts').doc(uid).get()).get(
        'status',
      ) !== 'active'
    )
      throw new NativeLifecycleError('UNAVAILABLE');
  }
  private async ownedBox(uid: string) {
    const rows = await this.db
      .collection('nativeBoxes')
      .where('ownerUid', '==', uid)
      .limit(1)
      .get();
    return !rows.empty;
  }
  private async reauthenticate(
    uid: string,
    password: string,
    verify: (uid: string, email: string, password: string) => Promise<void>,
  ) {
    if (!password || password.length > 256)
      throw new NativeLifecycleError('REAUTH_FAILED');
    const email = (await this.auth.getUser(uid)).email;
    if (!email) throw new NativeLifecycleError('REAUTH_FAILED');
    await verify(uid, email, password).catch(() => {
      throw new NativeLifecycleError('REAUTH_FAILED');
    });
  }

  private async *pages(query: Query): AsyncGenerator<DocumentSnapshot> {
    let cursor: DocumentSnapshot | undefined;
    while (true) {
      let page = query.orderBy(FieldPath.documentId()).limit(100);
      if (cursor) page = page.startAfter(cursor);
      const rows = await page.get();
      for (const doc of rows.docs) yield doc;
      if (rows.size < 100) return;
      cursor = rows.docs[rows.docs.length - 1];
    }
  }

  /** Page each owner-scoped query so archive size does not set worker memory use. */
  private async *archiveChunks(uid: string): AsyncGenerator<string> {
    const [identity, account, profile, preferences, room, personalization] =
      await Promise.all([
        this.auth.getUser(uid),
        this.db.collection('nativeAccounts').doc(uid).get(),
        this.db.collection('nativeProfiles').doc(uid).get(),
        this.db.collection('nativePreferences').doc(uid).get(),
        this.db.collection('nativeRooms').doc(uid).get(),
        this.db.collection('nativeRoomPersonalization').doc(uid).get(),
      ]);
    const header = {
      format: 'paldora-json-v1',
      exportedAt: iso(Date.now()),
      profile: {
        account: {
          id: uid,
          email: identity.email ?? null,
          username: account.get('username') ?? null,
          createdAt: account.get('createdAt') ?? null,
        },
        profile: serializable(profile),
        preferences: serializable(preferences),
      },
    };
    yield JSON.stringify(header).slice(0, -1);
    const collections: Array<[string, Query]> = [
      ['posts', this.db.collectionGroup('posts').where('authorUid', '==', uid)],
      [
        'comments',
        this.db.collectionGroup('comments').where('authorUid', '==', uid),
      ],
      [
        'reactions',
        this.db.collectionGroup('reactions').where('uid', '==', uid),
      ],
      [
        'lifeUpdates',
        this.db.collection('nativeLifeUpdates').where('authorUid', '==', uid),
      ],
      [
        'media',
        this.db.collection('nativeMediaAssets').where('ownerUid', '==', uid),
      ],
    ];
    for (const [name, query] of collections) {
      yield `,"${name}":[`;
      let first = true;
      for await (const doc of this.pages(query)) {
        const value =
          name === 'media' ? this.mediaMetadata(doc) : serializable(doc);
        yield `${first ? '' : ','}${JSON.stringify(value)}`;
        first = false;
      }
      yield ']';
    }
    yield `,"room":${JSON.stringify({ settings: serializable(room), personalization: serializable(personalization) })}}`;
  }

  private mediaMetadata(doc: DocumentSnapshot) {
    const row = doc.data() ?? {};
    return {
      id: doc.id,
      purpose: row.purpose,
      boxId: row.boxId ?? null,
      status: row.status,
      contentType: row.contentType,
      contentLength: row.contentLength,
      createdAt: row.createdAt,
      attachedPostId: row.attachedPostId ?? null,
      attachedLifeUpdateId: row.attachedLifeUpdateId ?? null,
      attachedRoomUid: row.attachedRoomUid ?? null,
    };
  }

  public async latestExport(uid: string) {
    await this.active(uid);
    const rows = await this.db
      .collection('nativeExports')
      .where('ownerUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const row = rows.docs[0];
    return { export: row ? this.exportView(row) : null };
  }
  private exportView(row: DocumentSnapshot) {
    const expiresAt = row.get('expiresAt') as number | null;
    return {
      id: row.id,
      status:
        expiresAt && expiresAt <= Date.now()
          ? ('expired' as const)
          : (row.get('status') as 'pending' | 'ready' | 'expired'),
      createdAt: iso(row.get('createdAt') as number),
      readyAt: row.get('readyAt') ? iso(row.get('readyAt') as number) : null,
      expiresAt: expiresAt ? iso(expiresAt) : null,
    };
  }
  public async requestExport(uid: string) {
    await this.active(uid);
    const id = randomUUID();
    const now = Date.now();
    await this.db
      .collection('nativeExports')
      .doc(id)
      .create({
        schemaVersion: 1,
        ownerUid: uid,
        status: 'pending',
        createdAt: now,
        readyAt: null,
        expiresAt: null,
        objectPath: `private/exports/${uid}/${id}.json`,
      });
    return this.processExport(id);
  }
  public async processExport(id: string) {
    const ref = this.db.collection('nativeExports').doc(id);
    const row = await ref.get();
    if (!row.exists) throw new NativeLifecycleError('UNAVAILABLE');
    if (row.get('status') !== 'pending') return this.exportView(row);
    const uid = row.get('ownerUid') as string;
    await this.active(uid);
    const objectPath = row.get('objectPath') as string;
    await pipeline(
      Readable.from(this.archiveChunks(uid)),
      this.bucket.file(objectPath).createWriteStream({
        contentType: 'application/json',
        resumable: false,
        metadata: { cacheControl: 'private, no-store' },
      }),
    );
    let published = false;
    await this.db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const account = await tx.get(
        this.db.collection('nativeAccounts').doc(uid),
      );
      if (
        fresh.get('status') !== 'pending' ||
        account.get('status') !== 'active'
      )
        return;
      const readyAt = Date.now();
      tx.update(ref, {
        status: 'ready',
        readyAt,
        expiresAt: readyAt + 7 * DAY,
      });
      published = true;
    });
    if (!published)
      await this.bucket
        .file(row.get('objectPath') as string)
        .delete({ ignoreNotFound: true });
    return this.exportView(await ref.get());
  }
  private async exportFile(uid: string, id: string) {
    await this.active(uid);
    const row = await this.db.collection('nativeExports').doc(id).get();
    if (
      row.get('ownerUid') !== uid ||
      row.get('status') !== 'ready' ||
      (row.get('expiresAt') as number) <= Date.now()
    )
      throw new NativeLifecycleError('UNAVAILABLE');
    return { row, file: this.bucket.file(row.get('objectPath') as string) };
  }

  private async recheckExport(uid: string, row: DocumentSnapshot) {
    // Account/session and object authorization are rechecked after the potentially slow Storage read.
    await this.active(uid);
    const fresh = await row.ref.get();
    if (
      fresh.get('status') !== 'ready' ||
      (fresh.get('expiresAt') as number) <= Date.now()
    )
      throw new NativeLifecycleError('UNAVAILABLE');
  }

  public async download(uid: string, id: string): Promise<Buffer> {
    const { row, file } = await this.exportFile(uid, id);
    const [bytes] = await file.download();
    await this.recheckExport(uid, row);
    return bytes;
  }

  /** The web route checks the session again immediately before returning this stream. */
  public async downloadStream(uid: string, id: string): Promise<Readable> {
    const { row, file } = await this.exportFile(uid, id);
    await this.recheckExport(uid, row);
    return file.createReadStream();
  }
  public async expireExports(now = Date.now()) {
    const rows = await this.db
      .collection('nativeExports')
      .where('expiresAt', '<=', now)
      .limit(PAGE)
      .get();
    for (const row of rows.docs) {
      if (row.get('objectPath'))
        await this.bucket
          .file(row.get('objectPath') as string)
          .delete({ ignoreNotFound: true });
      await row.ref.update({ status: 'expired', expiresAt: null });
    }
    return rows.size;
  }
  /** Repair orphan bytes left by a worker crash after Storage write. */
  public async reapOrphanExports() {
    const [files] = await this.bucket.getFiles({ prefix: 'private/exports/' });
    for (const file of files) {
      const match = /^private\/exports\/[^/]+\/([0-9a-f-]{36})\.json$/.exec(
        file.name,
      );
      if (!match) continue;
      const row = await this.db
        .collection('nativeExports')
        .doc(match[1]!)
        .get();
      if (!row.exists || row.get('status') === 'expired')
        await file.delete({ ignoreNotFound: true });
    }
  }

  public async currentDeletion(uid: string) {
    await this.active(uid);
    const row = await this.requestRef(uid).get();
    return {
      deletion:
        row.exists &&
        ['pending', 'blocked'].includes(row.get('status') as string)
          ? this.deletionView(row)
          : null,
    };
  }
  private deletionView(row: DocumentSnapshot) {
    return {
      id: row.get('generation') as string,
      status: row.get('status') as 'pending' | 'blocked' | 'cancelled',
      requestedAt: iso(row.get('requestedAt') as number),
      dueAt: iso(row.get('dueAt') as number),
      cancelledAt: row.get('cancelledAt')
        ? iso(row.get('cancelledAt') as number)
        : null,
    };
  }
  public async requestDeletion(
    uid: string,
    password: string,
    verify: (uid: string, email: string, password: string) => Promise<void>,
    now = Date.now(),
  ) {
    await this.reauthenticate(uid, password, verify);
    if (await this.ownedBox(uid))
      throw new NativeLifecycleError('BOX_OWNERSHIP_TRANSFER_REQUIRED');
    const ref = this.requestRef(uid);
    await this.db.runTransaction(async (tx) => {
      const [account, existing] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(ref),
      ]);
      if (account.get('status') !== 'active')
        throw new NativeLifecycleError('UNAVAILABLE');
      if (
        existing.exists &&
        ['pending', 'blocked'].includes(existing.get('status') as string)
      )
        return;
      tx.set(ref, {
        schemaVersion: 1,
        uid,
        generation: randomUUID(),
        status: 'pending',
        phase: 'pending',
        requestedAt: now,
        dueAt: now + 7 * DAY,
        cancelledAt: null,
        updatedAt: now,
      });
    });
    return this.deletionView(await ref.get());
  }
  public async cancelDeletion(
    uid: string,
    password: string,
    verify: (uid: string, email: string, password: string) => Promise<void>,
    now = Date.now(),
  ) {
    await this.reauthenticate(uid, password, verify);
    const ref = this.requestRef(uid);
    await this.db.runTransaction(async (tx) => {
      const row = await tx.get(ref);
      if (
        !row.exists ||
        !['pending', 'blocked'].includes(row.get('status') as string)
      )
        throw new NativeLifecycleError('UNAVAILABLE');
      if ((row.get('dueAt') as number) <= now)
        throw new NativeLifecycleError('WINDOW_CLOSED');
      tx.update(ref, { status: 'cancelled', cancelledAt: now, updatedAt: now });
    });
    return this.deletionView(await ref.get());
  }

  private async advance(
    uid: string,
    generation: string,
    from: Phase,
    to: Phase,
  ) {
    await this.db.runTransaction(async (tx) => {
      const ref = this.requestRef(uid),
        row = await tx.get(ref);
      if (
        row.get('generation') !== generation ||
        row.get('phase') !== from ||
        row.get('status') !== 'running'
      )
        throw new NativeLifecycleError('UNAVAILABLE');
      tx.update(ref, { phase: to, updatedAt: Date.now() });
    });
  }
  private async assertGeneration(
    uid: string,
    generation: string,
    phase: Phase,
  ) {
    const row = await this.requestRef(uid).get();
    if (
      row.get('generation') !== generation ||
      row.get('phase') !== phase ||
      row.get('status') !== 'running'
    )
      throw new NativeLifecycleError('UNAVAILABLE');
  }
  private async erasePage(
    uid: string,
    generation: string,
    phase: Phase,
    query: Query,
    recursive = false,
  ) {
    const rows = await query.limit(PAGE).get();
    for (const row of rows.docs) {
      await this.assertGeneration(uid, generation, phase);
      if (
        row.ref.parent.id === 'members' &&
        row.ref.parent.parent?.parent.id === 'nativeBoxes'
      ) {
        await this.db.runTransaction(async (tx) => {
          const member = await tx.get(row.ref);
          const boxRef = row.ref.parent.parent!;
          const box = await tx.get(boxRef);
          if (!member.exists) return;
          tx.delete(row.ref);
          if (box.exists && member.get('status') === 'active')
            tx.update(boxRef, {
              memberCount: FieldValue.increment(-1),
              updatedAt: Date.now(),
            });
        });
      } else if (recursive) await this.db.recursiveDelete(row.ref);
      else await row.ref.delete();
    }
    return rows.size;
  }
  private async removePost(row: DocumentSnapshot) {
    const pointers = await this.db
      .collection('nativeCommentPointers')
      .where('postId', '==', row.id)
      .get();
    for (const pointer of pointers.docs) await pointer.ref.delete();
    await this.db.recursiveDelete(row.ref);
    await this.db.collection('nativePostPointers').doc(row.id).delete();
  }

  /** One bounded erasure step. A crash can be retried without advancing prematurely. */
  // eslint-disable-next-line complexity, max-lines-per-function -- Each durable phase and retry boundary stays explicit.
  public async processDeletion(uid: string, now = Date.now()): Promise<Phase> {
    const ref = this.requestRef(uid);
    const row = await ref.get();
    if (!row.exists || row.get('status') === 'cancelled') return 'complete';
    const generation = row.get('generation') as string;
    let phase = row.get('phase') as Phase;
    if (phase === 'complete') return phase;
    if (phase === 'pending') {
      if ((row.get('dueAt') as number) > now) return phase;
      if (await this.ownedBox(uid)) {
        await ref.update({ status: 'blocked' });
        return 'pending';
      }
      await this.db.runTransaction(async (tx) => {
        const [fresh, account] = await Promise.all([
          tx.get(ref),
          tx.get(this.db.collection('nativeAccounts').doc(uid)),
        ]);
        if (
          fresh.get('generation') !== generation ||
          !['pending', 'blocked'].includes(fresh.get('status') as string) ||
          (fresh.get('dueAt') as number) > now ||
          account.get('status') !== 'active'
        )
          return;
        tx.update(this.db.collection('nativeAccounts').doc(uid), {
          status: 'deleting',
        });
        tx.update(ref, { status: 'running', phase: 'media', updatedAt: now });
      });
      phase = (await ref.get()).get('phase') as Phase;
      if (phase !== 'media') return phase;
      this.checkpoint?.('pending');
      await this.auth.revokeRefreshTokens(uid);
      return phase;
    }
    await this.assertGeneration(uid, generation, phase);
    if (phase === 'media') {
      await this.auth.revokeRefreshTokens(uid).catch((error: unknown) => {
        if ((error as { code?: string }).code !== 'auth/user-not-found')
          throw error;
      });
      const assets = await this.db
        .collection('nativeMediaAssets')
        .where('ownerUid', '==', uid)
        .limit(PAGE)
        .get();
      for (const asset of assets.docs) {
        await this.assertGeneration(uid, generation, phase);
        await this.media.retire(asset.id);
        await asset.ref.delete();
      }
      if (assets.size < PAGE) {
        this.checkpoint?.(phase);
        await this.advance(uid, generation, phase, 'exports');
      }
    } else if (phase === 'exports') {
      const rows = await this.db
        .collection('nativeExports')
        .where('ownerUid', '==', uid)
        .limit(PAGE)
        .get();
      for (const item of rows.docs) {
        await this.assertGeneration(uid, generation, phase);
        await this.bucket
          .file(item.get('objectPath') as string)
          .delete({ ignoreNotFound: true });
        await item.ref.delete();
      }
      if (rows.size < PAGE) {
        const [files] = await this.bucket.getFiles({
          prefix: `private/exports/${uid}/`,
        });
        for (const file of files) {
          await this.assertGeneration(uid, generation, phase);
          await file.delete({ ignoreNotFound: true });
        }
        this.checkpoint?.(phase);
        await this.advance(uid, generation, phase, 'content');
      }
    } else if (phase === 'content') {
      const posts = await this.db
        .collectionGroup('posts')
        .where('authorUid', '==', uid)
        .limit(PAGE)
        .get();
      for (const post of posts.docs) {
        await this.assertGeneration(uid, generation, phase);
        await this.removePost(post);
      }
      if (posts.size) return phase;
      const updates = await this.db
        .collection('nativeLifeUpdates')
        .where('authorUid', '==', uid)
        .limit(PAGE)
        .get();
      for (const update of updates.docs) {
        await this.assertGeneration(uid, generation, phase);
        const deliveries = await this.db
          .collection('nativeLifeUpdateDeliveries')
          .where('lifeUpdateId', '==', update.id)
          .get();
        for (const delivery of deliveries.docs) {
          const boxId = delivery.get('boxId') as string | undefined;
          const postId = delivery.get('postId') as string | undefined;
          if (boxId && postId)
            await this.removePost(
              await this.db
                .collection('nativeBoxes')
                .doc(boxId)
                .collection('posts')
                .doc(postId)
                .get(),
            );
          await delivery.ref.delete();
        }
        await update.ref.delete();
      }
      if (updates.size) return phase;
      const comments = await this.db
        .collectionGroup('comments')
        .where('authorUid', '==', uid)
        .limit(PAGE)
        .get();
      for (const comment of comments.docs) {
        await this.assertGeneration(uid, generation, phase);
        await this.db.recursiveDelete(comment.ref);
        await this.db
          .collection('nativeCommentPointers')
          .doc(comment.id)
          .delete();
      }
      if (comments.size) return phase;
      const reactions = await this.db
        .collectionGroup('reactions')
        .where('uid', '==', uid)
        .limit(PAGE)
        .get();
      for (const reaction of reactions.docs) {
        await this.assertGeneration(uid, generation, phase);
        await reaction.ref.delete();
      }
      if (reactions.size < PAGE) {
        this.checkpoint?.(phase);
        await this.advance(uid, generation, phase, 'references');
      }
    } else if (phase === 'references') {
      const queries: Array<[Query, boolean]> = [
        [
          this.db
            .collection('nativeFriendPairs')
            .where('users', 'array-contains', uid),
          false,
        ],
        [
          this.db
            .collection('nativeBlockPairs')
            .where('users', 'array-contains', uid),
          false,
        ],
        [
          this.db
            .collection('nativeBoxInvitations')
            .where('inviteeUid', '==', uid),
          false,
        ],
        [
          this.db
            .collection('nativeBoxInvitations')
            .where('inviterUid', '==', uid),
          false,
        ],
        [this.db.collectionGroup('members').where('uid', '==', uid), false],
        [
          this.db.collection('nativeFeedRefs').doc(uid).collection('items'),
          false,
        ],
        [this.db.collectionGroup('items').where('authorUid', '==', uid), false],
        [
          this.db
            .collection('nativeNotifications')
            .doc(uid)
            .collection('items'),
          false,
        ],
        [this.db.collectionGroup('items').where('actorUid', '==', uid), false],
        [
          this.db.collection('nativeActivity').where('actorUid', '==', uid),
          false,
        ],
        [
          this.db.collection('nativeActivity').where('recipientUid', '==', uid),
          false,
        ],
        [
          this.db
            .collection('nativeModerationNotices')
            .where('ownerUid', '==', uid),
          false,
        ],
        [this.db.collection('nativeJobs').where('uid', '==', uid), false],
        [this.db.collection('nativeJobs').where('ownerUid', '==', uid), false],
      ];
      for (const [query, recursive] of queries)
        if (await this.erasePage(uid, generation, phase, query, recursive))
          return phase;
      const rooms = await this.db
        .collection('nativeRooms')
        .where('topFriendIds', 'array-contains', uid)
        .limit(PAGE)
        .get();
      if (rooms.size) {
        for (const room of rooms.docs) {
          await this.assertGeneration(uid, generation, phase);
          await room.ref.update({
            topFriendIds: FieldValue.arrayRemove(uid),
            version: FieldValue.increment(1),
          });
        }
        return phase;
      }
      const reports = await this.db
        .collection('nativeReports')
        .where('reporterUid', '==', uid)
        .limit(PAGE)
        .get();
      if (reports.size) {
        for (const report of reports.docs) {
          await this.assertGeneration(uid, generation, phase);
          await report.ref.update({
            reporterUid: null,
            detail: null,
            reason: null,
          });
        }
        return phase;
      }
      const hints = await this.db
        .collection('nativeAccounts')
        .doc(uid)
        .collection('boxRefs')
        .limit(PAGE)
        .get();
      if (hints.size) {
        for (const hint of hints.docs) await hint.ref.delete();
        return phase;
      }
      this.checkpoint?.(phase);
      await this.advance(uid, generation, phase, 'identity');
    } else if (phase === 'identity') {
      await this.auth.deleteUser(uid).catch((error: unknown) => {
        if ((error as { code?: string }).code !== 'auth/user-not-found')
          throw error;
      });
      this.checkpoint?.(phase);
      await this.advance(uid, generation, phase, 'account');
    } else if (phase === 'account') {
      for (const collection of [
        'nativeProfiles',
        'nativePreferences',
        'nativeRooms',
        'nativeRoomPersonalization',
        'nativeUserHints',
        'nativeStaffGrants',
        'nativeAccounts',
      ])
        await this.db.collection(collection).doc(uid).delete();
      const usernames = await this.db
        .collection('nativeUsernames')
        .where('uid', '==', uid)
        .get();
      for (const username of usernames.docs) await username.ref.delete();
      this.checkpoint?.(phase);
      await this.advance(uid, generation, phase, 'complete');
      await ref.delete();
    }
    return phase;
  }
  public async repairDeletions(now = Date.now(), limit = PAGE) {
    const rows = await this.db
      .collection('nativeDeletionRequests')
      .where('status', 'in', ['pending', 'blocked', 'running'])
      .limit(limit)
      .get();
    for (const row of rows.docs)
      if (
        row.get('status') === 'running' ||
        (['pending', 'blocked'].includes(row.get('status') as string) &&
          (row.get('dueAt') as number) <= now)
      ) {
        try {
          await this.processDeletion(row.id, now);
        } catch {
          await row.ref.update({
            attempts: FieldValue.increment(1),
            lastFailureAt: now,
          });
        }
      }
  }
  public async repairExports(limit = PAGE) {
    const rows = await this.db
      .collection('nativeExports')
      .where('status', '==', 'pending')
      .limit(limit)
      .get();
    for (const row of rows.docs) {
      try {
        await this.processExport(row.id);
      } catch {
        await row.ref.update({
          attempts: FieldValue.increment(1),
          lastFailureAt: Date.now(),
        });
      }
    }
    await this.expireExports();
    await this.reapOrphanExports();
  }
}
