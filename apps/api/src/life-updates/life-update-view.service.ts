import { Inject, Injectable } from '@nestjs/common';
import {
  hiddenByBlock,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  type LifeUpdateRow,
} from '@paldora/database';
import type { LifeUpdateView } from '@paldora/validation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import { InteractionSummaryService } from '../interactions/interaction-summary.service.js';
import { MediaUrlService } from '../media/media-urls.service.js';
import { signPhotos } from '../media/signed-photos.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import {
  isVisible,
  loadContexts,
  type AccessibleContext,
} from './life-update-access.js';
import { toLifeUpdateView } from './life-update-views.js';

export interface LifeUpdateViews {
  /** Life Updates the viewer may see, by ID. */
  readonly views: ReadonlyMap<string, LifeUpdateView>;
  /** Active ones the viewer reaches but may not see because of a block. */
  readonly hidden: ReadonlySet<string>;
}

export interface ViewOptions {
  /** Show only this Box's context (Box feeds and Box Memories). */
  readonly scopeBoxId?: string;
}

const groupContexts = (contexts: readonly AccessibleContext[]) => {
  const grouped = new Map<string, AccessibleContext[]>();
  for (const context of contexts) {
    const list = grouped.get(context.lifeUpdateId) ?? [];
    list.push(context);
    grouped.set(context.lifeUpdateId, list);
  }
  return grouped;
};

/**
 * The read side for any list of Life Updates (detail, "mine", and later
 * feeds and Memories), in a fixed number of queries whatever the page size.
 * Authorization is decided by the first two (rows with the block flag, then
 * the viewer's contexts); photos, authors, and interaction summaries are
 * loaded only for what passed, so nothing is signed or counted for content
 * the viewer may not see.
 */
@Injectable()
export class LifeUpdateViewService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(ProfileSummaryService)
    private readonly people: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
    @Inject(InteractionSummaryService)
    private readonly interactions: InteractionSummaryService,
  ) {}

  private get database() {
    return this.infrastructure.database;
  }

  public async byIds(
    viewerId: string,
    ids: readonly string[],
    options: ViewOptions = {},
  ): Promise<LifeUpdateViews> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return { views: new Map(), hidden: new Set() };
    const rows = await this.database
      .select({
        update: lifeUpdates,
        hidden: hiddenByBlock(viewerId, lifeUpdates.authorUserId).mapWith(
          Boolean,
        ),
      })
      .from(lifeUpdates)
      .where(
        and(inArray(lifeUpdates.id, unique), eq(lifeUpdates.status, 'active')),
      );
    const contexts = groupContexts(
      await loadContexts(
        this.database,
        viewerId,
        rows.map((row) => row.update.id),
        options.scopeBoxId,
      ),
    );
    const reachable = (update: LifeUpdateRow) =>
      isVisible(
        update,
        false,
        viewerId,
        contexts.get(update.id)?.length ?? 0,
      ) &&
      (options.scopeBoxId === undefined || update.audience === 'boxes');
    const hidden = new Set(
      rows
        .filter((row) => row.hidden && reachable(row.update))
        .map((row) => row.update.id),
    );
    const visible = rows
      .filter((row) => !row.hidden && reachable(row.update))
      .map((row) => row.update);
    return { views: await this.assemble(viewerId, visible, contexts), hidden };
  }

  private async assemble(
    viewerId: string,
    updates: readonly LifeUpdateRow[],
    contexts: ReadonlyMap<string, readonly AccessibleContext[]>,
  ): Promise<Map<string, LifeUpdateView>> {
    const ids = updates.map((update) => update.id);
    const targets = updates.flatMap((update) =>
      (contexts.get(update.id) ?? []).map((context) => ({
        id: context.postId,
        boxStatus: context.boxStatus,
      })),
    );
    const [media, authors, interactions] = await Promise.all([
      this.mediaFor(ids),
      this.people.summaries(updates.map((update) => update.authorUserId)),
      this.interactions.forPosts(viewerId, targets),
    ]);
    const views = new Map<string, LifeUpdateView>();
    for (const update of updates) {
      const author = authors.get(update.authorUserId);
      if (!author) continue;
      views.set(
        update.id,
        toLifeUpdateView({
          update,
          author,
          viewerId,
          contexts: contexts.get(update.id) ?? [],
          media: media.get(update.id) ?? [],
          interactions,
        }),
      );
    }
    return views;
  }

  /** One signed set of photos per Life Update, shared by every delivery. */
  private async mediaFor(ids: readonly string[]) {
    if (ids.length === 0) return new Map();
    const rows = await this.database
      .select({
        lifeUpdateId: lifeUpdateMedia.lifeUpdateId,
        asset: mediaAssets,
      })
      .from(lifeUpdateMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, lifeUpdateMedia.mediaAssetId))
      .where(
        and(
          inArray(lifeUpdateMedia.lifeUpdateId, [...ids]),
          eq(mediaAssets.status, 'ready'),
        ),
      )
      .orderBy(
        asc(lifeUpdateMedia.lifeUpdateId),
        asc(lifeUpdateMedia.position),
      );
    return signPhotos(
      this.mediaUrls,
      rows.map(({ lifeUpdateId, asset }) => ({ ownerId: lifeUpdateId, asset })),
    );
  }
}
