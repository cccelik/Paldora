import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  comments,
  hiddenByBlock,
  mediaAssets,
  moderationAudit,
  postMedia,
  postReactions,
  posts,
  profiles,
  retireMediaAssets,
  staffGrants,
  storedObjectKeys,
  userReports,
  users,
  type DatabaseExecutor,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  CreateReportInput,
  ModerationActionInput,
} from '@paldora/validation';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, not } from 'drizzle-orm';
import type { ObjectStorage } from '@paldora/storage';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { boxNotFound } from '../boxes/box-errors.js';
import { InteractionPolicyService } from '../interactions/shared/interaction-policy.service.js';
import { commentNotFound } from '../interactions/shared/interaction-errors.js';
import { DATABASE, OBJECT_STORAGE } from '../platform/config/tokens.js';
import { defineError } from '../platform/http/api-error.js';
import {
  decodeCursor,
  cursorTimestamp,
  keysetWindow,
  pageOf,
  type PageQuery,
} from '../platform/pagination/pagination.js';
import { isReadable, loadPostContext } from '../posts/post-context.js';
import { postNotFound } from '../posts/post-errors.js';
import { userNotFound } from '../identity/user-directory.service.js';
import { RealtimeBus } from '../realtime/realtime-bus.js';

export const moderationForbidden = defineError(
  HttpStatus.FORBIDDEN,
  'MODERATION_FORBIDDEN',
  'Moderation access is unavailable.',
);
export const reportNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'REPORT_NOT_FOUND',
  'This case was not found.',
);
const actionUnavailable = defineError(
  HttpStatus.CONFLICT,
  'REPORT_ACTION_UNAVAILABLE',
  'This action is not available for the case.',
);

const receipt = (row: typeof userReports.$inferSelect) => ({
  id: row.id,
  targetKind: row.targetKind,
  targetId: row.targetId,
  category: row.category,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

async function changeAccount(
  tx: DatabaseExecutor,
  row: typeof userReports.$inferSelect,
  action: 'close' | 'suspend' | 'unsuspend',
  actorId: string,
): Promise<string | null> {
  if (action === 'close') return null;
  if (row.targetKind !== 'user' || row.targetId === actorId)
    throw actionUnavailable();
  const expected = action === 'suspend' ? 'active' : 'suspended';
  const next = action === 'suspend' ? 'suspended' : 'active';
  const [target] = await tx
    .update(users)
    .set({ status: next })
    .where(and(eq(users.id, row.targetId), eq(users.status, expected)))
    .returning({ id: users.id });
  if (!target) throw actionUnavailable();
  return target.id;
}

@Injectable()
export class ReportService {
  public constructor(
    @Inject(DATABASE) private readonly db: PaldoraDatabase,
    @Inject(BoxPolicyService) private readonly boxes: BoxPolicyService,
    @Inject(InteractionPolicyService)
    private readonly interactions: InteractionPolicyService,
    @Inject(RealtimeBus) private readonly realtime: RealtimeBus,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async changeContent(
    tx: DatabaseExecutor,
    row: typeof userReports.$inferSelect,
    action: 'hide' | 'restore',
  ): Promise<{ boxId: string; postId: string; commentId?: string }> {
    const expected = action !== 'hide';
    const next = action === 'hide';
    if (row.targetKind === 'comment') {
      const [changed] = await tx
        .update(comments)
        .set({ moderationHidden: next, updatedAt: new Date() })
        .where(
          and(
            eq(comments.id, row.targetId),
            eq(comments.status, 'active'),
            eq(comments.moderationHidden, expected),
          ),
        )
        .returning({ id: comments.id, postId: comments.postId });
      if (!changed) throw actionUnavailable();
      const [post] = await tx
        .select({ boxId: posts.boxId })
        .from(posts)
        .where(eq(posts.id, changed.postId))
        .limit(1);
      if (!post) throw actionUnavailable();
      return {
        boxId: post.boxId,
        postId: changed.postId,
        commentId: changed.id,
      };
    }
    if (row.targetKind !== 'post') throw actionUnavailable();
    const [changed] = await tx
      .update(posts)
      .set({ moderationHidden: next, updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, row.targetId),
          eq(posts.status, 'active'),
          eq(posts.moderationHidden, expected),
          eq(posts.kind, 'post'),
        ),
      )
      .returning({ id: posts.id, boxId: posts.boxId });
    if (!changed) throw actionUnavailable();
    if (action === 'restore')
      return { boxId: changed.boxId, postId: changed.id };
    const photoIds = await tx
      .select({ id: postMedia.mediaAssetId })
      .from(postMedia)
      .where(eq(postMedia.postId, row.targetId));
    const reactionIds = await tx
      .select({ id: postReactions.mediaAssetId })
      .from(postReactions)
      .where(eq(postReactions.postId, row.targetId));
    const ids = [
      ...photoIds.map(({ id }) => id),
      ...reactionIds.flatMap(({ id }) => (id === null ? [] : [id])),
    ];
    if (ids.length === 0) return { boxId: changed.boxId, postId: changed.id };
    const assets = await tx
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, [...new Set(ids)]))
      .for('update');
    // A successful takedown has already destroyed the bytes reachable by
    // previously issued signed URLs. The outbox remains the retry safeguard.
    await this.storage.delete(assets.flatMap(storedObjectKeys));
    await retireMediaAssets(tx, assets);
    return { boxId: changed.boxId, postId: changed.id };
  }

  private async assertTarget(viewerId: string, input: CreateReportInput) {
    switch (input.targetKind) {
      case 'user': {
        const [person] = await this.db
          .select({ id: users.id })
          .from(users)
          .innerJoin(profiles, eq(profiles.userId, users.id))
          .where(
            and(
              eq(users.id, input.targetId),
              eq(users.status, 'active'),
              isNotNull(profiles.username),
              not(hiddenByBlock(viewerId, users.id)),
            ),
          )
          .limit(1);
        if (!person || person.id === viewerId) throw userNotFound();
        return;
      }
      case 'box':
        await this.boxes.membership(viewerId, input.targetId);
        return;
      case 'post': {
        const context = await loadPostContext(
          this.db,
          viewerId,
          input.targetId,
        );
        if (!isReadable(context)) throw postNotFound();
        return;
      }
      case 'comment': {
        const context = await this.interactions.commentFor(
          this.db,
          viewerId,
          input.targetId,
        );
        if (context.comment.status !== 'active') throw commentNotFound();
        return;
      }
      default:
        throw boxNotFound();
    }
  }

  public async create(viewerId: string, input: CreateReportInput) {
    await this.assertTarget(viewerId, input);
    await this.db
      .insert(userReports)
      .values({
        reporterUserId: viewerId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        category: input.category,
        detail: input.detail,
      })
      .onConflictDoNothing();
    const [row] = await this.db
      .select()
      .from(userReports)
      .where(
        and(
          eq(userReports.reporterUserId, viewerId),
          eq(userReports.targetKind, input.targetKind),
          eq(userReports.targetId, input.targetId),
        ),
      )
      .limit(1);
    if (!row) throw reportNotFound();
    return receipt(row);
  }

  private async staff(
    userId: string,
    requiredRole?: 'administrator',
  ): Promise<void> {
    const [grant] = await this.db
      .select({ role: staffGrants.role })
      .from(staffGrants)
      .where(eq(staffGrants.userId, userId))
      .limit(1);
    if (!grant || (requiredRole && grant.role !== requiredRole))
      throw moderationForbidden();
  }

  public async account(actorId: string, accountId: string) {
    await this.staff(actorId, 'administrator');
    const [row] = await this.db
      .select({
        id: users.id,
        status: users.status,
        username: profiles.username,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, accountId))
      .limit(1);
    await this.db.insert(moderationAudit).values({
      actorUserId: actorId,
      subjectId: accountId,
      event: 'account.lookup',
      reason: 'Administrator exact-ID account lookup.',
      idempotencyKey: randomUUID(),
    });
    if (!row) throw userNotFound();
    return row;
  }

  public async mine(userId: string, query: PageQuery) {
    const keyset = keysetWindow(
      userReports.createdAt,
      userReports.id,
      decodeCursor(query.cursor),
      'desc',
    );
    const rows = await this.db
      .select({
        report: userReports,
        cursorAt: cursorTimestamp(userReports.createdAt),
      })
      .from(userReports)
      .where(and(eq(userReports.reporterUserId, userId), keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    return pageOf(
      rows,
      query.limit,
      ({ report, cursorAt }) => ({ at: cursorAt, id: report.id }),
      ({ report }) => receipt(report),
    );
  }

  public async queue(userId: string, query: PageQuery) {
    await this.staff(userId);
    const keyset = keysetWindow(
      userReports.createdAt,
      userReports.id,
      decodeCursor(query.cursor),
      'desc',
    );
    const rows = await this.db
      .select({
        report: userReports,
        cursorAt: cursorTimestamp(userReports.createdAt),
      })
      .from(userReports)
      .where(and(eq(userReports.status, 'open'), keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    return pageOf(
      rows,
      query.limit,
      ({ report, cursorAt }) => ({ at: cursorAt, id: report.id }),
      ({ report }) => receipt(report),
    );
  }

  public async case(userId: string, caseId: string) {
    await this.staff(userId);
    const [row] = await this.db
      .select()
      .from(userReports)
      .where(eq(userReports.id, caseId))
      .limit(1);
    if (!row) throw reportNotFound();
    await this.db.insert(moderationAudit).values({
      actorUserId: userId,
      subjectId: caseId,
      event: 'case.viewed',
      reason: 'Moderator opened this case for review.',
      idempotencyKey: randomUUID(),
    });
    return {
      ...receipt(row),
      detail: row.detail,
      reporterUserId: row.reporterUserId,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  }

  public async act(
    userId: string,
    caseId: string,
    input: ModerationActionInput,
  ) {
    await this.staff(userId);
    const event = {
      close: 'case.closed',
      suspend: 'account.suspended',
      unsuspend: 'account.unsuspended',
      hide: 'content.hidden',
      restore: 'content.restored',
    } as const;
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(userReports)
        .where(eq(userReports.id, caseId))
        .for('update')
        .limit(1);
      if (!row) throw reportNotFound();
      const [committed] = await tx
        .select()
        .from(moderationAudit)
        .where(eq(moderationAudit.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (committed) {
        if (
          committed.actorUserId !== userId ||
          committed.subjectId !== caseId ||
          committed.event !== event[input.action]
        )
          throw actionUnavailable();
        return { row, notify: null, boxEvent: null };
      }
      if (
        row.status !== 'open' &&
        input.action !== 'unsuspend' &&
        input.action !== 'restore'
      )
        throw actionUnavailable();
      let notify: string | null = null;
      let boxEvent: {
        boxId: string;
        postId: string;
        commentId?: string;
      } | null = null;
      if (input.action === 'hide' || input.action === 'restore')
        boxEvent = await this.changeContent(tx, row, input.action);
      else notify = await changeAccount(tx, row, input.action, userId);
      await tx.insert(moderationAudit).values({
        actorUserId: userId,
        subjectId: caseId,
        event: event[input.action],
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
      if (row.status === 'closed') return { row, notify, boxEvent };
      const [closed] = await tx
        .update(userReports)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(userReports.id, caseId))
        .returning();
      if (!closed) throw reportNotFound();
      return { row: closed, notify, boxEvent };
    });
    if (result.notify) await this.realtime.userEvent(result.notify, 'resync');
    if (result.boxEvent) {
      const type =
        input.action === 'hide'
          ? result.boxEvent.commentId
            ? 'comment.deleted'
            : 'post.deleted'
          : result.boxEvent.commentId
            ? 'comment.created'
            : 'post.created';
      await this.realtime.boxEvent(
        result.boxEvent.boxId,
        type,
        result.boxEvent,
      );
    }
    return {
      ...receipt(result.row),
      detail: result.row.detail,
      reporterUserId: result.row.reporterUserId,
      closedAt: result.row.closedAt?.toISOString() ?? null,
    };
  }
}
