import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  hiddenByBlock,
  moderationAudit,
  profiles,
  staffGrants,
  userReports,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { CreateReportInput } from '@paldora/validation';
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, not } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { boxNotFound } from '../boxes/box-errors.js';
import { InteractionPolicyService } from '../interactions/shared/interaction-policy.service.js';
import { commentNotFound } from '../interactions/shared/interaction-errors.js';
import { DATABASE } from '../platform/config/tokens.js';
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

const receipt = (row: typeof userReports.$inferSelect) => ({
  id: row.id,
  targetKind: row.targetKind,
  targetId: row.targetId,
  category: row.category,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class ReportService {
  public constructor(
    @Inject(DATABASE) private readonly db: PaldoraDatabase,
    @Inject(BoxPolicyService) private readonly boxes: BoxPolicyService,
    @Inject(InteractionPolicyService)
    private readonly interactions: InteractionPolicyService,
  ) {}

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

  private async staff(userId: string): Promise<void> {
    const [grant] = await this.db
      .select({ userId: staffGrants.userId })
      .from(staffGrants)
      .where(eq(staffGrants.userId, userId))
      .limit(1);
    if (!grant) throw moderationForbidden();
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
}
