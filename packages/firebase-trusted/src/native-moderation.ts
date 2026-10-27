import { createHash, randomUUID } from 'node:crypto';
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
import { nativeBlockPairId } from './native-box-invitations.js';
import {
  applyIndexWrite,
  planIndexWrite,
  type IndexWrite,
} from './native-interaction-index.js';
import { NativeBoxPosts, NativePostError } from './native-box-posts.js';
import { NativeBoxes, NativeBoxError } from './native-boxes.js';
import {
  createReportSchema,
  moderationActionSchema,
  type CreateReportInput,
  type ModerationActionInput,
} from '@paldora/validation';

/** Index change for a comment hide (-1) or restore (+1); no-op without a trusted index. */
function commentIndexWrite(
  post: DocumentSnapshot | null,
  authorUid: unknown,
  delta: 1 | -1,
): IndexWrite {
  if (!post?.exists || typeof authorUid !== 'string') return { kind: 'none' };
  return planIndexWrite(post.get('interactionIndex'), {
    type: 'comment',
    uid: authorUid,
    delta,
  });
}

type CaseKind = CreateReportInput['targetKind'];
type CaseStatus = 'open' | 'closed';
export interface NativeCase {
  id: string;
  targetKind: CaseKind;
  targetId: string;
  category: CreateReportInput['category'];
  detail: string | null;
  reporterUid: string | null;
  status: CaseStatus;
  createdAt: number;
  closedAt: number | null;
  boxId: string | null;
  postId: string | null;
}

function deterministicReportId(
  uid: string,
  kind: string,
  targetId: string,
): string {
  const hex = createHash('sha256')
    .update(`${uid}:${kind}:${targetId}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const OPERATOR_LABEL = /^[a-z0-9._-]{1,40}$/;

export class NativeModerationError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'INVALID',
  ) {
    super(code);
  }
}

export interface NativeReport {
  id: string;
  boxId: string;
  postId: string;
  reporterUid: string;
  reason: string;
  createdAt: number;
  status: 'open';
}

/** Report decisions close canonical reads and leave durable media cleanup. */
export class NativeModeration {
  public constructor(private readonly db: Firestore) {}

  private case(snapshot: FirebaseFirestore.DocumentSnapshot): NativeCase {
    if (!snapshot.exists) throw new NativeModerationError('UNAVAILABLE');
    return {
      id: snapshot.id,
      targetKind:
        (snapshot.get('targetKind') as CaseKind | undefined) ?? 'post',
      targetId:
        (snapshot.get('targetId') as string | undefined) ??
        (snapshot.get('postId') as string),
      category:
        (snapshot.get('category') as
          CreateReportInput['category'] | undefined) ?? 'other',
      detail:
        (snapshot.get('detail') as string | null | undefined) ??
        (snapshot.get('reason') as string | null | undefined) ??
        null,
      reporterUid:
        (snapshot.get('reporterUid') as string | null | undefined) ?? null,
      status: snapshot.get('status') as CaseStatus,
      createdAt: snapshot.get('createdAt') as number,
      closedAt: (snapshot.get('closedAt') as number | null | undefined) ?? null,
      boxId: (snapshot.get('boxId') as string | null | undefined) ?? null,
      postId: (snapshot.get('postId') as string | null | undefined) ?? null,
    };
  }

  /** Reports use a deterministic ID, making repeat submissions idempotent. */
  // eslint-disable-next-line complexity -- Target-specific visibility checks converge on one receipt transaction.
  public async createReport(
    uid: string,
    input: CreateReportInput,
    now = Date.now(),
  ): Promise<NativeCase> {
    if (!createReportSchema.safeParse(input).success)
      throw new NativeModerationError('INVALID');
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeModerationError('UNAVAILABLE');
    let boxId: string | null = null;
    let postId: string | null = null;
    const posts = new NativeBoxPosts(this.db);
    try {
      if (input.targetKind === 'user') {
        if (input.targetId === uid)
          throw new NativeModerationError('UNAVAILABLE');
        const [target, pair] = await Promise.all([
          this.db.collection('nativeAccounts').doc(input.targetId).get(),
          this.db
            .collection('nativeBlockPairs')
            .doc(nativeBlockPairId(uid, input.targetId))
            .get(),
        ]);
        if (
          target.get('status') !== 'active' ||
          !target.get('username') ||
          ((pair.get('blockedBy') as string[] | undefined)?.length ?? 0) > 0
        )
          throw new NativeModerationError('UNAVAILABLE');
      } else if (input.targetKind === 'box') {
        await new NativeBoxes(this.db).get(input.targetId, uid);
        boxId = input.targetId;
      } else if (input.targetKind === 'post') {
        const resolved = await posts.resolve(input.targetId, uid);
        if (resolved.kind !== 'post')
          throw new NativeModerationError('UNAVAILABLE');
        boxId = resolved.post.boxId;
        postId = input.targetId;
      } else {
        const pointer = await this.db
          .collection('nativeCommentPointers')
          .doc(input.targetId)
          .get();
        if (!pointer.exists) throw new NativeModerationError('UNAVAILABLE');
        boxId = pointer.get('boxId') as string;
        postId = pointer.get('postId') as string;
        await posts.commentDetail(boxId, postId, input.targetId, uid);
      }
    } catch (error) {
      if (
        error instanceof NativePostError ||
        error instanceof NativeBoxError ||
        error instanceof NativeModerationError
      )
        throw new NativeModerationError('UNAVAILABLE');
      throw error;
    }
    const ref = this.db
      .collection('nativeReports')
      .doc(deterministicReportId(uid, input.targetKind, input.targetId));
    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return;
      const current = await tx.get(
        this.db.collection('nativeAccounts').doc(uid),
      );
      if (current.get('status') !== 'active')
        throw new NativeModerationError('UNAVAILABLE');
      tx.create(ref, {
        schemaVersion: 1,
        reporterUid: uid,
        targetKind: input.targetKind,
        targetId: input.targetId,
        boxId,
        postId,
        category: input.category,
        detail: input.detail,
        status: 'open',
        createdAt: now,
        closedAt: null,
        retentionStatus: 'pending',
      });
    });
    return this.case(await ref.get());
  }

  public async myReports(uid: string, cursor?: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new NativeModerationError('INVALID');
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeModerationError('UNAVAILABLE');
    let query = this.db
      .collection('nativeReports')
      .where('reporterUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(limit);
    if (cursor) {
      const start = await this.db.collection('nativeReports').doc(cursor).get();
      if (!start.exists || start.get('reporterUid') !== uid)
        throw new NativeModerationError('INVALID');
      query = query.startAfter(start);
    }
    const page = await query.get();
    return {
      items: page.docs.map((row) => this.case(row)),
      nextCursor:
        page.size === limit ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async cases(
    staffUid: string,
    status: CaseStatus,
    cursor?: string,
    limit = 25,
  ) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !['open', 'closed'].includes(status)
    )
      throw new NativeModerationError('INVALID');
    await this.db.runTransaction((tx) => this.staff(tx, staffUid));
    let query = this.db
      .collection('nativeReports')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(limit);
    if (cursor) {
      const start = await this.db.collection('nativeReports').doc(cursor).get();
      if (!start.exists || start.get('status') !== status)
        throw new NativeModerationError('INVALID');
      query = query.startAfter(start);
    }
    const page = await query.get();
    await this.db.runTransaction((tx) => this.staff(tx, staffUid));
    return {
      items: page.docs.map((row) => this.case(row)),
      nextCursor:
        page.size === limit ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async getCase(staffUid: string, id: string): Promise<NativeCase> {
    return this.db.runTransaction(async (tx) => {
      await this.staff(tx, staffUid);
      const ref = this.db.collection('nativeReports').doc(id);
      const report = await tx.get(ref);
      if (!report.exists) throw new NativeModerationError('UNAVAILABLE');
      tx.create(this.db.collection('nativeModerationAudit').doc(), {
        reportId: id,
        staffUid,
        action: 'case_opened',
        createdAt: Date.now(),
      });
      return this.case(report);
    });
  }

  /** Commit the read closure and audit before destructive media work. */
  public async actOnCase(
    staffUid: string,
    id: string,
    input: ModerationActionInput,
    now = Date.now(),
  ) {
    if (!moderationActionSchema.safeParse(input).success)
      throw new NativeModerationError('INVALID');
    // eslint-disable-next-line complexity -- One audit transaction enforces all case-action preconditions.
    return this.db.runTransaction(async (tx) => {
      await this.staff(tx, staffUid);
      const reportRef = this.db.collection('nativeReports').doc(id);
      const auditRef = this.db
        .collection('nativeModerationAudit')
        .doc(input.idempotencyKey);
      const [report, prior] = await Promise.all([
        tx.get(reportRef),
        tx.get(auditRef),
      ]);
      if (!report.exists) throw new NativeModerationError('UNAVAILABLE');
      const row = this.case(report);
      if (prior.exists) {
        if (
          prior.get('reportId') !== id ||
          prior.get('staffUid') !== staffUid ||
          prior.get('action') !== input.action
        )
          throw new NativeModerationError('INVALID');
        return {
          action: input.action,
          boxId: row.boxId,
          postId: row.postId,
          targetUid: row.targetKind === 'user' ? row.targetId : null,
        };
      }
      if (input.action === 'close') {
        if (row.status !== 'open') throw new NativeModerationError('INVALID');
      } else if (input.action === 'suspend' || input.action === 'unsuspend') {
        if (
          row.targetKind !== 'user' ||
          row.targetId === staffUid ||
          (input.action === 'suspend' && row.status !== 'open')
        )
          throw new NativeModerationError('INVALID');
        const targetRef = this.db
          .collection('nativeAccounts')
          .doc(row.targetId);
        const target = await tx.get(targetRef);
        const expected = input.action === 'suspend' ? 'active' : 'suspended';
        if (target.get('status') !== expected)
          throw new NativeModerationError('INVALID');
        tx.update(targetRef, {
          status: input.action === 'suspend' ? 'suspended' : 'active',
        });
      } else {
        if (
          !['post', 'comment'].includes(row.targetKind) ||
          !row.boxId ||
          !row.postId ||
          (input.action === 'hide' && row.status !== 'open')
        )
          throw new NativeModerationError('INVALID');
        const postRef = this.db
          .collection('nativeBoxes')
          .doc(row.boxId)
          .collection('posts')
          .doc(row.postId);
        const targetRef =
          row.targetKind === 'comment'
            ? postRef.collection('comments').doc(row.targetId)
            : postRef;
        const [target, postSnap] = await Promise.all([
          tx.get(targetRef),
          row.targetKind === 'comment'
            ? tx.get(postRef)
            : Promise.resolve(null),
        ]);
        if (
          !target.exists ||
          target.get('status') !== 'active' ||
          target.get('moderationHidden') !== (input.action === 'restore')
        )
          throw new NativeModerationError('INVALID');
        const indexWrite = commentIndexWrite(
          postSnap,
          target.get('authorUid'),
          input.action === 'hide' ? -1 : 1,
        );
        tx.update(targetRef, {
          moderationHidden: input.action === 'hide',
          updatedAt: now,
        });
        if (postSnap) applyIndexWrite(tx, postRef, indexWrite);
        if (input.action === 'hide' && row.targetKind === 'post') {
          tx.set(
            this.db
              .collection('nativeJobs')
              .doc(`media-post-cleanup-${row.postId}`),
            {
              type: 'mediaPostCleanup',
              boxId: row.boxId,
              postId: row.postId,
              status: 'pending',
              createdAt: now,
              updatedAt: now,
            },
            { merge: true },
          );
        }
        if (input.action === 'hide') {
          tx.create(
            this.db.collection('nativeModerationNotices').doc(row.targetId),
            {
              schemaVersion: 1,
              ownerUid: target.get('authorUid'),
              targetKind: row.targetKind,
              targetId: row.targetId,
              boxId: row.boxId,
              postId: row.postId,
              originalCreatedAt: target.get('createdAt'),
              createdAt: now,
            },
          );
        } else
          tx.delete(
            this.db.collection('nativeModerationNotices').doc(row.targetId),
          );
      }
      if (row.status === 'open')
        tx.update(reportRef, {
          status: 'closed',
          closedAt: now,
          action: input.action,
          retentionStatus: 'pending',
        });
      tx.create(auditRef, {
        reportId: id,
        staffUid,
        action: input.action,
        reason: input.reason,
        createdAt: now,
      });
      return {
        action: input.action,
        boxId: row.boxId,
        postId: row.postId,
        targetUid: row.targetKind === 'user' ? row.targetId : null,
      };
    });
  }

  public async notices(uid: string) {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeModerationError('UNAVAILABLE');
    const page = await this.db
      .collection('nativeModerationNotices')
      .where('ownerUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const visible = await Promise.all(
      page.docs.map(async (row) => {
        const boxId = row.get('boxId') as string | undefined;
        const postId = row.get('postId') as string | undefined;
        if (!boxId || !postId) return null;
        const postRef = this.db
          .collection('nativeBoxes')
          .doc(boxId)
          .collection('posts')
          .doc(postId);
        const targetRef =
          row.get('targetKind') === 'comment'
            ? postRef.collection('comments').doc(row.id)
            : postRef;
        const [box, target] = await Promise.all([
          this.db.collection('nativeBoxes').doc(boxId).get(),
          targetRef.get(),
        ]);
        if (
          !['active', 'archived'].includes(box.get('status') as string) ||
          target.get('status') !== 'active' ||
          target.get('moderationHidden') !== true ||
          target.get('authorUid') !== uid
        )
          return null;
        return {
          targetKind: row.get('targetKind') as 'post' | 'comment',
          targetId: row.id,
          originalCreatedAt: row.get('originalCreatedAt') as number,
        };
      }),
    );
    return visible.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
  }

  public async account(staffUid: string, targetUid: string) {
    await this.db.runTransaction(async (tx) => {
      await this.staff(tx, staffUid);
      const grant = await tx.get(
        this.db.collection('nativeStaffGrants').doc(staffUid),
      );
      if (grant.get('role') !== 'administrator')
        throw new NativeModerationError('FORBIDDEN');
      tx.create(this.db.collection('nativeModerationAudit').doc(), {
        staffUid,
        targetUid,
        action: 'account.lookup',
        createdAt: Date.now(),
      });
    });
    const target = await this.db
      .collection('nativeAccounts')
      .doc(targetUid)
      .get();
    if (!target.exists) throw new NativeModerationError('UNAVAILABLE');
    return {
      id: targetUid,
      username: (target.get('username') as string | null | undefined) ?? null,
      status: target.get('status') as 'active' | 'suspended' | 'deleted',
    };
  }

  public async grantStaff(
    operator: string,
    targetUid: string,
    role: 'moderator' | 'administrator',
    options: { breakGlass?: boolean } = {},
  ): Promise<void> {
    if (
      !OPERATOR_LABEL.test(operator) ||
      !['moderator', 'administrator'].includes(role)
    )
      throw new NativeModerationError('INVALID');
    await this.db.runTransaction(async (tx) => {
      const grantRef = this.db.collection('nativeStaffGrants').doc(targetUid);
      const [account, grant] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(targetUid)),
        tx.get(grantRef),
      ]);
      if (!account.exists || account.get('status') !== 'active')
        throw new NativeModerationError('UNAVAILABLE');
      const now = Date.now();
      tx.create(this.db.collection('nativeModerationAudit').doc(), {
        action: 'staff.grant',
        operator,
        staffUid: null,
        targetUid,
        role,
        previousStatus: (grant.get('status') as string | undefined) ?? null,
        previousRole: (grant.get('role') as string | undefined) ?? null,
        ...(options.breakGlass === true ? { breakGlass: true } : {}),
        createdAt: now,
      });
      tx.set(grantRef, {
        status: 'active',
        role,
        createdAt: (grant.get('createdAt') as number | undefined) ?? now,
        updatedAt: now,
      });
    });
  }

  public async revokeStaff(operator: string, targetUid: string): Promise<void> {
    if (!OPERATOR_LABEL.test(operator))
      throw new NativeModerationError('INVALID');
    await this.db.runTransaction(async (tx) => {
      const grantRef = this.db.collection('nativeStaffGrants').doc(targetUid);
      const grant = await tx.get(grantRef);
      if (!grant.exists) throw new NativeModerationError('UNAVAILABLE');
      const now = Date.now();
      tx.create(this.db.collection('nativeModerationAudit').doc(), {
        action: 'staff.revoke',
        operator,
        staffUid: null,
        targetUid,
        role: (grant.get('role') as string | undefined) ?? null,
        previousStatus: (grant.get('status') as string | undefined) ?? null,
        previousRole: (grant.get('role') as string | undefined) ?? null,
        createdAt: now,
      });
      tx.update(grantRef, { status: 'revoked', updatedAt: now });
    });
  }

  private async staff(
    tx: FirebaseFirestore.Transaction,
    uid: string,
  ): Promise<void> {
    const [account, grant] = await Promise.all([
      tx.get(this.db.collection('nativeAccounts').doc(uid)),
      tx.get(this.db.collection('nativeStaffGrants').doc(uid)),
    ]);
    if (
      !account.exists ||
      account.get('status') !== 'active' ||
      !grant.exists ||
      grant.get('status') !== 'active'
    )
      throw new NativeModerationError('FORBIDDEN');
  }

  public async reportPost(
    boxId: string,
    postId: string,
    reporterUid: string,
    reason: string,
    now = Date.now(),
  ): Promise<string> {
    const body = reason.trim();
    if (!body || body.length > 2_000)
      throw new NativeModerationError('INVALID');
    const id = randomUUID();
    await this.db.runTransaction(async (tx) => {
      const boxRef = this.db.collection('nativeBoxes').doc(boxId);
      const [account, box, member, post] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(reporterUid)),
        tx.get(boxRef),
        tx.get(boxRef.collection('members').doc(reporterUid)),
        tx.get(boxRef.collection('posts').doc(postId)),
      ]);
      if (
        !account.exists ||
        account.get('status') !== 'active' ||
        !box.exists ||
        !['active', 'archived'].includes(box.get('status') as string) ||
        !member.exists ||
        member.get('status') !== 'active' ||
        !post.exists ||
        post.get('status') !== 'active' ||
        post.get('moderationHidden') !== false
      )
        throw new NativeModerationError('UNAVAILABLE');
      const authorUid = post.get('authorUid') as string;
      const [author, pair] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(authorUid)),
        tx.get(
          this.db
            .collection('nativeBlockPairs')
            .doc(nativeBlockPairId(reporterUid, authorUid)),
        ),
      ]);
      if (
        !author.exists ||
        author.get('status') !== 'active' ||
        (pair.exists && (pair.get('blockedBy') as string[] | undefined)?.length)
      )
        throw new NativeModerationError('UNAVAILABLE');
      tx.create(this.db.collection('nativeReports').doc(id), {
        schemaVersion: 1,
        boxId,
        postId,
        reporterUid,
        reason: body,
        createdAt: now,
        status: 'open',
        closedAt: null,
      });
    });
    return id;
  }

  public async listReports(
    staffUid: string,
    cursor?: string,
  ): Promise<{
    items: NativeReport[];
    nextCursor: string | null;
  }> {
    await this.db.runTransaction((tx) => this.staff(tx, staffUid));
    let query = this.db
      .collection('nativeReports')
      .where('status', '==', 'open')
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(20);
    if (cursor) {
      const cursorDoc = await this.db
        .collection('nativeReports')
        .doc(cursor)
        .get();
      if (!cursorDoc.exists || cursorDoc.get('status') !== 'open')
        throw new NativeModerationError('UNAVAILABLE');
      query = query.startAfter(cursorDoc);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          await this.staff(tx, staffUid);
          const report = await tx.get(candidate.ref);
          return report.exists && report.get('status') === 'open'
            ? {
                id: report.id,
                boxId: report.get('boxId') as string,
                postId: report.get('postId') as string,
                reporterUid: report.get('reporterUid') as string,
                reason: report.get('reason') as string,
                createdAt: report.get('createdAt') as number,
                status: 'open' as const,
              }
            : null;
        }),
      ),
    );
    return {
      items: items.filter((item): item is NativeReport => item !== null),
      nextCursor: page.size === 20 ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async hideReportedPost(
    reportId: string,
    staffUid: string,
    now = Date.now(),
  ): Promise<string> {
    return this.db.runTransaction(async (tx) => {
      await this.staff(tx, staffUid);
      const reportRef = this.db.collection('nativeReports').doc(reportId);
      const report = await tx.get(reportRef);
      if (!report.exists || report.get('status') !== 'open')
        throw new NativeModerationError('UNAVAILABLE');
      const boxId = report.get('boxId') as string;
      const postId = report.get('postId') as string;
      const postRef = this.db
        .collection('nativeBoxes')
        .doc(boxId)
        .collection('posts')
        .doc(postId);
      const post = await tx.get(postRef);
      if (!post.exists || post.get('status') !== 'active')
        throw new NativeModerationError('UNAVAILABLE');
      const auditRef = this.db.collection('nativeModerationAudit').doc();
      tx.update(postRef, { moderationHidden: true });
      tx.update(reportRef, {
        status: 'closed',
        closedAt: now,
        action: 'post_hidden',
        retentionStatus: 'pending',
      });
      tx.create(auditRef, {
        reportId,
        boxId,
        postId,
        staffUid,
        action: 'post_hidden',
        createdAt: now,
      });
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
      return postId;
    });
  }

  /** Trusted maintenance entry point; process at most 100 closed reports per run. */
  public async redactClosedReports(now = Date.now()): Promise<number> {
    const cutoff = now - NINETY_DAYS_MS;
    const page = await this.db
      .collection('nativeReports')
      .where('status', '==', 'closed')
      .where('retentionStatus', '==', 'pending')
      .where('closedAt', '<=', cutoff)
      .orderBy('closedAt', 'asc')
      .limit(100)
      .get();
    const changes = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const report = await tx.get(candidate.ref);
          if (
            !report.exists ||
            report.get('status') !== 'closed' ||
            report.get('retentionStatus') !== 'pending' ||
            report.get('closedAt') > cutoff
          )
            return false;
          tx.update(candidate.ref, {
            reporterUid: FieldValue.delete(),
            reason: FieldValue.delete(),
            detail: FieldValue.delete(),
            retentionStatus: 'redacted',
            redactedAt: now,
          });
          return true;
        }),
      ),
    );
    return changes.filter(Boolean).length;
  }
}
