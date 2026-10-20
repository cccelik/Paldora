import { Inject, Injectable } from '@nestjs/common';
import { lifeUpdates } from '@paldora/database';
import type { LifeUpdateView } from '@paldora/validation';
import { and, desc, eq } from 'drizzle-orm';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  encodeCursor,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { lifeUpdateNotFound } from './life-update-errors.js';
import { LifeUpdateViewService } from './life-update-view.service.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

@Injectable()
export class LifeUpdateQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(LifeUpdateViewService)
    private readonly views: LifeUpdateViewService,
  ) {}

  /** Hidden (blocked), deleted, and unreachable all answer the same. */
  public async get(
    viewerId: string,
    lifeUpdateId: string,
  ): Promise<LifeUpdateView> {
    const { views } = await this.views.byIds(viewerId, [lifeUpdateId]);
    const view = views.get(lifeUpdateId);
    if (!view) throw lifeUpdateNotFound();
    return view;
  }

  /**
   * The author's own, newest first, keyset on (created_at, id). One the
   * author can no longer reach (they left every delivery Box) is dropped
   * after the page is cut, so a page may be short while the cursor still
   * moves on: rare, and never a repeat or a gap.
   */
  public async listMine(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<LifeUpdateView>> {
    const rows = await this.infrastructure.database
      .select({
        id: lifeUpdates.id,
        cursorAt: cursorTimestamp(lifeUpdates.createdAt),
      })
      .from(lifeUpdates)
      .where(
        and(
          eq(lifeUpdates.authorUserId, viewerId),
          eq(lifeUpdates.status, 'active'),
          afterCursor(
            lifeUpdates.createdAt,
            lifeUpdates.id,
            decodeCursor(query.cursor),
            'desc',
          ),
        ),
      )
      .orderBy(desc(lifeUpdates.createdAt), desc(lifeUpdates.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const { views } = await this.views.byIds(
      viewerId,
      page.map((row) => row.id),
    );
    const last = page.at(-1);
    return {
      items: page.flatMap((row) => {
        const view = views.get(row.id);
        return view ? [view] : [];
      }),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ at: last.cursorAt, id: last.id })
          : null,
    };
  }
}
