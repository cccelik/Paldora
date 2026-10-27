import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import {
  NativeModerationError,
  type NativeCase,
} from '@paldora/firebase-trusted';
import {
  type CreateReportInput,
  type ModerationActionInput,
} from '@paldora/validation';
import { iso } from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Account lifecycle, reports and moderation. */
export class AccountModerationData {
  public constructor(private readonly ctx: WebDataContext) {}

  public accountExport() {
    return this.ctx.accountLifecycle.latestExport(this.ctx.uid);
  }
  public requestAccountExport() {
    return this.ctx.accountLifecycle.requestExport(this.ctx.uid);
  }
  public accountDeletion() {
    return this.ctx.accountLifecycle.currentDeletion(this.ctx.uid);
  }
  public async requestAccountDeletion(password: string) {
    return this.ctx.accountLifecycle.requestDeletion(
      this.ctx.uid,
      password,
      (uid, email, credential) =>
        this.ctx.services.sessions.reauthenticate(uid, email, credential),
    );
  }
  public async cancelAccountDeletion(password: string) {
    return this.ctx.accountLifecycle.cancelDeletion(
      this.ctx.uid,
      password,
      (uid, email, credential) =>
        this.ctx.services.sessions.reauthenticate(uid, email, credential),
    );
  }
  public downloadAccountExport(id: string) {
    return this.ctx.accountLifecycle.downloadStream(this.ctx.uid, id);
  }

  private moderationError(error: unknown): never {
    if (error instanceof NativeModerationError) {
      const code =
        error.code === 'FORBIDDEN'
          ? 'MODERATION_FORBIDDEN'
          : error.code === 'INVALID'
            ? 'REPORT_ACTION_UNAVAILABLE'
            : 'REPORT_NOT_FOUND';
      throw new ApiClientError(
        error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID' ? 409 : 404,
        code,
        'Moderation action unavailable.',
        null,
      );
    }
    throw error;
  }

  private receipt(item: NativeCase) {
    return {
      id: item.id,
      targetKind: item.targetKind,
      targetId: item.targetId,
      category: item.category,
      status: item.status,
      createdAt: iso(item.createdAt),
    };
  }

  public async createReport(input: CreateReportInput) {
    try {
      return this.receipt(
        await this.ctx.moderationService.createReport(this.ctx.uid, input),
      );
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async myReports(page: PageOptions = {}) {
    const result = await this.ctx.moderationService.myReports(
      this.ctx.uid,
      page.cursor,
      page.limit ?? 20,
    );
    return {
      items: result.items.map((item) => this.receipt(item)),
      nextCursor: result.nextCursor,
    };
  }

  public async moderationCases(
    page: PageOptions & { status: 'open' | 'closed' },
  ) {
    try {
      const result = await this.ctx.moderationService.cases(
        this.ctx.uid,
        page.status,
        page.cursor,
        page.limit ?? 25,
      );
      return {
        items: result.items.map((item) => this.receipt(item)),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async moderationCase(id: string) {
    try {
      const item = await this.ctx.moderationService.getCase(this.ctx.uid, id);
      return {
        ...this.receipt(item),
        detail: item.detail,
        reporterUserId: item.reporterUid,
        closedAt: item.closedAt ? iso(item.closedAt) : null,
      };
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async actOnModerationCase(id: string, input: ModerationActionInput) {
    try {
      const result = await this.ctx.moderationService.actOnCase(
        this.ctx.uid,
        id,
        input,
      );
      if (result.action === 'hide' && result.postId)
        await this.ctx.drainMediaPostCleanup(result.postId);
      if (result.action === 'suspend' && result.targetUid)
        await this.ctx.services.auth.revokeRefreshTokens(result.targetUid);
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async moderationAccount(id: string) {
    try {
      return await this.ctx.moderationService.account(this.ctx.uid, id);
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async myModerationNotices() {
    const items = await this.ctx.moderationService.notices(this.ctx.uid);
    return {
      items: items.map((item) => ({
        ...item,
        originalCreatedAt: iso(item.originalCreatedAt),
      })),
    };
  }
}
