import { randomUUID } from 'node:crypto';
import {
  createLifeUpdateSchema,
  updateLifeUpdateSchema,
  type LifeUpdateChanges,
  type LifeUpdateSectionsInput,
} from '@paldora/validation';
import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeLifeUpdateError extends Error {
  public constructor(public readonly code: 'INVALID' | 'UNAVAILABLE') {
    super(code);
  }
}

export interface NativeLifeUpdateContext {
  boxId: string;
  boxName: string;
  postId: string;
  canInteract: boolean;
}

export interface NativeLifeUpdate {
  id: string;
  authorUid: string;
  audience: 'only_me' | 'boxes';
  sections: LifeUpdateSectionsInput;
  mediaAssetIds: string[];
  createdAt: number;
  updatedAt: number;
  canEdit: boolean;
  contexts: NativeLifeUpdateContext[];
}

function active(snapshot: DocumentSnapshot): boolean {
  return snapshot.exists && snapshot.get('status') === 'active';
}

function readableBox(snapshot: DocumentSnapshot): boolean {
  return (
    snapshot.exists &&
    ['active', 'archived'].includes(snapshot.get('status') as string)
  );
}

function deliveryId(updateId: string, boxId: string): string {
  return `${updateId}_${boxId}`;
}

/** One canonical record, with separate Box delivery/backing-post contexts. */
export class NativeLifeUpdates {
  public constructor(private readonly db: Firestore) {}

  private update(id: string) {
    return this.db.collection('nativeLifeUpdates').doc(id);
  }

  private delivery(id: string, boxId: string) {
    return this.db
      .collection('nativeLifeUpdateDeliveries')
      .doc(deliveryId(id, boxId));
  }

  /** Publication is all-or-nothing, including the backing posts. */
  public async create(
    authorUid: string,
    input: unknown,
    now = Date.now(),
  ): Promise<string> {
    const parsed = createLifeUpdateSchema.safeParse(input);
    if (!parsed.success) throw new NativeLifeUpdateError('INVALID');
    const { audience, sections, mediaAssetIds } = parsed.data;
    const boxIds = audience.type === 'boxes' ? audience.boxIds : [];
    const id = randomUUID();
    await this.db.runTransaction(async (tx) => {
      const account = await tx.get(
        this.db.collection('nativeAccounts').doc(authorUid),
      );
      if (!active(account)) throw new NativeLifeUpdateError('UNAVAILABLE');
      const audienceRows = await Promise.all(
        boxIds.map(async (boxId) => {
          const boxRef = this.db.collection('nativeBoxes').doc(boxId);
          const [box, member] = await Promise.all([
            tx.get(boxRef),
            tx.get(boxRef.collection('members').doc(authorUid)),
          ]);
          if (box.get('status') !== 'active' || !active(member))
            throw new NativeLifeUpdateError('UNAVAILABLE');
          return { boxId, boxRef };
        }),
      );
      const assets = await Promise.all(
        mediaAssetIds.map((mediaId) =>
          tx.get(this.db.collection('nativeMediaAssets').doc(mediaId)),
        ),
      );
      if (
        assets.some(
          (asset) =>
            asset.get('status') !== 'ready' ||
            asset.get('purpose') !== 'life_update_image' ||
            asset.get('ownerUid') !== authorUid ||
            asset.get('attachedLifeUpdateId'),
        )
      )
        throw new NativeLifeUpdateError('INVALID');
      for (const asset of assets)
        tx.update(asset.ref, {
          attachedLifeUpdateId: id,
          unattachedExpiresAt: null,
          updatedAt: now,
        });
      tx.create(this.update(id), {
        schemaVersion: 1,
        authorUid,
        audience: audience.type,
        boxIds,
        sections,
        mediaAssetIds,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      if (!audienceRows.length) {
        tx.create(this.delivery(id, 'only_me'), {
          lifeUpdateId: id,
          authorUid,
          audience: 'only_me',
          boxId: null,
          postId: null,
          status: 'active',
          position: 0,
        });
      }
      for (const [position, { boxId, boxRef }] of audienceRows.entries()) {
        const postId = randomUUID();
        tx.create(boxRef.collection('posts').doc(postId), {
          boxId,
          authorUid,
          kind: 'life_update',
          lifeUpdateId: id,
          text: '',
          status: 'active',
          moderationHidden: false,
          createdAt: now,
          updatedAt: now,
        });
        tx.create(this.db.collection('nativePostPointers').doc(postId), {
          boxId,
          authorUid,
          kind: 'life_update',
          lifeUpdateId: id,
          createdAt: now,
        });
        tx.create(this.delivery(id, boxId), {
          lifeUpdateId: id,
          authorUid,
          audience: 'boxes',
          boxId,
          postId,
          status: 'active',
          position,
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
      }
    });
    return id;
  }

  private async contexts(
    tx: Transaction,
    update: DocumentSnapshot,
    viewerUid: string,
    scopeBoxId?: string,
  ): Promise<NativeLifeUpdateContext[]> {
    const boxIds = update.get('boxIds') as string[];
    const rows = await Promise.all(
      boxIds
        .filter((boxId) => !scopeBoxId || boxId === scopeBoxId)
        .map(async (boxId) => {
          const boxRef = this.db.collection('nativeBoxes').doc(boxId);
          const deliveryRef = this.delivery(update.id, boxId);
          const [box, member, delivery] = await Promise.all([
            tx.get(boxRef),
            tx.get(boxRef.collection('members').doc(viewerUid)),
            tx.get(deliveryRef),
          ]);
          if (
            !readableBox(box) ||
            !active(member) ||
            !active(delivery) ||
            delivery.get('lifeUpdateId') !== update.id ||
            delivery.get('boxId') !== boxId
          )
            return null;
          const postId = delivery.get('postId') as string;
          const post = await tx.get(boxRef.collection('posts').doc(postId));
          if (
            !active(post) ||
            post.get('moderationHidden') !== false ||
            post.get('lifeUpdateId') !== update.id ||
            post.get('kind') !== 'life_update'
          )
            return null;
          return {
            boxId,
            boxName: box.get('name') as string,
            postId,
            canInteract: box.get('status') === 'active',
          };
        }),
    );
    return rows
      .filter((row): row is NativeLifeUpdateContext => row !== null)
      .sort(
        (first, second) =>
          first.boxName.localeCompare(second.boxName) ||
          first.boxId.localeCompare(second.boxId),
      );
  }

  private async view(
    tx: Transaction,
    update: DocumentSnapshot,
    viewerUid: string,
    scopeBoxId?: string,
  ): Promise<NativeLifeUpdate> {
    if (!active(update)) throw new NativeLifeUpdateError('UNAVAILABLE');
    const authorUid = update.get('authorUid') as string;
    await this.assertPeople(tx, viewerUid, authorUid);
    const audience = update.get('audience') as 'only_me' | 'boxes';
    if (audience === 'only_me') {
      const delivery = await tx.get(this.delivery(update.id, 'only_me'));
      if (!active(delivery) || delivery.get('lifeUpdateId') !== update.id)
        throw new NativeLifeUpdateError('UNAVAILABLE');
    }
    const contexts =
      audience === 'boxes'
        ? await this.contexts(tx, update, viewerUid, scopeBoxId)
        : [];
    if (
      (audience === 'only_me' && (scopeBoxId || authorUid !== viewerUid)) ||
      (audience === 'boxes' && contexts.length === 0)
    )
      throw new NativeLifeUpdateError('UNAVAILABLE');
    return {
      id: update.id,
      authorUid,
      audience,
      sections: update.get('sections') as LifeUpdateSectionsInput,
      mediaAssetIds:
        (update.get('mediaAssetIds') as string[] | undefined) ?? [],
      createdAt: update.get('createdAt') as number,
      updatedAt: update.get('updatedAt') as number,
      canEdit:
        authorUid === viewerUid &&
        (audience === 'only_me' ||
          contexts.some((context) => context.canInteract)),
      contexts,
    };
  }

  private async assertPeople(
    tx: Transaction,
    viewerUid: string,
    authorUid: string,
  ): Promise<void> {
    const [viewer, author, pair] = await Promise.all([
      tx.get(this.db.collection('nativeAccounts').doc(viewerUid)),
      tx.get(this.db.collection('nativeAccounts').doc(authorUid)),
      tx.get(
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(viewerUid, authorUid)),
      ),
    ]);
    if (
      !active(viewer) ||
      !active(author) ||
      (pair.exists && (pair.get('blockedBy') as string[] | undefined)?.length)
    )
      throw new NativeLifeUpdateError('UNAVAILABLE');
  }

  public async get(
    id: string,
    viewerUid: string,
    scopeBoxId?: string,
  ): Promise<NativeLifeUpdate> {
    return this.db.runTransaction(async (tx) =>
      this.view(tx, await tx.get(this.update(id)), viewerUid, scopeBoxId),
    );
  }

  public async listMine(
    uid: string,
    cursor?: string,
    beforeAt?: number,
    afterAt?: number,
  ): Promise<{ items: NativeLifeUpdate[]; nextCursor: string | null }> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (!active(account)) throw new NativeLifeUpdateError('UNAVAILABLE');
    let query = this.db
      .collection('nativeLifeUpdates')
      .where('authorUid', '==', uid)
      .where('status', '==', 'active');
    if (beforeAt !== undefined) query = query.where('createdAt', '<', beforeAt);
    if (afterAt !== undefined) query = query.where('createdAt', '>=', afterAt);
    query = query
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(20);
    if (cursor) {
      const marker = await this.update(cursor).get();
      if (
        !marker.exists ||
        marker.get('authorUid') !== uid ||
        marker.get('status') !== 'active'
      )
        throw new NativeLifeUpdateError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map(async (candidate) => {
        try {
          return await this.get(candidate.id, uid);
        } catch (error) {
          if (
            error instanceof NativeLifeUpdateError &&
            error.code === 'UNAVAILABLE'
          )
            return null;
          throw error;
        }
      }),
    );
    return {
      items: items.filter((item): item is NativeLifeUpdate => item !== null),
      nextCursor: page.size === 20 ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async edit(
    id: string,
    authorUid: string,
    input: unknown,
    now = Date.now(),
  ): Promise<string[]> {
    const parsed = updateLifeUpdateSchema.safeParse(input);
    if (!parsed.success) throw new NativeLifeUpdateError('INVALID');
    const changes: LifeUpdateChanges = parsed.data;
    return this.db.runTransaction(async (tx) => {
      const ref = this.update(id);
      const snapshot = await tx.get(ref);
      const view = await this.view(tx, snapshot, authorUid);
      if (view.authorUid !== authorUid || !view.canEdit)
        throw new NativeLifeUpdateError('UNAVAILABLE');
      const sections = changes.sections ?? view.sections;
      if (!Object.keys(sections).length)
        throw new NativeLifeUpdateError('INVALID');
      const previous = view.mediaAssetIds;
      const next = changes.mediaAssetIds ?? previous;
      const added = next.filter((mediaId) => !previous.includes(mediaId));
      const removed = previous.filter((mediaId) => !next.includes(mediaId));
      const assets = await Promise.all(
        added.map((mediaId) =>
          tx.get(this.db.collection('nativeMediaAssets').doc(mediaId)),
        ),
      );
      if (
        assets.some(
          (asset) =>
            asset.get('status') !== 'ready' ||
            asset.get('purpose') !== 'life_update_image' ||
            asset.get('ownerUid') !== authorUid ||
            asset.get('attachedLifeUpdateId'),
        )
      )
        throw new NativeLifeUpdateError('INVALID');
      for (const asset of assets)
        tx.update(asset.ref, {
          attachedLifeUpdateId: id,
          unattachedExpiresAt: null,
          updatedAt: now,
        });
      for (const mediaId of removed)
        tx.update(this.db.collection('nativeMediaAssets').doc(mediaId), {
          attachedLifeUpdateId: null,
          unattachedExpiresAt: now,
          updatedAt: now,
        });
      tx.update(ref, { sections, mediaAssetIds: next, updatedAt: now });
      return removed;
    });
  }

  public async remove(
    id: string,
    authorUid: string,
    now = Date.now(),
  ): Promise<string[]> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.update(id);
      const snapshot = await tx.get(ref);
      if (
        snapshot.get('status') === 'deleted' &&
        snapshot.get('authorUid') === authorUid
      )
        return [];
      const view = await this.view(tx, snapshot, authorUid);
      if (view.authorUid !== authorUid)
        throw new NativeLifeUpdateError('UNAVAILABLE');
      const deliveries = await Promise.all(
        (snapshot.get('boxIds') as string[]).map(async (boxId) => {
          const delivery = await tx.get(this.delivery(id, boxId));
          const post = delivery.exists
            ? await tx.get(
                this.db
                  .collection('nativeBoxes')
                  .doc(boxId)
                  .collection('posts')
                  .doc(delivery.get('postId') as string),
              )
            : null;
          return { boxId, delivery, post };
        }),
      );
      tx.update(ref, { status: 'deleted', sections: {}, updatedAt: now });
      for (const mediaId of view.mediaAssetIds)
        tx.update(this.db.collection('nativeMediaAssets').doc(mediaId), {
          attachedLifeUpdateId: null,
          unattachedExpiresAt: now,
          updatedAt: now,
        });
      for (const { delivery, post } of deliveries) {
        if (delivery.exists) tx.update(delivery.ref, { status: 'deleted' });
        if (post?.exists) {
          tx.update(post.ref, { status: 'deleted', text: '', updatedAt: now });
          tx.delete(this.db.collection('nativePostPointers').doc(post.id));
          tx.create(
            this.db.collection('nativeJobs').doc(`feed-unpublish-${post.id}`),
            {
              type: 'feed',
              mode: 'unpublish',
              boxId: post.get('boxId'),
              postId: post.id,
              kind: 'life_update',
              contentId: id,
              cursor: null,
              status: 'pending',
              createdAt: now,
              updatedAt: now,
            },
          );
          tx.set(
            this.db
              .collection('nativeJobs')
              .doc(`media-post-cleanup-${post.id}`),
            {
              type: 'mediaPostCleanup',
              boxId: post.get('boxId'),
              postId: post.id,
              status: 'pending',
              createdAt: now,
              updatedAt: now,
            },
            { merge: true },
          );
        }
      }
      return view.mediaAssetIds;
    });
  }
}
