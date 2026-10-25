import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

const PAGE_SIZE = 25;
type Phase =
  | 'blockers'
  | 'derived_refs'
  | 'deliveries'
  | 'reports'
  | 'invitations'
  | 'members'
  | 'post_pointers'
  | 'tree'
  | 'complete';

export class NativeBoxDeletionError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'INVALID' | 'DEPENDENCY_PENDING',
  ) {
    super(code);
  }
}

export interface NativeBoxDeletionStatus {
  boxId: string;
  generation: string;
  phase: Phase;
  updatedAt: number;
}

export interface NativeBoxDeletionRepairResult {
  boxId: string;
  phase: Phase;
  blocked: boolean;
}

export type DeletePrivateObject = (path: string) => Promise<void>;

/**
 * Local v1 Box erasure. All reader and writer services must reject `deleting`
 * Boxes. Media objects are retired before their metadata and derived pointers.
 * and Life Update deliveries are detached in bounded, repeatable steps.
 */
export class NativeBoxDeletion {
  public constructor(
    private readonly db: Firestore,
    private readonly deletePrivateObject?: DeletePrivateObject,
    private readonly retireMediaAsset?: (id: string) => Promise<void>,
  ) {}

  private job(boxId: string) {
    return this.db.collection('nativeJobs').doc(`box-delete-${boxId}`);
  }

  public async start(
    boxId: string,
    ownerUid: string,
    confirmName: string,
    now = Date.now(),
  ): Promise<string> {
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const jobRef = this.job(boxId);
    await this.db.runTransaction(async (tx) => {
      const [box, owner, account, job] = await Promise.all([
        tx.get(boxRef),
        tx.get(boxRef.collection('members').doc(ownerUid)),
        tx.get(this.db.collection('nativeAccounts').doc(ownerUid)),
        tx.get(jobRef),
      ]);
      if (
        !box.exists ||
        box.get('ownerUid') !== ownerUid ||
        owner.get('status') !== 'active' ||
        owner.get('role') !== 'owner' ||
        account.get('status') !== 'active'
      )
        throw new NativeBoxDeletionError('UNAVAILABLE');
      if (box.get('name') !== confirmName)
        throw new NativeBoxDeletionError('INVALID');
      if (
        box.get('status') === 'deleting' &&
        job.exists &&
        job.get('ownerUid') === ownerUid
      )
        return;
      if (
        !['active', 'archived'].includes(box.get('status') as string) ||
        job.exists
      )
        throw new NativeBoxDeletionError('UNAVAILABLE');
      tx.update(boxRef, {
        status: 'deleting',
        version: (box.get('version') as number) + 1,
      });
      tx.create(jobRef, {
        type: 'boxDeletion',
        boxId,
        ownerUid,
        generation: randomUUID(),
        phase: 'blockers',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    });
    return jobRef.id;
  }

  public async status(
    boxId: string,
    ownerUid: string,
  ): Promise<NativeBoxDeletionStatus> {
    const [job, account] = await Promise.all([
      this.job(boxId).get(),
      this.db.collection('nativeAccounts').doc(ownerUid).get(),
    ]);
    if (
      !job.exists ||
      job.get('ownerUid') !== ownerUid ||
      account.get('status') !== 'active'
    )
      throw new NativeBoxDeletionError('UNAVAILABLE');
    return {
      boxId,
      generation: job.get('generation') as string,
      phase: job.get('phase') as Phase,
      updatedAt: job.get('updatedAt') as number,
    };
  }

  private async advance(
    jobRef: DocumentReference,
    phase: Phase,
    next: Phase,
    now: number,
  ): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const job = await tx.get(jobRef);
      if (job.get('phase') !== phase || job.get('status') !== 'pending') return;
      tx.update(jobRef, {
        phase: next,
        updatedAt: now,
        ...(next === 'complete'
          ? { status: 'complete', completedAt: now }
          : {}),
      });
    });
  }

  private async retireMedia(boxId: string): Promise<number> {
    const media = await this.db
      .collection('nativeMediaAssets')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (media.empty) return 0;
    if (!this.deletePrivateObject)
      throw new NativeBoxDeletionError('DEPENDENCY_PENDING');
    await Promise.all(
      media.docs.map((asset) => this.retireAsset(boxId, asset)),
    );
    return media.size;
  }

  private async retireAsset(
    boxId: string,
    asset: QueryDocumentSnapshot,
  ): Promise<void> {
    const retire = this.deletePrivateObject;
    if (!retire) throw new NativeBoxDeletionError('DEPENDENCY_PENDING');
    if (this.retireMediaAsset && asset.get('lifecycleEpoch') !== undefined) {
      await this.retireMediaAsset(asset.id);
      await asset.ref.delete();
      return;
    }
    const paths: unknown = asset.get('objectPaths');
    if (
      !Array.isArray(paths) ||
      paths.length > 20 ||
      !paths.every(
        (path) =>
          typeof path === 'string' &&
          path.startsWith(`private/boxes/${boxId}/`) &&
          !path.includes('..'),
      )
    )
      throw new NativeBoxDeletionError('DEPENDENCY_PENDING');
    await Promise.all(paths.map((path: string) => retire(path)));
    await asset.ref.delete();
  }

  /** Feed and notification pointers carry Box IDs, never private content. */
  // eslint-disable-next-line complexity -- Each bounded derived collection must drain before the Box tree is removed.
  private async deleteDerivedRefs(boxId: string): Promise<number> {
    const lifeRefs = await this.db
      .collectionGroup('items')
      .where('boxIds', 'array-contains', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (!lifeRefs.empty) {
      const batch = this.db.batch();
      for (const item of lifeRefs.docs) {
        if (item.ref.parent.parent?.parent.id !== 'nativeFeedRefs')
          throw new NativeBoxDeletionError('DEPENDENCY_PENDING');
        const boxes = item.get('boxIds') as string[];
        if (boxes.length <= 1) batch.delete(item.ref);
        else
          batch.update(item.ref, {
            boxIds: boxes.filter((id) => id !== boxId),
          });
      }
      await batch.commit();
      return lifeRefs.size;
    }
    const page = await this.db
      .collectionGroup('items')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (page.empty) {
      const activity = await this.db
        .collection('nativeActivity')
        .where('boxId', '==', boxId)
        .limit(PAGE_SIZE)
        .get();
      if (!activity.empty) {
        const batch = this.db.batch();
        for (const item of activity.docs) batch.delete(item.ref);
        await batch.commit();
        return activity.size;
      }
      const notices = await this.db
        .collection('nativeModerationNotices')
        .where('boxId', '==', boxId)
        .limit(PAGE_SIZE)
        .get();
      if (notices.empty) return 0;
      const batch = this.db.batch();
      for (const item of notices.docs) batch.delete(item.ref);
      await batch.commit();
      return notices.size;
    }
    for (const item of page.docs) {
      const root = item.ref.parent.parent?.parent.id;
      if (root !== 'nativeFeedRefs' && root !== 'nativeNotifications')
        throw new NativeBoxDeletionError('DEPENDENCY_PENDING');
    }
    const batch = this.db.batch();
    for (const item of page.docs) batch.delete(item.ref);
    const affected = new Set(
      page.docs
        .filter(
          (item) => item.ref.parent.parent?.parent.id === 'nativeNotifications',
        )
        .map((item) => item.ref.parent.parent!.id),
    );
    for (const uid of affected)
      batch.set(
        this.db.collection('nativeUserHints').doc(uid),
        {
          schemaVersion: 1,
          version: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    await batch.commit();
    return page.size;
  }

  /** A deleted Box removes one delivery, not an update still sent elsewhere. */
  private async detachDeliveries(boxId: string, now: number): Promise<number> {
    const page = await this.db
      .collection('nativeLifeUpdateDeliveries')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const delivery = await tx.get(candidate.ref);
          if (!delivery.exists || delivery.get('boxId') !== boxId) return;
          const updateId = delivery.get('lifeUpdateId') as string | undefined;
          if (!updateId) {
            tx.delete(candidate.ref);
            return;
          }
          const updateRef = this.db
            .collection('nativeLifeUpdates')
            .doc(updateId);
          const update = await tx.get(updateRef);
          const otherIds = update.exists
            ? (update.get('boxIds') as string[]).filter((id) => id !== boxId)
            : [];
          const others = await Promise.all(
            otherIds.map((id) =>
              tx.get(
                this.db
                  .collection('nativeLifeUpdateDeliveries')
                  .doc(`${update.id}_${id}`),
              ),
            ),
          );
          if (
            update.exists &&
            update.get('status') === 'active' &&
            !others.some((other) => other.get('status') === 'active')
          ) {
            tx.update(updateRef, {
              status: 'deleted',
              sections: {},
              updatedAt: now,
            });
          }
          tx.delete(candidate.ref);
        }),
      ),
    );
    return page.size;
  }

  private async closeReports(boxId: string, now: number): Promise<number> {
    const page = await this.db
      .collection('nativeReports')
      .where('boxId', '==', boxId)
      .where('status', '==', 'open')
      .limit(PAGE_SIZE)
      .get();
    await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const report = await tx.get(candidate.ref);
          if (report.get('boxId') !== boxId || report.get('status') !== 'open')
            return;
          tx.update(candidate.ref, {
            status: 'closed',
            closedAt: now,
            action: 'box_deleted',
            retentionStatus: 'pending',
          });
          tx.create(this.db.collection('nativeModerationAudit').doc(), {
            reportId: candidate.id,
            boxId,
            postId: report.get('postId'),
            staffUid: null,
            action: 'box_deleted',
            createdAt: now,
          });
        }),
      ),
    );
    return page.size;
  }

  private async deleteInvitations(boxId: string): Promise<number> {
    const page = await this.db
      .collection('nativeBoxInvitations')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (page.empty) return 0;
    const batch = this.db.batch();
    for (const item of page.docs) batch.delete(item.ref);
    await batch.commit();
    return page.size;
  }

  private async deleteMembersAndHints(boxId: string): Promise<number> {
    const page = await this.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .limit(PAGE_SIZE)
      .get();
    if (page.empty) return 0;
    const batch = this.db.batch();
    for (const member of page.docs) {
      batch.delete(
        this.db
          .collection('nativeAccounts')
          .doc(member.id)
          .collection('boxRefs')
          .doc(boxId),
      );
      batch.delete(member.ref);
    }
    await batch.commit();
    return page.size;
  }

  private async deletePostPointers(boxId: string): Promise<number> {
    const page = await this.db
      .collection('nativePostPointers')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (page.empty) return 0;
    const batch = this.db.batch();
    for (const pointer of page.docs) batch.delete(pointer.ref);
    await batch.commit();
    return page.size;
  }

  private async processPostPointers(
    jobRef: DocumentReference,
    boxId: string,
    now: number,
  ): Promise<void> {
    if ((await this.deletePostPointers(boxId)) !== 0) return;
    const comments = await this.db
      .collection('nativeCommentPointers')
      .where('boxId', '==', boxId)
      .limit(PAGE_SIZE)
      .get();
    if (!comments.empty) {
      const batch = this.db.batch();
      for (const pointer of comments.docs) batch.delete(pointer.ref);
      await batch.commit();
      return;
    }
    await this.advance(jobRef, 'post_pointers', 'tree', now);
  }

  /** Run one bounded logical step. Safe to repeat after a process crash. */
  public async processOnce(boxId: string, now = Date.now()): Promise<Phase> {
    const jobRef = this.job(boxId);
    const job = await jobRef.get();
    if (
      !job.exists ||
      job.get('type') !== 'boxDeletion' ||
      job.get('boxId') !== boxId
    )
      throw new NativeBoxDeletionError('UNAVAILABLE');
    const phase = job.get('phase') as Phase;
    if (phase === 'complete') return phase;
    await this.processStep(jobRef, phase, boxId, now);
    return (await jobRef.get()).get('phase') as Phase;
  }

  private async processStep(
    jobRef: DocumentReference,
    phase: Phase,
    boxId: string,
    now: number,
  ): Promise<void> {
    if (phase === 'blockers') {
      if ((await this.retireMedia(boxId)) === 0)
        await this.advance(jobRef, phase, 'derived_refs', now);
    } else if (phase === 'derived_refs') {
      if ((await this.deleteDerivedRefs(boxId)) === 0)
        await this.advance(jobRef, phase, 'deliveries', now);
    } else if (phase === 'deliveries') {
      if ((await this.detachDeliveries(boxId, now)) === 0)
        await this.advance(jobRef, phase, 'reports', now);
    } else if (phase === 'reports') {
      if ((await this.closeReports(boxId, now)) === 0)
        await this.advance(jobRef, phase, 'invitations', now);
    } else if (phase === 'invitations') {
      if ((await this.deleteInvitations(boxId)) === 0)
        await this.advance(jobRef, phase, 'members', now);
    } else if (phase === 'members') {
      if ((await this.deleteMembersAndHints(boxId)) === 0)
        await this.advance(jobRef, phase, 'post_pointers', now);
    } else if (phase === 'post_pointers') {
      await this.processPostPointers(jobRef, boxId, now);
    } else if (phase === 'tree') {
      await this.db.recursiveDelete(
        this.db.collection('nativeBoxes').doc(boxId),
      );
      await this.advance(jobRef, phase, 'complete', now);
    } else {
      throw new NativeBoxDeletionError('UNAVAILABLE');
    }
  }

  /** Bounded repair pass for a task function or local maintenance runner. */
  public async repairPending(
    now = Date.now(),
    limit = 10,
  ): Promise<NativeBoxDeletionRepairResult[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25)
      throw new NativeBoxDeletionError('INVALID');
    const page = await this.db
      .collection('nativeJobs')
      .where('type', '==', 'boxDeletion')
      .where('status', '==', 'pending')
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .get();
    return Promise.all(
      page.docs.map(async (job) => {
        const boxId = job.get('boxId') as string;
        try {
          return {
            boxId,
            phase: await this.processOnce(boxId, now),
            blocked: false,
          };
        } catch (error) {
          if (
            !(error instanceof NativeBoxDeletionError) ||
            error.code !== 'DEPENDENCY_PENDING'
          )
            throw error;
          await this.db.runTransaction(async (tx) => {
            const current = await tx.get(job.ref);
            if (current.get('status') === 'pending')
              tx.update(job.ref, { updatedAt: now });
          });
          return {
            boxId,
            phase: (await job.ref.get()).get('phase') as Phase,
            blocked: true,
          };
        }
      }),
    );
  }
}
