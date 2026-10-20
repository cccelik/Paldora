import { Inject, Injectable } from '@nestjs/common';
import type { MemoryItemView, MemoryQuery } from '@paldora/validation';
import { sql } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import { LifeUpdateViewService } from '../life-updates/life-update-view.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  encodeCursor,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { PostPageService } from '../posts/post-page.service.js';
import { memoryCandidates, type MemoryScope } from './memory-candidates.js';
import { memoryWindow } from './memory-window.js';

/** Which Memories a page draws from, beyond the viewer (see MemoryScope). */
export type MemoryPageScope = Pick<
  MemoryScope,
  'boxId' | 'authorId' | 'includeOnlyMe' | 'withPhotos'
>;

/** A page request; without `year` the page spans every year. */
export interface MemoryPageQuery {
  readonly type: MemoryQuery['type'];
  readonly year?: number | undefined;
  readonly month?: number | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

interface CandidateRow extends Record<string, unknown> {
  readonly item_kind: 'post' | 'life_update';
  readonly item_id: string;
  readonly cursor_at: string;
}

/**
 * Memories pages: a derived view, never a stored copy. One candidate query
 * decides what the viewer may see (keyset `(at desc, item_id desc)` inside
 * one UTC month or year), then the posts and Life Updates on the page are
 * loaded, and re-authorized, in batches. Something that stopped being
 * visible between the two steps is dropped; deleting content removes it
 * from Memories at once. A fixed number of queries per page.
 */
@Injectable()
export class MemoryQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly boxes: BoxPolicyService,
    @Inject(PostPageService) private readonly posts: PostPageService,
    @Inject(LifeUpdateViewService)
    private readonly lifeUpdates: LifeUpdateViewService,
  ) {}

  public mine(
    viewerId: string,
    query: MemoryQuery,
  ): Promise<Page<MemoryItemView>> {
    return this.page(viewerId, {}, query);
  }

  /** A Box the viewer is not in right now answers BOX_NOT_FOUND. */
  public async ofBox(
    viewerId: string,
    boxId: string,
    query: MemoryQuery,
  ): Promise<Page<MemoryItemView>> {
    await this.boxes.membership(viewerId, boxId);
    return this.page(viewerId, { boxId }, query);
  }

  /**
   * One page over the scoped candidates. The caller has already decided
   * the viewer may ask for this scope (a Box membership, a Room access).
   */
  public async page(
    viewerId: string,
    scope: MemoryPageScope,
    query: MemoryPageQuery,
  ): Promise<Page<MemoryItemView>> {
    const { boxId } = scope;
    const candidates = memoryCandidates({
      ...scope,
      viewerId,
      type: query.type,
      window:
        query.year === undefined
          ? undefined
          : memoryWindow(query.year, query.month),
    });
    const after = afterCursor(
      sql`c.at`,
      sql`c.item_id`,
      decodeCursor(query.cursor),
      'desc',
    );
    const { rows } = await this.infrastructure.database.execute<CandidateRow>(
      sql`select c.item_kind, c.item_id, ${cursorTimestamp(sql`c.at`)} as cursor_at
        from (${candidates}) c
        ${after ? sql`where ${after}` : sql``}
        order by c.at desc, c.item_id desc
        limit ${query.limit + 1}`,
    );
    const page = rows.slice(0, query.limit);
    const idsOf = (kind: CandidateRow['item_kind']) =>
      page.filter((row) => row.item_kind === kind).map((row) => row.item_id);
    const [postViews, lifeUpdateViews] = await Promise.all([
      this.posts.itemsForPosts(viewerId, idsOf('post')),
      this.lifeUpdates.byIds(
        viewerId,
        idsOf('life_update'),
        boxId === undefined ? {} : { scopeBoxId: boxId },
      ),
    ]);
    const items = page.flatMap((row): MemoryItemView[] => {
      if (row.item_kind === 'post') {
        const post = postViews.get(row.item_id);
        return post ? [{ kind: 'post', occurredAt: post.createdAt, post }] : [];
      }
      const lifeUpdate = lifeUpdateViews.views.get(row.item_id);
      return lifeUpdate
        ? [
            {
              kind: 'life_update',
              occurredAt: lifeUpdate.createdAt,
              lifeUpdate,
            },
          ]
        : [];
    });
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ at: last.cursor_at, id: last.item_id })
          : null,
    };
  }
}
